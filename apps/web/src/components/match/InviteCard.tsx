'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { api, errorText } from '@/lib/api'
import { clock, useCountdown, useMatch } from '@/lib/match'
import type { InviteBody } from '@/lib/types'

const STATUS_TEXT: Record<string, string> = {
  waiting_for_players: 'Waiting for players',
  countdown: 'Starting',
  live: 'Live now',
  judging: 'Judging',
  finished: 'Finished',
  cancelled: 'Cancelled: not enough players joined',
}

export function InviteCard({ matchId, body, meId }: { matchId: string; body: InviteBody; meId: string }) {
  const { detail, offsetMs, reload } = useMatch(matchId)
  const router = useRouter()
  const [error, setError] = useState('')
  const left = useCountdown(detail?.match.status === 'waiting_for_players' ? detail.match.joinDeadline : null, offsetMs)
  const st = detail?.match
  const joined = !!st?.players.some((p) => p.userId === meId)
  const isHost = st?.hostId === meId
  const redirected = useRef(false)

  // Socket pushes drive this card; a slow poll while waiting covers a missed push.
  useEffect(() => {
    if (st?.status !== 'waiting_for_players') return
    const t = setInterval(reload, 4000)
    return () => clearInterval(t)
  }, [st?.status, reload])

  // Players are pulled into the arena the moment the match starts.
  useEffect(() => {
    if (!redirected.current && joined && (st?.status === 'countdown' || st?.status === 'live')) {
      redirected.current = true
      router.push(`/match/${matchId}`)
    }
  }, [st?.status, joined, matchId, router])

  async function act(path: 'join' | 'start') {
    setError('')
    try {
      await api(`/matches/${matchId}/${path}`, { method: 'POST' })
    } catch (e) {
      setError(errorText(e))
    }
  }

  const ended = st?.status === 'finished' || st?.status === 'cancelled'
  return (
    <article aria-label="Challenge" className={`mx-auto flex w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-[0_1px_0_var(--color-line)] ${ended ? 'opacity-70' : ''}`}>
      <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 bg-cobalt px-2 py-4 text-white">
        <span className="text-2xl" aria-hidden>⚔️</span>
        <span className="text-xs font-semibold">{body.mode === 'coding' ? 'Coding' : 'Prompting'}</span>
      </div>
      <div className="relative min-w-0 flex-1 border-l-2 border-dashed border-paper p-4">
        <p className="text-xs text-muted">{STATUS_TEXT[st?.status ?? 'waiting_for_players']}</p>
        <h3 className="mt-0.5 truncate font-display text-lg font-bold leading-tight">{body.problemTitle}</h3>
        <p className="text-xs text-muted">
          {body.difficulty}, {body.timeLimitSec / 60} min, {body.language ?? 'any language'}
        </p>

        {left !== null && (
          <p className="mt-3 font-display text-3xl font-extrabold tabular-nums" aria-label={`${left} seconds left to join`}>
            {clock(left)}
          </p>
        )}

        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Players">
          {st?.players.map((p) => (
            <li key={p.userId} className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium">
              {p.username}
              {p.userId === st.hostId ? ' (host)' : ''}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          {st?.status === 'waiting_for_players' && !joined && <button className="btn-primary" onClick={() => act('join')}>Join</button>}
          {st?.status === 'waiting_for_players' && isHost && (
            <button className="btn-primary" disabled={(st.players.length ?? 0) < 2} onClick={() => act('start')} title={st.players.length < 2 ? 'Needs at least 2 players' : undefined}>
              Start now
            </button>
          )}
          {st?.status === 'waiting_for_players' && joined && !isHost && <span className="text-sm text-muted">You're in. Waiting for the host.</span>}
          {(st?.status === 'countdown' || st?.status === 'live' || st?.status === 'judging') && joined && (
            <Link className="btn-primary" href={`/match/${matchId}`}>Open arena</Link>
          )}
          {st?.status === 'finished' && <Link className="btn-outline" href={`/match/${matchId}/results`}>View results</Link>}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-fail">{error}</p>}
      </div>
    </article>
  )
}
