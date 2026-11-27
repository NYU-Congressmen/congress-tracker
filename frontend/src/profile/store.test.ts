import { afterEach, describe, expect, test } from 'vitest'
import { currentProfile, forgetAccountProfiles, importablePreferences, legacyProfileFor, usernameError } from './store'
import type { Profile } from './types'

afterEach(() => {
  localStorage.clear()
})

const stamp = '2026-11-20T12:00:00.000Z'

// Write browser profiles the way earlier builds stored them, with one of them in use.
function storeLegacy(profiles: Partial<Profile>[], active?: string) {
  const accounts = Object.fromEntries(profiles.map((profile) => [profile.username, {
    district: null, topics: [], socials: [], created_at: stamp, updated_at: stamp, ...profile,
  }]))
  localStorage.setItem('pull:accounts', JSON.stringify(accounts))
  if (active) localStorage.setItem('pull:session', active)
}

describe('profile names', () => {
  test('enforces length and allowed characters', () => {
    expect(usernameError('ab')).toMatch(/at least 3/)
    expect(usernameError('test user')).toMatch(/letters, numbers/)
    expect(usernameError('maya.k')).toBeNull()
  })
})

describe('browser profiles from earlier builds', () => {
  test('preserves older profiles and removes stored credentials', () => {
    storeLegacy([{ username: 'maya', password: 'legacy-example' } as Partial<Profile>], 'maya')
    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    delete accounts.maya.topics
    localStorage.setItem('pull:accounts', JSON.stringify(accounts))
    expect(currentProfile()?.topics).toEqual([])
    expect(JSON.parse(localStorage.getItem('pull:accounts') ?? '{}').maya).not.toHaveProperty('password')
  })

  test('prefers the profile linked to the account, then the unlinked profile in use', () => {
    storeLegacy([{ username: 'walk-in' }], 'walk-in')
    expect(legacyProfileFor('maya-id')?.username).toBe('walk-in')
    storeLegacy([{ username: 'walk-in' }, { username: 'maya', firebase_uid: 'maya-id' }], 'walk-in')
    expect(legacyProfileFor('maya-id')?.username).toBe('maya')
    storeLegacy([{ username: 'maya', firebase_uid: 'maya-id' }], 'maya')
    expect(legacyProfileFor('other-id')).toBeNull()
  })

  test('cleans fields the account API would reject instead of dropping the whole profile', () => {
    const stored = {
      username: ' Adam W! ', district: { state: 'NY', district: 0, method: 'map' },
      topics: [3, 3, -1, 2.5, 5], socials: [{ platform: 'bluesky', handle: ' adam.bsky.social ' }, { platform: '', handle: 'x' }],
      created_at: stamp, updated_at: stamp,
    } as Profile
    expect(importablePreferences(stored)).toEqual({
      username: 'Adam-W', topics: [3, 5], socials: [{ platform: 'bluesky', handle: 'adam.bsky.social' }],
    })
    expect(importablePreferences({ ...stored, username: '!!', district: { state: 'NY', district: 12, method: 'search' } })).toEqual({
      district: { state: 'NY', district: 12, method: 'search' }, topics: [3, 5],
      socials: [{ platform: 'bluesky', handle: 'adam.bsky.social' }],
    })
  })

  test('forgets linked copies and the imported profile but keeps other browser profiles', () => {
    storeLegacy([{ username: 'maya', firebase_uid: 'maya-id' }, { username: 'sam' }, { username: 'walk-in' }], 'walk-in')

    forgetAccountProfiles('maya-id', currentProfile())

    expect(Object.keys(JSON.parse(localStorage.getItem('pull:accounts') ?? '{}'))).toEqual(['sam'])
    expect(currentProfile()).toBeNull()
  })
})
