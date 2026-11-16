import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import OnboardingPage from './OnboardingPage'
import { ProfileProvider } from '../profile/ProfileContext'
import { signOut, signUp } from '../profile/store'
import { mockApi } from '../test/fetchMock'

const ISSUES = [
  { issue_id: 1, name: 'Health care' },
  { issue_id: 2, name: 'Housing' },
]

// Fill in and submit the account step. With no account on the device the step
// starts in "create an account" mode, so the confirm field is present.
async function completeAccount() {
  fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'civics-maya' } })
  fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'secret-123' } })
  fireEvent.change(screen.getByLabelText('Confirm the password'), { target: { value: 'secret-123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))
}

function renderOnboarding() {
  render(
    <ProfileProvider>
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>
    </ProfileProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('OnboardingPage', () => {
  test('signs up, picks an at-large seat by number, follows a topic, connects a social profile and saves the account', async () => {
    mockApi([{ match: '/api/issues', body: ISSUES }])
    renderOnboarding()
    await completeAccount()

    // The number method for an at-large seat needs no district-list call.
    fireEvent.click(screen.getByRole('tab', { name: 'Pick the number' }))
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'DC' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Use my at-large seat' }))

    expect(await screen.findByText('District of Columbia (At large)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))

    // Step three: pick a topic to follow, then move on.
    const topic = await screen.findByRole('button', { name: 'Health care' })
    fireEvent.click(topic)
    expect(screen.getByRole('button', { name: 'Health care' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Continue to social profiles' }))

    // Step four is social, and it is still optional: connect one profile here.
    fireEvent.change(screen.getByLabelText('Handle or profile'), { target: { value: 'maya.bsky.social' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(await screen.findByText('maya.bsky.social')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

    expect(await screen.findByText('All set, civics-maya')).toBeTruthy()

    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    expect(accounts['civics-maya']).toMatchObject({
      username: 'civics-maya',
      district: { state: 'DC', district: null, method: 'number' },
      topics: [1],
      socials: [{ platform: 'bluesky', handle: 'maya.bsky.social' }],
    })
    expect(localStorage.getItem('pull:session')).toBe('civics-maya')
  })

  test('finds the district from street, city, state and ZIP through the geocoder and the census lookup', async () => {
    mockApi([
      {
        match: 'nominatim.openstreetmap.org/search',
        body: [
          {
            lat: '34.0522',
            lon: '-118.2437',
            display_name: 'Los Angeles, California',
            address: { state: 'California' },
          },
        ],
      },
      {
        match: 'tigerweb.geo.census.gov',
        body: {
          features: [{ attributes: { CD120: '17', NAME: 'California District 17', STATE: '06' } }],
        },
      },
      { match: '/api/issues', body: ISSUES },
    ])
    renderOnboarding()
    await completeAccount()

    fireEvent.change(screen.getByLabelText('Street'), { target: { value: '500 S Main St' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Los Angeles' } })
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'CA' } })
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90013' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my district' }))

    expect(await screen.findByText('That address is in California, District 17.')).toBeTruthy()
    expect(screen.getByText('California · District 17')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))

    // Topics are optional: continue without choosing one.
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to social profiles' }))

    // The social step is optional too; skipping still finishes the setup.
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now and finish' }))

    expect(await screen.findByText('All set, civics-maya')).toBeTruthy()
    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    expect(accounts['civics-maya'].district).toEqual({ state: 'CA', district: 17, method: 'address' })
    expect(accounts['civics-maya'].topics).toEqual([])
    expect(accounts['civics-maya'].socials).toEqual([])
  })

  test('selects the at-large seat for the District of Columbia without any API lookup', async () => {
    // The District of Columbia elects a single at-large delegate, so the
    // answer is known in advance: the seat is confirmed on "Find my district"
    // with no geocoding and no district-boundary call.
    const fetchMock = mockApi([{ match: '/api/issues', body: ISSUES }])
    renderOnboarding()
    await completeAccount()

    fireEvent.change(screen.getByLabelText('Street'), { target: { value: '1600 Pennsylvania Ave NW' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Washington' } })
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'DC' } })
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '20500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my district' }))

    expect(
      await screen.findByText(
        'District of Columbia elects an at-large delegate, so there is no numbered district to pick.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('District of Columbia (At large)')).toBeTruthy()
    expect(screen.queryByText('District 98')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Continue to social profiles' }))

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now and finish' }))
    expect(await screen.findByText('All set, civics-maya')).toBeTruthy()

    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    expect(accounts['civics-maya'].district).toEqual({ state: 'DC', district: null, method: 'address' })

    // The answer was local: no geocoder or census request went out.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('nominatim.openstreetmap.org'))).toBe(false)
    expect(urls.some((url) => url.includes('tigerweb.geo.census.gov'))).toBe(false)
  })

  test('lets a territory reader skip the street, city and ZIP entirely', async () => {
    // Puerto Rico's delegate sits at large, so the address fields are
    // optional and nothing is sent to the API.
    const fetchMock = mockApi([{ match: '/api/issues', body: ISSUES }])
    renderOnboarding()
    await completeAccount()

    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'PR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my district' }))

    expect(
      await screen.findByText('Puerto Rico elects an at-large delegate, so there is no numbered district to pick.'),
    ).toBeTruthy()
    expect(screen.getByText('Puerto Rico (At large)')).toBeTruthy()
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('nominatim.openstreetmap.org'))).toBe(false)
    expect(urls.some((url) => url.includes('tigerweb.geo.census.gov'))).toBe(false)
  })

  test('asks for the state before it will look up a district by address', async () => {
    const fetchMock = mockApi([])
    renderOnboarding()
    await completeAccount()

    fireEvent.change(screen.getByLabelText('Street'), { target: { value: '500 S Main St' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Los Angeles' } })
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90013' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my district' }))

    expect(await screen.findByText('Choose the state or territory, and we will find the right seat.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to topics' })).toHaveProperty('disabled', true)
    expect(fetchMock.mock.calls).toEqual([])
  })

  test('asks for street, city and ZIP before looking up a numbered district', async () => {
    const fetchMock = mockApi([])
    renderOnboarding()
    await completeAccount()

    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'CA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my district' }))

    expect(await screen.findByText('Enter the street, city and ZIP so we can look up the district.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to topics' })).toHaveProperty('disabled', true)
    expect(fetchMock.mock.calls).toEqual([])
  })

  test('flags an address that geocodes outside the chosen state', async () => {
    // The reader picked New York, but the address resolves in California:
    // confirm nothing, and say where it actually sits.
    mockApi([
      {
        match: 'nominatim.openstreetmap.org/search',
        body: [
          {
            lat: '34.0522',
            lon: '-118.2437',
            display_name: 'Los Angeles, California',
            address: { state: 'California' },
          },
        ],
      },
      {
        match: 'tigerweb.geo.census.gov',
        body: {
          features: [{ attributes: { CD120: '17', NAME: 'California District 17', STATE: '06' } }],
        },
      },
    ])
    renderOnboarding()
    await completeAccount()

    fireEvent.change(screen.getByLabelText('Street'), { target: { value: '500 S Main St' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Los Angeles' } })
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'NY' } })
    fireEvent.change(screen.getByLabelText('ZIP code'), { target: { value: '90013' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my district' }))

    expect(
      await screen.findByText(
        'That address appears to be in California, not New York. Check the state choice, or pick the district on the map.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to topics' })).toHaveProperty('disabled', true)
  })

  test('signs in with credentials created by a finished onboarding', async () => {
    // A previous onboarding run created the account; the session has since ended.
    signUp('civics-maya', 'secret-123', {
      district: { state: 'CA', district: 12, method: 'address' },
      topics: [1],
      socials: [],
    })
    signOut()
    renderOnboarding()

    // With an account on the device, the step defaults to sign-in.
    expect(screen.getByRole('button', { name: 'Sign in and continue' })).toBeTruthy()
    expect(screen.queryByLabelText('Confirm the password')).toBeNull()

    // A wrong password is rejected and nothing is signed in.
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'civics-maya' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-pass-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in and continue' }))
    expect(await screen.findByText('That password does not match. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in and continue' })).toBeTruthy()

    // The correct password signs in and carries the saved profile forward.
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in and continue' }))
    expect(await screen.findByRole('tab', { name: 'Pick the number' })).toBeTruthy()
    expect(screen.getByText('California · District 12')).toBeTruthy()
    expect(screen.getByText(/Signed in as civics-maya/)).toBeTruthy()
  })

  test('stays on the account step until the credentials are valid', async () => {
    renderOnboarding()
    fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'maya' } })
    fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm the password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))

    expect(await screen.findByText('Choose a password with at least 8 characters.')).toBeTruthy()
    // Still on the account step, and nothing has been written to the store.
    expect(screen.getByRole('button', { name: 'Continue to your district' })).toBeTruthy()
    expect(localStorage.getItem('pull:accounts')).toBeNull()
  })

  test('rejects a username with illegal characters at the account step, not at the social step', async () => {
    // A space passes a length check but not the store's pattern; the reader
    // must hear about it before walking the rest of the wizard.
    renderOnboarding()
    fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'test user' } })
    fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'secret-123' } })
    fireEvent.change(screen.getByLabelText('Confirm the password'), { target: { value: 'secret-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))

    expect(await screen.findByText('Usernames can use letters, numbers, dots, dashes and underscores.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to your district' })).toBeTruthy()
    expect(localStorage.getItem('pull:accounts')).toBeNull()
  })

  test('rejects a username that is already on this device at the account step', async () => {
    // A previous onboarding run left an account behind; the session has since
    // ended, and signing up under the same name must be caught in step one,
    // not on the social step.
    signUp('civics-maya', 'old-pass-1', { district: null, topics: [], socials: [] })
    signOut()
    renderOnboarding()

    // An account on the device makes the step default to sign-in; switch to
    // creating one, as a reader arriving to "set up" would.
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    fireEvent.change(screen.getByLabelText('Choose a username'), { target: { value: 'civics-maya' } })
    fireEvent.change(screen.getByLabelText('Choose a password'), { target: { value: 'secret-123' } })
    fireEvent.change(screen.getByLabelText('Confirm the password'), { target: { value: 'secret-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to your district' }))

    expect(await screen.findByText('That username is taken on this device. Sign in instead, or pick another.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue to your district' })).toBeTruthy()
  })

  test('finishes the setup when the username was taken but the password matches the existing account', async () => {
    // Robustness: a name that appears between step one and the final click
    // (another tab, an older version of the app) must not break the finish.
    // A matching password means the same person: carry the setup onto it.
    mockApi([{ match: '/api/issues', body: ISSUES }])
    renderOnboarding()
    await completeAccount()

    // The account materializes just after step one accepted the name.
    localStorage.setItem(
      'pull:accounts',
      JSON.stringify({
        'civics-maya': {
          username: 'civics-maya',
          district: { state: 'CA', district: 12, method: 'address' },
          topics: [],
          socials: [{ platform: 'bluesky', handle: 'old.bsky.social' }],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          password: 'secret-123',
        },
      }),
    )

    // Walk the rest of the wizard with a fresh at-large district and skip
    // both topics and socials.
    fireEvent.click(screen.getByRole('tab', { name: 'Pick the number' }))
    fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'DC' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Use my at-large seat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to topics' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to social profiles' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now and finish' }))

    expect(await screen.findByText('All set, civics-maya')).toBeTruthy()

    // The account exists, is signed in, and holds the new setup without a
    // social profile from this run.
    expect(localStorage.getItem('pull:session')).toBe('civics-maya')
    const accounts = JSON.parse(localStorage.getItem('pull:accounts') ?? '{}')
    expect(accounts['civics-maya'].district).toEqual({ state: 'DC', district: null, method: 'number' })
    expect(accounts['civics-maya'].socials).toEqual([])
  })
})
