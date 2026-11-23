import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ProfileError, currentProfile, profileForUser, selectProfile as storeSelectProfile, leaveProfile as storeLeaveProfile, createProfile as storeCreateProfile, updateProfile as storeUpdateProfile } from './store'
import type { NewProfile, ProfileChanges } from './store'
import type { Profile } from './types'
import { useSession } from '../auth/SessionContext'

interface ProfileContextValue {
  profile: Profile | null
  // Throws ProfileError with a readable message when the attempt fails.
  createProfile: (username: string, base: NewProfile) => Profile
  selectProfile: (username: string) => Profile
  leaveProfile: () => void
  updateProfile: (patch: ProfileChanges) => Profile
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
  const { user } = useSession()
  const uid = user?.uid
  const [profileUid, setProfileUid] = useState(uid)
  const [selected, setProfile] = useState<Profile | null>(() => (uid ? profileForUser(uid) : null) ?? currentProfile())
  if (profileUid !== uid) {
    setProfileUid(uid)
    const restored = uid ? profileForUser(uid) : null
    if (restored) setProfile(restored)
  }
  const profile = selected?.firebase_uid && selected.firebase_uid !== uid ? null : selected

  useEffect(() => {
    if (uid && profile?.firebase_uid === uid) storeSelectProfile(profile.username, uid)
  }, [profile, uid])

  const createProfile = useCallback((username: string, base: NewProfile) => {
    const nextProfile = storeCreateProfile(username, base)
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const selectProfile = useCallback((username: string) => {
    const nextProfile = storeSelectProfile(username, uid)
    setProfile(nextProfile)
    return nextProfile
  }, [uid])

  const leaveProfile = useCallback(() => {
    storeLeaveProfile()
    setProfile(null)
  }, [])

  const updateProfile = useCallback((patch: ProfileChanges) => {
    if (!profile) throw new ProfileError('Select a profile before editing it.')
    const nextProfile = storeUpdateProfile(patch, profile.username)
    setProfile(nextProfile)
    return nextProfile
  }, [profile])

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
