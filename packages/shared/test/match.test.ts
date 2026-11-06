import { describe, expect, it } from 'vitest'
import { InvalidTransition, transition } from '../src/match.js'

describe('match state machine', () => {
  it('cancels when the join window ends with fewer than 2 players', () => {
    expect(transition('waiting_for_players', { type: 'join_window_elapsed' }, 1)).toBe('cancelled')
    expect(transition('waiting_for_players', { type: 'join_window_elapsed' }, 2)).toBe('countdown')
  })
  it('lets the host start early only with 2+ players', () => {
    expect(transition('waiting_for_players', { type: 'host_start' }, 3)).toBe('countdown')
    expect(() => transition('waiting_for_players', { type: 'host_start' }, 1)).toThrow(InvalidTransition)
  })
  it('walks the happy path', () => {
    expect(transition('countdown', { type: 'countdown_elapsed' }, 2)).toBe('live')
    expect(transition('live', { type: 'all_submitted' }, 2)).toBe('judging')
    expect(transition('live', { type: 'deadline' }, 2)).toBe('judging')
    expect(transition('judging', { type: 'all_judged' }, 2)).toBe('finished')
  })
  it('rejects events that do not apply', () => {
    expect(() => transition('finished', { type: 'deadline' }, 2)).toThrow()
    expect(() => transition('live', { type: 'host_start' }, 2)).toThrow()
    expect(() => transition('cancelled', { type: 'countdown_elapsed' }, 2)).toThrow()
  })
})
