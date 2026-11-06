'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, errorText } from '@/lib/api'
import { useRequireMe } from '@/lib/auth'

export default function JoinPage() {
  const me = useRequireMe()
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!me) return
    api<{ id: string }>(`/chats/join/${encodeURIComponent(code)}`, { method: 'POST' })
      .then((r) => router.replace(`/chats/${r.id}`))
      .catch((e) => setError(errorText(e)))
  }, [me, code, router])
  return <main className="grid min-h-full place-items-center p-8 text-sm text-muted">{error || 'Joining group…'}</main>
}
