export const LIMITS = {
  cpuSecDefault: 10,
  cpuSecMax: 60,
  memMbDefault: 512,
  memMbMax: 8192,
  maxCores: 4,
  outputBytesMax: 1_048_576,
  sourceBytesMax: 65_536,
  runCooldownMs: 3000,
  joinWindowMs: 120_000,
  countdownMs: 5000,
  defaultTimeLimitSec: 1800,
  groupMaxMembers: 20,
  promptCap: 25,
  promptMaxChars: 4000,
  tokenBudget: { easy: 60000, medium: 120000, hard: 200000 },
} as const

export type ExecLimits = { cpuSec: number; wallSec: number; memMb: number }

/** Apply defaults and caps to per-problem limits. Wall time is always 2x CPU time. */
export function clampLimits(l: { cpuSec?: number; memMb?: number }): ExecLimits {
  const cpuSec = Math.min(l.cpuSec ?? LIMITS.cpuSecDefault, LIMITS.cpuSecMax)
  const memMb = Math.min(l.memMb ?? LIMITS.memMbDefault, LIMITS.memMbMax)
  return { cpuSec, wallSec: cpuSec * 2, memMb }
}
