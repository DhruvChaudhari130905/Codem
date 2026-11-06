import { agentInflightKey, LIMITS } from '@codem/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { handleTimer } from '../src/matches/timers.js'
import { seedProblems } from '../src/problems/seed.js'
import { redis } from '../src/redis.js'
import { as, befriend, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
let a: TestUser, b: TestUser, c: TestUser
let matchId: string
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await resetDb()
  await seedProblems()
  await redis().flushdb()
  ;[a, b, c] = [await signup(app, 'alice'), await signup(app, 'bob'), await signup(app, 'carol')]
  const direct = await befriend(app, a, b)
  const problemId = (await prisma.problem.findFirstOrThrow({ where: { slug: 'reverse-words' } })).id
  matchId = (await app.inject({ method: 'POST', url: `/chats/${direct}/matches`, headers: as(a), payload: { mode: 'prompting', problemId, language: 'python' } })).json().id
  await app.inject({ method: 'POST', url: `/matches/${matchId}/join`, headers: as(b) })
  await handleTimer('countdown', matchId)
})

const prompt = (u: TestUser, text = 'reverse the words') => app.inject({ method: 'POST', url: `/matches/${matchId}/prompt`, headers: as(u), payload: { text } })
const player = (u: TestUser) => prisma.matchPlayer.findUniqueOrThrow({ where: { matchId_userId: { matchId, userId: u.id } } })

describe('prompting round', () => {
  it('accepts a prompt, counts it, and allows one turn in flight', async () => {
    expect((await prompt(a)).statusCode).toBe(202)
    expect((await player(a)).promptsUsed).toBe(1)
    const again = await prompt(a)
    expect(again.statusCode).toBe(429)
    expect(again.json().code).toBe('agent_busy')
  })

  it('rejects the 26th prompt', async () => {
    await prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId: a.id } }, data: { promptsUsed: LIMITS.promptCap } })
    const r = await prompt(a)
    expect(r.statusCode).toBe(429)
    expect(r.json().code).toBe('prompt_cap')
    expect(await redis().get(agentInflightKey(matchId, a.id))).toBeNull()
  })

  it('rejects prompts over 4000 characters and when the token budget is spent', async () => {
    expect((await prompt(a, 'x'.repeat(4001))).statusCode).toBe(400)
    await prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId: a.id } }, data: { tokensUsed: LIMITS.tokenBudget.easy } })
    const r = await prompt(a)
    expect(r.statusCode).toBe(429)
    expect(r.json().code).toBe('budget_exhausted')
  })

  it('only players of a live prompting match may prompt', async () => {
    expect((await prompt(c)).statusCode).toBe(403)
  })

  it("submit takes the agent's entry file", async () => {
    await prisma.matchPlayer.update({ where: { matchId_userId: { matchId, userId: a.id } }, data: { files: { 'main.py': 'print(42)', 'notes.txt': 'x' } } })
    const r = await app.inject({ method: 'POST', url: `/matches/${matchId}/submit`, headers: as(a), payload: {} })
    expect(r.statusCode).toBe(200)
    expect(await player(a)).toMatchObject({ code: 'print(42)', language: 'python' })
  })

  it('returns only your own agent history', async () => {
    await prisma.agentTurn.create({ data: { matchId, userId: a.id, index: 0, prompt: 'secret plan', transcript: [{ role: 'user', content: [{ type: 'text', text: 'secret plan' }] }, { role: 'assistant', content: [{ type: 'text', text: 'on it' }, { type: 'tool_use', id: 't1', name: 'write_file', input: { path: 'main.py', content: 'x' } }] }], filesAfter: {}, tokens: 10 } })
    const mine = await app.inject({ url: `/matches/${matchId}/agent`, headers: as(a) })
    expect(mine.json().events.map((e: { kind: string }) => e.kind)).toEqual(['user', 'text', 'tool_call'])
    const theirs = await app.inject({ url: `/matches/${matchId}/agent`, headers: as(b) })
    expect(theirs.body).not.toContain('secret plan')
  })

  it('run (sample tests by hand) is coding-only', async () => {
    const r = await app.inject({ method: 'POST', url: `/matches/${matchId}/run`, headers: as(a), payload: { source: 'print(1)', language: 'python' } })
    expect(r.statusCode).toBe(400)
  })
})
