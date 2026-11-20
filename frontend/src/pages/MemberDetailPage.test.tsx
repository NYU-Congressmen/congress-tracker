import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import MemberDetailPage from './MemberDetailPage'
import { mockApi } from '../test/fetchMock'

const CACHE = { complete: true, stale: false, refreshed_at: null, refresh_failed: false, retry_after: null }

const MEMBER = {
  bioguide_id: 'H001072',
  name: 'French Hill',
  party: 'R',
  state: 'AR',
  chamber: 'House',
  district: 2,
  image_url: null,
  is_current: true,
  office_phone: '(202) 225-2506',
  office_address: '1533 Longworth House Office Building, Washington, DC 20515',
  website_url: 'https://hill.house.gov/',
  sponsored_bills: [],
  cache: CACHE,
}

function renderPage(body: object) {
  mockApi([{ match: '/api/members/H001072', body }])
  return render(
    <MemoryRouter initialEntries={['/members/H001072']}>
      <Routes>
        <Route path="/members/:bioguideId" element={<MemberDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MemberDetailPage', () => {
  test('shows the seat and the Washington office contacts', async () => {
    renderPage(MEMBER)

    expect(await screen.findByRole('heading', { name: 'French Hill' })).toBeTruthy()
    expect(screen.getByText('Arkansas')).toBeTruthy()
    expect(screen.getByText('District 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: '(202) 225-2506' }).getAttribute('href')).toBe('tel:2022252506')
    expect(screen.getByText('1533 Longworth House Office Building, Washington, DC 20515')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'hill.house.gov' })).toBeTruthy()
  })

  test('says so when no office contact is on file', async () => {
    renderPage({ ...MEMBER, office_phone: null, office_address: null, website_url: null })

    expect(await screen.findByText('No office contact is on file for this member yet.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Official website' })).toBeNull()
  })
})
