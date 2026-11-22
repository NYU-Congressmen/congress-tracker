import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@firebase/auth'
import { request } from '../api/client'
import { getAccountToken } from './accountToken'
import { loadFirebaseAuth } from './firebase'
import { SessionContext } from './SessionContext'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    let revision = 0

    loadFirebaseAuth().then((auth) => {
      if (!active) return
      unsubscribe = auth.onAuthStateChanged(async (signedIn) => {
        const current = ++revision
        setUser(null)
        setError(null)
        setLoading(Boolean(signedIn))
        if (!signedIn) return

        // A restored Firebase session can retry account creation after an API outage.
        try {
          const token = await getAccountToken(signedIn)
          await request('/api/account', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
          })
          if (active && current === revision) setUser(signedIn)
        } catch {
          if (active && current === revision) {
            setError('Your account could not be set up. Try again.')
          }
        } finally {
          if (active && current === revision) setLoading(false)
        }
      })
    }).catch(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [attempt])

  return (
    <SessionContext.Provider value={{ user, loading, error, retry: () => setAttempt((n) => n + 1) }}>
      {children}
    </SessionContext.Provider>
  )
}
