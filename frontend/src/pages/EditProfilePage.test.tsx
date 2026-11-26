import { fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { SessionContext } from '../auth/SessionContext'
import { SiteHeader } from '../components/layout/SiteHeader'
import { ProfileProvider } from '../profile/ProfileContext'
import { mockAccountProfile, mockApi } from '../test/fetchMock'
import EditProfilePage from './EditProfilePage'
import MembersPage from './MembersPage'

const user = { uid: 'editor', getIdToken: async () => 'test-token' } as User

function renderEditor() {
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <ProfileProvider>
          <SiteHeader />
          <Routes>
            <Route path="/profile" element={<EditProfilePage />} />
            <Route path="/members" element={<MembersPage />} />
          </Routes>
        </ProfileProvider>
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => localStorage.clear())

test('saves topics and the profile name independently without reopening sign-in', async () => {
  const account = mockAccountProfile({ username: 'maya', district: { state: 'NY', district: 12, method: 'number' } })
  mockApi([
    account.route,
    { match: '/api/issues', body: [{ issue_id: 1, name: 'Housing' }] },
    { match: '/api/account/custom-topics', body: [] },
  ])
  renderEditor()

  expect(screen.queryByText('Phone verification')).toBeNull()
  fireEvent.click(await screen.findByRole('link', { name: 'Topics' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Housing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save topics' }))
  expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Go to my dashboard' }).getAttribute('href')).toBe('/')
  expect(screen.getByRole('link', { name: 'Open the Social page' }).getAttribute('href')).toBe('/social')

  const sections = within(screen.getByRole('navigation', { name: 'Profile sections' }))
  fireEvent.click(sections.getByRole('link', { name: 'Social' }))
  const saveSocial = screen.getByRole('button', { name: 'Save Social' })
  const addHandle = screen.getByRole('button', { name: 'Add handle' })
  expect(addHandle.parentElement).toBe(saveSocial.parentElement)
  fireEvent.change(screen.getByLabelText('Handle or profile'), { target: { value: 'maya.bsky.social' } })
  fireEvent.click(addHandle)
  fireEvent.click(saveSocial)
  expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Profile' }))
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'maya-civics' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save profile name' }))

  expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()
  expect(account.profile).toMatchObject({
    username: 'maya-civics',
    district: { state: 'NY', district: 12 },
    topics: [1],
    socials: [{ platform: 'bluesky', handle: 'maya.bsky.social' }],
  })
})

test('saves a district on request and uses it for My representatives', async () => {
  const account = mockAccountProfile({}, false)
  const match = { state: 'NY', district: 12 }
  const member = { party: 'D', state: 'NY', image_url: null, is_current: true }
  const members = [
    { ...member, bioguide_id: 'X000001', name: 'Example House Member', chamber: 'House', district: 12 },
    { ...member, bioguide_id: 'X000002', name: 'Example Senator', chamber: 'Senate', district: null },
    { ...member, bioguide_id: 'X000003', name: 'Neighboring House Member', chamber: 'House', district: 13 },
  ]
  const fetchMock = mockApi([
    account.route,
    { match: '/api/district-lookup', body: match },
    { match: '/api/account/district', body: match },
    { match: '/api/members', body: { total: members.length, data: members } },
  ])
  renderEditor()

  expect(screen.getByRole('link', { name: 'Edit profile' }).getAttribute('href')).toBe('/profile')
  expect(screen.queryByRole('link', { name: 'Set up profile' })).toBeNull()
  fireEvent.change(await screen.findByLabelText('Street address'), { target: { value: '350 Fifth Avenue, New York, NY' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find district' }))
  expect(await screen.findByText('New York · District 12')).toBeTruthy()
  expect(fetchMock).not.toHaveBeenCalledWith('/api/account/district', expect.objectContaining({ method: 'PUT' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save district' }))

  expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/account/district', expect.objectContaining({ method: 'PUT' }))
  expect(account.profile.district).toEqual({ ...match, method: 'address' })

  fireEvent.click(screen.getByRole('link', { name: 'Members' }))
  fireEvent.click(screen.getByRole('button', { name: 'My representatives' }))
  expect(await screen.findByText('New York · District 12 · 2 representatives')).toBeTruthy()
  expect(screen.getByText('Example House Member')).toBeTruthy()
  expect(screen.getByText('Example Senator')).toBeTruthy()
  expect(screen.queryByText('Neighboring House Member')).toBeNull()
})

test('forgets the account district when the reader picks one by number', async () => {
  const account = mockAccountProfile({ username: 'maya', district: { state: 'NY', district: 12, method: 'address' } })
  const fetchMock = mockApi([
    account.route,
    { match: '/api/account/district', body: null },
    { match: 'tigerWMS', body: { features: [] } },
  ])
  renderEditor()

  fireEvent.click(await screen.findByRole('tab', { name: 'Pick the number' }))
  fireEvent.change(screen.getByLabelText('State or territory'), { target: { value: 'DC' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Use my at-large seat' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save district' }))

  expect(await screen.findByRole('heading', { name: 'Profile saved' })).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/account/district', expect.objectContaining({ method: 'DELETE' }))
  expect(account.profile.district).toEqual({ state: 'DC', district: null, method: 'number' })
})
