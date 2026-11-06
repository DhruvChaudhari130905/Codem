import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { loadProblemDir, PROBLEMS_DIR } from '../src/problems/loader.js'
import { seedProblems } from '../src/problems/seed.js'
import { as, resetDb, signup, type TestUser } from './helpers.js'

let app: FastifyInstance
let a: TestUser, b: TestUser
beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await resetDb()
  ;[a, b] = [await signup(app, 'alice'), await signup(app, 'bob')]
})

const custom = {
  title: 'Secret echo',
  statementMd: 'Echo it.',
  difficulty: 'easy',
  samples: [{ stdin: 'pub', expected: 'pub' }],
  hidden: [{ stdin: 'ZZ_HIDDEN_IN', expected: 'ZZ_HIDDEN_OUT' }],
}

describe('problems', () => {
  it('seed is idempotent and loads all 15 problems', async () => {
    await seedProblems()
    await seedProblems()
    expect(await prisma.problem.count()).toBe(15)
    const byDiff = await prisma.problem.groupBy({ by: ['difficulty'], _count: true })
    expect(Object.fromEntries(byDiff.map((d) => [d.difficulty, d._count]))).toEqual({ easy: 6, medium: 6, hard: 3 })
  })

  it('GET /problems/:id contains no hidden test strings', async () => {
    await seedProblems()
    const p = await prisma.problem.findFirstOrThrow({ where: { slug: 'reverse-words' } })
    const res = await app.inject({ url: `/problems/${p.id}`, headers: as(a) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).not.toHaveProperty('hidden')
    for (const h of p.hidden as { stdin: string; expected: string }[]) {
      if (h.stdin.length > 3) expect(res.body).not.toContain(JSON.stringify(h.stdin).slice(1, -1))
    }
  })

  it('list filters by difficulty and never includes hidden', async () => {
    await seedProblems()
    const res = await app.inject({ url: '/problems?difficulty=hard', headers: as(a) })
    expect(res.json()).toHaveLength(3)
    expect(res.body).not.toContain('"hidden"')
  })

  it("a custom problem is listed for its creator only and hides its hidden tests", async () => {
    const c = await app.inject({ method: 'POST', url: '/problems/custom', headers: as(a), payload: custom })
    expect(c.statusCode).toBe(201)
    expect(c.body).not.toContain('ZZ_HIDDEN')
    expect((await app.inject({ url: '/problems', headers: as(a) })).json().map((p: { title: string }) => p.title)).toContain('Secret echo')
    expect((await app.inject({ url: '/problems', headers: as(b) })).json().map((p: { title: string }) => p.title)).not.toContain('Secret echo')
    expect((await app.inject({ url: `/problems/${c.json().id}`, headers: as(b) })).statusCode).toBe(404)
  })

  it('custom problem needs at least one sample and one hidden test', async () => {
    const res = await app.inject({ method: 'POST', url: '/problems/custom', headers: as(a), payload: { ...custom, hidden: [] } })
    expect(res.statusCode).toBe(400)
  })

  it('loader rejects a problem with zero hidden tests', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'codem-')), 'bad')
    mkdirSync(dir)
    writeFileSync(join(dir, 'problem.md'), '# Bad')
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ title: 'Bad', difficulty: 'easy' }))
    writeFileSync(join(dir, 'samples.json'), JSON.stringify([{ stdin: '1', expected: '1' }]))
    writeFileSync(join(dir, 'hidden.json'), '[]')
    expect(() => loadProblemDir(dir)).toThrow()
    expect(() => loadProblemDir(join(PROBLEMS_DIR, 'fizzbuzz'))).not.toThrow()
  })
})
