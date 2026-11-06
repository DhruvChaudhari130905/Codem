import { LIMITS, rankPlayers, scoreCoding, scorePrompting, type PlayerResult, type ScoreBreakdown } from '@codem/shared'
import type { Match, MatchPlayer, Problem } from '@prisma/client'

type Loaded = Match & { problem: Problem; players: (MatchPlayer & { user: { username: string | null } })[] }
export type ScoredPlayer = { userId: string; username: string; rank: number; result: PlayerResult; score: ScoreBreakdown }

const secs = (a: Date, b: Date) => Math.max(0, Math.round((a.getTime() - b.getTime()) / 1000))

/** Score and rank every player of a judged match (spec §6.7). */
export function scoreMatch(m: Loaded): ScoredPlayer[] {
  const startsAt = m.startsAt ?? m.createdAt
  const endsAt = m.endsAt ?? startsAt
  const scored = m.players.map((p) => {
    const result: PlayerResult = {
      userId: p.userId,
      submittedAtSec: p.submittedAt ? secs(p.submittedAt, startsAt) : null,
      testsPassed: p.testsPassed ?? 0,
      testsTotal: p.testsTotal ?? 0,
      aiScore: p.aiScore ?? 0,
      remainingSec: p.submittedAt ? Math.min(m.timeLimitSec, secs(endsAt, p.submittedAt)) : 0,
      timeLimitSec: m.timeLimitSec,
      promptsUsed: p.promptsUsed,
      tokensUsed: p.tokensUsed,
      tokenBudget: LIMITS.tokenBudget[m.problem.difficulty],
    }
    return { ...result, score: m.mode === 'coding' ? scoreCoding(result) : scorePrompting(result), username: p.user.username ?? '?', result }
  })
  const order = rankPlayers(scored)
  return order.map((id, i) => {
    const s = scored.find((x) => x.userId === id)!
    return { userId: id, username: s.username, rank: i + 1, result: s.result, score: s.score }
  })
}
