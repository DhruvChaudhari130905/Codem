import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/db.js'
import { RATE_LIMIT_PREFIX } from '../src/ratelimit.js'
import { redis } from '../src/redis.js'

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} cascade`)
  const keys = await redis().keys(`${RATE_LIMIT_PREFIX}*`)
  if (keys.length) await redis().del(...keys)
}

export type TestUser = { id: string; username: string; cookie: string }

export async function signup(app: FastifyInstance, username: string): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email: `${username}@test.dev`, username, password: 'password123' },
  })
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.body}`)
  const c = res.cookies.find((c) => c.name === 'codem_sid')!
  return { id: res.json().id, username, cookie: `codem_sid=${c.value}` }
}

export function as(u: TestUser) {
  return { cookie: u.cookie }
}

export async function befriend(app: FastifyInstance, x: TestUser, y: TestUser): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/friends/requests', headers: as(x), payload: { username: y.username } })
  const acc = await app.inject({ method: 'POST', url: `/friends/requests/${r.json().id}/accept`, headers: as(y) })
  return acc.json().chatId
}
