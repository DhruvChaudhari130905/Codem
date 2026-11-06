import { EV, idSchema, room, typingPayload, type PresenceEvent, type TypingEvent } from '@codem/shared'
import { createAdapter } from '@socket.io/redis-adapter'
import type { FastifyInstance } from 'fastify'
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import { SESSION_COOKIE, userFromSid } from '../auth/session.js'
import { isMember } from '../chats/authz.js'
import { chatHooks, toMessageView } from '../chats/service.js'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { createRedis } from '../redis.js'
import { emitToChat, joinUserToChat, setIo } from './rooms.js'

type SocketUser = { id: string; username: string }

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** Extra hook for match rooms; set by the matches module. Returns true if the user may watch the match. */
export const socketHooks: { canJoinMatch?: (matchId: string, userId: string) => Promise<boolean> } = {}

export function attachRealtime(app: FastifyInstance): Server {
  const pub = createRedis()
  const sub = pub.duplicate()
  const presence = createRedis()
  const io = new Server(app.server, {
    cors: { origin: env.webUrl, credentials: true },
    adapter: createAdapter(pub, sub, { key: env.socketKey }),
    maxHttpBufferSize: 100_000,
  })
  setIo(io)

  io.use(async (socket, next) => {
    try {
      const raw = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE]
      const unsigned = raw ? app.unsignCookie(raw) : null
      const user = unsigned?.valid ? await userFromSid(unsigned.value) : null
      if (!user?.username) return next(new Error('unauthenticated'))
      socket.data.user = { id: user.id, username: user.username } satisfies SocketUser
      next()
    } catch (e) {
      next(e as Error)
    }
  })

  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user as SocketUser
    const memberships = await prisma.chatMember.findMany({ where: { userId: user.id }, select: { chatId: true } })
    socket.join([room.user(user.id), ...memberships.map((m) => room.chat(m.chatId))])

    const presenceKey = `${env.socketKey}:presence`
    if ((await presence.hincrby(presenceKey, user.id, 1)) === 1) {
      for (const m of memberships) emitToChat(m.chatId, EV.presence, { userId: user.id, online: true } satisfies PresenceEvent)
    }
    socket.on('disconnect', async () => {
      try {
        if ((await presence.hincrby(presenceKey, user.id, -1)) <= 0) {
          await presence.hdel(presenceKey, user.id)
          for (const m of memberships) emitToChat(m.chatId, EV.presence, { userId: user.id, online: false } satisfies PresenceEvent)
        }
      } catch {
        // Redis already closed during shutdown; presence is best effort.
      }
    })

    socket.on(EV.chatJoin, async (payload: unknown) => {
      const p = typingPayload.safeParse(payload)
      if (p.success && (await isMember(p.data.chatId, user.id))) socket.join(room.chat(p.data.chatId))
    })

    socket.on(EV.chatTyping, (payload: unknown) => {
      const p = typingPayload.safeParse(payload)
      if (!p.success || !socket.rooms.has(room.chat(p.data.chatId))) return
      socket.to(room.chat(p.data.chatId)).emit(EV.chatTyping, { chatId: p.data.chatId, userId: user.id, username: user.username } satisfies TypingEvent)
    })

    socket.on(EV.matchJoin, async (payload: unknown, ack?: (ok: boolean) => void) => {
      const p = z.object({ matchId: idSchema }).safeParse(payload)
      const ok = p.success && !!socketHooks.canJoinMatch && (await socketHooks.canJoinMatch(p.data.matchId, user.id))
      if (ok) socket.join(room.match(p.data.matchId))
      if (typeof ack === 'function') ack(ok)
    })

    socket.emit('ready', { userId: user.id })
  })

  /** Online user ids among `ids`. */
  app.decorate('isOnline', async (ids: string[]) => {
    if (!ids.length) return new Set<string>()
    const vals = await presence.hmget(`${env.socketKey}:presence`, ...ids)
    return new Set(ids.filter((_, i) => Number(vals[i] ?? 0) > 0))
  })

  chatHooks.onMessage = (m) => emitToChat(m.chatId, EV.chatMessage, toMessageView(m))
  chatHooks.onMemberAdded = (chatId, userId) => {
    joinUserToChat(userId, chatId)
    io.to(room.user(userId)).emit(EV.chatAdded, { chatId })
  }

  app.addHook('onClose', async () => {
    setIo(null)
    await new Promise<void>((r) => io.close(() => r()))
    await Promise.allSettled([pub.quit(), sub.quit(), presence.quit()])
  })
  return io
}

declare module 'fastify' {
  interface FastifyInstance {
    isOnline: (ids: string[]) => Promise<Set<string>>
  }
}
