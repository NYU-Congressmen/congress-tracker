import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import BillDetailPage from './BillDetailPage'
import { mockApi } from '../test/fetchMock'

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

function renderBill() {
  // More specific routes first: the mock matches by URL substring, so the
  // bare bill route would swallow the explanation, text and review calls.
  mockApi([
    { match: '/api/bills/119/hr/7/explanation', body: EXPLANATION },
    { match: '/api/bills/119/hr/7/texts', body: [] },
    { match: '/api/bills/119/hr/7/review', body: { detail: 'not signed in' }, status: 404 },
    { match: '/api/bills/119/hr/7', body: BILL },
  ])
  return render(
    <MemoryRouter initialEntries={['/bills/119/hr/7']}>
      <Routes>
        <Route path="/bills/:congress/:type/:number" element={<BillDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BillDetailPage', () => {
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
