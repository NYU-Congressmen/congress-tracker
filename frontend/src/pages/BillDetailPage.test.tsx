import { fireEvent, render, screen, within } from '@testing-library/react'
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
  co_sponsors: [COSPONSOR],
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
    ...routes,
    { match: '/api/bills/119/hr/7/explanation', body: EXPLANATION },
    { match: '/api/bills/119/hr/7/texts', body: [] },
    { match: '/api/bills/119/hr/7/review', body: { detail: 'not signed in' }, status: 404 },
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

  test('records a call and its private note on the signed-in account', async () => {
    const caller = { uid: 'caller', getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User
    const note = 'Asked about the committee date.'
    const fetchMock = renderBill(caller, [
      { match: '/api/bills/119/hr/7/calls', body: [] },
      { match: '/api/members?state=NY', body: { data: [COSPONSOR], total: 1 } },
    ])
    const fixtures = fetchMock.getMockImplementation()
    const entry = { action_id: 1, member_name: COSPONSOR.name, created_at: '2025-03-01T12:00:00Z', note }
    let logged = false
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/calls/')) {
        logged = true
        return new Response(JSON.stringify(entry))
      }
      return logged && String(url).endsWith('/calls') ? new Response(JSON.stringify([entry])) : fixtures!(url)
    })

    const panel = await screen.findByRole('region', { name: 'Call log' })
    fireEvent.change(within(panel).getByLabelText('State or territory'), { target: { value: 'NY' } })
    await within(panel).findByRole('option', { name: /Schumer, Chuck/ })
    fireEvent.change(within(panel).getByLabelText('Office called'), { target: { value: COSPONSOR.bioguide_id } })
    fireEvent.change(within(panel).getByLabelText('Note (optional)'), { target: { value: note } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Log a call' }))

    expect(await within(panel).findByText('Call logged.')).toBeTruthy()
    expect(await within(panel).findByText(note)).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/calls\/[0-9a-f-]{36}$/), expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ bioguide_id: COSPONSOR.bioguide_id, note }),
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }))
  })

  test('shows the co-sponsors inside the sponsor card, not as a separate card', async () => {
    renderBill()

    const sponsorPanel = await screen.findByRole('region', { name: 'Sponsor' })
    expect(within(sponsorPanel).getByText('Lowey, NY-13')).toBeTruthy()
    expect(within(sponsorPanel).getByRole('heading', { name: 'Co-sponsors' })).toBeTruthy()
    expect(within(sponsorPanel).getByText('Schumer, Chuck')).toBeTruthy()

    // No standalone co-sponsors panel anywhere on the page.
    expect(screen.queryAllByRole('region', { name: 'Co-sponsors' })).toHaveLength(0)
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
