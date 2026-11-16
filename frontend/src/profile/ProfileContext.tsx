import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AccountError, currentProfile, signIn as storeSignIn, signOut as storeSignOut, signUp as storeSignUp, updateProfile as storeUpdateProfile } from './store'
import type { NewProfile } from './store'
import type { Profile } from './types'

interface ProfileContextValue {
  profile: Profile | null
  // Throws AccountError with a readable message when the attempt fails.
  signUp: (username: string, password: string, base: NewProfile) => Profile
  signIn: (username: string, password: string) => Profile
  signOut: () => void
  updateProfile: (patch: Partial<Pick<Profile, 'district' | 'topics' | 'socials'>>) => Profile
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

// The default value is a signed-out profile, so a page can read the context
// without a provider (for example in focused component tests).
const FALLBACK: ProfileContextValue = {
  profile: null,
  signUp: () => {
    throw new AccountError('Profile management is not available here.')
  },
  signIn: () => {
    throw new AccountError('Profile management is not available here.')
  },
  signOut: () => {},
  updateProfile: () => {
    throw new AccountError('Profile management is not available here.')
  },
}

// Wrap the app so any page can read the signed-in profile and act on it.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(() => currentProfile())

  const signUp = useCallback((username: string, password: string, base: NewProfile) => {
    const account = storeSignUp(username, password, base)
    const nextProfile = {
      username: account.username,
      district: account.district,
      topics: account.topics ?? [],
      socials: account.socials,
      created_at: account.created_at,
      updated_at: account.updated_at,
    }
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const signIn = useCallback((username: string, password: string) => {
    const account = storeSignIn(username, password)
    const nextProfile = {
      username: account.username,
      district: account.district,
      topics: account.topics ?? [],
      socials: account.socials,
      created_at: account.created_at,
      updated_at: account.updated_at,
    }
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const signOut = useCallback(() => {
    storeSignOut()
    setProfile(null)
  }, [])

  const updateProfile = useCallback((patch: Partial<Pick<Profile, 'district' | 'topics' | 'socials'>>) => {
    const nextProfile = storeUpdateProfile(patch)
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const value = useMemo(
    () => ({ profile, signUp, signIn, signOut, updateProfile }),
    [profile, signUp, signIn, signOut, updateProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

// Read the signed-in profile and the account actions. Safe without a provider:
// it reports a signed-out profile.
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext) ?? FALLBACK
}
