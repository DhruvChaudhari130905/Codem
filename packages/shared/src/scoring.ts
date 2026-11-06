import { LIMITS } from './limits.js'

export type PlayerResult = {
  userId: string
  submittedAtSec: number | null
  testsPassed: number
  testsTotal: number
  aiScore: number
  remainingSec: number
  timeLimitSec: number
  promptsUsed?: number
  tokensUsed?: number
  tokenBudget?: number
}
export type ScoreBreakdown = { correctness: number; speedOrEfficiency: number; quality: number; total: number }

const r2 = (x: number) => Math.round(x * 100) / 100
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const fraction = (r: PlayerResult) => (r.testsTotal > 0 ? clamp(r.testsPassed / r.testsTotal, 0, 1) : 0)
const ZERO: ScoreBreakdown = { correctness: 0, speedOrEfficiency: 0, quality: 0, total: 0 }

function breakdown(r: PlayerResult, bonus: number): ScoreBreakdown {
  const correctness = r2(60 * fraction(r))
  const speedOrEfficiency = r2(fraction(r) === 1 ? 20 * clamp(bonus, 0, 1) : 0)
  const quality = r2(20 * (clamp(r.aiScore, 0, 10) / 10))
  return { correctness, speedOrEfficiency, quality, total: r2(correctness + speedOrEfficiency + quality) }
}

/** Coding round (spec §6.7): correctness 60, speed 20 (only if all hidden tests pass), clean code 20. */
export function scoreCoding(r: PlayerResult): ScoreBreakdown {
  if (r.submittedAtSec === null) return ZERO
  return breakdown(r, r.remainingSec / r.timeLimitSec)
}

/** Prompting round: efficiency = avg(1 − prompts/cap, time remaining/limit, 1 − tokens/budget). */
export function scorePrompting(r: PlayerResult): ScoreBreakdown {
  if (r.submittedAtSec === null) return ZERO
  const prompts = 1 - (r.promptsUsed ?? 0) / LIMITS.promptCap
  const time = r.remainingSec / r.timeLimitSec
  const tokens = r.tokenBudget ? 1 - (r.tokensUsed ?? 0) / r.tokenBudget : 0
  return breakdown(r, (clamp(prompts, 0, 1) + clamp(time, 0, 1) + clamp(tokens, 0, 1)) / 3)
}

/** Correctness first, then points, then earlier submit; non-submitters last. Returns userIds best-first. */
export function rankPlayers(rs: (PlayerResult & { score: ScoreBreakdown })[]): string[] {
  return [...rs]
    .sort((a, b) => {
      if ((a.submittedAtSec === null) !== (b.submittedAtSec === null)) return a.submittedAtSec === null ? 1 : -1
      const f = fraction(b) - fraction(a)
      if (f !== 0) return f
      if (b.score.total !== a.score.total) return b.score.total - a.score.total
      return (a.submittedAtSec ?? Infinity) - (b.submittedAtSec ?? Infinity)
    })
    .map((r) => r.userId)
}
