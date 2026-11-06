import { randomUUID } from 'node:crypto'
import {
  EV,
  InvalidTransition,
  LIMITS,
  isActiveStatus,
  agentInflightKey,
  entryFile,
  runInflightKey,
  transition,
  type CreateMatchBody,
  type Language,
  type MatchEvent,
  type MatchStateEvent,
  type TestCase,
} from '@codem/shared'
import type { Match, MatchStatus, Prisma } from '@prisma/client'
import { assertMember } from '../chats/authz.js'
import { postSystemMessage } from '../chats/service.js'
import { prisma } from '../db.js'
import { HttpError } from '../errors.js'
import { canSeeProblem } from '../problems/routes.js'
import { enqueueAgentTurn, enqueueJudge, enqueueRun } from '../queue.js'
import { emitToChat, emitToMatch } from '../realtime/rooms.js'
import { redis } from '../redis.js'
import { scoreMatch } from './results.js'
import { scheduleTimer } from './timers.js'

/** Submissions are accepted up to 2 s after the deadline to absorb network latency. */
export const SUBMIT_GRACE_MS = 2000

const withPlayers = { players: { include: { user: { select: { username: true } } }, orderBy: { joinedAt: 'asc' } } } satisfies Prisma.MatchInclude
type MatchWithPlayers = Prisma.MatchGetPayload<{ include: typeof withPlayers }>

export function toStateEvent(m: MatchWithPlayers, at: number): MatchStateEvent {
  return {
    at,
    matchId: m.id,
    chatId: m.chatId,
    status: m.status,
    mode: m.mode,
    hostId: m.hostId,
    joinDeadline: m.joinDeadline?.toISOString() ?? null,
    startsAt: m.startsAt?.toISOString() ?? null,
    endsAt: m.endsAt?.toISOString() ?? null,
    players: m.players.map((p) => ({ userId: p.userId, username: p.user.username ?? '?', submitted: !!p.submittedAt })),
  }
}

async function broadcastState(matchId: string) {
  const at = Date.now()
  const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: withPlayers })
  const ev = toStateEvent(m, at)
  // The chat room sees state too, so the invite card in the chat updates live.
  emitToMatch(matchId, EV.matchState, ev)
  emitToChat(m.chatId, EV.matchState, ev)
  return m
}

export async function loadMatchForMember(matchId: string, userId: string): Promise<MatchWithPlayers> {
  const m = await prisma.match.findUnique({ where: { id: matchId }, include: withPlayers })
  if (!m) throw new HttpError(404, 'match not found')
  await assertMember(m.chatId, userId)
  return m
}

export async function canWatchMatch(matchId: string, userId: string): Promise<boolean> {
  const m = await prisma.match.findUnique({ where: { id: matchId }, select: { chatId: true } })
  if (!m) return false
  return !!(await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId } } }))
}

async function pickProblem(userId: string, body: CreateMatchBody & { excludeProblemId?: string }) {
  if (body.problemId !== 'random') {
    const p = await prisma.problem.findUnique({ where: { id: body.problemId } })
    if (!p || !(await canSeeProblem(p, userId))) throw new HttpError(400, 'problem not found')
    return p
  }
  let where: Prisma.ProblemWhereInput = { isCustom: false, ...(body.difficulty && { difficulty: body.difficulty }) }
  if (body.excludeProblemId && (await prisma.problem.count({ where })) > 1) where = { ...where, id: { not: body.excludeProblemId } }
  const n = await prisma.problem.count({ where })
  if (!n) throw new HttpError(400, 'no problems for that difficulty')
  return prisma.problem.findFirstOrThrow({ where, skip: Math.floor(Math.random() * n), orderBy: { id: 'asc' } })
}

export async function createMatch(chatId: string, hostId: string, body: CreateMatchBody & { excludeProblemId?: string }): Promise<Match> {
  await assertMember(chatId, hostId)
  const active = await prisma.match.findFirst({ where: { chatId, status: { in: ['waiting_for_players', 'countdown', 'live', 'judging'] } } })
  if (active) throw new HttpError(409, 'this chat already has a match in progress', 'match_in_progress')
  const problem = await pickProblem(hostId, body)
  const joinDeadline = new Date(Date.now() + LIMITS.joinWindowMs)
  const match = await prisma.match.create({
    data: {
      chatId,
      hostId,
      mode: body.mode,
      problemId: problem.id,
      language: body.language ?? null,
      timeLimitSec: body.timeLimitSec,
      joinDeadline,
      players: { create: { userId: hostId } },
    },
  })
  await scheduleTimer('join-window', match.id, joinDeadline)
  await postSystemMessage(chatId, 'match_invite', match.id, {
    mode: match.mode,
    problemTitle: problem.title,
    difficulty: problem.difficulty,
    timeLimitSec: match.timeLimitSec,
    language: match.language,
  })
  await broadcastState(match.id)
  return match
}

