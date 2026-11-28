import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@firebase/auth'
import { getAccountProfile, saveAccountProfile } from '../api/account'
import { useSession } from '../auth/SessionContext'
import { ProfileError, forgetAccountProfiles, forgetUnlinkedProfiles, importablePreferences, legacyProfileFor } from './store'
import type { ProfileChanges } from './store'
import type { Profile } from './types'

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  reload: () => void
  updateProfile: (patch: ProfileChanges) => Promise<Profile>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

// Let standalone components render without a selected profile.
const FALLBACK: ProfileContextValue = {
  profile: null,
  loading: false,
  error: null,
  reload: () => {},
  updateProfile: async () => {
    throw new ProfileError('Profile management is not available here.')
  },
}

interface LoadedAccount {
  uid: string
  profile: Profile | null
  error: string | null
}

// Provide the verified account's profile, which is the only profile the app shows.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const uid = user?.uid
  const [account, setAccount] = useState<LoadedAccount | null>(null)
  const [attempt, setAttempt] = useState(0)
  const saves = useRef(0)
  const activeOwner = useRef<User | null>(null)
  if (!uid && account) setAccount(null)
  const loaded = uid && account?.uid === uid ? account : null
  // Browser profiles from earlier builds only seed an empty account at sign-in. Showing one to a
  // signed-out visitor would carry a previous reader's district and topics on a shared browser.
  const profile = uid ? loaded?.profile ?? null : null

  useEffect(() => {
    activeOwner.current = user
    if (!user) return
    let active = true
    const savedBeforeLoad = saves.current

    async function restore(owner: NonNullable<typeof user>) {
      try {
        forgetUnlinkedProfiles()
        let saved = await getAccountProfile(owner)
        const legacy = legacyProfileFor(owner.uid)
        // Copy this account's own browser profile from earlier builds once, into an account that has none.
        if (!saved.saved && legacy && active) {
          saved = await saveAccountProfile(owner, importablePreferences(legacy), true)
        }
        if (saved.saved) forgetAccountProfiles(owner.uid)
        if (active && savedBeforeLoad === saves.current) {
          setAccount({ uid: owner.uid, profile: { ...saved, firebase_uid: owner.uid }, error: null })
        }
      } catch {
        if (active && savedBeforeLoad === saves.current) {
          setAccount({ uid: owner.uid, profile: null, error: 'Your profile could not be loaded.' })
        }
      }
    }

    void restore(user)
    return () => {
      active = false
      activeOwner.current = null
    }
  }, [user, attempt])

  const reload = useCallback(() => {
    setAccount(null)
    setAttempt((n) => n + 1)
  }, [])

  const updateProfile = useCallback(async (patch: ProfileChanges) => {
    if (!user) throw new ProfileError('Sign in to save your profile.')
    const saved = await saveAccountProfile(user, patch)
    const next = { ...saved, firebase_uid: user.uid }
    if (activeOwner.current === user) {
      saves.current += 1
      setAccount({ uid: user.uid, profile: next, error: null })
    }
    return next
  }, [user])

  return (
    <ProfileContext.Provider value={{
      profile, loading: Boolean(uid && !loaded), error: loaded?.error ?? null,
      reload, updateProfile,
    }}>
      {children}
    </ProfileContext.Provider>
  )
}

// Return the active profile and its actions.
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext) ?? FALLBACK
}
