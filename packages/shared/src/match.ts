export type MatchMode = 'coding' | 'prompting'
export type MatchStatus = 'waiting_for_players' | 'countdown' | 'live' | 'judging' | 'finished' | 'cancelled'
export type MatchEvent =
  | { type: 'host_start' }
  | { type: 'join_window_elapsed' }
  | { type: 'countdown_elapsed' }
  | { type: 'all_submitted' }
  | { type: 'deadline' }
  | { type: 'all_judged' }

export class InvalidTransition extends Error {
  constructor(status: MatchStatus, ev: MatchEvent['type']) {
    super(`cannot apply ${ev} to a match in ${status}`)
  }
}

export const MIN_PLAYERS = 2

/** Pure match state machine (spec §6.10). Matches are created in waiting_for_players. */
export function transition(status: MatchStatus, ev: MatchEvent, playerCount: number): MatchStatus {
  switch (`${status}:${ev.type}`) {
    case 'waiting_for_players:host_start':
      if (playerCount < MIN_PLAYERS) throw new InvalidTransition(status, ev.type)
      return 'countdown'
    case 'waiting_for_players:join_window_elapsed':
      return playerCount >= MIN_PLAYERS ? 'countdown' : 'cancelled'
    case 'countdown:countdown_elapsed':
      return 'live'
    case 'live:all_submitted':
    case 'live:deadline':
      return 'judging'
    case 'judging:all_judged':
      return 'finished'
    default:
      throw new InvalidTransition(status, ev.type)
  }
}

export const isActiveStatus = (s: MatchStatus) => s === 'waiting_for_players' || s === 'countdown' || s === 'live' || s === 'judging'
