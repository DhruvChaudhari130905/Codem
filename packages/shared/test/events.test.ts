import { describe, expect, it } from 'vitest'
import { newerState } from '../src/events.js'

describe('newerState', () => {
  it('keeps whichever match state was read last', () => {
    const live = { status: 'countdown', at: 2000 }
    const staleGet = { status: 'waiting_for_players', at: 1000 }
    expect(newerState(live, staleGet)).toBe(live)
    expect(newerState(staleGet, live)).toBe(live)
    expect(newerState(null, staleGet)).toBe(staleGet)
  })
})
