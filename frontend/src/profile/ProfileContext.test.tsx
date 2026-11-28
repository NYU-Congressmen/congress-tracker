import { render, screen, waitFor } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { afterEach, expect, test, vi } from 'vitest'
import { mockAccountProfile, mockApi } from '../test/fetchMock'
import { SessionContext } from '../auth/SessionContext'
import { ProfileProvider, useProfile } from './ProfileContext'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

function ProfileProbe() {
  const { profile } = useProfile()
  return <p>{profile ? `${profile.username} in ${profile.district?.state ?? 'no state'}` : 'No profile'}</p>
}

test('gives a signed-out visitor no profile even when an earlier browser profile is in use', () => {
  const stamp = '2026-11-01T00:00:00Z'
  localStorage.setItem('pull:accounts', JSON.stringify({
    'walk-in': {
      username: 'walk-in', district: { state: 'CA', district: 12, method: 'number' }, topics: [1], socials: [],
      created_at: stamp, updated_at: stamp,
    },
  }))
  localStorage.setItem('pull:session', 'walk-in')

  render(
    <SessionContext.Provider value={{ user: null, loading: false, error: null, retry: () => {} }}>
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>
    </SessionContext.Provider>,
  )

  expect(screen.getByText('No profile')).toBeTruthy()
})

test('never imports a profile someone else left signed out into a new account', async () => {
  const stamp = '2026-11-01T00:00:00Z'
  localStorage.setItem('pull:accounts', JSON.stringify({
    'walk-in': {
      username: 'walk-in', district: { state: 'CA', district: 12, method: 'number' }, topics: [1], socials: [],
      created_at: stamp, updated_at: stamp,
    },
  }))
  localStorage.setItem('pull:session', 'walk-in')
  const account = mockAccountProfile({}, false)
  const fetchMock = mockApi([account.route])
  const user = { uid: 'new-reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User

  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <ProfileProvider>
        <ProfileProbe />
      </ProfileProvider>
    </SessionContext.Provider>,
  )

  expect(await screen.findByText('Profile in no state')).toBeTruthy()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  // Nothing the walk-in left stays in this browser after the next sign-in
  await waitFor(() => expect(localStorage.getItem('pull:accounts')).toBe('{}'))
  expect(localStorage.getItem('pull:session')).toBeNull()
})
