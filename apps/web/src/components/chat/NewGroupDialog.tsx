'use client'
import { useEffect, useState } from 'react'
import { api, errorText } from '@/lib/api'
import type { FriendsResponse, UserRef } from '@/lib/types'
import { Dialog } from './Dialog'

export function NewGroupDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [friends, setFriends] = useState<UserRef[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPicked(new Set())
    setName('')
    setError('')
    api<FriendsResponse>('/friends').then((d) => setFriends(d.friends)).catch((e) => setError(errorText(e)))
  }, [open])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      const g = await api<{ id: string }>('/chats/groups', { body: { name, memberIds: [...picked] } })
      onCreated(g.id)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New group">
      <form onSubmit={create} className="space-y-4">
        <label className="block text-sm font-medium">
          Group name
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Members ({picked.size + 1}/20)</legend>
          {friends.length === 0 && <p className="mt-1 text-sm text-muted">Add friends first, then invite them here.</p>}
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {friends.map((f) => (
              <li key={f.id}>
                <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-paper">
                  <input
                    type="checkbox"
                    checked={picked.has(f.id)}
                    disabled={!picked.has(f.id) && picked.size >= 19}
                    onChange={(e) => {
                      const next = new Set(picked)
                      if (e.target.checked) next.add(f.id)
                      else next.delete(f.id)
                      setPicked(next)
                    }}
                  />
                  {f.username}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {error && <p role="alert" className="text-sm text-fail">{error}</p>}
        <button className="btn-primary w-full" disabled={!name.trim()}>Create group</button>
      </form>
    </Dialog>
  )
}
