import { fireEvent, render, screen } from '@testing-library/react'
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
  test('tries the official backup photo and shows initials if both sources fail', async () => {
    const portrait = 'https://www.congress.gov/img/member/h001072_200.jpg'
    renderPage({ ...MEMBER, image_url: portrait })
    const name = 'Official photo of French Hill'
    const first = await screen.findByRole('img', { name })
    expect(first.getAttribute('src')).toBe(portrait)
    fireEvent.error(first)
    const backup = screen.getByRole('img', { name })
    expect(backup.getAttribute('src')).toBe('https://bioguide.congress.gov/photo/H001072.jpg')
    fireEvent.error(backup)
    expect(screen.queryByRole('img', { name })).toBeNull()
    expect(screen.getByText('FH')).toBeTruthy()
  })

  test('shows the seat and the Washington office contacts', async () => {
    renderPage(MEMBER)

    expect(await screen.findByRole('heading', { name: 'French Hill' })).toBeTruthy()
    expect(screen.getByText('Arkansas')).toBeTruthy()
    expect(screen.getByText('District 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: '(202) 225-2506' }).getAttribute('href')).toBe('tel:2022252506')
    const office = screen.getByText('1533 Longworth House Office Building')
    expect(office.nextElementSibling?.textContent).toBe('Washington, DC 20515')
    expect(screen.getByRole('link', { name: 'hill.house.gov' })).toBeTruthy()
  })

  test.each([
    ['D', '/chambers/donkey.webp'],
    ['R', '/chambers/elephant.webp'],
  ])('shows the %s outline in the portrait badge', async (party, icon) => {
    renderPage({ ...MEMBER, party })

    const portrait = await screen.findByRole('img', { name: 'Official photo of French Hill' })
    expect(portrait.parentElement?.querySelector('.pb__icon')?.getAttribute('style')).toContain(icon)
  })

  test('shows the saved abbreviation for a party without an icon', async () => {
    renderPage({ ...MEMBER, party: 'ID' })

    const portrait = await screen.findByRole('img', { name: 'Official photo of French Hill' })
    expect(portrait.parentElement?.querySelector('.pb')?.textContent).toBe('ID')
  })

  test('preserves a suite and additional address lines while collapsing blank lines', async () => {
    renderPage({
      ...MEMBER,
      office_address: '1533 Longworth House Office Building, Suite 200\r\n\r\nAttn: Scheduling\n',
    })

    const address = (await screen.findByText('1533 Longworth House Office Building')).parentElement
    expect(Array.from(address?.children ?? [], (line) => line.textContent)).toEqual([
      '1533 Longworth House Office Building',
      'Suite 200',
      'Attn: Scheduling',
      'Washington, DC 20515',
    ])
  })

  test('says so when no office contact is on file', async () => {
    renderPage({ ...MEMBER, office_phone: null, office_address: null, website_url: null })

    expect(await screen.findByText('No office contact is on file for this member yet.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Official website' })).toBeNull()
  })
})
