import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ProfileError, currentProfile, selectProfile as storeSelectProfile, leaveProfile as storeLeaveProfile, createProfile as storeCreateProfile, updateProfile as storeUpdateProfile } from './store'
import type { NewProfile } from './store'
import type { Profile } from './types'

interface ProfileContextValue {
  profile: Profile | null
  // Throws ProfileError with a readable message when the attempt fails.
  createProfile: (username: string, base: NewProfile) => Profile
  selectProfile: (username: string) => Profile
  leaveProfile: () => void
  updateProfile: (patch: Partial<Pick<Profile, 'district' | 'topics' | 'socials'>>) => Profile
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

// Let standalone components render without a selected profile.
const FALLBACK: ProfileContextValue = {
  profile: null,
  createProfile: () => {
    throw new ProfileError('Profile management is not available here.')
  },
  selectProfile: () => {
    throw new ProfileError('Profile management is not available here.')
  },
  leaveProfile: () => {},
  updateProfile: () => {
    throw new ProfileError('Profile management is not available here.')
  },
}

// Provide the active local profile and actions for changing it.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(() => currentProfile())

  const createProfile = useCallback((username: string, base: NewProfile) => {
    const nextProfile = storeCreateProfile(username, base)
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const selectProfile = useCallback((username: string) => {
    const nextProfile = storeSelectProfile(username)
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const leaveProfile = useCallback(() => {
    storeLeaveProfile()
    setProfile(null)
  }, [])

  const updateProfile = useCallback((patch: Partial<Pick<Profile, 'district' | 'topics' | 'socials'>>) => {
    const nextProfile = storeUpdateProfile(patch)
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const value = useMemo(
    () => ({ profile, createProfile, selectProfile, leaveProfile, updateProfile }),
    [profile, createProfile, selectProfile, leaveProfile, updateProfile],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

// Return the active profile and profile actions.
export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext) ?? FALLBACK
}
