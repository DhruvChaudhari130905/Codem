import type Anthropic from '@anthropic-ai/sdk'
import { EV, LIMITS, room, type AgentEvent, type AgentTurnJob, type Language, type MatchProgressEvent, type TestCase } from '@codem/shared'
import { runAgentTurn } from '../ai/agent.js'
import type { AiClient } from '../ai/client.js'
import { prisma } from '../db.js'
import type { Emit } from '../emit.js'
import type { Executor } from '../executor.js'

export type AgentTurnDeps = { client: AiClient; executor: Executor; emit: Emit; clearInflight: (matchId: string, userId: string) => Promise<void> }

export async function processAgentTurn(job: AgentTurnJob, deps: AgentTurnDeps): Promise<void> {
  const key = { matchId_userId: { matchId: job.matchId, userId: job.userId } }
  try {
    const player = await prisma.matchPlayer.findUniqueOrThrow({ where: key, include: { match: { include: { problem: true } } } })
    const { match } = player
    const index = await prisma.agentTurn.count({ where: { matchId: job.matchId, userId: job.userId } })
    const emitAgent = (e: Omit<AgentEvent, 'matchId' | 'turn'>) => deps.emit(room.user(job.userId), EV.agentEvent, { ...e, matchId: job.matchId, turn: index } satisfies AgentEvent)
    if (match.status !== 'live' || player.submittedAt) {
      emitAgent({ kind: 'error', text: 'The match is no longer live.' })
      return
    }
    const turns = await prisma.agentTurn.findMany({ where: { matchId: job.matchId, userId: job.userId }, orderBy: { index: 'asc' }, select: { transcript: true } })
    const budget = LIMITS.tokenBudget[match.problem.difficulty]
    const out = await runAgentTurn(
      {
        matchId: job.matchId,
        turn: index,
        prompt: job.prompt,
        history: turns.flatMap((t) => t.transcript as unknown as Anthropic.Beta.BetaMessageParam[]),
        files: (player.files as Record<string, string> | null) ?? {},
        // Only public fields of the problem are passed on: hidden tests never reach the agent.
        problem: { statementMd: match.problem.statementMd, samples: match.problem.samples as TestCase[], cpuSec: match.problem.cpuSec, memMb: match.problem.memMb },
        language: (player.language ?? match.language ?? 'python') as Language,
        tokensLeft: Math.max(0, budget - player.tokensUsed),
      },
      { client: deps.client, executor: deps.executor, emit: emitAgent },
    )
    const [, updated] = await prisma.$transaction([
      prisma.agentTurn.create({ data: { matchId: job.matchId, userId: job.userId, index, prompt: job.prompt, transcript: out.transcript as object[], filesAfter: out.files, tokens: out.tokens } }),
      prisma.matchPlayer.update({ where: key, data: { files: out.files, tokensUsed: { increment: out.tokens } } }),
    ])
    emitAgent({ kind: 'done', tokensUsed: updated.tokensUsed, files: out.files })
    const progress: MatchProgressEvent = { matchId: job.matchId, userId: job.userId, promptsUsed: updated.promptsUsed, ...(out.samples && { samplePassed: out.samples.passed, sampleTotal: out.samples.total }) }
    deps.emit(room.match(job.matchId), EV.matchProgress, progress)
  } catch (e) {
    deps.emit(room.user(job.userId), EV.agentEvent, { matchId: job.matchId, turn: -1, kind: 'error', text: 'The agent hit an error. Try again.' } satisfies AgentEvent)
    throw e
  } finally {
    await deps.clearInflight(job.matchId, job.userId)
  }
}
