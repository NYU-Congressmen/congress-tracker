import { render, screen, within } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { BillDetail } from '../../api/bills'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { ConstituentSignal } from './ConstituentSignal'

afterEach(() => vi.unstubAllGlobals())

const BILL = { congress: 119, type: 's', number: 3108, bill_id: '119-s-3108' } as BillDetail
const READER = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User

function office(id: string, name: string, chamber: string, district: number | null, counts: number[]) {
  const [support, oppose, unsure, calls] = counts
  return { bioguide_id: id, name, party: 'D', chamber, state: 'NY', district, support, oppose, unsure, calls }
}

function renderPanel(user: User | null) {
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><ConstituentSignal bill={BILL} /></MemoryRouter>
    </SessionContext.Provider>,
  )
}

test('shows each office\'s draft counts and whether the reader is counted', async () => {
  const fetchMock = mockApi([{
    match: '/api/bills/119/s/3108/signal',
    body: {
      window_start: '2026-11-20T18:00:00Z', window_end: '2026-11-27T18:00:00Z', includes_sample: true,
      your_review: 'included',
      offices: [
        office('N000002', 'Nadler, Jerrold', 'House', 12, [21, 4, 3, 2]),
        office('S000148', 'Schumer, Charles E.', 'Senate', null, [40, 9, 6, 1]),
      ],
    },
  }])
  renderPanel(READER)

  const house = (await screen.findByText('Representative Nadler, Jerrold')).closest('li')!
  expect(within(house).getByText('New York · District 12')).toBeTruthy()
  expect(within(house).getByText('21')).toBeTruthy()
  const senate = screen.getByText('Senator Schumer, Charles E.').closest('li')!
  expect(within(senate).getByText('New York')).toBeTruthy()
  expect(screen.getByText('Your review is counted in these drafts.')).toBeTruthy()
  expect(screen.getByText('Sample data')).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/s/3108/signal', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer verified-token' }),
  }))
})

test('points a reader who has not opted in to the Social setting', async () => {
  mockApi([{
    match: '/signal',
    body: {
      window_start: '2026-11-20T18:00:00Z', window_end: '2026-11-27T18:00:00Z', includes_sample: false,
      your_review: 'not_consented', offices: [office('N000002', 'Nadler, Jerrold', 'House', 12, [0, 0, 0, 0])],
    },
  }])
  renderPanel(READER)

  expect(await screen.findByText(/not included in the Constituent Signal brief/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Include it on Social' }).getAttribute('href'))
    .toBe('/social?bill=119-s-3108#bill-review')
})

test('asks for a district when the reader has none and stays hidden from visitors', async () => {
  mockApi([{
    match: '/signal',
    body: { window_start: '2026-11-20T18:00:00Z', window_end: '2026-11-27T18:00:00Z', includes_sample: false,
      your_review: 'none', offices: [] },
  }])
  renderPanel(READER)
  expect(await screen.findByRole('link', { name: 'Save your district' })).toBeTruthy()
})

test('renders nothing for a visitor', () => {
  renderPanel(null)
  expect(screen.queryByText('Constituent Signal')).toBeNull()
})
