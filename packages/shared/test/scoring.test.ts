import { describe, expect, it } from 'vitest'
import { rankPlayers, scoreCoding, scorePrompting } from '../src/scoring.js'

describe('scoring', () => {
  it('scores a coding round', () => {
    expect(scoreCoding({ testsPassed: 5, testsTotal: 5, aiScore: 8, remainingSec: 900, timeLimitSec: 1800, submittedAtSec: 900, userId: 'a' }))
      .toEqual({ correctness: 60, speedOrEfficiency: 10, quality: 16, total: 86 })
  })

  it('gives no speed points unless every hidden test passes', () => {
    expect(scoreCoding({ testsPassed: 4, testsTotal: 5, aiScore: 10, remainingSec: 1700, timeLimitSec: 1800, submittedAtSec: 100, userId: 'b' }).speedOrEfficiency).toBe(0)
  })

  it('ranks correct-but-messy above clean-but-wrong even with fewer points', () => {
    const base = { testsTotal: 5, timeLimitSec: 1800, submittedAtSec: 1800 }
    const messy = { ...base, userId: 'messy', testsPassed: 5, aiScore: 0, remainingSec: 0 }
    const clean = { ...base, userId: 'clean', testsPassed: 4, aiScore: 10, remainingSec: 1800 }
    expect(scoreCoding(messy).total).toBeLessThan(scoreCoding(clean).total)
    expect(rankPlayers([clean, messy].map((r) => ({ ...r, score: scoreCoding(r) })))).toEqual(['messy', 'clean'])
  })

  it('scores a prompting round: avg(1 − 5/25, 900/1800, 1 − 30000/60000) = 0.6 → 12', () => {
    expect(scorePrompting({ testsPassed: 6, testsTotal: 6, aiScore: 5, remainingSec: 900, timeLimitSec: 1800, promptsUsed: 5, tokensUsed: 30000, tokenBudget: 60000, submittedAtSec: 900, userId: 'c' }))
      .toEqual({ correctness: 60, speedOrEfficiency: 12, quality: 10, total: 82 })
  })

  it('rounds to 2 decimals and clamps the AI score', () => {
    const s = scoreCoding({ testsPassed: 1, testsTotal: 3, aiScore: 14, remainingSec: 0, timeLimitSec: 1800, submittedAtSec: 10, userId: 'r' })
    expect(s).toEqual({ correctness: 20, speedOrEfficiency: 0, quality: 20, total: 40 })
    expect(scoreCoding({ testsPassed: 2, testsTotal: 3, aiScore: -3, remainingSec: 0, timeLimitSec: 1800, submittedAtSec: 10, userId: 'r' }).correctness).toBe(40)
    expect(scoreCoding({ testsPassed: 1, testsTotal: 7, aiScore: 0, remainingSec: 0, timeLimitSec: 1800, submittedAtSec: 10, userId: 'r' }).correctness).toBe(8.57)
  })

  it('gives non-submitters 0 points and ranks them last; ties go to the earlier submit', () => {
    const r = { testsPassed: 5, testsTotal: 5, aiScore: 5, remainingSec: 100, timeLimitSec: 1800 }
    const none = { ...r, userId: 'none', submittedAtSec: null }
    expect(scoreCoding(none).total).toBe(0)
    const late = { ...r, userId: 'late', submittedAtSec: 500 }
    const early = { ...r, userId: 'early', submittedAtSec: 400 }
    expect(rankPlayers([none, late, early].map((x) => ({ ...x, score: scoreCoding(x) })))).toEqual(['early', 'late', 'none'])
  })
})
