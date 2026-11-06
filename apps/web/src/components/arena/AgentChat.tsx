'use client'
import type { AgentEvent } from '@codem/shared'
import { useEffect, useRef } from 'react'

function ToolCall({ e, result }: { e: AgentEvent; result?: AgentEvent }) {
  const input = e.input as Record<string, unknown> | undefined
  const summary = e.tool === 'write_file' ? `Wrote ${String(input?.path ?? '')}` : e.tool === 'read_file' ? `Read ${String(input?.path ?? '')}` : e.tool === 'run_samples' ? 'Ran the sample tests' : 'Ran with custom input'
  return (
    <details className="rounded-lg border border-line bg-paper/60 text-xs">
      <summary className="cursor-pointer px-3 py-1.5 font-medium">{e.tool === 'write_file' && result?.text ? result.text.split('\n')[0] : `${summary}${result?.text ? `: ${result.text.split('\n')[0]}` : ''}`}</summary>
      {result?.text && <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-line px-3 py-2 font-mono">{result.text}</pre>}
    </details>
  )
}

export function AgentChat({ events, busy }: { events: AgentEvent[]; busy: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [events.length, busy])
  const items: React.ReactNode[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.kind === 'user') {
      items.push(<div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-cobalt px-3.5 py-2 text-sm text-white">{e.text}</div>)
    } else if (e.kind === 'text') {
      items.push(<div key={i} className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface px-3.5 py-2 text-sm">{e.text}</div>)
    } else if (e.kind === 'tool_call') {
      const result = events.slice(i + 1).find((x) => x.kind === 'tool_result' && x.tool === e.tool)
      items.push(<ToolCall key={i} e={e} result={result} />)
    } else if (e.kind === 'error') {
      items.push(<p key={i} role="alert" className="text-sm text-fail">{e.text}</p>)
    }
  }
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
      {!events.length && <p className="text-sm text-muted">You can't edit code in this round. Tell the agent what to write, read its runs, and steer it to a solution.</p>}
      {items}
      {busy && <p className="text-xs text-muted">Agent is working…</p>}
      <div ref={end} />
    </div>
  )
}
