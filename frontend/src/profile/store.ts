// Store local profiles and the active profile selection in this browser.

import type { Profile, SocialProfile, DistrictSelection } from './types'

const ACCOUNTS_KEY = 'pull:accounts'
const SESSION_KEY = 'pull:session'

// What the onboarding flow hands over; the store supplies the timestamps.
export interface NewProfile {
  district: DistrictSelection | null
  topics: number[]
  socials: SocialProfile[]
}

export class ProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileError'
  }
}

function readAccounts(): Record<string, Profile> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}
    const stored = parsed as Record<string, Profile & { password?: string }>
    // Strip credentials left by earlier builds while preserving the local profiles.
    const profiles = Object.fromEntries(Object.entries(stored).map(([name, profile]) => [name, toProfile(profile)]))
    if (Object.values(stored).some((profile) => Object.hasOwn(profile, 'password'))) writeAccounts(profiles)
    return profiles
  } catch {
    return {}
  }
}

function writeAccounts(accounts: Record<string, Profile>): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function listUsernames(): string[] {
  return Object.keys(readAccounts()).sort()
}

// Validate a profile name during onboarding and again when saving it.
export function usernameError(username: string): string | null {
  const name = username.trim()
  if (name.length < 3) return 'Choose a username with at least 3 characters.'
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return 'Usernames can use letters, numbers, dots, dashes and underscores.'
  }
  return null
}

export function isUsernameTaken(username: string): boolean {
  const name = username.trim().toLowerCase()
  return Object.keys(readAccounts()).some((existing) => existing.toLowerCase() === name)
}

export function createProfile(username: string, base: NewProfile): Profile {
  const name = username.trim()
  const problem = usernameError(username)
  if (problem) throw new ProfileError(problem)
  if (isUsernameTaken(name)) {
    throw new ProfileError('That name is already used by a profile on this device.')
  }
  const accounts = readAccounts()
  const now = new Date().toISOString()
  const account: Profile = {
    username: name,
    district: base.district,
    topics: base.topics,
    socials: base.socials,
    created_at: now,
    updated_at: now,
  }
  writeAccounts({ ...accounts, [name]: account })
  localStorage.setItem(SESSION_KEY, name)
  return account
}

export function selectProfile(username: string): Profile {
  const accounts = readAccounts()
  const match = Object.keys(accounts).find((name) => name.toLowerCase() === username.trim().toLowerCase())
  if (!match) throw new ProfileError('That profile could not be found on this device.')
  localStorage.setItem(SESSION_KEY, match)
  return accounts[match]
}

export function leaveProfile(): void {
  localStorage.removeItem(SESSION_KEY)
}

// Return the active local profile or null.
export function currentProfile(): Profile | null {
  const accounts = readAccounts()
  const name = localStorage.getItem(SESSION_KEY)
  return name && Object.hasOwn(accounts, name) ? accounts[name] : null
}

// Save changes to the active local profile and return it.
export function updateProfile(patch: Partial<Pick<Profile, 'district' | 'topics' | 'socials'>>): Profile {
  const name = localStorage.getItem(SESSION_KEY)
  const accounts = readAccounts()
  const account = name && Object.hasOwn(accounts, name) ? accounts[name] : undefined
  if (!account) throw new ProfileError('Select a profile before editing it.')
  const next: Profile = {
    ...account,
    district: patch.district !== undefined ? patch.district : account.district,
    topics: patch.topics !== undefined ? patch.topics : account.topics ?? [],
    socials: patch.socials !== undefined ? patch.socials : account.socials,
    updated_at: new Date().toISOString(),
  }
  accounts[account.username] = next
  writeAccounts(accounts)
  return toProfile(next)
}

function toProfile(account: Profile): Profile {
  return {
    username: account.username,
    district: account.district,
    topics: account.topics ?? [],
    socials: account.socials,
    created_at: account.created_at,
    updated_at: account.updated_at,
  }
}
