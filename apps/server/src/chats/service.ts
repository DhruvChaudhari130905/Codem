import type { Chat, Message, MessageKind } from '@prisma/client'
import { prisma } from '../db.js'

/** The single direct chat between two users; created on first friendship acceptance. */
export async function ensureDirectChat(a: string, b: string): Promise<Chat> {
  const directKey = [a, b].sort().join(':')
  const chat = await prisma.chat.upsert({
    where: { directKey },
    update: {},
    create: {
      kind: 'direct',
      directKey,
      createdById: a,
      members: { create: [{ userId: a }, { userId: b }] },
    },
  })
  for (const u of [a, b]) chatHooks.onMemberAdded?.(chat.id, u)
  return chat
}

type Hooks = {
  onMessage?: (m: Message & { sender: { username: string | null } | null }) => void
  onMemberAdded?: (chatId: string, userId: string) => void
}
export const chatHooks: Hooks = {}

/** Insert a message and broadcast it to the chat room (realtime layer sets the hook). */
export async function createMessage(data: { chatId: string; senderId: string | null; kind: MessageKind; body: string; matchId?: string | null }): Promise<Message> {
  const m = await prisma.message.create({ data, include: { sender: { select: { username: true } } } })
  chatHooks.onMessage?.(m)
  return m
}

export function postSystemMessage(chatId: string, kind: Exclude<MessageKind, 'text'>, matchId: string, body: unknown): Promise<Message> {
  return createMessage({ chatId, senderId: null, kind, body: JSON.stringify(body), matchId })
}

export type MessageView = {
  id: string
  chatId: string
  senderId: string | null
  senderName: string | null
  kind: MessageKind
  body: string
  matchId: string | null
  createdAt: string
}

export function toMessageView(m: Message & { sender?: { username: string | null } | null }): MessageView {
  return {
    id: m.id,
    chatId: m.chatId,
    senderId: m.senderId,
    senderName: m.sender?.username ?? null,
    kind: m.kind,
    body: m.body,
    matchId: m.matchId,
    createdAt: m.createdAt.toISOString(),
  }
}
