// The local account store. Pull's sign-in goes live through the backend when
// Firebase verification lands; until then accounts live in this browser's
// localStorage, and the app degrades gracefully when the backend still
// returns 401 for signed-in actions.

import type { Account, Profile, SocialProfile, DistrictSelection } from './types'

const ACCOUNTS_KEY = 'pull:accounts'
const SESSION_KEY = 'pull:session'

// What the onboarding flow hands over; the store supplies the timestamps.
export interface NewProfile {
  district: DistrictSelection | null
  topics: number[]
  socials: SocialProfile[]
}

export class AccountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountError'
  }
}

function readAccounts(): Record<string, Account> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, Account>) : {}
  } catch {
    return {}
  }
}

function writeAccounts(accounts: Record<string, Account>): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function listUsernames(): string[] {
  return Object.keys(readAccounts()).sort()
}

// The rules a new username must satisfy. Shared by the onboarding account
// step (for early feedback) and signUp (as the final guard), so a name that
// is accepted in step one can never be rejected at the last click.
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

export function signUp(username: string, password: string, base: NewProfile): Account {
  const name = username.trim()
  const problem = usernameError(username)
  if (problem) throw new AccountError(problem)
  if (password.length < 8) throw new AccountError('Choose a password with at least 8 characters.')
  if (isUsernameTaken(name)) {
    throw new AccountError('That username is taken on this device. Sign in instead, or pick another.')
  }
  const accounts = readAccounts()
  const now = new Date().toISOString()
  const account: Account = {
    username: name,
    district: base.district,
    topics: base.topics,
    socials: base.socials,
    created_at: now,
    updated_at: now,
    password,
  }
  accounts[name] = account
  writeAccounts(accounts)
  localStorage.setItem(SESSION_KEY, name)
  return account
}

export function signIn(username: string, password: string): Account {
  const accounts = readAccounts()
  const match = Object.keys(accounts).find((name) => name.toLowerCase() === username.trim().toLowerCase())
  if (!match) throw new AccountError('No account with that username on this device.')
  if (accounts[match].password !== password) throw new AccountError('That password does not match. Try again.')
  localStorage.setItem(SESSION_KEY, match)
  return accounts[match]
}

export function signOut(): void {
  localStorage.removeItem(SESSION_KEY)
}

// The signed-in profile, or null when nobody is signed in.
export function currentProfile(): Profile | null {
  const name = localStorage.getItem(SESSION_KEY)
  if (!name) return null
  const account = readAccounts()[name]
  if (!account) return null
  return toProfile(account)
}

// Change the profile fields (district, topics, socials) and keep the account stored.
export function updateProfile(patch: Partial<Pick<Profile, 'district' | 'topics' | 'socials'>>): Profile {
  const name = localStorage.getItem(SESSION_KEY)
  const accounts = readAccounts()
  const account = name ? accounts[name] : undefined
  if (!account) throw new AccountError('Sign in before changing your profile.')
  const next: Account = {
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

function toProfile(account: Account): Profile {
  return {
    username: account.username,
    district: account.district,
    // Accounts written before topics existed read as an empty list.
    topics: account.topics ?? [],
    socials: account.socials,
    created_at: account.created_at,
    updated_at: account.updated_at,
  }
}
