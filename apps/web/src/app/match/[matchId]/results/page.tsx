'use client'
import { LANGUAGES, type Language, type ScoreBreakdown } from '@codem/shared'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ReportView } from '@/components/arena/ReportView'
import { api, errorText } from '@/lib/api'
import { useRequireMe } from '@/lib/auth'

type ResultPlayer = {
  userId: string
  username: string
  rank: number
  score: ScoreBreakdown
  testsPassed: number
  testsTotal: number
  submittedAtSec: number | null
  aiScore: number | null
  report: unknown
  code: string | null
  language: string | null
  promptsUsed: number
  tokensUsed: number
}
type Results = { match: { id: string; chatId: string; mode: 'coding' | 'prompting'; timeLimitSec: number }; problem: { title: string; difficulty: string }; players: ResultPlayer[] }

const PLACE = ['1st', '2nd', '3rd']
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export default function ResultsPage() {
  const me = useRequireMe()
  const { matchId } = useParams<{ matchId: string }>()
  const router = useRouter()
  const [data, setData] = useState<Results | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!me) return
    api<Results>(`/matches/${matchId}/results`).then(setData).catch((e) => setError(errorText(e)))
  }, [me, matchId])

  if (!me) return null
  if (error) return <main className="p-8 text-center"><p>{error}</p><Link href="/chats" className="btn-outline mt-4">Back to chats</Link></main>
  if (!data) return <main className="p-8 text-center text-muted">Loading results…</main>

  const viewing = data.players.find((p) => p.userId === (selected ?? me.id)) ?? data.players[0]
  const speedLabel = data.match.mode === 'coding' ? 'Speed' : 'Efficiency'
  const qualityLabel = data.match.mode === 'coding' ? 'Clean code' : 'Prompt quality'

  async function rematch() {
    try {
      const r = await api<{ chatId: string }>(`/matches/${matchId}/rematch`, { method: 'POST' })
      router.push(`/chats/${r.chatId}`)
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{data.match.mode === 'coding' ? 'Coding' : 'Prompting'} round, {data.problem.difficulty}</p>
          <h1 className="font-display text-3xl font-extrabold">{data.problem.title}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={rematch}>Rematch</button>
          <Link className="btn-outline" href={`/chats/${data.match.chatId}`}>Back to chat</Link>
        </div>
      </div>

      <ol aria-label="Podium" className="mt-8 space-y-2">
        {data.players.map((p) => (
          <li key={p.userId}>
            <button
              onClick={() => setSelected(p.userId)}
              className={`grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-4 rounded-2xl border bg-surface px-4 py-3 text-left ${viewing.userId === p.userId ? 'border-cobalt' : 'border-transparent'}`}
            >
              <span className={`font-display text-2xl font-extrabold ${p.rank === 1 ? 'text-gold' : 'text-muted'}`}>{PLACE[p.rank - 1] ?? `${p.rank}th`}</span>
              <span>
                <span className="block font-semibold">{p.username}{p.userId === me.id ? ' (you)' : ''}</span>
                <span className="block text-xs text-muted">
                  {p.submittedAtSec === null ? 'No submission' : `${p.testsPassed}/${p.testsTotal} hidden tests, submitted at ${Math.floor(p.submittedAtSec / 60)}m ${p.submittedAtSec % 60}s`}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-display text-2xl font-extrabold tabular-nums">{fmt(p.score.total)}</span>
                <span className="block text-xs text-muted">
                  {fmt(p.score.correctness)} correct, {fmt(p.score.speedOrEfficiency)} {speedLabel.toLowerCase()}, {fmt(p.score.quality)} {qualityLabel.toLowerCase()}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted">Players are ranked by hidden tests passed first; points break ties.</p>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-surface p-5">
          <h2 className="font-display text-lg font-bold">{viewing.userId === me.id ? 'Your report' : `${viewing.username}'s report`}</h2>
          <div className="mt-3"><ReportView report={viewing.report} mode={data.match.mode} /></div>
          {data.match.mode === 'prompting' && <p className="mt-4 text-xs text-muted">{viewing.promptsUsed} prompts, {viewing.tokensUsed.toLocaleString()} tokens</p>}
        </div>
        <div className="min-w-0 rounded-2xl bg-editor p-5 text-white">
          <h2 className="font-display text-lg font-bold">
            Code {viewing.language ? <span className="text-sm font-normal text-white/60">({LANGUAGES[viewing.language as Language]?.label ?? viewing.language})</span> : null}
          </h2>
          <pre className="mt-3 max-h-[28rem] overflow-auto font-mono text-xs leading-relaxed">{viewing.code ?? 'No code submitted.'}</pre>
        </div>
      </section>
    </main>
  )
}
