'use client'
import { EV, type TypingEvent } from '@codem/shared'
import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, errorText } from '@/lib/api'
import { getSocket, useSocketEvent } from '@/lib/socket'
import type { ChatSummary, MessageView } from '@/lib/types'
import { MessageBubble } from './MessageBubble'
import { SystemCard } from './SystemCard'

type Props = { chat: ChatSummary; meId: string; onStartChallenge?: () => void }

export function ChatView({ chat, meId, onStartChallenge }: Props) {
  const [messages, setMessages] = useState<MessageView[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastTypingSent = useRef(0)

  useEffect(() => {
    let alive = true
    setMessages([])
    setError('')
    api<{ messages: MessageView[]; hasMore: boolean }>(`/chats/${chat.id}/messages`)
      .then((r) => {
        if (!alive) return
        stickToBottom.current = true
        setMessages(r.messages)
        setHasMore(r.hasMore)
      })
      .catch((e) => alive && setError(errorText(e)))
    void api(`/chats/${chat.id}/read`, { method: 'POST' }).catch(() => {})
    return () => {
      alive = false
    }
  }, [chat.id])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onMessage = useCallback(
    (m: MessageView) => {
      if (m.chatId !== chat.id) return
      const el = scroller.current
      stickToBottom.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120 || m.senderId === meId
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      const sender = m.senderId
      if (sender) setTyping((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== sender)))
      if (m.senderId !== meId) void api(`/chats/${chat.id}/read`, { method: 'POST' }).catch(() => {})
    },
    [chat.id, meId],
  )
  useSocketEvent(EV.chatMessage, onMessage)

  const onTyping = useCallback(
    (t: TypingEvent) => {
      if (t.chatId === chat.id) setTyping((prev) => ({ ...prev, [t.userId]: { name: t.username, until: Date.now() + 3000 } }))
    },
    [chat.id],
  )
  useSocketEvent(EV.chatTyping, onTyping)
  useEffect(() => {
    const t = setInterval(() => setTyping((prev) => Object.fromEntries(Object.entries(prev).filter(([, v]) => v.until > Date.now()))), 1000)
    return () => clearInterval(t)
  }, [])

  async function loadOlder() {
    const el = scroller.current
    const before = el?.scrollHeight ?? 0
    const r = await api<{ messages: MessageView[]; hasMore: boolean }>(`/chats/${chat.id}/messages?before=${messages[0].id}`)
    stickToBottom.current = false
    setMessages((prev) => [...r.messages, ...prev])
    setHasMore(r.hasMore)
    requestAnimationFrame(() => el && (el.scrollTop = el.scrollHeight - before))
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      const m = await api<MessageView>(`/chats/${chat.id}/messages`, { body: { body } })
      onMessage(m)
    } catch (err) {
      setError(errorText(err))
      setDraft(body)
    }
  }

  function onDraft(v: string) {
    setDraft(v)
    if (Date.now() - lastTypingSent.current > 2000) {
      lastTypingSent.current = Date.now()
      getSocket().emit(EV.chatTyping, { chatId: chat.id })
    }
  }

  const typers = Object.values(typing).map((t) => t.name)
  const online = chat.members.filter((m) => m.online && m.id !== meId).length

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <Link href="/chats" className="btn-ghost px-2 md:hidden" aria-label="Back to chats">←</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">{chat.title}</h1>
          <p className="truncate text-xs text-muted">
            {typers.length ? `${typers.join(', ')} typing…` : chat.kind === 'group' ? `${chat.members.length} members, ${online} online` : online ? 'online' : 'offline'}
          </p>
        </div>
        {chat.inviteCode && (
          <button
            className="btn-ghost hidden text-xs sm:inline-flex"
            onClick={() => navigator.clipboard?.writeText(`${location.origin}/join/${chat.inviteCode}`)}
            title="Copy invite link"
          >
            Copy invite link
          </button>
        )}
        <button className="btn-primary" onClick={onStartChallenge} disabled={!onStartChallenge}>
          ⚔️ Start challenge
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {hasMore && (
          <div className="text-center">
            <button className="btn-ghost text-xs" onClick={loadOlder}>Load earlier messages</button>
          </div>
        )}
        {messages.map((m) =>
          m.kind === 'text' ? (
            <MessageBubble key={m.id} m={m} mine={m.senderId === meId} showName={chat.kind === 'group'} />
          ) : (
            <div key={m.id} className="py-2"><SystemCard m={m} meId={meId} /></div>
          ),
        )}
        {!messages.length && !error && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hi, or start a challenge.</p>}
      </div>

      {error && <p role="alert" className="px-4 pb-1 text-sm text-fail">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-line bg-surface p-3">
        <textarea
          className="field max-h-32 min-h-10 flex-1 resize-none"
          rows={1}
          placeholder="Message"
          value={draft}
          maxLength={4000}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="btn-primary" disabled={!draft.trim()}>Send</button>
      </form>
    </section>
  )
}
