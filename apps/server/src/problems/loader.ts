import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clampLimits, difficultySchema, testCaseSchema } from '@codem/shared'
import { z } from 'zod'

export const PROBLEMS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../problems')

const metaSchema = z.object({
  title: z.string().min(1).max(100),
  difficulty: difficultySchema,
  cpuSec: z.number().int().positive().optional(),
  memMb: z.number().int().positive().optional(),
})

export type ProblemFile = {
  slug: string
  title: string
  difficulty: z.infer<typeof difficultySchema>
  statementMd: string
  samples: z.infer<typeof testCaseSchema>[]
  hidden: z.infer<typeof testCaseSchema>[]
  cpuSec: number
  memMb: number
}

export function loadProblemDir(dir: string): ProblemFile {
  const read = (f: string) => readFileSync(join(dir, f), 'utf8')
  const meta = metaSchema.parse(JSON.parse(read('meta.json')))
  const samples = z.array(testCaseSchema).min(1).parse(JSON.parse(read('samples.json')))
  // Generated problems ship hidden tests gzipped; hand-written ones may use plain hidden.json.
  const gz = join(dir, 'hidden.json.gz')
  const hiddenRaw = existsSync(gz) ? gunzipSync(readFileSync(gz)).toString('utf8') : read('hidden.json')
  const hidden = z.array(testCaseSchema).min(1, 'a problem needs at least one hidden test').parse(JSON.parse(hiddenRaw))
  const lim = clampLimits({ cpuSec: meta.cpuSec, memMb: meta.memMb })
  const slug = dir.split(/[\\/]/).filter(Boolean).at(-1)!
  return { slug, title: meta.title, difficulty: meta.difficulty, statementMd: read('problem.md'), samples, hidden, cpuSec: lim.cpuSec, memMb: lim.memMb }
}

/** Every problems/<slug>/ directory (folders starting with _ hold tooling). */
export function loadAllProblems(root = PROBLEMS_DIR): ProblemFile[] {
  return readdirSync(root)
    .filter((d) => !d.startsWith('_') && !d.startsWith('.') && statSync(join(root, d)).isDirectory())
    .sort()
    .map((d) => loadProblemDir(join(root, d)))
}
