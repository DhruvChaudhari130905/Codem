'use client'
import { entryFile, EV, LANGUAGE_IDS, LANGUAGES, LIMITS, type AgentEvent, type Language } from '@codem/shared'
import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from '@/lib/api'
import type { MatchDetail } from '@/lib/match'
import { useSocketEvent } from '@/lib/socket'
import { AgentChat } from './AgentChat'
import { AgentCodeView } from './AgentCodeView'
import { BudgetMeter } from './BudgetMeter'
import { ProblemPanel } from './ProblemPanel'
import { PromptBox } from './PromptBox'

export function PromptingArena({ detail, matchId, onSubmitted }: { detail: MatchDetail; matchId: string; onSubmitted: () => void }) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [files, setFiles] = useState<Record<string, string>>(detail.me.files ?? {})
  const [busy, setBusy] = useState(false)
  const [promptsUsed, setPromptsUsed] = useState(detail.me.promptsUsed)
  const [tokensUsed, setTokensUsed] = useState(detail.me.tokensUsed)
  const [error, setError] = useState('')
  const fixed = (detail.match.language ?? detail.me.language) as Language | null
  const [language, setLanguage] = useState<Language>(fixed ?? 'python')
  const submitted = detail.me.submitted

  useEffect(() => {
    api<{ events: AgentEvent[] }>(`/matches/${matchId}/agent`).then((r) => setEvents((live) => [...r.events, ...live])).catch(() => {})
  }, [matchId])

  useSocketEvent(
    EV.agentEvent,
    useCallback(
      (e: AgentEvent) => {
        if (e.matchId !== matchId) return
        if (e.files) setFiles(e.files)
        if (e.kind === 'done' || e.kind === 'error') setBusy(false)
        if (e.tokensUsed !== undefined) setTokensUsed(e.tokensUsed)
        if (e.kind !== 'files' && e.kind !== 'done') setEvents((prev) => [...prev, e])
      },
      [matchId],
    ),
  )

  async function send(text: string): Promise<boolean> {
    setError('')
    setBusy(true)
    try {
      const r = await api<{ promptsUsed: number }>(`/matches/${matchId}/prompt`, { body: { text, language } })
      setPromptsUsed(r.promptsUsed)
      return true
    } catch (e) {
      setBusy(false)
      setError(errorText(e))
      return false
    }
  }

  async function submit() {
    if (!confirm(`Submit ${entryFile(language)} as your final answer? You only get one submit.`)) return
    try {
      await api(`/matches/${matchId}/submit`, { body: {} })
      onSubmitted()
    } catch (e) {
      setError(errorText(e))
    }
  }

  if (!detail.problem) return null
  const lastRun = [...events].reverse().find((e) => e.kind === 'tool_result' && (e.tool === 'run_samples' || e.tool === 'run_custom'))?.text ?? null
  const languageLocked = !!fixed || promptsUsed > 0
  return (
    <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(280px,2fr)_minmax(320px,3fr)_minmax(320px,3fr)]">
      <div className="min-h-0 border-r border-line bg-surface"><ProblemPanel problem={detail.problem} /></div>
      <div className="flex min-h-[60vh] flex-col border-r border-line md:min-h-0">
        <BudgetMeter promptsUsed={promptsUsed} promptCap={LIMITS.promptCap} tokensUsed={tokensUsed} tokenBudget={LIMITS.tokenBudget[detail.problem.difficulty]} />
        <AgentChat events={events} busy={busy} />
        {error && <p role="alert" className="px-4 pb-1 text-sm text-fail">{error}</p>}
        <PromptBox disabled={submitted || promptsUsed >= LIMITS.promptCap} busy={busy} onSend={send} />
      </div>
      <div className="flex min-h-[60vh] flex-col md:min-h-0">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            Language
            <select className="field w-auto py-1" value={language} disabled={languageLocked || submitted} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGE_IDS.map((l) => <option key={l} value={l}>{LANGUAGES[l].label}</option>)}
            </select>
          </label>
          <button className="btn-primary ml-auto" onClick={submit} disabled={submitted || busy}>{submitted ? 'Submitted' : 'Submit'}</button>
        </div>
        <div className="min-h-0 flex-1"><AgentCodeView files={files} entry={entryFile(language)} lastRun={lastRun} /></div>
      </div>
    </div>
  )
}
