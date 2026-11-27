import { render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { SessionContext } from '../auth/SessionContext'
import { ProfileProvider, useProfile } from './ProfileContext'

afterEach(() => localStorage.clear())

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
  // The browser copy stays so a later sign-in can import it into an empty account.
  expect(localStorage.getItem('pull:session')).toBe('walk-in')
})
