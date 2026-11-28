import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import BillDetailPage from './BillDetailPage'
import { SessionContext } from '../auth/SessionContext'
import { mockApi } from '../test/fetchMock'
import type { ApiRoute } from '../test/fetchMock'

const SPONSOR = {
  bioguide_id: 'P000614',
  name: 'Lowey, NY-13',
  party: 'D',
  state: 'NY',
  chamber: 'House',
  district: 13,
  image_url: null,
  is_current: true,
}

const COSPONSOR = {
  bioguide_id: 'S001210',
  name: 'Schumer, Chuck',
  party: 'D',
  state: 'NY',
  chamber: 'Senate',
  district: null,
  image_url: null,
  is_current: true,
}

const BILL = {
  bill_id: '119-hr-7',
  congress: 119,
  type: 'hr',
  number: 7,
  title: 'To expand hospital coverage',
  status: 'committee',
  passed_house: false,
  passed_senate: false,
  introduced_date: '2026-01-07',
  latest_action_date: '2026-03-02',
  latest_action_text: 'Referred to committee.',
  policy_area: 'Health',
  sponsor_id: 'P000614',
  sponsor: SPONSOR,
  actions: [{ action_date: '2026-03-02', type: 'Referred', text: 'Referred to committee.' }],
  cache: { complete: true, stale: false, refreshed_at: null, refresh_failed: false, retry_after: null },
}

const EXPLANATION = {
  bill_id: '119-hr-7',
  does: 'This bill expands hospital coverage.',
  does_not: 'It does not expand rural coverage.',
  stands: 'It has been referred to committee.',
  decides: 'The committee must act next.',
  does_source: 'crs_summary',
  source: 'crs',
  model: 'none',
  cached: true,
  missing: [],
  from_stored: false,
}

