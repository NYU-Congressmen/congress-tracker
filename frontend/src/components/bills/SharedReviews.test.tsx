import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { afterEach, expect, test, vi } from 'vitest'
import type { BillDetail } from '../../api/bills'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { SharedReviews } from './SharedReviews'

afterEach(() => vi.unstubAllGlobals())

const BILL = { congress: 119, type: 'hr', number: 1, bill_id: '119-hr-1' } as BillDetail
const STAMP = '2026-11-20T12:00:00Z'

function review(id: number, overrides: Record<string, unknown> = {}) {
  return {
    review_id: id, bill_id: '119-hr-1', stance: 'oppose', story: `Story ${id}.`, action_taken: null,
    state: 'NY', district: 12, created_at: STAMP, updated_at: STAMP, posted_to: [], mine: false,
    is_sample: false, ...overrides,
  }
}

function renderReviews(user: User | null, onReviewHidden = vi.fn()) {
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <SharedReviews bill={BILL} onReviewHidden={onReviewHidden} />
    </SessionContext.Provider>,
  )
  return onReviewHidden
}

test('lists shared stories with their district and loads the next page', async () => {
  const fetchMock = mockApi([
    { match: 'reviews?page=2', body: { total: 11, page: 2, limit: 10, data: [review(11)] } },
    { match: 'reviews?page=1', body: { total: 11, page: 1, limit: 10, data: [review(1, { is_sample: true })] } },
  ])
  renderReviews(null)

  expect(await screen.findByText('Story 1.')).toBeTruthy()
  expect(screen.getByText(/Constituent in New York · District 12/)).toBeTruthy()
  expect(screen.getByText('Sample data')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }))
  expect(await screen.findByText('Story 11.')).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2'), undefined)
})

test('lets a visitor report a story with a reason', async () => {
  const fetchMock = mockApi([
    { match: '/api/reviews/1/reports', body: null },
    { match: 'reviews?page=1', body: { total: 1, page: 1, limit: 10, data: [review(1)] } },
  ])
  renderReviews(null)

  fireEvent.click(await screen.findByRole('button', { name: 'Report' }))
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'harassment' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

  expect(await screen.findByText('Report sent.')).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/reviews/1/reports', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ reason: 'harassment', details: null }),
  }))
})

test('offers the author Hide in place of Report and removes the story', async () => {
  const fetchMock = mockApi([
    { match: '/review/visibility', body: { hidden: true } },
    { match: 'reviews?page=1', body: { total: 2, page: 1, limit: 10, data: [review(1, { mine: true }), review(2)] } },
  ])
  const user = { uid: 'author', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
  const onReviewHidden = renderReviews(user)

  expect(await screen.findByText('Your review')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Report' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Hide from shared reviews' }))

  await waitFor(() => expect(screen.queryByText('Story 1.')).toBeNull())
  expect(onReviewHidden).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/1/review/visibility', expect.objectContaining({
    method: 'PUT', body: JSON.stringify({ hidden: true }),
    headers: expect.objectContaining({ Authorization: 'Bearer verified-token' }),
  }))
})
