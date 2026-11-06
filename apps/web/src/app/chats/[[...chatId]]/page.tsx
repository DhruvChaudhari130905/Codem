'use client'
import { EV, type MatchStateEvent, type PresenceEvent } from '@codem/shared'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ChatList } from '@/components/chat/ChatList'
import { ChatView } from '@/components/chat/ChatView'
import { FriendsDialog } from '@/components/chat/FriendsDialog'
import { NewGroupDialog } from '@/components/chat/NewGroupDialog'
import { ChallengeModal } from '@/components/match/ChallengeModal'
import { api } from '@/lib/api'
import { useMe, useRequireMe } from '@/lib/auth'
import { useSocketEvent } from '@/lib/socket'
import type { ChatSummary, MessageView } from '@/lib/types'

export default function ChatsPage() {
  const me = useRequireMe()
  const { logout } = useMe()
  const router = useRouter()
  const params = useParams<{ chatId?: string[] }>()
  const activeId = params.chatId?.[0]
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [dialog, setDialog] = useState<'friends' | 'group' | 'challenge' | null>(null)

  // The open chat is read as messages arrive, so a refetch never shows it as unread.
  const load = useCallback(
    () => api<ChatSummary[]>('/chats').then((cs) => setChats(cs.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)))).catch(() => setChats([])),
    [activeId],
  )
  const meId = me?.id
  useEffect(() => {
    if (meId) void load()
    // Fetch once per sign-in; later updates arrive over the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId])

  // Opening a chat clears its unread badge locally (ChatView marks it read on the server).
  useEffect(() => {
    if (activeId) setChats((cs) => cs?.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)) ?? cs)
  }, [activeId])

  useSocketEvent(
    EV.chatMessage,
    useCallback(
      (m: MessageView) => {
        setChats((cs) => {
          if (!cs) return cs
          const c = cs.find((x) => x.id === m.chatId)
          if (!c) {
            void load()
            return cs
          }
          const unread = m.chatId !== activeId && m.senderId !== me?.id ? c.unread + 1 : c.unread
          return [{ ...c, lastMessage: m, unread }, ...cs.filter((x) => x.id !== m.chatId)]
        })
        if (m.kind !== 'text') void load()
      },
      [activeId, me?.id, load],
    ),
  )
  useSocketEvent(EV.chatAdded, load)
  useSocketEvent(
    EV.matchState,
    useCallback((ev: MatchStateEvent) => {
      if (ev.status === 'cancelled' || ev.status === 'finished') void load()
    }, [load]),
  )
  useSocketEvent(
    EV.presence,
    useCallback((p: PresenceEvent) => {
      setChats((cs) => cs?.map((c) => ({ ...c, members: c.members.map((m) => (m.id === p.userId ? { ...m, online: p.online } : m)) })) ?? cs)
    }, []),
  )

  if (!me) return null
  const active = chats?.find((c) => c.id === activeId)

  return (
    <div className="flex h-dvh">
      <aside className={`${activeId ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-line bg-surface md:w-80`}>
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <span className="font-display text-2xl font-extrabold tracking-tight">codem<span className="text-cobalt">.</span></span>
          <div className="flex gap-1">
            <button className="btn-ghost px-2.5" onClick={() => setDialog('friends')}>Friends</button>
            <button className="btn-ghost px-2.5" onClick={() => setDialog('group')}>New group</button>
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Chats">
          {chats && <ChatList chats={chats} activeId={activeId} meId={me.id} />}
        </nav>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
          <span className="font-medium">{me.username}</span>
          <button className="text-muted hover:text-ink" onClick={() => logout().then(() => router.push('/login'))}>Sign out</button>
        </div>
      </aside>

      <main className={`${activeId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {active ? (
          <ChatView key={active.id} chat={active} meId={me.id} onStartChallenge={active.liveMatch ? undefined : () => setDialog('challenge')} />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="max-w-xs">
              <p className="font-display text-2xl font-bold">{activeId && chats ? 'Chat not found' : 'Pick a chat'}</p>
              <p className="mt-2 text-sm text-muted">Open a chat on the left and press Start challenge to race your friends on the same problem.</p>
            </div>
          </div>
        )}
      </main>

      {active && <ChallengeModal chatId={active.id} open={dialog === 'challenge'} onClose={() => setDialog(null)} />}
      <FriendsDialog open={dialog === 'friends'} onClose={() => setDialog(null)} onChange={load} />
      <NewGroupDialog
        open={dialog === 'group'}
        onClose={() => setDialog(null)}
        onCreated={(id) => {
          setDialog(null)
          void load().then(() => router.push(`/chats/${id}`))
        }}
      />
    </div>
  )
}
