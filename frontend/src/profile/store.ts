// Read browser profiles saved by earlier builds, which seed an empty account at sign-in when they
// were already linked to it.

import type { Profile, SocialProfile, DistrictSelection } from './types'

const ACCOUNTS_KEY = 'pull:accounts'
const SESSION_KEY = 'pull:session'

// Describe the profile fields an account save accepts.
export interface NewProfile {
  firebase_uid?: string
  district: DistrictSelection | null
  topics: number[]
  socials: SocialProfile[]
}

export type ProfileChanges = Partial<NewProfile & Pick<Profile, 'username'>>

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

// Validate a profile name during onboarding and again when saving it.
export function usernameError(username: string): string | null {
  const name = username.trim()
  if (name.length < 3) return 'Choose a username with at least 3 characters.'
  if (name.length > 80) return 'Choose a username with 80 characters or fewer.'
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return 'Usernames can use letters, numbers, dots, dashes and underscores.'
  }
  return null
}

// Find the active or most recently updated local profile for the signed-in account.
export function profileForUser(uid: string): Profile | null {
  const accounts = readAccounts()
  const activeName = localStorage.getItem(SESSION_KEY)
  const active = activeName && Object.hasOwn(accounts, activeName) ? accounts[activeName] : null
  if (active?.firebase_uid === uid) return active

  return Object.values(accounts)
    .filter((profile) => profile.firebase_uid === uid)
    .sort((left, right) => (right.updated_at ?? '').localeCompare(left.updated_at ?? ''))[0] ?? null
}

// Return the browser profile to copy into a new account, which is only ever one an earlier build
// linked to this same account. An unlinked profile could belong to anyone who used the browser.
export function legacyProfileFor(uid: string): Profile | null {
  return profileForUser(uid)
}

const NAME_PATTERN = /^[a-zA-Z0-9_.-]{3,80}$/
const SOCIAL_LIMIT = 20
const TOPIC_LIMIT = 100

// Convert a browser profile into fields the account API accepts, dropping any it would reject.
export function importablePreferences(profile: Profile): ProfileChanges {
  const preferences: ProfileChanges = {}
  const name = String(profile.username ?? '').trim().replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  if (NAME_PATTERN.test(name)) preferences.username = name

  const district = profile.district
  if (district && /^[A-Z]{2}$/.test(district.state)
    && (district.district === null || (Number.isInteger(district.district) && district.district >= 1 && district.district <= 99))
    && ['address', 'map', 'number', 'search'].includes(district.method)) {
    preferences.district = { state: district.state, district: district.district, method: district.method }
  }

  if (Array.isArray(profile.topics)) {
    preferences.topics = [...new Set(profile.topics.filter((id) => Number.isInteger(id) && id > 0))].slice(0, TOPIC_LIMIT)
  }
  if (Array.isArray(profile.socials)) {
    preferences.socials = profile.socials
      .filter((social) => typeof social?.platform === 'string' && typeof social.handle === 'string')
      .map((social) => ({ platform: social.platform, handle: social.handle.trim() }))
      .filter((social) => social.platform.length >= 1 && social.platform.length <= 32 && social.handle.length >= 1 && social.handle.length <= 512)
      .slice(0, SOCIAL_LIMIT)
  }
  return preferences
}

// Keep only the browser profiles that pass the test, and drop the profile in use if it went.
function keepProfiles(keep: (profile: Profile) => boolean): void {
  const accounts = readAccounts()
  const kept = Object.fromEntries(Object.entries(accounts).filter(([, profile]) => keep(profile)))
  if (Object.keys(kept).length !== Object.keys(accounts).length) writeAccounts(kept)
  const active = localStorage.getItem(SESSION_KEY)
  if (active && !Object.hasOwn(kept, active)) localStorage.removeItem(SESSION_KEY)
}

// Delete every unlinked profile, which no screen shows and no account can import, so nothing a
// signed-out visitor left behind lingers after the next sign-in.
export function forgetUnlinkedProfiles(): void {
  keepProfiles((profile) => Boolean(profile.firebase_uid))
}

// Delete the browser copies an account now holds, along with every unlinked profile.
export function forgetAccountProfiles(uid: string): void {
  keepProfiles((profile) => Boolean(profile.firebase_uid) && profile.firebase_uid !== uid)
}

function toProfile(account: Profile): Profile {
  return {
    username: account.username,
    firebase_uid: account.firebase_uid,
    district: account.district,
    topics: account.topics ?? [],
    socials: account.socials,
    created_at: account.created_at,
    updated_at: account.updated_at,
  }
}
