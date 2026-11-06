import { LANGUAGES, LIMITS, clampLimits, type Language } from '@codem/shared'

export type RunInput = { language: Language; source: string; stdin: string; cpuSec: number; memMb: number }
export type RunStatus = 'ok' | 'compile_error' | 'runtime_error' | 'time_limit' | 'memory_limit' | 'internal_error'
export type RunOutput = { status: RunStatus; stdout: string; stderr: string; timeMs: number; memoryKb: number }
export type BatchInput = Omit<RunInput, 'stdin'> & { stdins: string[] }

export interface Executor {
  run(i: RunInput): Promise<RunOutput>
  runBatch(i: BatchInput): Promise<RunOutput[]>
}

export class SourceTooLarge extends Error {
  constructor() {
    super(`source exceeds ${LIMITS.sourceBytesMax} bytes`)
  }
}

type J0Result = {
  token: string
  status: { id: number; description: string }
  stdout: string | null
  stderr: string | null
  compile_output: string | null
  message: string | null
  time: string | null
  memory: number | null
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
const unb64 = (s: string | null) => (s ? Buffer.from(s, 'base64').toString('utf8') : '')
const truncate = (s: string) => (Buffer.byteLength(s) > LIMITS.outputBytesMax ? Buffer.from(s).subarray(0, LIMITS.outputBytesMax).toString('utf8') : s)
const OOM = /MemoryError|bad_alloc|out of memory|OutOfMemoryError|heap out of memory|Cannot allocate memory|runtime: out of memory/i
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Judge0 status ids: 1 queued, 2 processing, 3 accepted, 5 TLE, 6 compile error, 7-12 runtime errors, 13 internal, 14 exec format. */
function mapResult(r: J0Result, memMb: number): RunOutput {
  const stdout = truncate(unb64(r.stdout))
  const stderr = truncate(unb64(r.stderr) || unb64(r.compile_output) || r.message || '')
  const memoryKb = r.memory ?? 0
  const base = { stdout, stderr, timeMs: Math.round(Number(r.time ?? 0) * 1000), memoryKb }
  const id = r.status.id
  if (id === 3 || id === 4) return { ...base, status: 'ok' }
  if (id === 5) return { ...base, status: 'time_limit' }
  if (id === 6) return { ...base, status: 'compile_error' }
  if (id >= 7 && id <= 12) {
    const nearCap = memoryKb >= memMb * 1024 * 0.9
    if (OOM.test(stderr) || nearCap) return { ...base, status: 'memory_limit' }
    if (id === 8) return { ...base, status: 'runtime_error', stderr: stderr || 'output limit exceeded' }
    return { ...base, status: 'runtime_error' }
  }
  return { ...base, status: 'internal_error', stderr: stderr || r.status.description }
}

export class Judge0Executor implements Executor {
  constructor(
    private url: string,
    private pollMs = 250,
  ) {}

  async run(i: RunInput): Promise<RunOutput> {
    const [r] = await this.runBatch({ ...i, stdins: [i.stdin] })
    return r
  }

  async runBatch(i: BatchInput): Promise<RunOutput[]> {
    if (Buffer.byteLength(i.source) > LIMITS.sourceBytesMax) throw new SourceTooLarge()
    if (!i.stdins.length) return []
    const lim = clampLimits({ cpuSec: i.cpuSec, memMb: i.memMb })
    const submissions = i.stdins.map((stdin) => ({
      language_id: LANGUAGES[i.language].judge0Id,
      source_code: b64(i.source),
      stdin: b64(stdin),
      cpu_time_limit: lim.cpuSec,
      cpu_extra_time: 0.5,
      wall_time_limit: lim.wallSec,
      memory_limit: lim.memMb * 1024,
      stack_limit: 64_000,
      max_processes_and_or_threads: 64,
      enable_per_process_and_thread_time_limit: false,
      enable_per_process_and_thread_memory_limit: false,
      max_file_size: LIMITS.outputBytesMax / 1024,
      enable_network: false,
    }))
    const created = await this.req<{ token?: string; error?: unknown }[]>('/submissions/batch?base64_encoded=true', {
      method: 'POST',
      body: JSON.stringify({ submissions }),
    })
    const tokens = created.map((c) => {
      if (!c.token) throw new Error(`judge0 rejected submission: ${JSON.stringify(c)}`)
      return c.token
    })

    // Judge0 runs the batch in parallel; poll until every submission is done.
    const deadline = Date.now() + (lim.wallSec * i.stdins.length + 120) * 1000
    const fields = 'token,status,stdout,stderr,compile_output,message,time,memory'
    let delay = this.pollMs
    for (;;) {
      const { submissions: rs } = await this.req<{ submissions: J0Result[] }>(
        `/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true&fields=${fields}`,
      )
      if (rs.every((r) => r.status.id > 2)) return rs.map((r) => mapResult(r, lim.memMb))
      if (Date.now() > deadline) {
        return rs.map((r) => (r.status.id > 2 ? mapResult(r, lim.memMb) : { status: 'internal_error' as const, stdout: '', stderr: 'execution timed out in queue', timeMs: 0, memoryKb: 0 }))
      }
      await sleep(delay)
      delay = Math.min(delay * 1.5, 2000)
    }
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.url}${path}`, { ...init, headers: { 'content-type': 'application/json' } })
    if (!res.ok) throw new Error(`judge0 ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }
}
