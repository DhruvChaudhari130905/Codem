import type { Language, RunCaseResult } from '@codem/shared'
import { prisma } from '../src/db.js'
import type { BatchInput, Executor, RunInput, RunOutput } from '../src/executor.js'

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} cascade`)
}

export const HIDDEN = [
  { stdin: 'HIDDEN_IN_ALPHA', expected: 'HIDDEN_OUT_ALPHA' },
  { stdin: 'HIDDEN_IN_BETA', expected: 'HIDDEN_OUT_BETA' },
  { stdin: 'HIDDEN_IN_GAMMA', expected: 'HIDDEN_OUT_GAMMA' },
]

/** One live coding match with one submitted player. */
export async function seedMatch(opts: { code: string; language?: Language; mode?: 'coding' | 'prompting' } = { code: 'x' }) {
  const u = await prisma.user.create({ data: { email: 'w@test.dev', username: 'wally' } })
  const chat = await prisma.chat.create({ data: { kind: 'group', name: 'g', createdById: u.id, members: { create: [{ userId: u.id, role: 'admin' }] } } })
  const problem = await prisma.problem.create({
    data: { slug: 'echo', title: 'Echo', difficulty: 'easy', statementMd: 'Echo the input.', samples: [{ stdin: 'a', expected: 'a' }], hidden: HIDDEN },
  })
  const match = await prisma.match.create({
    data: { chatId: chat.id, hostId: u.id, mode: opts.mode ?? 'coding', problemId: problem.id, timeLimitSec: 1800, status: 'live', startsAt: new Date(), endsAt: new Date(Date.now() + 1800_000) },
  })
  await prisma.matchPlayer.create({ data: { matchId: match.id, userId: u.id, code: opts.code, language: opts.language ?? 'python', submittedAt: new Date() } })
  return { user: u, chat, problem, match }
}

/** Fake executor: treats the source as a lookup table "stdin=>stdout;..." so tests control results. */
export class FakeExecutor implements Executor {
  calls: BatchInput[] = []
  async run(i: RunInput): Promise<RunOutput> {
    return (await this.runBatch({ ...i, stdins: [i.stdin] }))[0]
  }
  async runBatch(i: BatchInput): Promise<RunOutput[]> {
    this.calls.push(i)
    const table = Object.fromEntries(i.source.split(';').map((p) => p.split('=>')))
    return i.stdins.map((s) => ({ status: 'ok', stdout: (table[s] ?? 'wrong') + '\n', stderr: '', timeMs: 1, memoryKb: 1 }))
  }
}

export type Emitted = { room: string; ev: string; payload: unknown }
export function fakeEmitter() {
  const out: Emitted[] = []
  return { out, emit: (room: string, ev: string, payload: unknown) => void out.push({ room, ev, payload }) }
}
export type { RunCaseResult }
