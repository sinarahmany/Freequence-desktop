import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Library, RefreshCw, Smartphone, Users } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/useSession'
import { Button } from '@/components/ui/Button'
import { AccountsCard } from '@/components/settings/AccountsCard'
import { MusicFoldersCard } from '@/components/settings/MusicFoldersCard'

type SettingsTab = 'library' | 'remote' | 'accounts'

function formatAgo(iso?: string): string {
  if (!iso) return 'Never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function ScanCard() {
  // Polling keeps the progress numbers moving while a scan runs, and stops as soon
  // as it finishes so an idle browser is not asking every second forever.
  const { data: status, refetch } = useQuery({
    queryKey: ['scanStatus'],
    queryFn: api.scanStatus,
    refetchInterval: (query) => (query.state.data?.scanning ? 1000 : false),
  })

  async function startScan() {
    await api.startScan()
    await refetch()
  }

  const scanning = status?.scanning ?? false

  return (
    <section className="rounded-xl border border-line bg-elevated p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Library Synchronization</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Folders are watched for changes automatically, or you can run a full scan.
          </p>
        </div>
        <Button
          onClick={() => void startScan()}
          disabled={scanning}
          className="shrink-0 self-start whitespace-nowrap"
        >
          <RefreshCw className={scanning ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {scanning ? 'Scanning' : 'Scan Library Now'}
        </Button>
      </div>

      {status && (
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-base px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <span
              className={cn(
                'h-2 w-2 rounded-full bg-accent',
                scanning && 'animate-pulse',
              )}
            />
            Status: {scanning ? 'Scanning' : 'Idle'}
            {scanning && status.scanned > 0 && (
              <span className="font-normal text-muted">{status.scanned} files</span>
            )}
          </span>
          <span className="text-muted">
            Last Scan: <span className="text-fg">{scanning ? 'In progress' : formatAgo(status.finishedAt)}</span>
          </span>
          <span className="text-muted">
            Added: <span className="text-accent">+{status.added}</span>
          </span>
          <span className="text-muted">
            Updated: <span className="text-fg">{status.updated}</span>
          </span>
          <span className="text-muted">
            Removed: <span className="text-fg">{status.removed}</span>
          </span>
        </div>
      )}
      {status?.error && <p className="mt-3 text-sm text-red-400">{status.error}</p>}
    </section>
  )
}

function CopyField({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-base px-3 py-2.5">
        <span className={cn('min-w-0 flex-1 truncate font-mono text-sm', accent ? 'text-accent' : 'text-fg')}>
          {value}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="shrink-0 text-muted hover:text-fg"
        >
          {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function SubsonicCard() {
  const { session } = useSession()
  const origin = window.location.origin
  const username = session?.user.username ?? ''
  const apiKey = session?.subsonicApiKey ?? ''

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold tracking-tight">Connect Mobile Client</h2>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-muted">
        This server speaks the Subsonic and OpenSubsonic API, so apps like Symfonium, Amperfy,
        substreamer and DSub can play your library directly.
      </p>

      <div className="flex flex-col gap-4 rounded-xl border border-line bg-elevated p-4 sm:p-6">
        <CopyField label="Server endpoint URL" value={origin} accent />
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Username</p>
          <div className="rounded-lg border border-line bg-base px-3 py-2.5 font-mono text-sm">{username}</div>
          <p className="mt-2 text-xs text-muted">Use the same password you sign in with here.</p>
        </div>
        {apiKey && <CopyField label="Dedicated Subsonic API key / token" value={apiKey} />}
      </div>
    </section>
  )
}

function PasswordCard() {
  const { session, refresh } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setMessage('Password changed. Update it in any connected apps as well.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password')
    }
  }

  const fieldClass =
    'h-11 w-full rounded-lg border border-line bg-base px-3 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-accent'

  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">Password</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {session?.user.mustChangePassword
          ? 'This account still uses the default password. Change it now.'
          : 'Changing your password also changes it for connected Subsonic apps.'}
      </p>
      <form onSubmit={submit} className="rounded-xl border border-line bg-elevated p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-[11px] font-semibold tracking-wider text-muted uppercase">
              Current password
            </span>
            <input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              required
              className={fieldClass}
            />
          </label>
          <label>
            <span className="mb-2 block text-[11px] font-semibold tracking-wider text-muted uppercase">
              New password
            </span>
            <input
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              required
              className={fieldClass}
            />
          </label>
        </div>
        <Button type="submit" variant="primary" className="mt-4">
          Change password
        </Button>
        {message && <p className="mt-3 text-sm text-accent">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </form>
    </section>
  )
}

const tabs: { id: SettingsTab; label: string; icon: typeof Library; admin?: boolean }[] = [
  { id: 'library', label: 'Library & Storage', icon: Library, admin: true },
  { id: 'remote', label: 'Remote & Mobile', icon: Smartphone },
  { id: 'accounts', label: 'Accounts', icon: Users, admin: true },
]

export function SettingsPage() {
  const { session } = useSession()
  const [tab, setTab] = useState<SettingsTab>('library')
  const visibleTabs = tabs.filter((item) => !item.admin || session?.user.isAdmin)
  const activeTab = visibleTabs.some((item) => item.id === tab) ? tab : 'remote'

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex gap-6 border-b border-line">
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium',
                active
                  ? 'border-accent text-fg'
                  : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>

      {activeTab === 'library' ? (
        <>
          <MusicFoldersCard />
          <ScanCard />
        </>
      ) : activeTab === 'accounts' ? (
        <AccountsCard />
      ) : (
        <>
          <SubsonicCard />
          <PasswordCard />
        </>
      )}
    </div>
  )
}
