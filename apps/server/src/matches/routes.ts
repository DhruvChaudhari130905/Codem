import { createMatchBody, idSchema, promptBody, sourceBody, type AgentEvent, type TestCase } from '@codem/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requireUser } from '../auth/session.js'
import { prisma } from '../db.js'
import { HttpError, parse } from '../errors.js'
import { rateLimit } from '../ratelimit.js'
import { toPublicProblem } from '../problems/serialize.js'
import { scoreMatch } from './results.js'
import { createMatch, joinMatch, loadMatchForMember, rematch, runSamples, sendPrompt, startMatch, submit, submitPrompting, toStateEvent } from './service.js'

const matchId = (req: FastifyRequest) => parse(idSchema, (req.params as { id: string }).id)

export async function matchRoutes(app: FastifyInstance) {
  app.post('/chats/:chatId/matches', async (req, reply) => {
    const me = await requireUser(req)
    const chatId = parse(idSchema, (req.params as { chatId: string }).chatId)
    const body = parse(createMatchBody, req.body)
    await rateLimit('matchCreate', me.id)
    const m = await createMatch(chatId, me.id, body)
    return reply.code(201).send({ id: m.id })
  })

  app.post('/matches/:id/rematch', async (req, reply) => {
    const me = await requireUser(req)
    await rateLimit('matchCreate', me.id)
    const m = await rematch(matchId(req), me.id)
    return reply.code(201).send({ id: m.id, chatId: m.chatId })
  })

  app.post('/matches/:id/join', async (req) => {
    const me = await requireUser(req)
    await joinMatch(matchId(req), me.id)
    return { ok: true }
  })

  app.post('/matches/:id/start', async (req) => {
    const me = await requireUser(req)
    await startMatch(matchId(req), me.id)
    return { ok: true }
  })

  app.get('/matches/:id', async (req) => {
    const me = await requireUser(req)
    const at = Date.now() // taken before the read, so a push of a later write always wins
    const m = await loadMatchForMember(matchId(req), me.id)
    const started = m.status === 'live' || m.status === 'judging' || m.status === 'finished'
    const problem = started ? toPublicProblem(await prisma.problem.findUniqueOrThrow({ where: { id: m.problemId } })) : null
    const mine = m.players.find((p) => p.userId === me.id)
    return {
      match: { ...toStateEvent(m, at), timeLimitSec: m.timeLimitSec, language: m.language },
      problem,
      me: mine
        ? { playing: true, submitted: !!mine.submittedAt, promptsUsed: mine.promptsUsed, tokensUsed: mine.tokensUsed, files: mine.files ?? null, code: mine.code, language: mine.language }
        : { playing: false, submitted: false, promptsUsed: 0, tokensUsed: 0, files: null, code: null, language: null },
      serverTime: new Date().toISOString(),
    }
  })

  app.post('/matches/:id/run', async (req, reply) => {
    const me = await requireUser(req)
    const { source, language } = parse(sourceBody, req.body)
    return reply.code(202).send(await runSamples(matchId(req), me.id, source, language))
  })

  app.post('/matches/:id/submit', async (req) => {
    const me = await requireUser(req)
    const id = matchId(req)
    const m = await loadMatchForMember(id, me.id)
    if (m.mode === 'prompting') await submitPrompting(id, me.id)
    else {
      const { source, language } = parse(sourceBody, req.body)
      await submit(id, me.id, source, language)
    }
    return { ok: true }
  })

  app.post('/matches/:id/prompt', async (req, reply) => {
    const me = await requireUser(req)
    const { text, language } = parse(promptBody, req.body)
    return reply.code(202).send(await sendPrompt(matchId(req), me.id, text, language))
  })

  /** Your own agent conversation, as the same events the live stream sends. */
  app.get('/matches/:id/agent', async (req) => {
    const me = await requireUser(req)
    const id = matchId(req)
    await loadMatchForMember(id, me.id)
    const turns = await prisma.agentTurn.findMany({ where: { matchId: id, userId: me.id }, orderBy: { index: 'asc' } })
    return { events: turns.flatMap((t) => transcriptToEvents(id, t.index, t.prompt, t.transcript)) }
  })

  app.get('/matches/:id/results', async (req) => {
    const me = await requireUser(req)
    const id = matchId(req)
    await loadMatchForMember(id, me.id)
    const m = await prisma.match.findUniqueOrThrow({
      where: { id },
      include: { problem: true, players: { include: { user: { select: { username: true } } } } },
    })
    if (m.status !== 'finished') throw new HttpError(409, 'results are not ready yet', 'not_finished')
    const ranked = scoreMatch(m)
    const byId = new Map(m.players.map((p) => [p.userId, p]))
    return {
      match: { id: m.id, chatId: m.chatId, mode: m.mode, timeLimitSec: m.timeLimitSec, language: m.language, problemId: m.problemId },
      problem: { ...toPublicProblem(m.problem), hiddenCount: (m.problem.hidden as TestCase[]).length },
      players: ranked.map((r) => {
        const p = byId.get(r.userId)!
        return {
          userId: r.userId,
          username: r.username,
          rank: r.rank,
          score: r.score,
          testsPassed: r.result.testsPassed,
          testsTotal: r.result.testsTotal,
          submittedAtSec: r.result.submittedAtSec,
          aiScore: p.aiScore,
          report: p.report,
          code: p.code,
          language: p.language,
          promptsUsed: p.promptsUsed,
          tokensUsed: p.tokensUsed,
        }
      }),
    }
  })
}

type Block = { type: string; text?: string; name?: string; input?: { path?: string } & Record<string, unknown>; content?: unknown; is_error?: boolean }

/** Replay a stored turn as agent events. Thinking blocks and signatures stay server-side. */
function transcriptToEvents(matchId: string, turn: number, prompt: string, transcript: unknown): AgentEvent[] {
  const out: AgentEvent[] = [{ matchId, turn, kind: 'user', text: prompt }]
  const names = new Map<string, string>()
  for (const msg of (transcript as { role: string; content: Block[] | string }[]).slice(1)) {
    if (typeof msg.content === 'string') continue
    for (const b of msg.content) {
      if (b.type === 'text' && b.text?.trim()) out.push({ matchId, turn, kind: 'text', text: b.text })
      if (b.type === 'tool_use') {
        names.set((b as { id?: string }).id ?? '', b.name ?? '')
        out.push({ matchId, turn, kind: 'tool_call', tool: b.name, input: b.name === 'write_file' ? { path: b.input?.path } : b.input })
      }
      if (b.type === 'tool_result') {
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
        out.push({ matchId, turn, kind: 'tool_result', tool: names.get((b as { tool_use_id?: string }).tool_use_id ?? ''), text: text.slice(0, 4000) })
      }
    }
  }
  return out
}
