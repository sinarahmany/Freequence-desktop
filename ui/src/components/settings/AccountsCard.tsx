import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSession } from '@/hooks/useSession'
import { Button } from '@/components/ui/Button'

const fieldClass =
  'h-11 w-full rounded-lg border border-line bg-base px-3 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-accent'

/**
 * Administrators create accounts, reset another person's password, and remove
 * accounts here. Everyone shares the library; playlists, favourites and play
 * history stay with the account.
 */
export function AccountsCard() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState<{ id: string; username: string } | null>(null)

  const { data: users = [], refetch } = useQuery({
    queryKey: ['users'],
    queryFn: api.users,
  })

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await api.createUser(username.trim(), password, isAdmin)
      setUsername('')
      setPassword('')
      setIsAdmin(false)
      setMessage('Account created. They can sign in with that username and password.')
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? Their playlists and favourites go with the account.`)) return
    setError('')
    setMessage('')
    try {
      await api.deleteUser(id)
      await refetch()
      await queryClient.invalidateQueries({ queryKey: ['playlists'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account')
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight">Accounts</h2>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-muted">
        Each person signs in separately. They share this library, and keep their own playlists,
        favourites and listening history.
      </p>

      <ul className="mb-4 flex flex-col gap-2">
        {users.map((user) => {
          const mine = user.id === session?.user.id
          return (
            <li
              key={user.id}
              className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-4 py-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-400">
                {(user.username[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.username}</p>
                <p className="text-xs text-muted">
                  {user.isAdmin ? 'Administrator' : 'Listener'}
                  {mine ? ' · You' : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={mine}
                onClick={() => setResetting({ id: user.id, username: user.username })}
              >
                Reset password
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={mine}
                onClick={() => void remove(user.id, user.username)}
              >
                Delete
              </Button>
            </li>
          )
        })}
      </ul>

      <form onSubmit={create} className="rounded-xl border border-line bg-elevated p-4 sm:p-6">
        <h3 className="font-semibold">New account</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-[11px] font-semibold tracking-wider text-muted uppercase">
              Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              required
              className={fieldClass}
            />
          </label>
          <label>
            <span className="mb-2 block text-[11px] font-semibold tracking-wider text-muted uppercase">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={4}
              required
              className={fieldClass}
            />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(event) => setIsAdmin(event.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          Administrator, can manage folders and accounts
        </label>
        <Button type="submit" variant="primary" className="mt-4" disabled={busy}>
          Create account
        </Button>
        {message && <p className="mt-3 text-sm text-accent">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>

      {resetting && (
        <ResetPasswordDialog
          username={resetting.username}
          onClose={() => setResetting(null)}
          onSave={async (password) => {
            await api.resetPassword(resetting.id, password)
            setMessage(`Password updated for ${resetting.username}. They can sign in with the new one.`)
            setError('')
            setResetting(null)
          }}
        />
      )}
    </section>
  )
}

function ResetPasswordDialog({
  username,
  onClose,
  onSave,
}: {
  username: string
  onClose: () => void
  onSave: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        onSubmit={(event) => void submit(event)}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface p-4 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">Reset password</h2>
        <p className="mt-1 text-sm text-muted">
          Set a new password for {username}. The current one stops working.
        </p>
        <label className="mt-3 block">
          <span className="sr-only">New password</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={4}
            required
            placeholder="New password"
            className={fieldClass}
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#08080a] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