function renderBill(user: User | null = null, routes: ApiRoute[] = []) {
  // More specific routes first: the mock matches by URL substring, so the
  // bare bill route would swallow the explanation, text and review calls.
  const fetchMock = mockApi([
    { match: '/api/bills/119/hr/7/reviews/summary', body: {
      story_count: 0, min_stories: 5, includes_sample: false, words: [], highlights: null, highlights_at: null,
    } },
    ...routes,
    { match: '/api/bills/119/hr/7/explanation', body: EXPLANATION },
    { match: '/api/bills/119/hr/7/texts', body: [] },
    { match: '/api/bills/119/hr/7/review', body: { detail: 'not signed in' }, status: 404 },
    { match: '/api/bills/119/hr/7/graph', body: {
      cache: BILL.cache,
      cosponsors: [{ ...COSPONSOR, name: 'Schumer, Chuck [D-NY]', withdrawn_date: null }],
    } },
    { match: '/api/bills/119/hr/7/house-votes', body: [] },
    { match: '/api/bills/119/hr/7/signal', body: {
      window_start: '2026-11-20T18:00:00Z', window_end: '2026-11-27T18:00:00Z', includes_sample: false,
      your_review: 'none', offices: [],
    } },
    { match: '/api/bills/119/hr/7/responses', body: {
      label: 'Verified Pull users who responded', total: 0, counts: { support: 0, oppose: 0, unsure: 0 },
    } },
    { match: '/api/bills/119/hr/7', body: BILL },
  ])
  render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter initialEntries={['/bills/119/hr/7']}>
        <Routes>
          <Route path="/bills/:congress/:type/:number" element={<BillDetailPage />} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  )
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BillDetailPage', () => {
  test('saves a stance without sending review fields and refreshes the breakdown', async () => {
    const reader = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User
    const calls = renderBill(reader)
    const fixtures = calls.getMockImplementation()
    const review = {
      bill_id: BILL.bill_id, stance: 'support', story: 'Existing review text',
      consent_to_share: true, share_publicly: true, updated_at: '2026-11-25T12:00:00Z',
    }
    let changed = false
    calls.mockImplementation(async (url) => {
      if (String(url).endsWith('/review/stance')) {
        changed = true
        return Response.json({ ...review, stance: 'oppose' })
      }
      if (String(url).endsWith('/review')) return Response.json(review)
      if (changed && String(url).endsWith('/responses')) {
        return Response.json({ label: 'Verified Pull users who responded', total: 1,
          counts: { support: 0, oppose: 1, unsure: 0 } })
      }
      return fixtures!(url)
    })

    const stance = await screen.findByRole('button', { name: 'Oppose' })
    fireEvent.click(stance)
    expect(await screen.findByText('Oppose saved.')).toBeTruthy()
    expect(stance.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Existing review text')).toBeTruthy()
    expect(await screen.findByText('100% · 1')).toBeTruthy()
    expect(calls).toHaveBeenCalledWith('/api/bills/119/hr/7/review/stance', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ stance: 'oppose' }),
    }))
  })

  test('hides an author\'s shared review and keeps one shared reviews panel', async () => {
    const author = { uid: 'author', getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User
    const review = {
      bill_id: BILL.bill_id, stance: 'support', story: 'My shared story', consent_to_share: true,
      share_publicly: true, moderation_status: 'cleared', hidden: false, updated_at: '2026-11-25T12:00:00Z',
    }
    const shared = {
      review_id: 5, bill_id: BILL.bill_id, stance: 'support', story: 'My shared story', action_taken: null,
      state: 'NY', district: 13, created_at: review.updated_at, updated_at: review.updated_at,
      posted_to: [], mine: true, is_sample: false,
    }
    let hidden = false
    renderBill(author, [
      { match: '/api/bills/119/hr/7/reviews', respond: () => hidden
        ? { total: 0, page: 1, limit: 10, data: [], mine_hidden: shared }
        : { total: 1, page: 1, limit: 10, data: [shared], mine_hidden: null } },
      { match: '/api/bills/119/hr/7/review/visibility', respond: (init) => {
        hidden = JSON.parse(String(init?.body)).hidden
        return { ...review, hidden }
      } },
      { match: '/api/bills/119/hr/7/review', respond: () => ({ ...review, hidden }) },
    ])

    fireEvent.click(await screen.findByRole('button', { name: 'Hide from shared reviews' }))
    expect(await screen.findByRole('button', { name: 'Show it again' })).toBeTruthy()
    expect(await screen.findByText('Only you can see this')).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: 'Shared reviews' })).toHaveLength(1)

    // The shared list offers the same way back as the stance panel
    fireEvent.click(screen.getByRole('button', { name: 'Show in shared reviews' }))
    expect(await screen.findByText('Your review')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show it again' })).toBeNull())
    expect(screen.getAllByRole('heading', { name: 'Shared reviews' })).toHaveLength(1)
  })

  test('shows a saved call and its private note on the signed-in bill page', async () => {
    const caller = { uid: 'caller', getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User
    const note = 'Asked about the committee date.'
    const entry = { action_id: 1, member_name: COSPONSOR.name, created_at: '2025-03-01T12:00:00Z', note }
    const fetchMock = renderBill(caller, [
      { match: '/api/bills/119/hr/7/calls', body: [entry] },
    ])
    const panel = await screen.findByRole('region', { name: 'Call log' })
    expect(await within(panel).findByText(note)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/7/calls', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }))
  })

  test('shows the co-sponsors inside the sponsor card, not as a separate card', async () => {
    renderBill()

    const sponsorPanel = await screen.findByRole('region', { name: 'Sponsor' })
    expect(within(sponsorPanel).getByText('Lowey, NY-13')).toBeTruthy()
    expect(within(sponsorPanel).getByRole('heading', { name: 'Co-sponsors' })).toBeTruthy()
    expect((await within(sponsorPanel).findByRole('link', { name: /Schumer, Chuck/ })).getAttribute('href'))
      .toBe('/members/S001210')
    expect(within(sponsorPanel).queryByText(/\[D-NY\]/)).toBeNull()

    // No standalone co-sponsors panel anywhere on the page.
    expect(screen.queryAllByRole('region', { name: 'Co-sponsors' })).toHaveLength(0)
  })

  test.each([true, false])('distinguishes empty cosponsors from incomplete data (%s)', async (complete) => {
    renderBill(null, [{
      match: '/api/bills/119/hr/7/graph',
      body: { cosponsors: [], cache: { ...BILL.cache, complete, stale: !complete } },
    }])
    const sponsorPanel = await screen.findByRole('region', { name: 'Sponsor' })
    const message = complete
      ? 'Congress.gov lists no co-sponsors for this bill.'
      : 'Co-sponsor data is unavailable.'
    expect(await within(sponsorPanel).findByText(message)).toBeTruthy()
  })

  test('lays out sponsor and action history side by side, then the explanation, then the diffs', async () => {
    renderBill()

    await screen.findByRole('region', { name: 'Sponsor' })
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '')
    const index = (text: string) => headings.findIndex((heading) => heading.includes(text))

    expect(index('Sponsor')).toBeGreaterThanOrEqual(0)
    expect(index('Sponsor')).toBeLessThan(index('Action history'))
    expect(index('Action history')).toBeLessThan(index('Explanation'))
    expect(index('Explanation')).toBeLessThan(index('Text versions and changes'))
  })
})
