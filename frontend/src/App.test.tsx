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

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders the dashboard with the live bills and members', async () => {
  mockApi([
    { match: '/api/members', body: { total: 1, data: [MEMBER] } },
    { match: '/api/bills', body: { total: 1, page: 1, limit: 8, data: [BILL] } },
  ])

  render(<App />)

  // Chrome
  expect(screen.getByRole('link', { name: 'Bills' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Members' })).toBeTruthy()

  // Hero
  expect(await screen.findByText('Follow the work of the 119th Congress')).toBeTruthy()

  // Latest activity from the API
  expect(await screen.findByText('To amend the Clean Air Act')).toBeTruthy()
  expect(screen.getAllByText('In committee').length).toBeGreaterThan(0)
})

test('shows a helpful offline state when the API is down', async () => {
  mockApi([
    { match: '/api/members', body: { detail: 'down' }, status: 500 },
    { match: '/api/bills', body: { detail: 'down' }, status: 500 },
  ])

  render(<App />)

  expect(await screen.findByText('Live data unavailable')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
})
