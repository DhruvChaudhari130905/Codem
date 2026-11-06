/** Socket event names. Server → client unless noted. */
export const EV = {
  chatMessage: 'chat:message',
  chatTyping: 'chat:typing', // both directions
  chatJoin: 'chat:join', // client → server: subscribe to a chat room (membership checked)
  chatAdded: 'chat:added', // you were added to a chat; refresh the list
  presence: 'presence',
  matchJoin: 'match:join', // client → server: subscribe to a match room (membership checked)
  matchState: 'match:state',
  matchProgress: 'match:progress',
  runResult: 'run:result',
  agentEvent: 'agent:event',
} as const

export const room = {
  user: (id: string) => `user:${id}`,
  chat: (id: string) => `chat:${id}`,
  match: (id: string) => `match:${id}`,
}

/** Redis channel the worker publishes to when a player's judging + review is done. */
export const MATCH_JUDGED_CHANNEL = 'match:judged'

export type TypingEvent = { chatId: string; userId: string; username: string }
export type PresenceEvent = { userId: string; online: boolean }

export type MatchStateEvent = {
  matchId: string
  chatId: string
  status: 'waiting_for_players' | 'countdown' | 'live' | 'judging' | 'finished' | 'cancelled'
  mode: 'coding' | 'prompting'
  hostId: string
  joinDeadline: string | null
  startsAt: string | null
  endsAt: string | null
  players: { userId: string; username: string; submitted: boolean }[]
  /** Server time (ms) when this state was read from the database; orders pushes against fetches. */
  at: number
}

/** Of two snapshots of the same match, the one read last. A slow fetch must not undo a newer push. */
export function newerState<T extends { at: number }>(current: T | null | undefined, incoming: T): T {
  return current && current.at > incoming.at ? current : incoming
}

export type MatchProgressEvent = {
  matchId: string
  userId: string
  samplePassed?: number
  sampleTotal?: number
  promptsUsed?: number
}

export type RunCaseResult = { passed: boolean; stdin: string; expected: string; stdout: string; stderr: string; status: string; timeMs: number }
export type RunResultEvent = { matchId: string; runId: string; cases: RunCaseResult[]; error?: string }
