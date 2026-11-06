'use client'
import { InviteCard } from '@/components/match/InviteCard'
import { ResultCard } from '@/components/match/ResultCard'
import type { InviteBody, MessageView, ResultBody } from '@/lib/types'

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

/** Match cards posted into the chat by the server. */
export function SystemCard({ m, meId }: { m: MessageView; meId: string }) {
  if (!m.matchId) return null
  if (m.kind === 'match_invite') {
    const body = parse<InviteBody>(m.body)
    return body && <InviteCard matchId={m.matchId} body={body} meId={meId} />
  }
  if (m.kind === 'match_result') {
    const body = parse<ResultBody>(m.body)
    return body && <ResultCard matchId={m.matchId} body={body} />
  }
  return (
    <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">
      <span className="size-1.5 rounded-full bg-live" aria-hidden />
      Match started
    </p>
  )
}
