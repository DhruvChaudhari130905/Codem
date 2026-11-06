import { buildApp } from './app.js'
import { env } from './env.js'
import { recoverTimers, startTimerWorker } from './matches/timers.js'

const app = await buildApp()
await app.listen({ port: env.port, host: '0.0.0.0' })
startTimerWorker()
await recoverTimers()

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0))
  })
}
