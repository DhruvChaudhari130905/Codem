import type { Redis } from 'ioredis'
import { createRedis } from '../redis.js'

/** One subscriber connection for server-side Redis channels (e.g. worker → server notifications). */
export function createSubscriber(handlers: Record<string, (msg: string) => void | Promise<void>>): Redis {
  const sub = createRedis()
  sub.subscribe(...Object.keys(handlers)).catch((e) => console.error('redis subscribe failed', e))
  sub.on('message', (channel, msg) => {
    Promise.resolve(handlers[channel]?.(msg)).catch((e) => console.error(`handler for ${channel} failed`, e))
  })
  return sub
}
