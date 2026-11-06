import Link from 'next/link'
import type { ResultBody } from '@/lib/types'

const MEDAL = ['bg-gold text-ink', 'bg-line text-ink', 'bg-[#e3b38a] text-ink']

export function ResultCard({ matchId, body }: { matchId: string; body: ResultBody }) {
  return (
    <article aria-label="Match results" className="mx-auto w-full max-w-md rounded-2xl bg-surface p-4 shadow-[0_1px_0_var(--color-line)]">
      <p className="text-xs text-muted">{body.mode === 'coding' ? 'Coding' : 'Prompting'} round finished</p>
      <h3 className="font-display text-lg font-bold">{body.problemTitle}</h3>
      <ol className="mt-3 space-y-1.5">
        {body.podium.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 text-sm">
            <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${MEDAL[p.rank - 1] ?? 'bg-paper'}`}>{p.rank}</span>
            <span className="flex-1 font-medium">{p.username}</span>
            <span className="text-xs text-muted">{p.testsPassed}/{p.testsTotal} tests</span>
            <span className="w-12 text-right font-display font-bold tabular-nums">{Math.round(p.total)}</span>
          </li>
        ))}
      </ol>
      <Link href={`/match/${matchId}/results`} className="btn-outline mt-4 w-full">View report</Link>
    </article>
  )
}
