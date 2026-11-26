import { render, screen } from '@testing-library/react'
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

function renderPanel(moderationStatus: string) {
  mockApi([{ match: '/api/bills/119/hr/1/review', body: { ...REVIEW, moderation_status: moderationStatus } }])
  const user = { uid: 'author', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter>
        <ReviewPanel congress={119} type="hr" number={1} />
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
