import { EV, outputsMatch, room, type MatchProgressEvent, type RunCaseResult, type RunJob, type RunResultEvent } from '@codem/shared'
import type { Emit } from '../emit.js'
import { SourceTooLarge, type Executor } from '../executor.js'

export type RunDeps = { executor: Executor; emit: Emit; clearInflight: (matchId: string, userId: string) => Promise<void> }

/** Run code against sample tests. Sample tests are public, so echoing them back is safe. */
export async function processRun(job: RunJob, deps: RunDeps): Promise<RunResultEvent> {
  let result: RunResultEvent
  try {
    const outs = await deps.executor.runBatch({ language: job.language, source: job.source, cpuSec: job.cpuSec, memMb: job.memMb, stdins: job.tests.map((t) => t.stdin) })
    const cases: RunCaseResult[] = outs.map((o, i) => ({
      passed: o.status === 'ok' && outputsMatch(o.stdout, job.tests[i].expected),
      stdin: job.tests[i].stdin,
      expected: job.tests[i].expected,
      stdout: o.stdout,
      stderr: o.stderr,
      status: o.status,
      timeMs: o.timeMs,
    }))
    result = { matchId: job.matchId, runId: job.runId, cases }
  } catch (e) {
    result = { matchId: job.matchId, runId: job.runId, cases: [], error: e instanceof SourceTooLarge ? e.message : 'execution failed, try again' }
  } finally {
    await deps.clearInflight(job.matchId, job.userId)
  }
  deps.emit(room.user(job.userId), EV.runResult, result)
  if (result.cases.length) {
    const progress: MatchProgressEvent = { matchId: job.matchId, userId: job.userId, samplePassed: result.cases.filter((c) => c.passed).length, sampleTotal: result.cases.length }
    deps.emit(room.match(job.matchId), EV.matchProgress, progress)
  }
  return result
}
