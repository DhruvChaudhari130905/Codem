'use client'
import { LANGUAGE_IDS, LANGUAGES } from '@codem/shared'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/chat/Dialog'
import { api, errorText } from '@/lib/api'
import type { ProblemSummary, TestCase } from '@/lib/types'

type Source = 'library' | 'random' | 'custom'
const TIMES = [10, 15, 20, 30, 45, 60, 90, 120]

function CaseEditor({ label, cases, onChange }: { label: string; cases: TestCase[]; onChange: (c: TestCase[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {cases.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <textarea aria-label={`${label} ${i + 1} input`} className="field font-mono text-xs" rows={2} placeholder="Input" value={c.stdin} onChange={(e) => onChange(cases.map((x, j) => (j === i ? { ...x, stdin: e.target.value } : x)))} />
          <textarea aria-label={`${label} ${i + 1} expected output`} className="field font-mono text-xs" rows={2} placeholder="Expected output" value={c.expected} onChange={(e) => onChange(cases.map((x, j) => (j === i ? { ...x, expected: e.target.value } : x)))} />
          <button type="button" className="btn-ghost px-2" aria-label={`Remove ${label} ${i + 1}`} disabled={cases.length === 1} onClick={() => onChange(cases.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-ghost px-2 text-xs" onClick={() => onChange([...cases, { stdin: '', expected: '' }])}>Add test</button>
    </fieldset>
  )
}

export function ChallengeModal({ chatId, open, onClose }: { chatId: string; open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'coding' | 'prompting'>('coding')
  const [source, setSource] = useState<Source>('library')
  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [problemId, setProblemId] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy')
  const [minutes, setMinutes] = useState(30)
  const [language, setLanguage] = useState('')
  const [custom, setCustom] = useState({ title: '', statementMd: '', samples: [{ stdin: '', expected: '' }], hidden: [{ stdin: '', expected: '' }] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    api<ProblemSummary[]>('/problems').then((ps) => {
      setProblems(ps)
      setProblemId((cur) => cur || ps[0]?.id || '')
    }).catch((e) => setError(errorText(e)))
  }, [open])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      let pid: string = source === 'random' ? 'random' : problemId
      if (source === 'custom') pid = (await api<{ id: string }>('/problems/custom', { body: { ...custom, difficulty } })).id
      await api(`/chats/${chatId}/matches`, {
        body: { mode, problemId: pid, difficulty: source === 'random' ? difficulty : undefined, timeLimitSec: minutes * 60, language: language || undefined },
      })
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Start a challenge" wide>
      <form onSubmit={send} className="space-y-5">
        <fieldset>
          <legend className="text-sm font-medium">Round</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([['coding', 'Coding', 'Write the code yourself'], ['prompting', 'Prompting', 'Direct an AI agent; no hand edits']] as const).map(([v, label, hint]) => (
              <label key={v} className={`cursor-pointer rounded-xl border p-3 ${mode === v ? 'border-cobalt bg-cobalt-soft' : 'border-line'}`}>
                <input type="radio" name="mode" className="sr-only" aria-label={label} checked={mode === v} onChange={() => setMode(v)} />
                <span className="block font-display font-bold">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Problem</legend>
          <div className="mt-2 flex gap-1 rounded-lg bg-paper p-1 text-sm" role="tablist">
            {([['library', 'From library'], ['random', 'Random'], ['custom', 'Write your own']] as const).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={source === v} className={`flex-1 rounded-md px-2 py-1.5 font-medium ${source === v ? 'bg-surface shadow-sm' : 'text-muted'}`} onClick={() => setSource(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {source === 'library' && (
              <label className="block text-sm">
                <span className="sr-only">Problem</span>
                <select aria-label="Problem" className="field" value={problemId} onChange={(e) => setProblemId(e.target.value)}>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>{`${p.title} (${p.difficulty})${p.isCustom ? ' · yours' : ''}`}</option>
                  ))}
                </select>
              </label>
            )}
            {(source === 'random' || source === 'custom') && (
              <label className="block text-sm font-medium">
                Difficulty
                <select className="field mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            )}
            {source === 'custom' && (
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium">
                  Title
                  <input className="field mt-1" required maxLength={100} value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} />
                </label>
                <label className="block text-sm font-medium">
                  Statement (Markdown; programs read stdin and write stdout)
                  <textarea className="field mt-1" rows={4} required value={custom.statementMd} onChange={(e) => setCustom({ ...custom, statementMd: e.target.value })} />
                </label>
                <CaseEditor label="Sample" cases={custom.samples} onChange={(samples) => setCustom({ ...custom, samples })} />
                <CaseEditor label="Hidden test" cases={custom.hidden} onChange={(hidden) => setCustom({ ...custom, hidden })} />
              </div>
            )}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            Time limit
            <select className="field mt-1" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {TIMES.map((t) => <option key={t} value={t}>{t} minutes</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Language
            <select className="field mt-1" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="">Any language</option>
              {LANGUAGE_IDS.map((l) => <option key={l} value={l}>{LANGUAGES[l].label}</option>)}
            </select>
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-fail">{error}</p>}
        <button className="btn-primary w-full py-2.5" disabled={busy || (source === 'library' && !problemId)}>Send invite to chat</button>
        <p className="text-center text-xs text-muted">Friends in this chat get 2 minutes to join.</p>
      </form>
    </Dialog>
  )
}
