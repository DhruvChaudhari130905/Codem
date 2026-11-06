import Link from 'next/link'

export function AuthShell({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="grid min-h-full place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-3xl font-extrabold tracking-tight">
          codem<span className="text-cobalt">.</span>
        </Link>
        <p className="mt-1 text-sm text-muted">Coding challenges inside your chats.</p>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <h1 className="font-display text-xl font-bold">{title}</h1>
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-4 text-center text-sm text-muted">{footer}</p>
      </div>
    </main>
  )
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input className="field mt-1" {...props} />
    </label>
  )
}

export function GoogleButton() {
  const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/auth/google`
  return (
    <a href={url} className="btn-outline w-full">
      Continue with Google
    </a>
  )
}
