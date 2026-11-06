'use client'
import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from '@/lib/api'
import type { FriendsResponse, UserRef } from '@/lib/types'
import { Dialog } from './Dialog'

export function FriendsDialog({ open, onClose, onChange }: { open: boolean; onClose: () => void; onChange: () => void }) {
  const [data, setData] = useState<FriendsResponse | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserRef[]>([])
  const [msg, setMsg] = useState('')

  const load = useCallback(() => api<FriendsResponse>('/friends').then(setData).catch((e) => setMsg(errorText(e))), [])
  useEffect(() => {
    if (open) void load()
  }, [open, load])
  useEffect(() => {
    if (!open || !q.trim()) return setResults([])
    const t = setTimeout(() => {
      api<UserRef[]>(`/users/search?q=${encodeURIComponent(q.trim().toLowerCase())}`).then(setResults).catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [q, open])

  const related = new Set([...(data?.friends ?? []), ...(data?.incoming ?? []).map((r) => r.user), ...(data?.outgoing ?? []).map((r) => r.user)].map((u) => u.id))

  async function add(u: UserRef) {
    setMsg('')
    try {
      await api('/friends/requests', { body: { username: u.username } })
      setMsg(`Request sent to ${u.username}.`)
      await load()
    } catch (e) {
      setMsg(errorText(e))
    }
  }
  async function accept(id: string) {
    await api(`/friends/requests/${id}/accept`, { method: 'POST' })
    await load()
    onChange()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Friends">
      <input className="field" placeholder="Search by username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {results.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium">{u.username}</span>
              {related.has(u.id) ? (
                <span className="text-muted">Added</span>
              ) : (
                <button className="btn-outline py-1" aria-label={`Add ${u.username}`} onClick={() => add(u)}>Add</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm text-muted" role="status">{msg}</p>}

      {!!data?.incoming.length && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">Requests for you</h3>
          <ul className="mt-2 space-y-2">
            {data.incoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.user.username}</span>
                <button className="btn-primary py-1" onClick={() => accept(r.id)}>Accept</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-5">
        <h3 className="text-sm font-semibold">Your friends</h3>
        {data?.friends.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.friends.map((f) => (
              <li key={f.id} className="rounded-full bg-paper px-3 py-1 text-sm">{f.username}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Search for a username above to send your first request.</p>
        )}
        {!!data?.outgoing.length && <p className="mt-3 text-sm text-muted">Waiting on: {data.outgoing.map((r) => r.user.username).join(', ')}</p>}
      </section>
    </Dialog>
  )
}
