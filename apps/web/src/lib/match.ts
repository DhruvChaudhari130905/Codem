'use client'
import { EV, newerState, type MatchStateEvent } from '@codem/shared'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { getSocket, useSocketEvent } from './socket'

export type MatchDetail = {
  match: MatchStateEvent & { timeLimitSec: number; language: string | null }
  problem: import('./types').PublicProblem | null
  me: { playing: boolean; submitted: boolean; promptsUsed: number; tokensUsed: number; files: Record<string, string> | null; code: string | null; language: string | null }
  serverTime: string
}

/** Live match state: initial GET plus match:state pushes. Also subscribes the socket to the match room. */
export function useMatch(matchId: string) {
  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [error, setError] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)

  const load = useCallback(async () => {
    const t0 = Date.now()
    try {
      const d = await api<MatchDetail>(`/matches/${matchId}`)
      const t1 = Date.now()
      // Server clock offset, assuming symmetric latency.
      setOffsetMs(new Date(d.serverTime).getTime() - (t0 + t1) / 2)
      setDetail((cur) => (cur ? { ...d, match: newerState(cur.match, d.match) } : d))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the match')
    }
  }, [matchId])

  useEffect(() => {
    void load()
    const s = getSocket()
    const join = () => s.emit(EV.matchJoin, { matchId })
    join()
    s.on('connect', join)
    return () => {
      s.off('connect', join)
    }
  }, [matchId, load])

  useSocketEvent(
    EV.matchState,
    useCallback(
      (ev: MatchStateEvent) => {
        if (ev.matchId !== matchId) return
        setDetail((d) => {
          // Entering live reveals the problem; refetch to get it.
          if (!d || (ev.status !== d.match.status && (ev.status === 'live' || ev.status === 'finished'))) void load()
          return d ? { ...d, match: newerState(d.match, { ...d.match, ...ev }) } : d
        })
      },
      [matchId, load],
    ),
  )

  return { detail, error, offsetMs, reload: load }
}

/** Seconds until an ISO time, ticking every 250 ms, corrected by the server offset. */
export function useCountdown(iso: string | null | undefined, offsetMs = 0): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [iso])
  if (!iso) return null
  return Math.max(0, Math.ceil((new Date(iso).getTime() - (now + offsetMs)) / 1000))
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
