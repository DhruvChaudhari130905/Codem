'use client'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, ApiError } from './api'
import { closeSocket } from './socket'

export type Me = { id: string; username: string | null; email: string; needsUsername: boolean }
type Ctx = { me: Me | null; loading: boolean; refresh: () => Promise<Me | null>; logout: () => Promise<void> }

const MeContext = createContext<Ctx>({ me: null, loading: true, refresh: async () => null, logout: async () => {} })

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>('/auth/me')
      setMe(m)
      return m
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) console.error(e)
      setMe(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    closeSocket()
    setMe(null)
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return <MeContext.Provider value={{ me, loading, refresh, logout }}>{children}</MeContext.Provider>
}

export const useMe = () => useContext(MeContext)

/** Redirect to /login when signed out, or to the username step after a Google signup. */
export function useRequireMe(): Me & { username: string } | null {
  const { me, loading } = useMe()
  const router = useRouter()
  useEffect(() => {
    if (loading) return
    if (!me) router.replace('/login')
    else if (me.needsUsername) router.replace('/signup?google=1')
  }, [me, loading, router])
  return me && me.username ? (me as Me & { username: string }) : null
}
