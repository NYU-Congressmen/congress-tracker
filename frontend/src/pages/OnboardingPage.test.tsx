import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import OnboardingPage from './OnboardingPage'
import { ProfileProvider } from '../profile/ProfileContext'
import { createProfile, leaveProfile } from '../profile/store'
import { mockApi } from '../test/fetchMock'

const ISSUES = [
  { issue_id: 1, name: 'Health care' },
  { issue_id: 2, name: 'Housing' },
]

// Start setup for a new local profile.
function completeAccount() {
  fireEvent.change(screen.getByLabelText('New profile name'), { target: { value: 'civics-maya' } })
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
  test('saves a local profile with a district, topic and social handle', async () => {
    mockApi([{ match: '/api/issues', body: ISSUES }])
    renderOnboarding()
    completeAccount()

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
    fireEvent.click(screen.getByRole('button', { name: 'Add handle' }))
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

  test('requires a district after choosing a numbered state', async () => {
    const fetchMock = mockApi([
      { match: 'tigerWMS_ACS2025', body: { features: [{ attributes: { CD119: '17' } }] } },
      { match: '/api/issues', body: ISSUES },
    ])
    renderOnboarding()
    completeAccount()

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

  test('rejects an invalid or duplicate profile name', () => {
    createProfile('civics-maya', { district: null, topics: [], socials: [] })
    leaveProfile()
    renderOnboarding()

    const field = screen.getByLabelText('New profile name')
    const next = screen.getByRole('button', { name: 'Continue to your district' })
    fireEvent.change(field, { target: { value: 'civics maya' } })
    fireEvent.click(next)
    expect(screen.getByRole('alert').textContent).toMatch(/letters, numbers, dots, dashes and underscores/)
    fireEvent.change(field, { target: { value: 'Civics-Maya' } })
    fireEvent.click(next)
    expect(screen.getByRole('alert').textContent).toMatch(/already used/)
  })
})
