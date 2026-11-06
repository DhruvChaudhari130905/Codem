import { friendRequestBody, idSchema, searchQuery } from '@codem/shared'
import type { FastifyInstance } from 'fastify'
import { requireUser } from '../auth/session.js'
import { ensureDirectChat } from '../chats/service.js'
import { prisma } from '../db.js'
import { HttpError, parse } from '../errors.js'

const userView = { id: true, username: true } as const

export async function friendRoutes(app: FastifyInstance) {
  app.get('/users/search', async (req) => {
    const me = await requireUser(req)
    const { q } = parse(searchQuery, req.query)
    return prisma.user.findMany({
      where: { username: { startsWith: q.toLowerCase() }, id: { not: me.id } },
      select: userView,
      orderBy: { username: 'asc' },
      take: 10,
    })
  })

  app.post('/friends/requests', async (req, reply) => {
    const me = await requireUser(req)
    const { username } = parse(friendRequestBody, req.body)
    if (username === me.username) throw new HttpError(400, 'cannot befriend yourself')
    const other = await prisma.user.findUnique({ where: { username } })
    if (!other) throw new HttpError(404, 'user not found')
    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ requesterId: me.id, addresseeId: other.id }, { requesterId: other.id, addresseeId: me.id }] },
    })
    if (existing) throw new HttpError(409, existing.status === 'accepted' ? 'already friends' : 'request already exists')
    const f = await prisma.friendship.create({ data: { requesterId: me.id, addresseeId: other.id } })
    return reply.code(201).send({ id: f.id, status: f.status })
  })

  app.post('/friends/requests/:id/accept', async (req) => {
    const me = await requireUser(req)
    const id = parse(idSchema, (req.params as { id: string }).id)
    const f = await prisma.friendship.findUnique({ where: { id } })
    if (!f) throw new HttpError(404, 'request not found')
    if (f.addresseeId !== me.id) throw new HttpError(403, 'only the recipient can accept')
    if (f.status === 'accepted') throw new HttpError(409, 'already accepted')
    await prisma.friendship.update({ where: { id }, data: { status: 'accepted' } })
    const chat = await ensureDirectChat(f.requesterId, f.addresseeId)
    return { ok: true, chatId: chat.id }
  })

  app.get('/friends', async (req) => {
    const me = await requireUser(req)
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
      include: { requester: { select: userView }, addressee: { select: userView } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      friends: rows.filter((r) => r.status === 'accepted').map((r) => (r.requesterId === me.id ? r.addressee : r.requester)),
      incoming: rows.filter((r) => r.status === 'pending' && r.addresseeId === me.id).map((r) => ({ id: r.id, user: r.requester })),
      outgoing: rows.filter((r) => r.status === 'pending' && r.requesterId === me.id).map((r) => ({ id: r.id, user: r.addressee })),
    }
  })
}
