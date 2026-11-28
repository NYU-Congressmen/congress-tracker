import { fireEvent, render, screen } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { YourAsks } from './YourAsks'

afterEach(() => vi.unstubAllGlobals())

const READER = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User

function ask(number: number, extra: Record<string, unknown>) {
  return {
    bill_id: `119-hr-${number}`, congress: 119, type: 'hr', number, title: `Bill ${number}`, status: 'committee',
    passed_house: false, passed_senate: false, introduced_date: null, latest_action_date: '2026-10-14',
    latest_action_text: `Action on ${number}.`, stance: null, tracking: false, unread: 0, calls: 0, ...extra,
  }
}

test('lists the reader\'s stances and tracked bills and marks updates read', async () => {
  let read = false
  const fetchMock = mockApi([
    { match: '/api/account/notifications/read', respond: () => { read = true; return { unread: 0, data: [] } } },
    { match: '/api/account/asks', respond: () => [
      ask(1190, { tracking: true, unread: read ? 0 : 1 }),
      ask(3108, { stance: 'support', calls: 2 }),
    ] },
  ])
  render(
    <SessionContext.Provider value={{ user: READER, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><YourAsks /></MemoryRouter>
    </SessionContext.Provider>,
  )

  expect(await screen.findByText('New update')).toBeTruthy()
  expect(screen.getByText('Tracking')).toBeTruthy()
  expect(screen.getByText('You: Support · 2 calls logged')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
  expect(await screen.findByText(/No new updates/)).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/account/notifications/read', expect.objectContaining({ method: 'PUT' }))
})
