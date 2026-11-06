import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { resetDb, signup } from './helpers.js'

let app: FastifyInstance
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(resetDb)

const body = (username: string, email = `${username}@test.dev`) => ({ email, username, password: 'password123' })

describe('auth', () => {
  it('signup returns 201 and an httpOnly session cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: body('alice') })
    expect(res.statusCode).toBe(201)
    const c = res.cookies.find((c) => c.name === 'codem_sid')
    expect(c?.httpOnly).toBe(true)
    expect(c?.sameSite).toBe('Lax')
  })

  it('rejects a duplicate username with 409', async () => {
    await signup(app, 'alice')
    const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: body('alice', 'other@test.dev') })
    expect(res.statusCode).toBe(409)
  })

  it('rejects a bad username with 400', async () => {
    for (const u of ['Al', 'UPPER', 'has space', 'x'.repeat(21)]) {
      const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: body(u, 'x@test.dev') })
      expect(res.statusCode).toBe(400)
    }
  })

  it('login with a wrong password is 401, right password sets a cookie', async () => {
    await signup(app, 'alice')
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'alice@test.dev', password: 'nope-nope' } })
    expect(bad.statusCode).toBe(401)
    const ok = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ALICE@test.dev', password: 'password123' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.cookies.some((c) => c.name === 'codem_sid')).toBe(true)
  })

  it('/auth/me is 401 without a cookie and hides the password hash with one', async () => {
    expect((await app.inject({ url: '/auth/me' })).statusCode).toBe(401)
    const u = await signup(app, 'alice')
    const res = await app.inject({ url: '/auth/me', headers: { cookie: u.cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: u.id, username: 'alice' })
    expect(res.body).not.toContain('passwordHash')
  })

  it('a tampered cookie is 401', async () => {
    const u = await signup(app, 'alice')
    const res = await app.inject({ url: '/auth/me', headers: { cookie: u.cookie.slice(0, -3) + 'abc' } })
    expect(res.statusCode).toBe(401)
  })

  it('logout ends the session', async () => {
    const u = await signup(app, 'alice')
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: u.cookie } })
    expect((await app.inject({ url: '/auth/me', headers: { cookie: u.cookie } })).statusCode).toBe(401)
  })
})
