import type { Problem } from '@prisma/client'
import type { Difficulty, TestCase } from '@codem/shared'

export type PublicProblem = {
  id: string
  slug: string
  title: string
  difficulty: Difficulty
  statementMd: string
  samples: TestCase[]
  cpuSec: number
  memMb: number
  isCustom: boolean
}

/** The only shape a problem may take on the wire before a match is finished: hidden tests are dropped here. */
export function toPublicProblem(p: Problem): PublicProblem {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    difficulty: p.difficulty,
    statementMd: p.statementMd,
    samples: p.samples as TestCase[],
    cpuSec: p.cpuSec,
    memMb: p.memMb,
    isCustom: p.isCustom,
  }
}

export type ProblemSummary = Pick<PublicProblem, 'id' | 'slug' | 'title' | 'difficulty' | 'isCustom'>
export const toProblemSummary = (p: Problem): ProblemSummary => ({ id: p.id, slug: p.slug, title: p.title, difficulty: p.difficulty, isCustom: p.isCustom })
