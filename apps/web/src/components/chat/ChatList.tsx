'use client'
import Link from 'next/link'
import type { ChatSummary } from '@/lib/types'

function preview(c: ChatSummary): string {
  const m = c.lastMessage
  if (!m) return c.kind === 'group' ? `${c.members.length} members` : 'Say hi'
  if (m.kind === 'match_invite') return 'Challenge posted'
  if (m.kind === 'match_live') return 'Match is live'
  if (m.kind === 'match_result') return 'Match results'
  return c.kind === 'group' && m.senderName ? `${m.senderName}: ${m.body}` : m.body
}

export function ChatList({ chats, activeId, meId }: { chats: ChatSummary[]; activeId?: string; meId: string }) {
  if (!chats.length) {
    return <p className="px-5 py-6 text-sm text-muted">No chats yet. Add a friend to start a 1:1 chat, or create a group.</p>
  }
  return (
    <ul>
      {chats.map((c) => {
        const other = c.kind === 'direct' ? c.members.find((m) => m.id !== meId) : null
        const active = c.id === activeId
        return (
          <li key={c.id}>
            <Link
              href={`/chats/${c.id}`}
              className={`flex items-center gap-3 px-4 py-3 transition-colors ${active ? 'bg-cobalt-soft' : 'hover:bg-paper'}`}
            >
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-bold text-white">
                {c.title.slice(0, 2).toUpperCase()}
                {other?.online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-pass" aria-label="online" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{c.title}</span>
                  {c.liveMatch && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-live/10 px-2 py-0.5 text-xs font-semibold text-live">
                      <span className="size-1.5 animate-pulse rounded-full bg-live" />
                      match live
                    </span>
                  )}
                </span>
                <span className="block truncate text-sm text-muted">{preview(c)}</span>
              </span>
              {c.unread > 0 && (
                <span aria-label={`${c.unread} unread`} className="grid min-w-6 place-items-center rounded-full bg-cobalt px-1.5 text-xs font-bold text-white">
                  {c.unread}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
