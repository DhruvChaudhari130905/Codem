import { createServer } from 'node:http'
import { agentInflightKey, AI_QUEUE, EXEC_QUEUE, runInflightKey, type AgentTurnJob, type JudgeJob, type ReviewJob, type RunJob } from '@codem/shared'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { prisma } from './db.js'
import { createEmit, createPublish } from './emit.js'
import { env } from './env.js'
import { Judge0Executor } from './executor.js'
import { processJudge } from './jobs/judge.js'
import { processRun } from './jobs/run.js'
import { anthropicClient } from './ai/client.js'
import { fakeClient } from './ai/fake.js'
import { processAgentTurn } from './jobs/agentTurn.js'
import { processReview } from './jobs/review.js'

const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null })
const redis = new Redis(env.redisUrl)
const emit = createEmit(redis)
const publish = createPublish(redis)
const executor = new Judge0Executor(env.judge0Url)
const client = process.env.AI_FAKE === '1' ? fakeClient : anthropicClient
const aiQueue = new Queue(AI_QUEUE, { connection, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } })
const enqueueReview = async (j: ReviewJob) => {
  await aiQueue.add('review', j, { jobId: `review-${j.matchId}-${j.userId}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 } })
}

const exec = new Worker(
  EXEC_QUEUE,
  async (job) => {
    if (job.name === 'run') return processRun(job.data as RunJob, { executor, emit, clearInflight: async (m, u) => void (await redis.del(runInflightKey(m, u))) })
    if (job.name === 'judge') return processJudge(job.data as JudgeJob, { executor, emit, publish, enqueueReview })
    throw new Error(`unknown exec job ${job.name}`)
  },
  { connection, concurrency: env.concurrency },
)
exec.on('failed', (job, err) => console.error(`exec job ${job?.name} ${job?.id} failed`, err))

const ai = new Worker(
  AI_QUEUE,
  async (job) => {
    if (job.name === 'review') return processReview(job.data as ReviewJob, { client, publish })
    if (job.name === 'agent-turn')
      return processAgentTurn(job.data as AgentTurnJob, { client, executor, emit, clearInflight: async (m, u) => void (await redis.del(agentInflightKey(m, u))) })
    throw new Error(`unknown ai job ${job.name}`)
  },
  { connection, concurrency: env.aiConcurrency },
)
ai.on('failed', (job, err) => console.error(`ai job ${job?.name} ${job?.id} failed`, err))

const health = createServer((_, res) => res.end('ok')).listen(env.port, '127.0.0.1')
console.log(`worker ready: concurrency ${env.concurrency}, judge0 ${env.judge0Url}, ai ${process.env.AI_FAKE === '1' ? 'fake' : 'claude'}`)

async function shutdown() {
  await Promise.allSettled([exec.close(), ai.close(), aiQueue.close()])
  health.close()
  await Promise.allSettled([connection.quit(), redis.quit(), prisma.$disconnect()])
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
