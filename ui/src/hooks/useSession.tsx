import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type Session } from '@/lib/api'
import { usePlayer } from '@/store/playerStore'

interface SessionContextValue {
  session: Session | null
  /** True until the initial "am I signed in" check finishes. */
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  createAccount: (username: string, password: string) => Promise<void>
  clear: () => void
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const restoreQueue = usePlayer((s) => s.restoreQueue)
  const queryClient = useQueryClient()

  // The session lives in an HttpOnly cookie, so the only way to know whether one
  // exists is to ask the server.
  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((value) => {
        if (cancelled) return
        setSession(value)
        void restoreQueue()
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [restoreQueue])

  const signIn = useCallback(
    async (username: string, password: string) => {
      // Drop the previous account's cached playlists, favourites and queue
      // before the new session is shown.
      queryClient.clear()
      const value = await api.login(username, password)
      setSession(value)
      void restoreQueue()
    },
    [queryClient, restoreQueue],
  )

  const createAccount = useCallback(
    async (username: string, password: string) => {
      queryClient.clear()
      const value = await api.setup(username, password)
      setSession(value)
      void restoreQueue()
    },
    [queryClient, restoreQueue],
  )

  const refresh = useCallback(async () => {
    setSession(await api.me())
  }, [])

  const clear = useCallback(() => {
    setSession(null)
    usePlayer.getState().clearQueue()
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({ session, loading, signIn, createAccount, clear, refresh }),
    [session, loading, signIn, createAccount, clear, refresh],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside a SessionProvider')
  return context
}
