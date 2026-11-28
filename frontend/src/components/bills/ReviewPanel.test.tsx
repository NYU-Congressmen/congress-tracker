import { fireEvent, render, screen } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { ReviewPanel } from './ReviewPanel'

afterEach(() => vi.unstubAllGlobals())

const REVIEW = {
  bill_id: '119-hr-1', stance: 'oppose', story: 'My clinic closed.', action_taken: null,
  consent_to_share: false, share_publicly: true, hidden: false,
  created_at: '2026-11-20T12:00:00Z', updated_at: '2026-11-20T12:00:00Z',
}

function renderPanel(moderationStatus: string, signalStatus?: 'included' | 'not_included') {
  mockApi([{ match: '/api/bills/119/hr/1/review', body: {
    ...REVIEW, moderation_status: moderationStatus, consent_to_share: signalStatus !== undefined,
    updated_at: new Date().toISOString(),
  } }])
  const user = { uid: 'author', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter>
        <ReviewPanel congress={119} type="hr" number={1} signalStatus={signalStatus} />
      </MemoryRouter>
    </SessionContext.Provider>,
  )
}

test.each([
  ['pending', 'Moderation pending'],
  ['flagged', 'Held for review'],
  ['held', 'Hidden after review'],
])('tells the author when a %s review is off the public list', async (status, notice) => {
  renderPanel(status)
  expect(await screen.findByText(notice)).toBeTruthy()
})

test('shows no notice for a cleared review', async () => {
  renderPanel('cleared')
  expect(await screen.findByText('My clinic closed.')).toBeTruthy()
  expect(screen.queryByText(/Moderation pending|Held for review|Hidden after review/)).toBeNull()
})

test('saves just the selected sharing choice and displays the latest review', async () => {
  const fetchMock = mockApi([{
    match: '/api/bills/119/hr/1/review',
    respond: (init) => init?.method === 'PATCH'
      ? { ...REVIEW, story: 'An edit from another tab.', consent_to_share: true, moderation_status: 'cleared' }
      : { ...REVIEW, moderation_status: 'cleared' },
  }])
  const user = { uid: 'author', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><ReviewPanel congress={119} type="hr" number={1} /></MemoryRouter>
    </SessionContext.Provider>,
  )

  expect(await screen.findByText('Only you can see this box')).toBeTruthy()
  expect(screen.getByText('Your story appears in Shared reviews without your name, labeled with your district.')).toBeTruthy()
  expect(screen.getByText(/do not count you in their Constituent Signal/)).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: /Count me in my representatives/ }))

  expect(await screen.findByText('Your choice is saved.')).toBeTruthy()
  expect(screen.getByText('An edit from another tab.')).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/1/review/sharing', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ field: 'consent_to_share', value: true }),
  }))
})

test('uses the server status when an opted-in review is ineligible', async () => {
  renderPanel('cleared', 'not_included')
  expect(await screen.findByText(/You are not counted in this week/)).toBeTruthy()
  expect(screen.queryByText(/You are counted in this week/)).toBeNull()
})
