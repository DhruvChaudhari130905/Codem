'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { api, errorText } from '@/lib/api'
import { useMe } from '@/lib/auth'
import { AuthShell, Field, GoogleButton } from '../AuthShell'

const USERNAME_HINT = '3–20 characters: lowercase letters, digits, underscore'

function SignupForm() {
  const router = useRouter()
  const google = useSearchParams().get('google') === '1'
  const { refresh } = useMe()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      if (google) await api('/auth/username', { body: { username: f.get('username') } })
      else await api('/auth/signup', { body: { email: f.get('email'), username: f.get('username'), password: f.get('password') } })
      await refresh()
      router.push('/chats')
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={google ? 'Pick a username' : 'Create your account'}
      footer={google ? 'Friends find you by this name.' : <>Have an account? <Link className="font-semibold text-cobalt" href="/login">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        {!google && <Field label="Email" name="email" type="email" autoComplete="email" required />}
        <Field label="Username" name="username" pattern="[a-z0-9_]{3,20}" title={USERNAME_HINT} autoComplete="username" required />
        {!google && <Field label="Password" name="password" type="password" minLength={8} autoComplete="new-password" required />}
        {error && <p role="alert" className="text-sm text-fail">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{google ? 'Save username' : 'Create account'}</button>
      </form>
      {!google && <div className="mt-3"><GoogleButton /></div>}
    </AuthShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  )
}
