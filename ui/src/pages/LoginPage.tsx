import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/layout/Logo'
import { LoadingState, Spinner } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { useSession } from '@/hooks/useSession'

const fieldClass =
  'h-10 w-full rounded-md border border-line bg-elevated px-3 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-accent'

export function LoginPage() {
  const { signIn, createAccount } = useSession()
  const [mode, setMode] = useState<'checking' | 'login' | 'setup'>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .setupStatus()
      .then((status) => {
        if (!cancelled) setMode(status.needsSetup ? 'setup' : 'login')
      })
      .catch(() => {
        if (!cancelled) setMode('login')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (mode === 'setup') {
      if (password.length < 4) {
        setError('Password must be at least 4 characters')
        return
      }
      if (password !== confirm) {
        setError('Those passwords do not match')
        return
      }
    }
    setSubmitting(true)
    try {
      if (mode === 'setup') {
        await createAccount(username.trim(), password)
      } else {
        await signIn(username, password)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed'
      if (mode === 'setup' && message === 'an administrator already exists') {
        setMode('login')
        setConfirm('')
        setError('An administrator already exists. Sign in instead.')
      } else {
        setError(message)
      }
      setSubmitting(false)
    }
  }

  if (mode === 'checking') return <LoadingState label="Starting" />

  const setup = mode === 'setup'

  return (
    <div className="grid h-full place-items-center px-4">
      <form
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface/90 p-8 shadow-2xl backdrop-blur-md"
      >
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <h1 className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
            Freequence
          </h1>
        </div>

        {setup && (
          <p className="mb-5 text-sm text-muted">
            Create the administrator for this server. You can add other people later in Settings.
          </p>
        )}

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-muted">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
            className={fieldClass}
          />
        </label>

        <label className={setup ? 'mb-4 block' : 'mb-6 block'}>
          <span className="mb-1.5 block text-sm text-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={setup ? 'new-password' : 'current-password'}
            minLength={setup ? 4 : undefined}
            required
            className={fieldClass}
          />
        </label>

        {setup && (
          <label className="mb-6 block">
            <span className="mb-1.5 block text-sm text-muted">Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={4}
              required
              className={fieldClass}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
          {submitting ? <Spinner className="h-4 w-4 text-black" /> : setup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
