'use client'
import { EV, LIMITS, type RunResultEvent } from '@codem/shared'
import { useCallback, useState } from 'react'
import { api, errorText } from '@/lib/api'
import { useSocketEvent } from '@/lib/socket'

const STATUS: Record<string, string> = {
  ok: 'Wrong answer',
  compile_error: 'Compile error',
  runtime_error: 'Runtime error',
  time_limit: 'Time limit exceeded',
  memory_limit: 'Memory limit exceeded',
  internal_error: 'Sandbox error',
}

type Props = { matchId: string; getSource: () => { source: string; language: string }; submitted: boolean; onSubmitted: () => void }

export function RunPanel({ matchId, getSource, submitted, onSubmitted }: Props) {
  const [running, setRunning] = useState(false)
  const [coolUntil, setCoolUntil] = useState(0)
  const [result, setResult] = useState<RunResultEvent | null>(null)
  const [error, setError] = useState('')

  useSocketEvent(
    EV.runResult,
    useCallback(
      (r: RunResultEvent) => {
        if (r.matchId !== matchId) return
        setResult(r)
        setRunning(false)
      },
      [matchId],
    ),
  )

  async function run() {
    setError('')
    setRunning(true)
    setCoolUntil(Date.now() + LIMITS.runCooldownMs)
    setTimeout(() => setCoolUntil(0), LIMITS.runCooldownMs)
    try {
      await api(`/matches/${matchId}/run`, { body: getSource() })
    } catch (e) {
      setRunning(false)
      setError(errorText(e))
    }
  }

  async function submit() {
    if (!confirm('Submit your final answer? You only get one submit.')) return
    setError('')
    try {
      await api(`/matches/${matchId}/submit`, { body: getSource() })
      onSubmitted()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const passed = result?.cases.filter((c) => c.passed).length ?? 0
  return (
    <section className="flex max-h-[45%] min-h-40 flex-col border-t border-line bg-surface" aria-label="Run results">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button className="btn-outline" onClick={run} disabled={running || submitted || coolUntil > Date.now()}>
          {running ? 'Running…' : 'Run samples'}
        </button>
        <button className="btn-primary" onClick={submit} disabled={submitted}>
          {submitted ? 'Submitted' : 'Submit'}
        </button>
        <span className="ml-auto text-sm" role="status">
          {result && !result.error && (
            <span className={passed === result.cases.length ? 'font-semibold text-pass' : 'text-muted'}>
              {passed}/{result.cases.length} samples passed
            </span>
          )}
        </span>
      </div>
      {(error || result?.error) && <p role="alert" className="px-4 pb-2 text-sm text-fail">{error || result?.error}</p>}
      <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3">
        {result?.cases.map((c, i) => (
          <li key={i} className="rounded-lg border border-line p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${c.passed ? 'text-pass' : 'text-fail'}`}>
                Sample {i + 1}: {c.passed ? 'Passed' : STATUS[c.status] ?? c.status}
              </span>
              <span className="ml-auto text-muted">{c.timeMs} ms</span>
            </div>
            {!c.passed && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-muted">Your output</div>
                  <pre className="max-h-32 overflow-auto rounded bg-paper p-1.5 font-mono">{c.stdout || '(empty)'}</pre>
                </div>
                <div>
                  <div className="text-muted">Expected</div>
                  <pre className="max-h-32 overflow-auto rounded bg-paper p-1.5 font-mono">{c.expected}</pre>
                </div>
                {c.stderr && <pre className="max-h-32 overflow-auto rounded bg-fail/5 p-1.5 font-mono text-fail sm:col-span-2">{c.stderr}</pre>}
              </div>
            )}
          </li>
        ))}
        {!result && <li className="text-sm text-muted">Run your code against the sample tests as often as you like. Submit runs the hidden tests once.</li>}
      </ol>
    </section>
  )
}
