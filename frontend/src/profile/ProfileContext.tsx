import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@firebase/auth'
import { getAccountProfile, saveAccountProfile } from '../api/account'
import { useSession } from '../auth/SessionContext'
import { ProfileError, currentProfile, profileForUser, selectProfile as storeSelectProfile, leaveProfile as storeLeaveProfile, updateProfile as storeUpdateProfile } from './store'
import type { ProfileChanges } from './store'
import type { Profile } from './types'

interface ProfileContextValue {
  profile: Profile | null
  loading: boolean
  error: string | null
  reload: () => void
  selectProfile: (username: string) => Profile
  leaveProfile: () => void
  updateProfile: (patch: ProfileChanges) => Promise<Profile>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

// Let standalone components render without a selected profile.
const FALLBACK: ProfileContextValue = {
  profile: null,
  loading: false,
  error: null,
  reload: () => {},
  selectProfile: () => {
    throw new ProfileError('Profile management is not available here.')
  },
  leaveProfile: () => {},
  updateProfile: async () => {
    throw new ProfileError('Profile management is not available here.')
  },
}

interface LoadedAccount {
  uid: string
  profile: Profile | null
  error: string | null
}

// Provide the verified account's profile or the signed-out browser profile.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const uid = user?.uid
  const [local, setLocal] = useState(currentProfile)
  const [account, setAccount] = useState<LoadedAccount | null>(null)
  const [attempt, setAttempt] = useState(0)
  const saves = useRef(0)
  const activeOwner = useRef<User | null>(null)
  if (!uid && account) setAccount(null)
  const legacy = useMemo(() => uid ? profileForUser(uid) : null, [uid])
  const loaded = uid && account?.uid === uid ? account : null
  const profile = uid ? loaded?.profile ?? legacy : local?.firebase_uid ? null : local

  useEffect(() => {
    activeOwner.current = user
    if (!user) return
    let active = true
    const savedBeforeLoad = saves.current

    async function restore(owner: NonNullable<typeof user>) {
      try {
        let saved = await getAccountProfile(owner)
        if (!saved.saved && legacy && active) {
          saved = await saveAccountProfile(owner, legacy, true)
        }
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
  }, [user, legacy, attempt])

  const reload = useCallback(() => {
    setAccount(null)
    setAttempt((n) => n + 1)
  }, [])

  const selectProfile = useCallback((username: string) => {
    if (uid) throw new ProfileError('Open Edit profile to change your account.')
    const next = storeSelectProfile(username)
    setLocal(next)
    return next
  }, [uid])

  const leaveProfile = useCallback(() => {
    storeLeaveProfile()
    setLocal(null)
  }, [])

  const updateProfile = useCallback(async (patch: ProfileChanges) => {
    if (user) {
      const saved = await saveAccountProfile(user, patch)
      const next = { ...saved, firebase_uid: user.uid }
      if (activeOwner.current === user) {
        saves.current += 1
        setAccount({ uid: user.uid, profile: next, error: null })
      }
      return next
    }
    if (!profile) throw new ProfileError('Open a profile before editing it.')
    const next = storeUpdateProfile(patch, profile.username)
    setLocal(next)
    return next
  }, [profile, user])

  return (
    <ProfileContext.Provider value={{
      profile, loading: Boolean(uid && !loaded), error: loaded?.error ?? null,
      reload, selectProfile, leaveProfile, updateProfile,
    }}>
      {children}
    </ProfileContext.Provider>
  )
}

// Return the active profile and its actions.
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext) ?? FALLBACK
}
