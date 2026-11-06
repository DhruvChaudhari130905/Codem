function Meter({ label, used, total, format = String }: { label: string; used: number; total: number; format?: (n: number) => string }) {
  const pct = Math.min(100, (used / total) * 100)
  return (
    <div aria-label={label} className="min-w-0 flex-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums">{format(used)} / {format(total)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
        <div className={`h-full rounded-full ${pct > 85 ? 'bg-live' : 'bg-cobalt'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export function BudgetMeter({ promptsUsed, promptCap, tokensUsed, tokenBudget }: { promptsUsed: number; promptCap: number; tokensUsed: number; tokenBudget: number }) {
  return (
    <div className="flex gap-4 border-b border-line bg-surface px-4 py-2.5">
      <Meter label="Prompts used" used={promptsUsed} total={promptCap} />
      <Meter label="Tokens used" used={tokensUsed} total={tokenBudget} format={k} />
    </div>
  )
}
