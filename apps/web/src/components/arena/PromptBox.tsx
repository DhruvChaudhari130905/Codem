'use client'
import { LIMITS } from '@codem/shared'
import { useState } from 'react'

type Props = { disabled: boolean; busy: boolean; onSend: (text: string) => Promise<boolean> }

export function PromptBox({ disabled, busy, onSend }: Props) {
  const [text, setText] = useState('')
  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (!text.trim() || busy || disabled) return
    if (await onSend(text.trim())) setText('')
  }
  const over = text.length > LIMITS.promptMaxChars
  return (
    <form onSubmit={send} className="border-t border-line bg-surface p-3">
      <textarea
        aria-label="Prompt the agent"
        className="field min-h-20 resize-y font-sans"
        placeholder="Tell the agent what to build or fix. Ctrl+Enter sends."
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
        }}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs tabular-nums ${over ? 'text-fail' : 'text-muted'}`}>{text.length} / {LIMITS.promptMaxChars}</span>
        <button className="btn-primary" disabled={disabled || busy || over || !text.trim()}>{busy ? 'Agent working…' : 'Send prompt'}</button>
      </div>
    </form>
  )
}
