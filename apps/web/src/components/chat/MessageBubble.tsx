import type { MessageView } from '@/lib/types'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function MessageBubble({ m, mine, showName }: { m: MessageView; mine: boolean; showName: boolean }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? 'rounded-br-md bg-cobalt text-white' : 'rounded-bl-md bg-surface'}`}>
        {showName && !mine && <div className="text-xs font-semibold text-cobalt">{m.senderName}</div>}
        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</p>
        <div className={`mt-0.5 text-right text-[11px] ${mine ? 'text-white/70' : 'text-muted'}`}>{time(m.createdAt)}</div>
      </div>
    </div>
  )
}
