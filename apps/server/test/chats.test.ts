import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { as, befriend, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
let a: TestUser, b: TestUser, c: TestUser
let direct: string
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await resetDb()
  ;[a, b, c] = [await signup(app, 'alice'), await signup(app, 'bob'), await signup(app, 'carol')]
  direct = await befriend(app, a, b)
})

const post = (u: TestUser, chatId: string, body: string) =>
  app.inject({ method: 'POST', url: `/chats/${chatId}/messages`, headers: as(u), payload: { body } })

describe('chats', () => {
  it('non-members cannot read or post messages (403)', async () => {
    expect((await app.inject({ url: `/chats/${direct}/messages`, headers: as(c) })).statusCode).toBe(403)
    expect((await post(c, direct, 'hi')).statusCode).toBe(403)
  })

  it('empty or too long body is 400', async () => {
    expect((await post(a, direct, '   ')).statusCode).toBe(400)
    expect((await post(a, direct, 'x'.repeat(4001))).statusCode).toBe(400)
  })

  it('group with a non-friend is 400; group over 20 members is 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/chats/groups', headers: as(a), payload: { name: 'g', memberIds: [b.id, c.id] } })
    expect(r.statusCode).toBe(400)
    const many = Array.from({ length: 20 }, (_, i) => `fake${i}`)
    const r2 = await app.inject({ method: 'POST', url: '/chats/groups', headers: as(a), payload: { name: 'g', memberIds: many } })
    expect(r2.statusCode).toBe(400)
  })

  it('creates a group of friends, admin adds members, invite code joins', async () => {
    await befriend(app, a, c)
    const g = await app.inject({ method: 'POST', url: '/chats/groups', headers: as(a), payload: { name: 'crew', memberIds: [b.id] } })
    expect(g.statusCode).toBe(201)
    const gid = g.json().id
    expect((await app.inject({ method: 'POST', url: `/chats/${gid}/members`, headers: as(b), payload: { userId: c.id } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/chats/${gid}/members`, headers: as(a), payload: { userId: c.id } })).statusCode).toBe(200)
    const d = await signup(app, 'dave')
    const join = await app.inject({ method: 'POST', url: `/chats/join/${g.json().inviteCode}`, headers: as(d) })
    expect(join.statusCode).toBe(200)
    expect(await prisma.chatMember.count({ where: { chatId: gid } })).toBe(4)
  })

  it('paginates newest 50 then older via before', async () => {
    await prisma.message.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({ chatId: direct, senderId: a.id, body: `m${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) })),
    })
    const first = (await app.inject({ url: `/chats/${direct}/messages`, headers: as(b) })).json()
    expect(first.messages).toHaveLength(50)
    expect(first.messages.at(-1).body).toBe('m59')
    expect(first.messages[0].body).toBe('m10')
    const older = (await app.inject({ url: `/chats/${direct}/messages?before=${first.messages[0].id}`, headers: as(b) })).json()
    expect(older.messages.map((m: { body: string }) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`))
    expect(older.hasMore).toBe(false)
  })

  it('unread count drops to 0 after /read; list shows last message', async () => {
    await post(a, direct, 'one')
    await post(a, direct, 'two')
    const list = (await app.inject({ url: '/chats', headers: as(b) })).json()
    const ch = list.find((x: { id: string }) => x.id === direct)
    expect(ch.unread).toBe(2)
    expect(ch.lastMessage.body).toBe('two')
    expect(ch.title).toBe('alice')
    await app.inject({ method: 'POST', url: `/chats/${direct}/read`, headers: as(b) })
    const after = (await app.inject({ url: '/chats', headers: as(b) })).json()
    expect(after.find((x: { id: string }) => x.id === direct).unread).toBe(0)
    // own messages never count as unread
    expect((await app.inject({ url: '/chats', headers: as(a) })).json()[0].unread).toBe(0)
  })
})
