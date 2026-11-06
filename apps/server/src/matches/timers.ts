import { TIMERS_QUEUE } from '@codem/shared'
import { Queue, Worker } from 'bullmq'
import { prisma } from '../db.js'
import { redisOptions } from '../redis.js'
import { applyEvent, maybeFinish } from './service.js'
import { enqueueJudge } from '../queue.js'

export type TimerName = 'join-window' | 'countdown' | 'deadline'

let queue: Queue | null = null
let worker: Worker | null = null
const conn = () => redisOptions()

/** Delayed BullMQ jobs survive a server restart; recoverTimers() covers the rest. */
export async function scheduleTimer(name: TimerName, matchId: string, at: Date) {
  queue ??= new Queue(TIMERS_QUEUE, { connection: conn(), defaultJobOptions: { removeOnComplete: true, removeOnFail: 1000 } })
  await queue.add(name, { matchId }, { jobId: `${name}-${matchId}`, delay: Math.max(0, at.getTime() - Date.now()), attempts: 3, backoff: { type: 'fixed', delay: 1000 } })
}

export async function handleTimer(name: TimerName, matchId: string) {
  const ev = name === 'join-window' ? 'join_window_elapsed' : name === 'countdown' ? 'countdown_elapsed' : 'deadline'
  await applyEvent(matchId, { type: ev })
}

export function startTimerWorker() {
  worker = new Worker(TIMERS_QUEUE, (job) => handleTimer(job.name as TimerName, (job.data as { matchId: string }).matchId), { connection: conn(), concurrency: 8 })
  worker.on('failed', (job, err) => console.error(`timer ${job?.id} failed`, err))
}

/** On boot: advance every match whose timer passed while the server was down. */
export async function recoverTimers() {
  const now = new Date()
  const due = await prisma.match.findMany({
    where: {
      OR: [
        { status: 'waiting_for_players', joinDeadline: { lt: now } },
        { status: 'countdown', startsAt: { lt: now } },
        { status: 'live', endsAt: { lt: now } },
        { status: 'judging' },
      ],
    },
    include: { players: true },
  })
  for (const m of due) {
    if (m.status === 'waiting_for_players') await handleTimer('join-window', m.id)
    else if (m.status === 'countdown') await handleTimer('countdown', m.id)
    if (m.status === 'countdown' || m.status === 'live') {
      const fresh = await prisma.match.findUniqueOrThrow({ where: { id: m.id } })
      if (fresh.status === 'live' && fresh.endsAt && fresh.endsAt < now) await handleTimer('deadline', m.id)
    }
    if (m.status === 'judging') {
      // Re-enqueue judging for submissions the worker never finished (jobId dedupes).
      for (const p of m.players.filter((p) => p.submittedAt && !p.judgedAt)) await enqueueJudge({ matchId: m.id, userId: p.userId })
      await maybeFinish(m.id)
    }
  }
  // Re-arm future timers in case Redis lost them.
  const pending = await prisma.match.findMany({ where: { status: { in: ['waiting_for_players', 'countdown', 'live'] } } })
  for (const m of pending) {
    if (m.status === 'waiting_for_players' && m.joinDeadline) await scheduleTimer('join-window', m.id, m.joinDeadline)
    if (m.status === 'countdown' && m.startsAt) await scheduleTimer('countdown', m.id, m.startsAt)
    if ((m.status === 'countdown' || m.status === 'live') && m.endsAt) await scheduleTimer('deadline', m.id, m.endsAt)
  }
}

export async function closeTimers() {
  await Promise.allSettled([worker?.close(), queue?.close()])
  worker = null
  queue = null
}
