import { randomBytes } from 'node:crypto'
import { addMemberBody, createGroupBody, idSchema, LIMITS, messagesQuery, postMessageBody } from '@codem/shared'
import { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireUser } from '../auth/session.js'
import { prisma } from '../db.js'
import { HttpError, parse } from '../errors.js'
import { rateLimit } from '../ratelimit.js'
import { friendIds } from '../friends/service.js'
import { assertMember } from './authz.js'
import { chatHooks, createMessage, toMessageView } from './service.js'

const chatIdParam = (req: FastifyRequest) => parse(idSchema, (req.params as { id: string }).id)
const ACTIVE_MATCH: Prisma.MatchWhereInput = { status: { in: ['waiting_for_players', 'countdown', 'live', 'judging'] } }

export async function chatRoutes(app: FastifyInstance) {
  app.get('/chats', async (req) => {
    const me = await requireUser(req)
    const memberships = await prisma.chatMember.findMany({
      where: { userId: me.id },
      include: {
        chat: {
          include: {
            members: { include: { user: { select: { id: true, username: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { username: true } } } },
            matches: { where: ACTIVE_MATCH, select: { id: true, status: true }, take: 1 },
          },
        },
      },
    })
    const unread = await prisma.$queryRaw<{ chatId: string; n: bigint }[]>`
      select m."chatId", count(*) as n from "Message" m
      join "ChatMember" cm on cm."chatId" = m."chatId" and cm."userId" = ${me.id}
      where m."createdAt" > cm."lastReadAt" and m."senderId" is distinct from ${me.id}
      group by m."chatId"`
    const unreadBy = new Map(unread.map((r) => [r.chatId, Number(r.n)]))
    const online = await app.isOnline([...new Set(memberships.flatMap((m) => m.chat.members.map((x) => x.userId)))])
    return memberships
      .map(({ chat, role }) => {
        const other = chat.kind === 'direct' ? chat.members.find((m) => m.userId !== me.id)?.user : null
        const last = chat.messages[0]
        return {
          id: chat.id,
          kind: chat.kind,
          title: chat.kind === 'direct' ? (other?.username ?? 'unknown') : (chat.name ?? 'group'),
          role,
          inviteCode: chat.kind === 'group' && role === 'admin' ? chat.inviteCode : null,
          members: chat.members.map((m) => ({ id: m.user.id, username: m.user.username, role: m.role, online: online.has(m.userId) })),
          lastMessage: last ? toMessageView(last) : null,
          unread: unreadBy.get(chat.id) ?? 0,
          liveMatch: chat.matches[0] ?? null,
          sortKey: (last?.createdAt ?? chat.createdAt).toISOString(),
        }
      })
      .sort((x, y) => y.sortKey.localeCompare(x.sortKey))
  })

  app.post('/chats/groups', async (req, reply) => {
    const me = await requireUser(req)
    const body = parse(createGroupBody, req.body)
    const ids = [...new Set(body.memberIds.filter((id) => id !== me.id))]
    if (ids.length + 1 > LIMITS.groupMaxMembers) throw new HttpError(400, `groups hold at most ${LIMITS.groupMaxMembers} members`)
    const friends = await friendIds(me.id)
    if (ids.some((id) => !friends.has(id))) throw new HttpError(400, 'you can only add friends to a group')
    const chat = await prisma.chat.create({
      data: {
        kind: 'group',
        name: body.name,
        createdById: me.id,
        inviteCode: randomBytes(9).toString('base64url'),
        members: { create: [{ userId: me.id, role: 'admin' }, ...ids.map((userId) => ({ userId }))] },
      },
    })
    for (const u of [me.id, ...ids]) chatHooks.onMemberAdded?.(chat.id, u)
    return reply.code(201).send({ id: chat.id, inviteCode: chat.inviteCode })
  })

  app.post('/chats/:id/members', async (req) => {
    const me = await requireUser(req)
    const chatId = chatIdParam(req)
    const { userId } = parse(addMemberBody, req.body)
    const m = await assertMember(chatId, me.id)
    const chat = await prisma.chat.findUniqueOrThrow({ where: { id: chatId } })
    if (chat.kind !== 'group' || m.role !== 'admin') throw new HttpError(403, 'only the group admin can add members')
    if (!(await friendIds(me.id)).has(userId)) throw new HttpError(400, 'you can only add friends to a group')
    await addToGroup(chatId, userId)
    return { ok: true }
  })

  app.post('/chats/join/:code', async (req) => {
    const me = await requireUser(req)
    const code = parse(z.string().min(1).max(32), (req.params as { code: string }).code)
    const chat = await prisma.chat.findUnique({ where: { inviteCode: code } })
    if (!chat || chat.kind !== 'group') throw new HttpError(404, 'invite not found')
    await addToGroup(chat.id, me.id)
    return { id: chat.id }
  })

  app.get('/chats/:id/messages', async (req) => {
    const me = await requireUser(req)
    const chatId = chatIdParam(req)
    await assertMember(chatId, me.id)
    const q = parse(messagesQuery, req.query)
    let cursor: { createdAt: Date; id: string } | null = null
    if (q.before) {
      cursor = await prisma.message.findFirst({ where: { id: q.before, chatId }, select: { createdAt: true, id: true } })
      if (!cursor) throw new HttpError(400, 'unknown cursor')
    }
    const rows = await prisma.message.findMany({
      where: {
        chatId,
        ...(cursor && { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: { sender: { select: { username: true } } },
    })
    const hasMore = rows.length > q.limit
    return { messages: rows.slice(0, q.limit).reverse().map(toMessageView), hasMore }
  })

  app.post('/chats/:id/messages', async (req, reply) => {
    const me = await requireUser(req)
    const chatId = chatIdParam(req)
    await assertMember(chatId, me.id)
    const { body } = parse(postMessageBody, req.body)
    await rateLimit('message', me.id)
    const m = await createMessage({ chatId, senderId: me.id, kind: 'text', body })
    await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId: me.id } }, data: { lastReadAt: m.createdAt } })
    return reply.code(201).send(toMessageView({ ...m, sender: { username: me.username } }))
  })

  app.post('/chats/:id/read', async (req) => {
    const me = await requireUser(req)
    const chatId = chatIdParam(req)
    await assertMember(chatId, me.id)
    await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId: me.id } }, data: { lastReadAt: new Date() } })
    return { ok: true }
  })
}

async function addToGroup(chatId: string, userId: string) {
  const added = await prisma.$transaction(async (tx) => {
    // Lock the chat row so concurrent joins cannot exceed the member cap.
    await tx.$queryRaw`select id from "Chat" where id = ${chatId} for update`
    const count = await tx.chatMember.count({ where: { chatId } })
    const exists = await tx.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } })
    if (exists) return false
    if (count >= LIMITS.groupMaxMembers) throw new HttpError(400, `groups hold at most ${LIMITS.groupMaxMembers} members`)
    await tx.chatMember.create({ data: { chatId, userId } })
    return true
  })
  if (added) chatHooks.onMemberAdded?.(chatId, userId)
}
