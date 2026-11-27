import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { TrackedBills } from './TrackedBills'

afterEach(() => vi.unstubAllGlobals())

const READER = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User

function bill(number: number, unread: number) {
  return {
    bill_id: `119-hr-${number}`, congress: 119, type: 'hr', number, title: `Bill ${number}`, status: 'committee',
    passed_house: false, passed_senate: false, introduced_date: '2026-01-02', latest_action_date: '2026-10-14',
    latest_action_text: `Action on ${number}.`, followed_at: '2026-09-30T00:00:00Z', unread,
  }
}

function renderPanel() {
  render(
    <SessionContext.Provider value={{ user: READER, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><TrackedBills /></MemoryRouter>
    </SessionContext.Provider>,
  )
}

test('flags tracked bills with new updates and marks them all read', async () => {
  let read = false
  const fetchMock = mockApi([
    { match: '/api/account/notifications/read', respond: () => { read = true; return { unread: 0, data: [] } } },
    { match: '/api/account/tracked', respond: () => [bill(1190, read ? 0 : 1), bill(3108, 0)] },
  ])
  renderPanel()

  expect(await screen.findByText('1 with a new update · 2 tracked')).toBeTruthy()
  expect(screen.getAllByText('New update')).toHaveLength(1)
  expect(screen.getByText('Action on 1190.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))

  expect(await screen.findByText('No new updates · 2 tracked')).toBeTruthy()
  await waitFor(() => expect(screen.queryByText('New update')).toBeNull())
  expect(fetchMock).toHaveBeenCalledWith('/api/account/notifications/read', expect.objectContaining({
    body: JSON.stringify({ bill_id: null }),
  }))
})

test('explains how to track a bill when none are tracked', async () => {
  mockApi([{ match: '/api/account/tracked', body: [] }])
  renderPanel()
  expect(await screen.findByText(/choose Track this bill/)).toBeTruthy()
})
