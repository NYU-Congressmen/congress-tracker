import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import MembersPage from './MembersPage'
import { mockApi } from '../test/fetchMock'

const MEMBER_ONE = {
  bioguide_id: 'M000147',
  name: 'Alexandria Ocasio-Cortez',
  party: 'D',
  state: 'NY',
  chamber: 'House',
  district: 14,
  image_url: null,
  is_current: true,
}

const MEMBER_TWO = {
  bioguide_id: 'R000146',
  name: 'Ted Cruz',
  party: 'R',
  state: 'TX',
  chamber: 'Senate',
  district: null,
  image_url: null,
  is_current: true,
}

function renderPage(initialPath = '/members') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MembersPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MembersPage', () => {
  test('shows the directory returned by the API', async () => {
    mockApi([{ match: '/api/members', body: { total: 2, data: [MEMBER_ONE, MEMBER_TWO] } }])

    renderPage()

    expect(await screen.findByText('Alexandria Ocasio-Cortez')).toBeTruthy()
    expect(screen.getByText('Ted Cruz')).toBeTruthy()
    expect(screen.getByText(/2 members/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Alexandria Ocasio-Cortez/ })).toBeTruthy()
  })

  test('passes the party filter to the API', async () => {
    const fetchMock = mockApi([{ match: '/api/members', body: { total: 1, data: [MEMBER_ONE] } }])

    renderPage('/members?party=D')

    await screen.findByText('Alexandria Ocasio-Cortez')
    expect(String(fetchMock.mock.calls[0][0])).toContain('party=D')
  })

  test('shows an empty state when nothing matches', async () => {
    mockApi([{ match: '/api/members', body: { total: 0, data: [] } }])

    renderPage('/members?state=XX')

    expect(await screen.findByText('No members match those filters')).toBeTruthy()
  })

  test('tints each card with the member party class', async () => {
    mockApi([{ match: '/api/members', body: { total: 2, data: [MEMBER_ONE, MEMBER_TWO] } }])

    renderPage()

    const democratCard = (await screen.findByText('Alexandria Ocasio-Cortez')).closest('.member-card')
    expect(democratCard?.className).toContain('member-card--d')

    const republicanCard = screen.getByText('Ted Cruz').closest('.member-card')
    expect(republicanCard?.className).toContain('member-card--r')
  })
})
