import { HttpError } from './errors.js'
import { redis } from './redis.js'

const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d)

/** Auth limit per IP per minute. E2E runs may raise it; production always uses 10. */
export function authLimitFor(e: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  return e.NODE_ENV === 'production' ? 10 : num(e.AUTH_RATE_LIMIT_PER_MIN, 10)
}

/** Fixed-window limits (spec §7). */
export const RATE_LIMITS = {
  auth: { limit: authLimitFor(process.env), windowSec: 60 },
  message: { limit: 30, windowSec: 60 },
  matchCreate: { limit: 10, windowSec: 3600 },
} as const

export const RATE_LIMIT_PREFIX = 'rl:'

/** Count one hit for `id` under `name`; over the limit throws 429 with Retry-After. */
export async function rateLimit(name: keyof typeof RATE_LIMITS, id: string) {
  const { limit, windowSec } = RATE_LIMITS[name]
  const now = Math.floor(Date.now() / 1000)
  const window = Math.floor(now / windowSec)
  const key = `${RATE_LIMIT_PREFIX}${name}:${id}:${window}`
  const r = redis()
  const [[, count]] = (await r.multi().incr(key).expire(key, windowSec + 5).exec()) as [[null, number]]
  if (count > limit) {
    const retryAfter = (window + 1) * windowSec - now
    throw new HttpError(429, 'too many requests, slow down', 'rate_limited', Math.max(1, retryAfter))
  }
}
