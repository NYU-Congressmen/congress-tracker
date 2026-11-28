import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'
import { mockApi } from './test/fetchMock'

const BILL = {
  bill_id: '119-hr-1',
  congress: 119,
  type: 'hr',
  number: 1,
  title: 'To amend the Clean Air Act',
  status: 'committee',
  passed_house: false,
  passed_senate: false,
  introduced_date: '2025-01-03',
  latest_action_date: '2026-03-02',
  latest_action_text: 'Committed to the Committee on Environment.',
}

const MEMBER = {
  bioguide_id: 'M000147',
  name: 'Alexandria Ocasio-Cortez',
  party: 'D',
  state: 'NY',
  chamber: 'House',
  district: 14,
  image_url: null,
  is_current: true,
}

const STAGE_COUNTS = {
  introduced: 0, committee: 1, passed_one_chamber: 0, passed_both_chambers: 0, to_president: 0, became_law: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders the dashboard with the live bills and members', async () => {
  mockApi([
    { match: '/api/members', body: { total: 1, data: [MEMBER] } },
    { match: '/api/bills/stage-counts', body: STAGE_COUNTS },
    { match: '/api/bills', body: { total: 1, page: 1, limit: 8, data: [BILL] } },
  ])

  render(<App />)

  // Chrome: the header links, repeated in the phone tab bar
  expect(screen.getAllByRole('link', { name: 'Bills' })).toHaveLength(2)
  expect(screen.getAllByRole('link', { name: 'Members' })).toHaveLength(2)

  // Hero
  expect(await screen.findByRole('heading', { name: 'Your representatives work for you' })).toBeTruthy()
  expect(screen.getByText('stand out').tagName).toBe('MARK')

  // Latest updates from the API, each with its number and stage
  expect(await screen.findByText('To amend the Clean Air Act')).toBeTruthy()
  expect(screen.getByText('H.R. 1 · In committee')).toBeTruthy()

  // Stage tallies and the chamber composition from the member list
  expect(await screen.findByRole('heading', { name: 'Stage' })).toBeTruthy()
  expect((await screen.findAllByText('In committee')).length).toBeGreaterThan(0)
  expect(await screen.findByRole('img', { name: /^House seating, 1 current member, Democrats 1/ })).toBeTruthy()

  // Without a profile, the home page invites the reader to set one up
  expect(screen.getByRole('heading', { name: 'Find your representatives' })).toBeTruthy()
})

test('shows a helpful offline state when the API is down', async () => {
  mockApi([
    { match: '/api/members', body: { detail: 'down' }, status: 500 },
    { match: '/api/bills/stage-counts', body: { detail: 'down' }, status: 500 },
    { match: '/api/bills', body: { detail: 'down' }, status: 500 },
  ])

  render(<App />)

  expect(await screen.findByText('Live data unavailable')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
})
