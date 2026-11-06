import { EV } from '@codem/shared'
import type { FastifyInstance } from 'fastify'
import { io as connect, type Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { as, befriend, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
let url: string
let a: TestUser, b: TestUser, c: TestUser
let chatId: string
const sockets: Socket[] = []

beforeAll(async () => {
  app = await buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await resetDb()
  ;[a, b, c] = [await signup(app, 'alice'), await signup(app, 'bob'), await signup(app, 'carol')]
  chatId = await befriend(app, a, b)
})
afterEach(() => { for (const s of sockets.splice(0)) s.disconnect() })

function open(u?: TestUser): Promise<Socket> {
  const s = connect(url, { transports: ['websocket'], extraHeaders: u ? { cookie: u.cookie } : {}, reconnection: false, forceNew: true })
  sockets.push(s)
  return new Promise((resolve, reject) => {
    s.on('ready', () => resolve(s))
    s.on('connect_error', reject)
  })
}

const next = <T>(s: Socket, ev: string, ms = 1000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${ev} within ${ms}ms`)), ms)
    s.once(ev, (p: T) => { clearTimeout(t); resolve(p) })
  })

const silent = (s: Socket, ev: string, ms = 500) =>
  new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(true), ms)
    s.once(ev, () => { clearTimeout(t); resolve(false) })
  })

describe('realtime', () => {
  it('rejects an unauthenticated socket', async () => {
    await expect(open()).rejects.toThrow()
  })

  it('member receives chat:message within 1s of POST; non-member does not', async () => {
    const sb = await open(b)
    const sc = await open(c)
    const got = next<{ body: string; senderName: string }>(sb, EV.chatMessage)
    const quiet = silent(sc, EV.chatMessage)
    await app.inject({ method: 'POST', url: `/chats/${chatId}/messages`, headers: as(a), payload: { body: 'hi' } })
    expect(await got).toMatchObject({ body: 'hi', senderName: 'alice' })
    expect(await quiet).toBe(true)
  })

  it('chat:join for a non-member chat yields no events', async () => {
    const sc = await open(c)
    sc.emit(EV.chatJoin, { chatId })
    await new Promise((r) => setTimeout(r, 100))
    const quiet = silent(sc, EV.chatMessage)
    await app.inject({ method: 'POST', url: `/chats/${chatId}/messages`, headers: as(a), payload: { body: 'secret' } })
    expect(await quiet).toBe(true)
  })

  it('typing is relayed to other members only', async () => {
    const sa = await open(a)
    const sb = await open(b)
    const got = next<{ username: string }>(sb, EV.chatTyping)
    const self = silent(sa, EV.chatTyping)
    sa.emit(EV.chatTyping, { chatId })
    expect((await got).username).toBe('alice')
    expect(await self).toBe(true)
  })

  it('a socket joins a chat created after it connected', async () => {
    const sc = await open(c)
    await befriend(app, a, c)
    await new Promise((r) => setTimeout(r, 200))
    const g = await app.inject({ method: 'POST', url: '/chats/groups', headers: as(a), payload: { name: 'g', memberIds: [c.id] } })
    await new Promise((r) => setTimeout(r, 200))
    const got = next<{ body: string }>(sc, EV.chatMessage)
    await app.inject({ method: 'POST', url: `/chats/${g.json().id}/messages`, headers: as(a), payload: { body: 'welcome' } })
    expect((await got).body).toBe('welcome')
  })
})
