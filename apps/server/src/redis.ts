import { Redis } from 'ioredis'
import { env } from './env.js'

/** New connection; BullMQ requires maxRetriesPerRequest = null. */
export function createRedis(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: null })
}

let shared: Redis | null = null
/** Shared command connection (rate limits, in-flight markers). */
export function redis(): Redis {
  shared ??= createRedis()
  return shared
}
export async function closeRedis() {
  await shared?.quit().catch(() => {})
  shared = null
}

/** Connection options for BullMQ, which then owns (and closes) its own connections. */
export function redisOptions() {
  const u = new URL(env.redisUrl)
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    db: Number(u.pathname.slice(1) || 0),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    maxRetriesPerRequest: null,
  }
}
