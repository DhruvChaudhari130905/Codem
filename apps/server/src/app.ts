import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import { authRoutes } from './auth/routes.js'
import { chatRoutes } from './chats/routes.js'
import { env } from './env.js'
import { friendRoutes } from './friends/routes.js'
import { matchRoutes } from './matches/routes.js'
import { canWatchMatch, onPlayerJudged } from './matches/service.js'
import { closeTimers } from './matches/timers.js'
import { problemRoutes } from './problems/routes.js'
import { closeQueues } from './queue.js'
import { createSubscriber } from './realtime/pubsub.js'
import { closeRedis } from './redis.js'
import { attachRealtime, socketHooks } from './realtime/socket.js'
import { MATCH_JUDGED_CHANNEL, type JudgedMessage } from '@codem/shared'
import { HttpError } from './errors.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' }, trustProxy: (_addr: string, hop: number) => hop < env.trustProxyHops })
  await app.register(cookie, { secret: env.sessionSecret })
  await app.register(cors, { origin: env.webUrl, credentials: true })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      if (err.retryAfter) reply.header('retry-after', String(err.retryAfter))
      return reply.code(err.statusCode).send({ error: err.message, code: err.code })
    }
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message })
    req.log.error(err)
    return reply.code(500).send({ error: 'internal error' })
  })

  attachRealtime(app)
  app.get('/health', async () => ({ ok: true }))
  await app.register(authRoutes)
  await app.register(friendRoutes)
  await app.register(chatRoutes)
  await app.register(problemRoutes)
  await app.register(matchRoutes)

  socketHooks.canJoinMatch = canWatchMatch
  const sub = createSubscriber({
    [MATCH_JUDGED_CHANNEL]: async (msg) => {
      const { matchId, userId } = JSON.parse(msg) as JudgedMessage
      await onPlayerJudged(matchId, userId)
    },
  })
  app.addHook('onClose', async () => {
    await sub.quit().catch(() => {})
    await closeTimers()
    await closeQueues()
    await closeRedis()
  })
  return app
}
