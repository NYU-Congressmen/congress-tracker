import { afterEach, describe, expect, test } from 'vitest'
import { AccountError, currentProfile, signIn, signOut, signUp, updateProfile } from './store'

afterEach(() => {
  localStorage.clear()
})

describe('local account store', () => {
  test('creates an account, signs it in and returns a profile without the password', () => {
    const account = signUp('maya', 'hunter22', { district: null, topics: [], socials: [] })

    expect(account.username).toBe('maya')
    expect(account.password).toBe('hunter22')
    expect(currentProfile()?.username).toBe('maya')
  })

  test('refuses a second account with the same username', () => {
    signUp('maya', 'hunter22', { district: null, topics: [], socials: [] })
    expect(() => signUp('Maya', 'other99', { district: null, topics: [], socials: [] })).toThrow(AccountError)
  })

  test('enforces username and password length', () => {
    expect(() => signUp('ab', 'hunter22', { district: null, topics: [], socials: [] })).toThrow(/username/)
    expect(() => signUp('maya', 'short', { district: null, topics: [], socials: [] })).toThrow(/password/)
  })

  test('rejects usernames with characters outside letters, numbers, dots, dashes and underscores', () => {
    expect(() => signUp('test user', 'hunter22', { district: null, topics: [], socials: [] })).toThrow(
      /letters, numbers, dots, dashes and underscores/,
    )
    expect(localStorage.getItem('pull:accounts')).toBeNull()
  })

  test('signs in only with the matching password', () => {
    signUp('maya', 'hunter22', { district: null, topics: [], socials: [] })
    signOut()
    expect(currentProfile()).toBeNull()
    expect(() => signIn('maya', 'wrongpass')).toThrow(/password/)
    signIn('maya', 'hunter22')
    expect(currentProfile()?.username).toBe('maya')
  })

  test('updates the district, topics and socials and keeps the password private', () => {
    signUp('maya', 'hunter22', { district: null, topics: [], socials: [] })
    const profile = updateProfile({
      district: { state: 'CA', district: 10, method: 'map' },
      topics: [1, 2],
      socials: [{ platform: 'bluesky', handle: 'maya.bsky.social' }],
    })
    expect(profile.district).toEqual({ state: 'CA', district: 10, method: 'map' })
    expect(profile.topics).toEqual([1, 2])
    expect(profile.socials).toHaveLength(1)
    const stored = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    expect(stored.maya.topics).toEqual([1, 2])
    expect(stored.maya.password).toBe('hunter22')
    expect(profile).not.toHaveProperty('password')
  })

  test('treats accounts written before topics existed as following none', () => {
    signUp('maya', 'hunter22', { district: null, topics: [], socials: [] })
    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    delete accounts.maya.topics
    localStorage.setItem('pull:accounts', JSON.stringify(accounts))
    expect(currentProfile()?.topics).toEqual([])
  })

  test('keeps each account on this device independent', () => {
    signUp('maya', 'hunter22', { district: { state: 'CA', district: 10, method: 'number' }, topics: [], socials: [] })
    signUp('sam', 'hunter33', { district: null, topics: [], socials: [] })
    signIn('maya', 'hunter22')
    expect(currentProfile()?.district?.state).toBe('CA')
    signOut()
    signIn('sam', 'hunter33')
    expect(currentProfile()?.district).toBeNull()
  })
})
