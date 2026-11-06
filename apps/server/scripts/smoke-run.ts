// Phase 3 checkpoint: enqueue Python and C++ run jobs and print the worker's results.
// Usage: pnpm dev (or pnpm -F worker dev) in another terminal, then: pnpm -F server exec tsx scripts/smoke-run.ts
import { EXEC_QUEUE } from '@codem/shared'
import { QueueEvents } from 'bullmq'
import { createRedis } from '../src/redis.js'
import { closeQueues, enqueueRun } from '../src/queue.js'

const events = new QueueEvents(EXEC_QUEUE, { connection: createRedis() })
const tests = [{ stdin: '3 4', expected: '7' }, { stdin: '10 -2', expected: '8' }]
const jobs = {
  python: 'a, b = map(int, input().split())\nprint(a + b)',
  cpp: '#include <iostream>\nint main(){ long a,b; std::cin>>a>>b; std::cout<<a+b<<"\\n"; }',
} as const
for (const [language, source] of Object.entries(jobs)) {
  const job = await enqueueRun({ matchId: 'smoke', userId: 'smoke', runId: language, language: language as 'python', source, tests, cpuSec: 2, memMb: 128 })
  const r = (await job.waitUntilFinished(events, 60_000)) as { cases: { passed: boolean; stdout: string; status: string }[] }
  console.log(language, r.cases.map((c) => `${c.status} ${c.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(c.stdout)}`).join(' | '))
}
await events.close()
await closeQueues()
process.exit(0)
