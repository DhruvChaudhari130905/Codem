import type { Language } from './languages.js'
import type { TestCase } from './schemas.js'

/** Execution queue: sample runs and hidden-test judging. */
export const EXEC_QUEUE = 'exec'
/** AI queue: reviews and prompting-agent turns (slow; kept off the exec queue). */
export const AI_QUEUE = 'ai'
/** Delayed match timers, consumed by the server. */
export const TIMERS_QUEUE = 'timers'

export type RunJob = { matchId: string; userId: string; runId: string; language: Language; source: string; tests: TestCase[]; cpuSec: number; memMb: number }
export type JudgeJob = { matchId: string; userId: string }
export type ReviewJob = { matchId: string; userId: string }
export type AgentTurnJob = { matchId: string; userId: string; prompt: string }
export type JudgedMessage = { matchId: string; userId: string }

/** Redis key marking a player's in-flight Run (set by server, cleared by worker). */
export const runInflightKey = (matchId: string, userId: string) => `run-inflight:${matchId}:${userId}`
/** Redis key marking a player's in-flight agent turn. */
export const agentInflightKey = (matchId: string, userId: string) => `agent-inflight:${matchId}:${userId}`

/** Compare program output: trailing whitespace on each line and trailing blank lines are ignored. */
export function outputsMatch(actual: string, expected: string): boolean {
  const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').replace(/\n+$/, '')
  return norm(actual) === norm(expected)
}
