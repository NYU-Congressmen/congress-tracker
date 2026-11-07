import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import BillsPage from './BillsPage'
import { mockApi } from '../test/fetchMock'

const BILL_ONE = {
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

const BILL_TWO = {
  bill_id: '119-s-12',
  congress: 119,
  type: 's',
  number: 12,
  title: 'Housing stability act',
  status: 'became_law',
  passed_house: true,
  passed_senate: true,
  introduced_date: '2025-02-10',
  latest_action_date: '2026-05-19',
  latest_action_text: 'Signed by the President.',
}

function renderPage(initialPath = '/bills') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BillsPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BillsPage', () => {
  test('shows the bills returned by the API', async () => {
    mockApi([
      {
        match: '/api/bills',
        body: { total: 2, page: 1, limit: 15, data: [BILL_ONE, BILL_TWO] },
      },
    ])

    renderPage('/bills?q=water')

    expect(await screen.findByText('To amend the Clean Air Act')).toBeTruthy()
    expect(screen.getByText('Housing stability act')).toBeTruthy()
    expect(screen.getByText(/2 bills found/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /H\.R\. 1/ })).toBeTruthy()
  })

  test('passes the keyword filter to the API', async () => {
    const fetchMock = mockApi([
      { match: '/api/bills', body: { total: 1, page: 1, limit: 15, data: [BILL_ONE] } },
    ])

    renderPage('/bills?q=clean%20water')

    await screen.findByText('To amend the Clean Air Act')
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=clean+water')
  })

  test('shows an empty state when nothing matches', async () => {
    mockApi([{ match: '/api/bills', body: { total: 0, page: 1, limit: 15, data: [] } }])

    renderPage('/bills?q=zzz')

    expect(await screen.findByText('No bills match those filters')).toBeTruthy()
  })

  test('surfaces API errors with a retry action', async () => {
    mockApi([{ match: '/api/bills', body: { detail: 'DATABASE_URL is not set.' }, status: 500 }])

    renderPage('/bills')

    expect(await screen.findByText('Bills could not be loaded')).toBeTruthy()
    expect(screen.getByText(/DATABASE_URL is not set/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
