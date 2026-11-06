'use client'
import { EV, type Language, type MatchProgressEvent } from '@codem/shared'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArenaHeader } from '@/components/arena/ArenaHeader'
import { CodeEditor, useSavedCode } from '@/components/arena/CodeEditor'
import { ProblemPanel } from '@/components/arena/ProblemPanel'
import { PromptingArena } from '@/components/arena/PromptingArena'
import { RunPanel } from '@/components/arena/RunPanel'
import { useRequireMe } from '@/lib/auth'
import { useCountdown, useMatch, type MatchDetail } from '@/lib/match'
import { useSocketEvent } from '@/lib/socket'

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="grid h-dvh place-items-center p-8 text-center">{children}</main>
}

function CodingArena({ detail, matchId, onSubmitted }: { detail: MatchDetail; matchId: string; onSubmitted: () => void }) {
  const [code, setCode] = useSavedCode(matchId, (detail.match.language as Language | null) ?? null)
  const latest = useRef(code)
  latest.current = code
  const getSource = useCallback(() => ({ source: latest.current?.code ?? '', language: latest.current?.language ?? 'python' }), [])
  if (!detail.problem || !code) return null
  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(320px,2fr)_3fr]">
      <div className="min-h-0 border-r border-line bg-surface">
        <ProblemPanel problem={detail.problem} />
      </div>
      <div className="flex min-h-[70vh] flex-col md:min-h-0">
        <div className="min-h-0 flex-1">
          <CodeEditor value={code} onChange={setCode} locked={!!detail.match.language} readOnly={detail.me.submitted} />
        </div>
        <RunPanel matchId={matchId} getSource={getSource} submitted={detail.me.submitted} onSubmitted={onSubmitted} />
      </div>
    </div>
  )
}

export default function ArenaPage() {
  const me = useRequireMe()
  const { matchId } = useParams<{ matchId: string }>()
  const router = useRouter()
  const { detail, error, offsetMs, reload } = useMatch(matchId)
  const [progress, setProgress] = useState<Record<string, MatchProgressEvent>>({})
  const startIn = useCountdown(detail?.match.status === 'countdown' ? detail.match.startsAt : null, offsetMs)

  useSocketEvent(
    EV.matchProgress,
    useCallback((p: MatchProgressEvent) => {
      if (p.matchId === matchId) setProgress((prev) => ({ ...prev, [p.userId]: { ...prev[p.userId], ...p } }))
    }, [matchId]),
  )

  const status = detail?.match.status
  useEffect(() => {
    if (status === 'finished') router.replace(`/match/${matchId}/results`)
  }, [status, matchId, router])
  // The countdown timer flips the match to live server-side; refetch shortly after it ends in case the push is missed.
  useEffect(() => {
    if (startIn === 0 && status === 'countdown') {
      const t = setTimeout(reload, 1000)
      return () => clearTimeout(t)
    }
  }, [startIn, status, reload])

  if (!me) return null
  if (error) return <Centered><p>{error} <Link className="text-cobalt" href="/chats">Back to chats</Link></p></Centered>
  if (!detail) return <Centered><p className="text-muted">Loading match…</p></Centered>
  const { match } = detail

  if (match.status === 'waiting_for_players') {
    return <Centered><div><p className="font-display text-2xl font-bold">Waiting for the host to start</p><Link className="btn-outline mt-4" href={`/chats/${match.chatId}`}>Back to chat</Link></div></Centered>
  }
  if (match.status === 'cancelled') {
    return <Centered><div><p className="font-display text-2xl font-bold">Match cancelled</p><p className="mt-1 text-sm text-muted">Fewer than 2 players joined in time.</p><Link className="btn-outline mt-4" href={`/chats/${match.chatId}`}>Back to chat</Link></div></Centered>
  }
  if (match.status === 'countdown') {
    return (
      <Centered>
        <div>
          <p className="text-sm text-muted">{match.mode === 'coding' ? 'Coding' : 'Prompting'} round starts in</p>
          <p className="font-display text-[9rem] font-extrabold leading-none tabular-nums text-cobalt" aria-live="polite">{startIn ?? ''}</p>
          <p className="text-sm text-muted">{match.players.map((p) => p.username).join(' vs ')}</p>
        </div>
      </Centered>
    )
  }

  const waitingForOthers = detail.me.submitted || match.status === 'judging'
  return (
    <div className="flex h-dvh flex-col">
      <ArenaHeader state={match} title={detail.problem?.title ?? ''} offsetMs={offsetMs} progress={progress} meId={me.id} />
      {waitingForOthers && (
        <p role="status" className="bg-cobalt-soft px-4 py-2 text-center text-sm">
          {match.status === 'judging' ? 'Judging every submission against the hidden tests…' : 'Submitted. Waiting for the others to finish.'}
        </p>
      )}
      {!detail.me.playing ? (
        <Centered><p className="text-muted">You're not playing in this match.</p></Centered>
      ) : match.mode === 'coding' ? (
        <CodingArena detail={detail} matchId={matchId} onSubmitted={reload} />
      ) : (
        <PromptingArena detail={detail} matchId={matchId} onSubmitted={reload} />
      )}
    </div>
  )
}
