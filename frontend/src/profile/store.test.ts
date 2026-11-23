import { afterEach, describe, expect, test } from 'vitest'
import { ProfileError, activateRestoredProfile, currentProfile, selectProfile, leaveProfile, createProfile, updateProfile } from './store'

afterEach(() => {
  localStorage.clear()
})

describe('local profile store', () => {
  test('creates and selects a local profile', () => {
    const account = createProfile('maya', { district: null, topics: [], socials: [] })

    expect(account.username).toBe('maya')
    expect(account).not.toHaveProperty('password')
    expect(currentProfile()?.username).toBe('maya')
  })

  test('refuses a second account with the same username', () => {
    createProfile('maya', { district: null, topics: [], socials: [] })
    expect(() => createProfile('Maya', { district: null, topics: [], socials: [] })).toThrow(ProfileError)
  })

  test('enforces profile name length', () => {
    expect(() => createProfile('ab', { district: null, topics: [], socials: [] })).toThrow(/username/)
  })

  test('rejects usernames with characters outside letters, numbers, dots, dashes and underscores', () => {
    expect(() => createProfile('test user', { district: null, topics: [], socials: [] })).toThrow(
      /letters, numbers, dots, dashes and underscores/,
    )
    expect(localStorage.getItem('pull:accounts')).toBeNull()
  })

  test('selects an existing profile by name', () => {
    createProfile('maya', { district: null, topics: [], socials: [] })
    leaveProfile()
    expect(currentProfile()).toBeNull()
    expect(() => selectProfile('sam')).toThrow(/could not be found/)
    selectProfile('maya')
    expect(currentProfile()?.username).toBe('maya')
  })

  test('updates the district, topics and socials', () => {
    createProfile('maya', { district: null, topics: [], socials: [] })
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
    expect(stored.maya).not.toHaveProperty('password')
    expect(profile).not.toHaveProperty('password')
  })

  test('activates a restored profile only while its Firebase link is available', () => {
    createProfile('maya', { firebase_uid: 'maya-id', district: null, topics: [], socials: [] })
    leaveProfile()
    activateRestoredProfile('maya', 'another-id')
    expect(currentProfile()).toBeNull()
    activateRestoredProfile('maya', 'maya-id')
    expect(currentProfile()?.username).toBe('maya')

    localStorage.clear()
    activateRestoredProfile('maya', 'maya-id')
    expect(localStorage.getItem('pull:session')).toBeNull()
  })

  test('preserves older profiles and removes stored credentials', () => {
    createProfile('maya', { district: null, topics: [], socials: [] })
    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    delete accounts.maya.topics
    accounts.maya.password = 'legacy-example'
    localStorage.setItem('pull:accounts', JSON.stringify(accounts))
    expect(currentProfile()?.topics).toEqual([])
    expect(JSON.parse(localStorage.getItem('pull:accounts') ?? '{}').maya).not.toHaveProperty('password')
  })

  test('keeps each account on this device independent', () => {
    createProfile('maya', { district: { state: 'CA', district: 10, method: 'number' }, topics: [], socials: [] })
    createProfile('sam', { district: null, topics: [], socials: [] })
    selectProfile('maya')
    expect(currentProfile()?.district?.state).toBe('CA')
    leaveProfile()
    selectProfile('sam')
    expect(currentProfile()?.district).toBeNull()
  })
})
