import { prisma } from '../db.js'
import { loadAllProblems } from './loader.js'

/** Upsert every seed problem by slug. Safe to run repeatedly. */
export async function seedProblems(): Promise<number> {
  const problems = loadAllProblems()
  for (const p of problems) {
    const data = { title: p.title, difficulty: p.difficulty, statementMd: p.statementMd, samples: p.samples, hidden: p.hidden, cpuSec: p.cpuSec, memMb: p.memMb }
    await prisma.problem.upsert({ where: { slug: p.slug }, update: data, create: { slug: p.slug, ...data } })
  }
  return problems.length
}