/** Same chat, mode, time and language; a different problem of the same difficulty (custom problems are reused). */
export async function rematch(matchId: string, userId: string): Promise<Match> {
  const m = await loadMatchForMember(matchId, userId)
  if (m.status !== 'finished' && m.status !== 'cancelled') throw new HttpError(409, 'this match has not ended yet')
  const problem = await prisma.problem.findUniqueOrThrow({ where: { id: m.problemId } })
  return createMatch(m.chatId, userId, {
    mode: m.mode,
    problemId: problem.isCustom ? problem.id : 'random',
    difficulty: problem.difficulty,
    timeLimitSec: m.timeLimitSec,
    language: (m.language as Language | null) ?? undefined,
    excludeProblemId: problem.id,
  })
}

export async function joinMatch(matchId: string, userId: string) {
  const m = await loadMatchForMember(matchId, userId)
  if (m.status !== 'waiting_for_players') throw new HttpError(409, 'this match is no longer open to join', 'not_joinable')
  await prisma.matchPlayer.upsert({ where: { matchId_userId: { matchId, userId } }, update: {}, create: { matchId, userId } })
  // A 1:1 chat has exactly two possible players: start as soon as the second one joins.
  const chat = await prisma.chat.findUniqueOrThrow({ where: { id: m.chatId }, select: { kind: true } })
  if (chat.kind === 'direct') await applyEvent(matchId, { type: 'host_start' })
  else await broadcastState(matchId)
}

export async function startMatch(matchId: string, userId: string) {
  const m = await loadMatchForMember(matchId, userId)
  if (m.hostId !== userId) throw new HttpError(403, 'only the host can start the match')
  if (m.status !== 'waiting_for_players') throw new HttpError(409, 'match already started')
  if (m.players.length < 2) throw new HttpError(409, 'at least 2 players must join first', 'not_enough_players')
  await applyEvent(matchId, { type: 'host_start' })
}

/**
 * Apply one state-machine event under a row lock. Events that no longer apply (a timer firing after
 * everyone submitted, a duplicate notification) are ignored and return null.
 */
export async function applyEvent(matchId: string, ev: MatchEvent): Promise<MatchStatus | null> {
  const next = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`select id from "Match" where id = ${matchId} for update`
    const m = await tx.match.findUnique({ where: { id: matchId }, include: { players: true } })
    if (!m) return null
    if (ev.type === 'deadline' && m.endsAt && m.endsAt.getTime() > Date.now()) return null
    let status: MatchStatus
    try {
      status = transition(m.status, ev, m.players.length)
    } catch (e) {
      if (e instanceof InvalidTransition) return null
      throw e
    }
    const data: Prisma.MatchUpdateInput = { status }
    if (status === 'countdown') {
      const startsAt = new Date(Date.now() + LIMITS.countdownMs)
      data.startsAt = startsAt
      data.endsAt = new Date(startsAt.getTime() + m.timeLimitSec * 1000)
    }
    await tx.match.update({ where: { id: matchId }, data })
    if (status === 'judging') {
      // Players who never submitted are judged on the spot: nothing to run.
      const total = await tx.problem.findUniqueOrThrow({ where: { id: m.problemId }, select: { hidden: true } })
      await tx.matchPlayer.updateMany({
        where: { matchId, submittedAt: null },
        data: { testsPassed: 0, testsTotal: (total.hidden as TestCase[]).length, aiScore: 0, judgedAt: new Date() },
      })
    }
    return status
  })
  if (!next) return null

  const m = await broadcastState(matchId)
  if (next === 'countdown') {
    await scheduleTimer('countdown', matchId, m.startsAt!)
    await scheduleTimer('deadline', matchId, m.endsAt!)
  } else if (next === 'live') {
    await postSystemMessage(m.chatId, 'match_live', matchId, { endsAt: m.endsAt })
  } else if (next === 'judging') {
    await maybeFinish(matchId)
  } else if (next === 'finished') {
    await finalize(matchId)
  }
  return next
}

/** Move judging → finished once every player has a judged result. */
export async function maybeFinish(matchId: string) {
  const players = await prisma.matchPlayer.findMany({ where: { matchId }, select: { judgedAt: true } })
  if (players.length && players.every((p) => p.judgedAt)) await applyEvent(matchId, { type: 'all_judged' })
}

export async function onPlayerJudged(matchId: string, _userId: string) {
  const m = await prisma.match.findUnique({ where: { id: matchId }, select: { status: true } })
  if (m?.status === 'judging') await maybeFinish(matchId)
}

async function finalize(matchId: string) {
  const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, include: { problem: true, ...withPlayers } })
  const ranked = scoreMatch(m)
  await prisma.$transaction(
    ranked.map((r) => prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId: r.userId } }, data: { score: { ...r.score, rank: r.rank } } })),
  )
  await postSystemMessage(m.chatId, 'match_result', matchId, {
    mode: m.mode,
    problemTitle: m.problem.title,
    podium: ranked.map((r) => ({ userId: r.userId, username: r.username, total: r.score.total, rank: r.rank, testsPassed: r.result.testsPassed, testsTotal: r.result.testsTotal })),
  })
}

