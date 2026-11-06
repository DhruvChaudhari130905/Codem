/** Claude model IDs (chosen with the claude-api skill, 2026-11-06). */
export const REVIEW_MODEL = 'claude-opus-5-5'
export const AGENT_MODEL = 'claude-opus-5-5'

export type CodingReport = { score: number; readability: string; structure: string; complexity: string; edgeCases: string; refactor: string }
export type PromptingReport = { score: number; clarity: string; decomposition: string; feedbackUse: string; wastedTurns: string; tip: string }

/** Streamed to the prompting player only (user:<id> room). */
export type AgentEvent = {
  matchId: string
  turn: number
  kind: 'user' | 'text' | 'tool_call' | 'tool_result' | 'files' | 'done' | 'error'
  text?: string
  tool?: string
  input?: unknown
  files?: Record<string, string>
  tokensUsed?: number
}
