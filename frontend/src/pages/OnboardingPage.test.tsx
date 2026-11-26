import { fireEvent, render, screen } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import OnboardingPage from './OnboardingPage'
import { SessionContext } from '../auth/SessionContext'
import { ProfileProvider } from '../profile/ProfileContext'
import { createProfile, leaveProfile } from '../profile/store'
import { mockAccountProfile, mockApi } from '../test/fetchMock'

const ISSUES = [
  { issue_id: 1, name: 'Health care' },
  { issue_id: 2, name: 'Housing' },
]
const VERIFIED_USER = { uid: 'test-account', getIdToken: async () => 'test-token' } as User

// Start setup for a new local profile.
function completeAccount() {
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'civics-maya' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))
}

function renderOnboarding(user: User | null = null, entry = '/onboarding') {
  const view = (sessionUser: User | null) => (
    <SessionContext.Provider value={{ user: sessionUser, loading: false, error: null, retry: () => {} }}>
      <ProfileProvider>
        <MemoryRouter initialEntries={[entry]}>
          <OnboardingPage />
        </MemoryRouter>
      </ProfileProvider>
    </SessionContext.Provider>
  )
  const result = render(view(user))
  return { signIn: () => result.rerender(view(VERIFIED_USER)) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('OnboardingPage', () => {
  test('saves an address match and continues with the account district', async () => {
    const fetchMock = mockApi([
      { match: '/api/account/district', body: { state: 'NY', district: 12 } },
      { match: '/api/issues', body: ISSUES },
    ])
    renderOnboarding({ uid: 'test-account', getIdToken: async () => 'test-token' } as User)
    completeAccount()
    expect(screen.getByRole('tab', { name: 'Find by address', selected: true })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '100 Example St, New York, NY' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find district' }))
    expect(await screen.findByText('New York · District 12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))
    expect(await screen.findByRole('button', { name: 'Health care' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/account/district', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ address: '100 Example St, New York, NY' }),
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }))
  })

  test('offers sign-in before a visitor names a profile', () => {
    renderOnboarding()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in?next=onboarding')
  })

  test('lets returning users look up a district before naming a browser profile', async () => {
    mockApi([
      { match: '/api/account/district', body: { state: 'NY', district: 12 } },
      { match: '/api/issues', body: ISSUES },
    ])
    const user = { uid: 'test-account', getIdToken: async () => 'test-token' } as User
    renderOnboarding(user, '/onboarding?step=district')

    expect(screen.queryByLabelText('Profile name')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Find by address', selected: true })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to your profile' }))
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'civics-maya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))
    expect(await screen.findByRole('button', { name: 'Health care' })).toBeTruthy()
  })

  test.each([0, 1, 3])('handles %i failed saves after phone verification', async (failedSaves) => {
    const account = mockAccountProfile({}, false)
    const fetchMock = mockApi([
      account.route,
      { match: '/api/district-lookup', body: { state: 'NY', district: 12 } },
      { match: '/api/account/district', body: { state: 'NY', district: 12 } },
      { match: '/api/issues', body: ISSUES },
    ])
    const { signIn } = renderOnboarding()
    completeAccount()

    const address = '100 Example St, New York, NY'
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: address } })
    const findDistrict = screen.getByRole('button', { name: 'Find district' })
    expect(findDistrict.parentElement).toBe(screen.getByRole('button', { name: 'Back' }).parentElement)
    fireEvent.click(findDistrict)
    expect(await screen.findByText('New York · District 12')).toBeTruthy()
    const continueToTopics = await screen.findByRole('button', { name: 'Continue to topics' })
    expect(continueToTopics.parentElement).toBe(screen.getByRole('button', { name: 'Back' }).parentElement)
    fireEvent.click(continueToTopics)
    expect(await screen.findByRole('button', { name: 'Health care' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/district-lookup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ address }),
      headers: { 'Content-Type': 'application/json' },
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to social profiles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to phone verification' }))
    expect(await screen.findByLabelText('Phone number')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Request code' }).parentElement)
      .toBe(screen.getByRole('button', { name: 'Back' }).parentElement)
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(screen.getByLabelText<HTMLInputElement>('Profile name').value).toBe('civics-maya')
    expect(screen.queryByRole('button', { name: 'Phone verification' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))
    expect(screen.getByText('New York · District 12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))
    await screen.findByRole('button', { name: 'Health care' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to social profiles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to phone verification' }))
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
    expect(localStorage.getItem('pull:accounts')).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/account/district')).toBe(false)

    const respond = fetchMock.getMockImplementation()!
    let failuresRemaining = failedSaves
    fetchMock.mockImplementation(async (url, init) => {
      if (url === '/api/account/district' && failuresRemaining > 0) {
        failuresRemaining -= 1
        return new Response(JSON.stringify({ detail: 'District lookup is unavailable.' }), { status: 502 })
      }
      return respond(url, init)
    })
    signIn()
    for (let failure = 0; failure < Math.min(failedSaves, 2); failure += 1) {
      expect((await screen.findByRole('alert')).textContent).toBe('District lookup is unavailable.')
      expect(localStorage.getItem('pull:accounts')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    }
    if (failedSaves === 3) {
      expect((await screen.findByRole('alert')).textContent).toMatch(/couldn’t be saved after three attempts/)
      expect(screen.queryByRole('button', { name: 'Retry save' })).toBeNull()
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/account/district')).toHaveLength(3)
      fireEvent.click(screen.getByRole('button', { name: 'Restart setup' }))
      expect(screen.getByLabelText<HTMLInputElement>('Profile name').value).toBe('')
      return
    }
    expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/account/district', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      body: JSON.stringify({ address }),
    }))
    expect(JSON.stringify(account.profile)).not.toContain(address)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/account/district')).toHaveLength(failedSaves + 1)
  })

  test('saves an account profile with a district, topic and social handle', async () => {
    const account = mockAccountProfile({}, false)
    const fetchMock = mockApi([
      account.route,
      { match: '/api/issues', body: ISSUES },
      { match: '/api/account/district', body: null },
    ])
    renderOnboarding(VERIFIED_USER)
    completeAccount()

    // The number method for an at-large seat needs no district-list call.
    fireEvent.click(screen.getByRole('tab', { name: 'Pick the number' }))
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'DC' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Use my at-large seat' }))

    expect(await screen.findByText('District of Columbia (At large)')).toBeTruthy()
    const toTopics = screen.getByRole('button', { name: 'Continue to topics' })
    expect(toTopics.parentElement).toBe(screen.getByRole('button', { name: 'Back' }).parentElement)
    fireEvent.click(toTopics)

    // Step three: pick a topic to follow, then move on.
    const topic = await screen.findByRole('button', { name: 'Health care' })
    fireEvent.click(topic)
    expect(screen.getByRole('button', { name: 'Health care' }).getAttribute('aria-pressed')).toBe('true')
    const toSocial = screen.getByRole('button', { name: 'Continue to social profiles' })
    expect(toSocial.parentElement).toBe(screen.getByRole('button', { name: 'Back' }).parentElement)
    fireEvent.click(toSocial)

    // Step four is social, and it is still optional: connect one profile here.
    fireEvent.change(screen.getByLabelText('Handle or profile'), { target: { value: 'maya.bsky.social' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add handle' }))
    expect(await screen.findByText('maya.bsky.social')).toBeTruthy()
    const finish = screen.getByRole('button', { name: 'Save profile' })
    expect(finish.parentElement).toBe(screen.getByRole('button', { name: 'Back' }).parentElement)
    fireEvent.click(finish)

    expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()

    expect(account.profile).toMatchObject({
      username: 'civics-maya',
      district: { state: 'DC', district: null, method: 'number' },
      topics: [1],
      socials: [{ platform: 'bluesky', handle: 'maya.bsky.social' }],
    })
    // A district picked by number replaces any address match saved on the account
    expect(fetchMock).toHaveBeenCalledWith('/api/account/district', expect.objectContaining({ method: 'DELETE' }))
  })

  test('requires a district after choosing a numbered state', async () => {
    const fetchMock = mockApi([
      { match: 'tigerWMS_ACS2025', body: { features: [{ attributes: { CD119: '17' } }] } },
      { match: '/api/issues', body: ISSUES },
    ])
    renderOnboarding()
    completeAccount()

    fireEvent.click(screen.getByRole('tab', { name: 'Pick the number' }))
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'CA' } })
    expect(await screen.findByRole('option', { name: 'District 17' })).toBeTruthy()
    const next = screen.getByRole<HTMLButtonElement>('button', { name: 'Continue to topics' })
    expect(next.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('District number'), { target: { value: '17' } })
    expect(next.disabled).toBe(false)
    expect(screen.getByText('California · District 17')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('tigerWMS_ACS2025'))).toBe(true)
  })

  test('matches Census district 00 to an at-large seat', async () => {
    mockApi([{ match: 'tigerWMS_ACS2025', body: { features: [{ attributes: { CD119: '00' } }] } }])
    renderOnboarding()
    completeAccount()

    fireEvent.click(screen.getByRole('tab', { name: 'Pick the number' }))
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'WY' } })
    expect(await screen.findByRole('option', { name: 'At-large district' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('District number'), { target: { value: '0' } })
    expect(screen.getByText('Wyoming (At large)')).toBeTruthy()
  })

  test('opens an existing local profile without credentials', async () => {
    createProfile('civics-maya', { district: { state: 'CA', district: 12, method: 'number' }, topics: [1], socials: [] })
    leaveProfile()
    mockApi([{ match: '/api/issues', body: ISSUES }])
    renderOnboarding()

    fireEvent.change(screen.getByLabelText('Saved profile'), { target: { value: 'civics-maya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }))
    expect(screen.getByText('California · District 12')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))
    expect((await screen.findByRole('button', { name: 'Health care' })).getAttribute('aria-pressed')).toBe('true')
  })

  test('suggests an editable name when a browser profile name is taken', () => {
    createProfile('civics-maya', { district: null, topics: [], socials: [] })
    createProfile('civics-maya-2', { district: null, topics: [], socials: [] })
    leaveProfile()
    renderOnboarding()

    const field = screen.getByLabelText('Profile name')
    const next = screen.getByRole('button', { name: 'Continue to your district' })
    fireEvent.change(field, { target: { value: 'civics maya' } })
    fireEvent.click(next)
    expect(screen.getByRole('alert').textContent).toMatch(/letters, numbers, dots, dashes and underscores/)
    fireEvent.change(field, { target: { value: 'Civics-Maya' } })
    fireEvent.click(next)
    expect(screen.getByRole('alert').textContent).toMatch(/already used/)
    fireEvent.click(screen.getByRole('button', { name: 'Use Civics-Maya-3' }))
    expect((field as HTMLInputElement).value).toBe('Civics-Maya-3')
    fireEvent.change(field, { target: { value: 'Maya-Civics' } })
    fireEvent.click(next)
    expect(screen.getByLabelText('Street address')).toBeTruthy()
  })
})
