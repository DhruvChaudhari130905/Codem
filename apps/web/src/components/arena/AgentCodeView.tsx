'use client'
import { useState } from 'react'

export function AgentCodeView({ files, entry, lastRun }: { files: Record<string, string>; entry: string; lastRun: string | null }) {
  const names = Object.keys(files).sort((a, b) => (a === entry ? -1 : b === entry ? 1 : a.localeCompare(b)))
  const [picked, setPicked] = useState<string | null>(null)
  const current = picked && picked in files ? picked : names[0]
  return (
    <section aria-label="Agent code" className="flex h-full min-h-0 flex-col bg-editor text-white">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 text-xs">
        {names.length ? names.map((n) => (
          <button key={n} onClick={() => setPicked(n)} className={`rounded-md px-2 py-1 font-mono ${n === current ? 'bg-white/15' : 'text-white/60 hover:text-white'}`}>
            {n}{n === entry ? ' (entry file)' : ''}
          </button>
        )) : <span className="text-white/50">No files yet. The agent's code appears here, read-only.</span>}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-4 py-2 font-mono text-[13px] leading-relaxed">{current ? files[current] : ''}</pre>
      {lastRun && (
        <div className="max-h-[35%] overflow-auto border-t border-white/10 px-4 py-2">
          <div className="text-xs text-white/60">Last run</div>
          <pre className="whitespace-pre-wrap font-mono text-xs">{lastRun}</pre>
        </div>
      )}
    </section>
  )
}
