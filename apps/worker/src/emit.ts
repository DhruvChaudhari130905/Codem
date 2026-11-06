import { Emitter } from '@socket.io/redis-emitter'
import { Redis } from 'ioredis'
import { env } from './env.js'

export type Emit = (room: string, ev: string, payload: unknown) => void
export type Publish = (channel: string, message: string) => Promise<void>

/** Socket emits from the worker go through Redis to the server's Socket.IO adapter. */
export function createEmit(redis: Redis): Emit {
  const emitter = new Emitter(redis, { key: env.socketKey })
  return (room, ev, payload) => emitter.to(room).emit(ev, payload)
}

export function createPublish(redis: Redis): Publish {
  return async (channel, message) => {
    await redis.publish(channel, message)
  }
}
