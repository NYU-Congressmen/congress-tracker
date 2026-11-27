import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { BillDetail } from '../../api/bills'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { TrackButton } from './TrackButton'

afterEach(() => vi.unstubAllGlobals())

const BILL = { congress: 119, type: 'hr', number: 1, bill_id: '119-hr-1' } as BillDetail
const READER = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User

function renderButton(user: User | null) {
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><TrackButton bill={BILL} /></MemoryRouter>
    </SessionContext.Provider>,
  )
}

test('asks a visitor to sign in before tracking', () => {
  renderButton(null)
  expect(screen.getByRole('link', { name: 'Sign in to track' }).getAttribute('href')).toBe('/sign-in')
})

test('tracks a bill and stops tracking it', async () => {
  let tracking = false
  const fetchMock = mockApi([{
    match: '/api/bills/119/hr/1/track',
    respond: (init) => {
      if (init?.method === 'PUT') tracking = true
      if (init?.method === 'DELETE') tracking = false
      return { tracking }
    },
  }])
  renderButton(READER)

  fireEvent.click(await screen.findByRole('button', { name: 'Track this bill' }))
  const button = await screen.findByRole('button', { name: 'Tracking' })
  expect(button.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(button)
  expect(await screen.findByRole('button', { name: 'Track this bill' })).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/1/track', expect.objectContaining({
    method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer verified-token' }),
  }))
})

test('marks a tracked bill\'s updates read when the reader opens it', async () => {
  const fetchMock = mockApi([
    { match: '/api/account/notifications/read', body: { unread: 0, data: [] } },
    { match: '/api/bills/119/hr/1/track', body: { tracking: true } },
  ])
  renderButton(READER)

  expect(await screen.findByRole('button', { name: 'Tracking' })).toBeTruthy()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/notifications/read', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ bill_id: '119-hr-1' }),
  })))
})
