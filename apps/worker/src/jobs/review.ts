import type { Language, ReviewJob } from '@codem/shared'
import { Prisma } from '@prisma/client'
import type { AiClient } from '../ai/client.js'
import { reviewCode, reviewPrompts } from '../ai/review.js'
import { prisma } from '../db.js'
import type { Publish } from '../emit.js'
import { announceJudged, NEUTRAL_AI_SCORE } from './judge.js'

export type ReviewDeps = { client?: AiClient; publish: Publish }

/** AI report for a judged submission, then mark the player judged. A failed review scores a neutral 5. */
export async function processReview(job: ReviewJob, deps: ReviewDeps): Promise<void> {
  const key = { matchId_userId: { matchId: job.matchId, userId: job.userId } }
  const p = await prisma.matchPlayer.findUniqueOrThrow({ where: key, include: { match: { include: { problem: true } } } })
  if (p.judgedAt) return
  const base = { problemMd: p.match.problem.statementMd, testsPassed: p.testsPassed ?? 0, testsTotal: p.testsTotal ?? 0 }
  let report = null
  if (p.match.mode === 'coding') {
    if (p.code && p.language) report = await reviewCode({ ...base, language: p.language as Language, source: p.code }, deps.client)
  } else {
    const turns = await prisma.agentTurn.findMany({ where: { matchId: job.matchId, userId: job.userId }, orderBy: { index: 'asc' }, select: { prompt: true } })
    report = await reviewPrompts({ ...base, prompts: turns.map((t) => t.prompt) }, deps.client)
  }
  await prisma.matchPlayer.update({
    where: key,
    data: { aiScore: report?.score ?? NEUTRAL_AI_SCORE, report: report ?? Prisma.DbNull, judgedAt: new Date() },
  })
  await announceJudged(deps.publish, job.matchId, job.userId)
}
