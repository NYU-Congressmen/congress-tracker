import { createContext, useContext } from 'react'
import type { User } from '@firebase/auth'

interface Session {
  user: User | null
  loading: boolean
  error: string | null
  retry: () => void
}

export const SessionContext = createContext<Session>({
  user: null,
  loading: false,
  error: null,
  retry: () => {},
})

export function useSession(): Session {
  return useContext(SessionContext)
}
