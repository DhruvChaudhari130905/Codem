import { AI_QUEUE, EXEC_QUEUE, type AgentTurnJob, type JudgeJob, type RunJob } from '@codem/shared'
import { Queue } from 'bullmq'
import { redisOptions } from './redis.js'

const queues = new Map<string, Queue>()

function queue(name: string): Queue {
  let q = queues.get(name)
  if (!q) {
    q = new Queue(name, { connection: redisOptions(), defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } })
    queues.set(name, q)
  }
  return q
}

export const enqueueRun = (job: RunJob) => queue(EXEC_QUEUE).add('run', job, { attempts: 1 })
/** jobId dedupes: one judge job per player per match. */
export const enqueueJudge = (job: JudgeJob) =>
  queue(EXEC_QUEUE).add('judge', job, { jobId: `judge-${job.matchId}-${job.userId}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 } })
export const enqueueAgentTurn = (job: AgentTurnJob) => queue(AI_QUEUE).add('agent-turn', job, { attempts: 1 })

export async function closeQueues() {
  await Promise.allSettled([...queues.values()].map((q) => q.close()))
  queues.clear()
}
