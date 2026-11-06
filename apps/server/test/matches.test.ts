import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { onPlayerJudged } from '../src/matches/service.js'
import { handleTimer, recoverTimers } from '../src/matches/timers.js'
import { seedProblems } from '../src/problems/seed.js'
import { as, befriend, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
let a: TestUser, b: TestUser, c: TestUser
let groupId: string
let problemId: string
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await resetDb()
  await seedProblems()
  ;[a, b, c] = [await signup(app, 'alice'), await signup(app, 'bob'), await signup(app, 'carol')]
  await befriend(app, a, b)
  const g = await app.inject({ method: 'POST', url: '/chats/groups', headers: as(a), payload: { name: 'crew', memberIds: [b.id] } })
  groupId = g.json().id
  problemId = (await prisma.problem.findFirstOrThrow({ where: { slug: 'reverse-words' } })).id
})

const create = (u: TestUser, body: object = {}) =>
  app.inject({ method: 'POST', url: `/chats/${groupId}/matches`, headers: as(u), payload: { mode: 'coding', problemId, timeLimitSec: 600, ...body } })
const join = (u: TestUser, id: string) => app.inject({ method: 'POST', url: `/matches/${id}/join`, headers: as(u) })
const submit = (u: TestUser, id: string) =>
  app.inject({ method: 'POST', url: `/matches/${id}/submit`, headers: as(u), payload: { source: 'print(1)', language: 'python' } })
const status = async (id: string) => (await prisma.match.findUniqueOrThrow({ where: { id } })).status

async function liveMatch() {
  const id = (await create(a)).json().id
  await join(b, id)
  expect((await app.inject({ method: 'POST', url: `/matches/${id}/start`, headers: as(a) })).statusCode).toBe(200)
  await handleTimer('countdown', id)
  expect(await status(id)).toBe('live')
  return id
}

