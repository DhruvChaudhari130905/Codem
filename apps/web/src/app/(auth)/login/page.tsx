'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api, errorText } from '@/lib/api'
import { useMe } from '@/lib/auth'
import { AuthShell, Field, GoogleButton } from '../AuthShell'

export default function LoginPage() {
  const router = useRouter()
  const { refresh } = useMe()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api('/auth/login', { body: { email: f.get('email'), password: f.get('password') } })
      await refresh()
      router.push('/chats')
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Sign in" footer={<>New here? <Link className="font-semibold text-cobalt" href="/signup">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error && <p role="alert" className="text-sm text-fail">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>Sign in</button>
      </form>
      <div className="mt-3"><GoogleButton /></div>
    </AuthShell>
  )
}
