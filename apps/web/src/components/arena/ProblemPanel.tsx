import Markdown from 'react-markdown'
import type { PublicProblem } from '@/lib/types'

export function ProblemPanel({ problem }: { problem: PublicProblem }) {
  return (
    <article className="h-full overflow-y-auto px-6 py-5">
      <p className="text-xs text-muted">
        {problem.difficulty}, {problem.cpuSec}s CPU, {problem.memMb} MB
      </p>
      <div className="prose-arena mt-1">
        <Markdown>{problem.statementMd}</Markdown>
      </div>
      <h2 className="mt-6 font-display text-base font-bold">Sample tests</h2>
      <div className="mt-2 space-y-3">
        {problem.samples.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="mb-1 text-muted">Input {i + 1}</div>
              <pre className="max-h-40 overflow-auto rounded-lg bg-paper p-2 font-mono">{s.stdin}</pre>
            </div>
            <div>
              <div className="mb-1 text-muted">Expected output</div>
              <pre className="max-h-40 overflow-auto rounded-lg bg-paper p-2 font-mono">{s.expected}</pre>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
