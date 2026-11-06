import { EV, MATCH_JUDGED_CHANNEL, type RunResultEvent } from '@codem/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { processJudge } from '../src/jobs/judge.js'
import { processRun } from '../src/jobs/run.js'
import { FakeExecutor, fakeEmitter, HIDDEN, resetDb, seedMatch } from './fixtures.js'

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

describe('run job', () => {
  it('emits per-case results to the user and sample progress to the match', async () => {
    const em = fakeEmitter()
    const ex = new FakeExecutor()
    await processRun(
      { matchId: 'm1', userId: 'u1', runId: 'r1', language: 'python', source: '1=>2;3=>5', tests: [{ stdin: '1', expected: '2' }, { stdin: '3', expected: '4' }], cpuSec: 2, memMb: 128 },
      { executor: ex, emit: em.emit, clearInflight: async () => {} },
    )
    const result = em.out.find((e) => e.ev === EV.runResult)!
    expect(result.room).toBe('user:u1')
    const cases = (result.payload as RunResultEvent).cases
    expect(cases[0].passed).toBe(true)
    expect(cases[1].passed).toBe(false)
    expect(em.out.find((e) => e.ev === EV.matchProgress)).toMatchObject({ room: 'match:m1', payload: { userId: 'u1', samplePassed: 1, sampleTotal: 2 } })
  })

  it('treats "5\\n\\n" as matching expected "5"', async () => {
    const em = fakeEmitter()
    const ex: FakeExecutor = Object.assign(new FakeExecutor(), {
      async runBatch() { return [{ status: 'ok' as const, stdout: '5\n\n', stderr: '', timeMs: 1, memoryKb: 1 }] },
    })
    await processRun({ matchId: 'm', userId: 'u', runId: 'r', language: 'python', source: '', tests: [{ stdin: '', expected: '5' }], cpuSec: 1, memMb: 64 }, { executor: ex, emit: em.emit, clearInflight: async () => {} })
    expect((em.out[0].payload as RunResultEvent).cases[0].passed).toBe(true)
  })
})

describe('judge job', () => {
  it('writes testsPassed and never emits hidden tests', async () => {
    const { match, user } = await seedMatch({ code: 'HIDDEN_IN_ALPHA=>HIDDEN_OUT_ALPHA;HIDDEN_IN_BETA=>HIDDEN_OUT_BETA' })
    const em = fakeEmitter()
    const published: [string, string][] = []
    const enqueued: unknown[] = []
    await processJudge(
      { matchId: match.id, userId: user.id },
      { executor: new FakeExecutor(), emit: em.emit, publish: async (c, m) => void published.push([c, m]), enqueueReview: async (j) => void enqueued.push(j) },
    )
    const p = await prisma.matchPlayer.findUniqueOrThrow({ where: { matchId_userId: { matchId: match.id, userId: user.id } } })
    expect(p).toMatchObject({ testsPassed: 2, testsTotal: 3 })
    expect(enqueued).toEqual([{ matchId: match.id, userId: user.id }])
    const wire = JSON.stringify([em.out, published])
    for (const h of HIDDEN) {
      expect(wire).not.toContain(h.stdin)
      expect(wire).not.toContain(h.expected)
    }
  })

  it('without a review queue, sets a neutral AI score and announces the player is judged', async () => {
    const { match, user } = await seedMatch({ code: 'nothing' })
    const published: [string, string][] = []
    await processJudge({ matchId: match.id, userId: user.id }, { executor: new FakeExecutor(), emit: () => {}, publish: async (c, m) => void published.push([c, m]) })
    const p = await prisma.matchPlayer.findUniqueOrThrow({ where: { matchId_userId: { matchId: match.id, userId: user.id } } })
    expect(p).toMatchObject({ testsPassed: 0, testsTotal: 3, aiScore: 5 })
    expect(p.judgedAt).not.toBeNull()
    expect(published).toEqual([[MATCH_JUDGED_CHANNEL, JSON.stringify({ matchId: match.id, userId: user.id })]])
  })
})
