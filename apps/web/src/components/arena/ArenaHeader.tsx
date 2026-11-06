'use client'
import type { MatchProgressEvent, MatchStateEvent } from '@codem/shared'
import Link from 'next/link'
import { clock, useCountdown } from '@/lib/match'

type Props = { state: MatchStateEvent; title: string; offsetMs: number; progress: Record<string, MatchProgressEvent>; meId: string }

export function ArenaHeader({ state, title, offsetMs, progress, meId }: Props) {
  const left = useCountdown(state.status === 'live' ? state.endsAt : null, offsetMs)
  const urgent = left !== null && left <= 60
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
      <Link href={`/chats/${state.chatId}`} className="font-display text-xl font-extrabold tracking-tight">
        codem<span className="text-cobalt">.</span>
      </Link>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted">{title}</span>
      <ul className="flex flex-wrap gap-2" aria-label="Players">
        {state.players.map((p) => {
          const pr = progress[p.userId]
          const detail = state.mode === 'coding'
            ? pr?.sampleTotal ? `${pr.samplePassed}/${pr.sampleTotal} samples` : 'no runs yet'
            : `${pr?.promptsUsed ?? 0} prompts${pr?.sampleTotal ? `, ${pr.samplePassed}/${pr.sampleTotal}` : ''}`
          return (
            <li key={p.userId} aria-label={`${p.username} progress`} className={`rounded-full px-3 py-1 text-xs ${p.userId === meId ? 'bg-cobalt-soft' : 'bg-paper'}`}>
              <span className="font-semibold">{p.username}</span> {p.submitted ? '✅ submitted' : detail}
            </li>
          )
        })}
      </ul>
      {left !== null && (
        <span role="timer" aria-label="Time left" className={`font-display text-2xl font-extrabold tabular-nums ${urgent ? 'text-live' : ''}`}>
          {clock(left)}
        </span>
      )}
    </header>
  )
}
