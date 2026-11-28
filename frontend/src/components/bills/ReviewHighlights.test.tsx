import { render, screen, waitFor } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { afterEach, expect, test, vi } from 'vitest'
import type { BillDetail } from '../../api/bills'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { ReviewHighlights } from './ReviewHighlights'

afterEach(() => vi.unstubAllGlobals())

const BILL = { congress: 119, type: 's', number: 3108, bill_id: '119-s-3108' } as BillDetail
const WORDS = [{ word: 'jobs', count: 12 }, { word: 'training', count: 3 }]
const HIGHLIGHTS = {
  support: 'Supporters want data before layoffs.', oppose: 'Opponents fear a slow survey.', unsure: '',
  themes: ['job data', 'entry-level work'],
}

function renderPanel(user: User | null) {
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <ReviewHighlights bill={BILL} />
    </SessionContext.Provider>,
  )
}

test('writes missing highlights once for a signed-in reader and sizes the words', async () => {
  let written = false
  const fetchMock = mockApi([{
    match: '/api/bills/119/s/3108/reviews/summary',
    respond: (init) => {
      if (init?.method === 'POST') written = true
      return {
        story_count: 23, min_stories: 5, includes_sample: true, words: WORDS,
        highlights: written ? HIGHLIGHTS : null, highlights_at: written ? '2026-11-28T12:00:00Z' : null,
      }
    },
  }])
  const user = { uid: 'maya', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
  renderPanel(user)

  expect(await screen.findByText('Supporters want data before layoffs.')).toBeTruthy()
  expect(screen.getByText('AI-generated')).toBeTruthy()
  expect(screen.queryByText('Unsure')).toBeNull()
  expect(screen.getByText('jobs').className).toContain('word-cloud__word--5')
  expect(screen.getByText('training').className).toContain('word-cloud__word--2')
  await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
})

test('waits for enough stories before summing them up', async () => {
  mockApi([{ match: '/reviews/summary', body: {
    story_count: 2, min_stories: 5, includes_sample: false, words: [], highlights: null, highlights_at: null,
  } }])
  renderPanel(null)
  expect(await screen.findByText(/once at least 5 people share a story/)).toBeTruthy()
})
