type CodingReport = { score: number; readability: string; structure: string; complexity: string; edgeCases: string; refactor: string }
type PromptingReport = { score: number; clarity: string; decomposition: string; feedbackUse: string; wastedTurns: string; tip: string }

const CODING: [keyof CodingReport, string][] = [
  ['readability', 'Readability and naming'],
  ['structure', 'Structure'],
  ['complexity', 'Complexity'],
  ['edgeCases', 'Edge cases'],
  ['refactor', 'Suggested refactor'],
]
const PROMPTING: [keyof PromptingReport, string][] = [
  ['clarity', 'Clarity'],
  ['decomposition', 'Decomposition'],
  ['feedbackUse', 'Use of run feedback'],
  ['wastedTurns', 'Wasted turns'],
  ['tip', 'One tip'],
]

export function ReportView({ report, mode }: { report: unknown; mode: 'coding' | 'prompting' }) {
  if (!report || typeof report !== 'object') {
    return <p className="text-sm text-muted">Report unavailable. The quality score was set to a neutral 5/10.</p>
  }
  const r = report as Record<string, string | number>
  const rows = mode === 'coding' ? CODING : PROMPTING
  return (
    <div>
      <p className="font-display text-3xl font-extrabold">
        {r.score}
        <span className="text-base font-semibold text-muted">/10</span>
      </p>
      <dl className="mt-3 space-y-3">
        {rows.map(([k, label]) => (
          <div key={k}>
            <dt className="text-sm font-semibold">{label}</dt>
            <dd className="mt-0.5 max-w-[70ch] whitespace-pre-wrap text-sm text-muted">{String(r[k] ?? '')}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
