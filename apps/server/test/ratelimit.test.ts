import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { authLimitFor } from '../src/ratelimit.js'
import { as, befriend, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(resetDb)

describe('rate limits', () => {
  it('the 11th auth request from one IP in a minute is 429 with Retry-After', async () => {
    await signup(app, 'alice') // 1
    for (let i = 0; i < 9; i++) {
      const r = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'alice@test.dev', password: 'wrong-password' } })
      expect(r.statusCode).toBe(401)
    }
    const r = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'alice@test.dev', password: 'password123' } })
    expect(r.statusCode).toBe(429)
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0)
    // another IP is unaffected
    const other = await app.inject({ method: 'POST', url: '/auth/login', remoteAddress: '10.0.0.9', payload: { email: 'alice@test.dev', password: 'password123' } })
    expect(other.statusCode).toBe(200)
  })

  it('the 31st message from one user in a minute is 429', async () => {
    const a: TestUser = await signup(app, 'alice')
    const b: TestUser = await signup(app, 'bob')
    const chatId = await befriend(app, a, b)
    for (let i = 0; i < 30; i++) {
      const r = await app.inject({ method: 'POST', url: `/chats/${chatId}/messages`, headers: as(a), payload: { body: `m${i}` } })
      expect(r.statusCode).toBe(201)
    }
    const r = await app.inject({ method: 'POST', url: `/chats/${chatId}/messages`, headers: as(a), payload: { body: 'one too many' } })
    expect(r.statusCode).toBe(429)
    expect(r.headers['retry-after']).toBeDefined()
    expect((await app.inject({ method: 'POST', url: `/chats/${chatId}/messages`, headers: as(b), payload: { body: 'bob is fine' } })).statusCode).toBe(201)
  })

  it('a client cannot dodge the auth limit by faking X-Forwarded-For', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-forwarded-for': `203.0.113.${i}` }, payload: { email: 'x@test.dev', password: 'nope-nope' } })
      expect(r.statusCode).toBe(401)
    }
    const r = await app.inject({ method: 'POST', url: '/auth/login', headers: { 'x-forwarded-for': '203.0.113.99' }, payload: { email: 'x@test.dev', password: 'nope-nope' } })
    expect(r.statusCode).toBe(429)
  })

  it('the auth limit override is ignored in production', () => {
    expect(authLimitFor({ AUTH_RATE_LIMIT_PER_MIN: '1000' })).toBe(1000)
    expect(authLimitFor({ AUTH_RATE_LIMIT_PER_MIN: '1000', NODE_ENV: 'production' })).toBe(10)
    expect(authLimitFor({})).toBe(10)
  })
})
