import { MATCH_JUDGED_CHANNEL, outputsMatch, type JudgeJob, type Language, type ReviewJob, type TestCase } from '@codem/shared'
import { prisma } from '../db.js'
import type { Emit, Publish } from '../emit.js'
import type { Executor } from '../executor.js'

export type JudgeDeps = { executor: Executor; emit: Emit; publish: Publish; enqueueReview?: (j: ReviewJob) => Promise<void> }

export const NEUTRAL_AI_SCORE = 5

export async function announceJudged(publish: Publish, matchId: string, userId: string) {
  await publish(MATCH_JUDGED_CHANNEL, JSON.stringify({ matchId, userId }))
}

/** Run a submission against hidden tests. Only pass counts leave this function. */
export async function processJudge(job: JudgeJob, deps: JudgeDeps): Promise<void> {
  const player = await prisma.matchPlayer.findUniqueOrThrow({
    where: { matchId_userId: { matchId: job.matchId, userId: job.userId } },
    include: { match: { include: { problem: true } } },
  })
  if (player.judgedAt) return // already judged (job retry)
  const { problem } = player.match
  const hidden = problem.hidden as TestCase[]
  let passed = 0
  if (player.code && player.language) {
    const outs = await deps.executor.runBatch({
      language: player.language as Language,
      source: player.code,
      cpuSec: problem.cpuSec,
      memMb: problem.memMb,
      stdins: hidden.map((t) => t.stdin),
    })
    passed = outs.filter((o, i) => o.status === 'ok' && outputsMatch(o.stdout, hidden[i].expected)).length
  }
  await prisma.matchPlayer.update({
    where: { matchId_userId: { matchId: job.matchId, userId: job.userId } },
    data: { testsPassed: passed, testsTotal: hidden.length, ...(deps.enqueueReview ? {} : { aiScore: NEUTRAL_AI_SCORE, judgedAt: new Date() }) },
  })
  if (deps.enqueueReview) await deps.enqueueReview({ matchId: job.matchId, userId: job.userId })
  else await announceJudged(deps.publish, job.matchId, job.userId)
}
