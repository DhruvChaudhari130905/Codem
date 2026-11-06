import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { as, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
let a: TestUser, b: TestUser, c: TestUser
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await resetDb()
  ;[a, b, c] = [await signup(app, 'alice'), await signup(app, 'bob'), await signup(app, 'carol')]
})

const request = (from: TestUser, username: string) =>
  app.inject({ method: 'POST', url: '/friends/requests', headers: as(from), payload: { username } })

describe('friends', () => {
  it('search finds users by prefix and excludes self', async () => {
    const res = await app.inject({ url: '/users/search?q=', headers: as(a) })
    expect(res.json().map((u: { username: string }) => u.username).sort()).toEqual(['bob', 'carol'])
    const bo = await app.inject({ url: '/users/search?q=bo', headers: as(a) })
    expect(bo.json()).toEqual([{ id: b.id, username: 'bob' }])
  })

  it('a request is pending; accepting makes both friends and creates a direct chat', async () => {
    const r = await request(a, 'bob')
    expect(r.statusCode).toBe(201)
    expect(r.json().status).toBe('pending')
    const incoming = await app.inject({ url: '/friends', headers: as(b) })
    expect(incoming.json().incoming).toHaveLength(1)

    expect((await app.inject({ method: 'POST', url: `/friends/requests/${r.json().id}/accept`, headers: as(b) })).statusCode).toBe(200)
    for (const [me, other] of [[a, b], [b, a]] as const) {
      const f = await app.inject({ url: '/friends', headers: as(me) })
      expect(f.json().friends.map((x: { id: string }) => x.id)).toEqual([other.id])
    }
    const chats = await prisma.chat.findMany({ where: { kind: 'direct' }, include: { members: true } })
    expect(chats).toHaveLength(1)
    expect(chats[0].members.map((m) => m.userId).sort()).toEqual([a.id, b.id].sort())
  })

  it('only the addressee can accept', async () => {
    const r = await request(a, 'bob')
    for (const u of [a, c]) {
      expect((await app.inject({ method: 'POST', url: `/friends/requests/${r.json().id}/accept`, headers: as(u) })).statusCode).toBe(403)
    }
  })

  it('duplicate request (either direction) is 409, request to self is 400', async () => {
    await request(a, 'bob')
    expect((await request(a, 'bob')).statusCode).toBe(409)
    expect((await request(b, 'alice')).statusCode).toBe(409)
    expect((await request(a, 'alice')).statusCode).toBe(400)
  })

  it('unknown username is 404', async () => {
    expect((await request(a, 'nobody')).statusCode).toBe(404)
  })
})
