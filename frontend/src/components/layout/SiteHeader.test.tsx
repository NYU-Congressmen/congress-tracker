import type { User } from '@firebase/auth'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { SiteHeader } from './SiteHeader'

vi.mock('../../profile/ProfileContext', () => ({
  useProfile: () => ({ profile: { username: 'maya', district: { state: 'NY', district: 12 } } }),
}))

afterEach(() => vi.unstubAllGlobals())

function update(id: number, number: number, message: string, isRead: boolean) {
  return {
    notification_id: id, bill_id: `119-hr-${number}`, congress: 119, type: 'hr', number, title: `Bill ${number}`,
    message, is_read: isRead, created_at: '2026-11-27T12:00:00Z',
  }
}

test('lists recent bill updates in the account menu and marks them all read', async () => {
  let read = false
  const fetchMock = mockApi([
    { match: '/api/account/notifications/read', respond: () => { read = true; return { unread: 0, data: [] } } },
    { match: '/api/account/notifications', respond: () => ({
      unread: read ? 0 : 2,
      data: [
        update(2, 10159, 'Nov 20, 2026: Became Public Law No: 119-146.', read),
        update(1, 1190, 'Oct 14, 2026: Message on Senate action sent to the House.', read),
      ],
    }) },
  ])
  const user = { uid: 'maya', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><SiteHeader /></MemoryRouter>
    </SessionContext.Provider>,
  )

  const summary = await screen.findByLabelText('maya profile options, 2 unread bill updates')
  fireEvent.click(summary)
  const updates = screen.getByRole('region', { name: 'Bill updates' })
  const latest = within(updates).getByRole('link', { name: /H\.R\. 10159/ })
  expect(latest.getAttribute('href')).toBe('/bills/119/hr/10159')
  expect(latest.closest('li')!.className).toBe('is-unread')
  expect(screen.getByRole('link', { name: 'Edit profile' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()

  fireEvent.click(within(updates).getByRole('button', { name: 'Mark all read' }))
  await waitFor(() => expect(screen.getByLabelText('maya profile options')).toBeTruthy())
  expect(fetchMock).toHaveBeenCalledWith('/api/account/notifications/read', expect.objectContaining({ method: 'PUT' }))
})