async function livePlayer(matchId: string, userId: string) {
  const m = await loadMatchForMember(matchId, userId)
  const player = m.players.find((p) => p.userId === userId)
  if (!player) throw new HttpError(403, 'you are not playing in this match')
  if (m.status !== 'live') throw new HttpError(409, 'match is not live', 'not_live')
  return { m, player }
}

function checkLanguage(m: Match, language: Language) {
  if (m.language && m.language !== language) throw new HttpError(400, `this match is ${m.language} only`)
}

export async function runSamples(matchId: string, userId: string, source: string, language: Language) {
  const { m } = await livePlayer(matchId, userId)
  if (m.mode !== 'coding') throw new HttpError(400, 'run is only for coding rounds')
  checkLanguage(m, language)
  const r = redis()
  const cool = await r.set(`run-cooldown:${matchId}:${userId}`, '1', 'PX', LIMITS.runCooldownMs, 'NX')
  if (!cool) throw new HttpError(429, 'wait 3 seconds between runs', 'run_cooldown')
  const inflight = await r.set(runInflightKey(matchId, userId), '1', 'EX', 120, 'NX')
  if (!inflight) throw new HttpError(429, 'your previous run is still going', 'run_in_flight')
  const problem = await prisma.problem.findUniqueOrThrow({ where: { id: m.problemId } })
  const runId = randomUUID()
  await enqueueRun({ matchId, userId, runId, language, source, tests: problem.samples as TestCase[], cpuSec: problem.cpuSec, memMb: problem.memMb })
  return { runId }
}

/** Prompting round: the player's prompt becomes one agent-turn job on the worker. */
export async function sendPrompt(matchId: string, userId: string, text: string, language?: Language) {
  const { m, player } = await livePlayer(matchId, userId)
  if (m.mode !== 'prompting') throw new HttpError(400, 'prompts are only for prompting rounds')
  if (player.submittedAt) throw new HttpError(409, 'you already submitted', 'already_submitted')
  const problem = await prisma.problem.findUniqueOrThrow({ where: { id: m.problemId }, select: { difficulty: true } })
  if (player.tokensUsed >= LIMITS.tokenBudget[problem.difficulty]) throw new HttpError(429, 'your token budget is used up', 'budget_exhausted')
  // The language is fixed by the match, or chosen with the first prompt and then kept.
  const lang = (m.language as Language | null) ?? (player.language as Language | null) ?? language ?? 'python'
  const r = redis()
  const key = agentInflightKey(matchId, userId)
  if (!(await r.set(key, '1', 'EX', 600, 'NX'))) throw new HttpError(429, 'the agent is still working on your last prompt', 'agent_busy')
  try {
    const { count } = await prisma.matchPlayer.updateMany({
      where: { matchId, userId, promptsUsed: { lt: LIMITS.promptCap } },
      data: { promptsUsed: { increment: 1 }, language: lang },
    })
    if (!count) throw new HttpError(429, `you have used all ${LIMITS.promptCap} prompts`, 'prompt_cap')
    await enqueueAgentTurn({ matchId, userId, prompt: text })
  } catch (e) {
    await r.del(key)
    throw e
  }
  const promptsUsed = player.promptsUsed + 1
  emitToMatch(matchId, EV.matchProgress, { matchId, userId, promptsUsed })
  return { promptsUsed }
}

/** Prompting round submit: the agent's entry file is the submission. */
export async function submitPrompting(matchId: string, userId: string) {
  const { m, player } = await livePlayer(matchId, userId)
  const language = ((m.language as Language | null) ?? (player.language as Language | null) ?? 'python')
  const files = (player.files as Record<string, string> | null) ?? {}
  await submit(matchId, userId, files[entryFile(language)] ?? '', language)
}

export async function submit(matchId: string, userId: string, source: string, language: Language) {
  const { m } = await livePlayer(matchId, userId)
  checkLanguage(m, language)
  if (m.endsAt && Date.now() > m.endsAt.getTime() + SUBMIT_GRACE_MS) throw new HttpError(409, 'time is up', 'deadline_passed')
  // Conditional update: a concurrent double submit can only win once.
  const { count } = await prisma.matchPlayer.updateMany({
    where: { matchId, userId, submittedAt: null },
    data: { submittedAt: new Date(), code: source, language },
  })
  if (!count) throw new HttpError(409, 'you already submitted', 'already_submitted')
  await enqueueJudge({ matchId, userId })
  const waiting = await prisma.matchPlayer.count({ where: { matchId, submittedAt: null } })
  if (waiting === 0) await applyEvent(matchId, { type: 'all_submitted' })
  else await broadcastState(matchId)
}

export { isActiveStatus }