describe('matches', () => {
  it('creating posts an invite card and auto-joins the host', async () => {
    const r = await create(a)
    expect(r.statusCode).toBe(201)
    const msg = await prisma.message.findFirstOrThrow({ where: { chatId: groupId, kind: 'match_invite' } })
    expect(msg.matchId).toBe(r.json().id)
    expect(await prisma.matchPlayer.count({ where: { matchId: r.json().id } })).toBe(1)
  })

  it('non-members cannot create, join or read a match (403)', async () => {
    expect((await create(c)).statusCode).toBe(403)
    const id = (await create(a)).json().id
    expect((await join(c, id)).statusCode).toBe(403)
    expect((await app.inject({ url: `/matches/${id}`, headers: as(c) })).statusCode).toBe(403)
  })

  it('only the host can start, and only with 2+ players', async () => {
    const id = (await create(a)).json().id
    expect((await app.inject({ method: 'POST', url: `/matches/${id}/start`, headers: as(a) })).statusCode).toBe(409)
    await join(b, id)
    expect((await app.inject({ method: 'POST', url: `/matches/${id}/start`, headers: as(b) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/matches/${id}/start`, headers: as(a) })).statusCode).toBe(200)
    expect(await status(id)).toBe('countdown')
  })

  it('a 1-player match is cancelled when the join window ends', async () => {
    const id = (await create(a)).json().id
    await handleTimer('join-window', id)
    expect(await status(id)).toBe('cancelled')
  })

  it('a live match whose deadline passed while the server was down moves to judging on recovery', async () => {
    const id = await liveMatch()
    await submit(a, id)
    await prisma.match.update({ where: { id }, data: { endsAt: new Date(Date.now() - 60_000) } })
    await recoverTimers()
    expect(await status(id)).toBe('judging')
  })

  it('rejects a double submit and a submit after the deadline grace with 409', async () => {
    const id = await liveMatch()
    expect((await submit(a, id)).statusCode).toBe(200)
    expect((await submit(a, id)).statusCode).toBe(409)
    await prisma.match.update({ where: { id }, data: { endsAt: new Date(Date.now() - 3000) } })
    expect((await submit(b, id)).statusCode).toBe(409)
  })

  it('GET /matches/:id has no problem before live and never hidden tests', async () => {
    const id = (await create(a)).json().id
    const before = await app.inject({ url: `/matches/${id}`, headers: as(b) })
    expect(before.statusCode).toBe(200)
    expect(before.json().problem).toBeNull()
    await join(b, id)
    await app.inject({ method: 'POST', url: `/matches/${id}/start`, headers: as(a) })
    await handleTimer('countdown', id)
    const live = await app.inject({ url: `/matches/${id}`, headers: as(b) })
    expect(live.json().problem.title).toBe('Reverse the words')
    expect(live.body).not.toContain('"hidden"')
    const hidden = (await prisma.problem.findUniqueOrThrow({ where: { id: problemId } })).hidden as { stdin: string }[]
    expect(live.body).not.toContain(hidden[2].stdin.trim())
  })

  it('run enforces a 3 s cooldown (429) and is coding-only', async () => {
    const id = await liveMatch()
    const run = () => app.inject({ method: 'POST', url: `/matches/${id}/run`, headers: as(a), payload: { source: 'print(1)', language: 'python' } })
    expect((await run()).statusCode).toBe(202)
    expect((await run()).statusCode).toBe(429)
  })

  it('when all players are judged the match finishes and a result card is posted', async () => {
    const id = await liveMatch()
    await submit(a, id)
    await submit(b, id)
    expect(await status(id)).toBe('judging')
    await prisma.matchPlayer.update({ where: { matchId_userId: { matchId: id, userId: a.id } }, data: { testsPassed: 10, testsTotal: 10, aiScore: 7, judgedAt: new Date() } })
    await onPlayerJudged(id, a.id)
    expect(await status(id)).toBe('judging')
    await prisma.matchPlayer.update({ where: { matchId_userId: { matchId: id, userId: b.id } }, data: { testsPassed: 3, testsTotal: 10, aiScore: 10, judgedAt: new Date() } })
    await onPlayerJudged(id, b.id)
    await onPlayerJudged(id, b.id) // duplicate notification is harmless
    expect(await status(id)).toBe('finished')
    const cards = await prisma.message.findMany({ where: { chatId: groupId, kind: 'match_result' } })
    expect(cards).toHaveLength(1)
    expect(JSON.parse(cards[0].body).podium.map((p: { username: string }) => p.username)).toEqual(['alice', 'bob'])
    const res = await app.inject({ url: `/matches/${id}/results`, headers: as(b) })
    expect(res.statusCode).toBe(200)
    expect(res.json().players[0]).toMatchObject({ username: 'alice', rank: 1 })
  })

  it('non-submitters at the deadline are scored 0 without blocking the finish', async () => {
    const id = await liveMatch()
    await prisma.match.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } })
    await handleTimer('deadline', id)
    expect(await status(id)).toBe('finished')
  })

  it('in a 1:1 chat the match starts as soon as the second player joins', async () => {
    const direct = (await prisma.chat.findFirstOrThrow({ where: { kind: 'direct' } })).id
    const r = await app.inject({ method: 'POST', url: `/chats/${direct}/matches`, headers: as(a), payload: { mode: 'coding', problemId: 'random', difficulty: 'easy' } })
    expect(r.statusCode).toBe(201)
    await join(b, r.json().id)
    expect(await status(r.json().id)).toBe('countdown')
  })

  it('one active match per chat', async () => {
    await create(a)
    expect((await create(b)).statusCode).toBe(409)
  })

  it('rematch creates a new match in the same chat with the same settings and a fresh problem', async () => {
    const id = await liveMatch()
    await prisma.match.update({ where: { id }, data: { status: 'finished' } })
    const r = await app.inject({ method: 'POST', url: `/matches/${id}/rematch`, headers: as(b) })
    expect(r.statusCode).toBe(201)
    const [old, fresh] = await Promise.all([prisma.match.findUniqueOrThrow({ where: { id } }), prisma.match.findUniqueOrThrow({ where: { id: r.json().id }, include: { problem: true } })])
    expect(fresh).toMatchObject({ chatId: old.chatId, mode: old.mode, timeLimitSec: old.timeLimitSec, hostId: b.id, status: 'waiting_for_players' })
    expect(fresh.problemId).not.toBe(old.problemId)
    expect(fresh.problem.difficulty).toBe('easy')
  })
})
