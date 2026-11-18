import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { DistrictBills } from './DistrictBills'
import { mockApi } from '../../test/fetchMock'

const HOUSE = {
  bioguide_id: 'P000614',
  name: 'Lowey, NY-13',
  party: 'D',
  state: 'NY',
  chamber: 'House',
  district: 13,
  image_url: null,
  is_current: true,
}

const SENATOR = {
  bioguide_id: 'S001210',
  name: 'Schumer, Chuck',
  party: 'D',
  state: 'NY',
  chamber: 'Senate',
  district: null,
  image_url: null,
  is_current: true,
}

const OTHER_HOUSE = {
  bioguide_id: 'M000147',
  name: 'Ocasio-Cortez, Alexandria',
  party: 'D',
  state: 'NY',
  chamber: 'House',
  district: 14,
  image_url: null,
  is_current: true,
}

const BILL_A = {
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
}

const BILL_B = {
  bill_id: '119-hr-9',
  congress: 119,
  type: 'hr',
  number: 9,
  title: 'To fund district schools',
  status: 'introduced',
  passed_house: false,
  passed_senate: false,
  introduced_date: '2026-01-10',
  latest_action_date: '2026-02-01',
  latest_action_text: null,
}

const OTHER_BILL = {
  ...BILL_A,
  bill_id: '119-hr-88',
  number: 88,
  title: 'To do something for another district',
}

function renderBills(members: unknown[] = [HOUSE, SENATOR, OTHER_HOUSE]) {
  const fetchMock = mockApi([
    {
      match: '/api/members/P000614',
      body: {
        ...HOUSE,
        // The same bill listed twice (sponsored and co-sponsored) must show once.
        sponsored_bills: [BILL_A],
        co_sponsored_bills: [BILL_A, BILL_B],
      },
    },
    { match: '/api/members/S001210', body: { ...SENATOR, sponsored_bills: [], co_sponsored_bills: [] } },
    { match: '/api/members/M000147', body: { ...OTHER_HOUSE, sponsored_bills: [OTHER_BILL], co_sponsored_bills: [] } },
    { match: '/api/members', body: { total: members.length, data: members } },
  ])
  return {
    fetchMock,
    view: render(
      <MemoryRouter>
        <DistrictBills state="NY" district={13} />
      </MemoryRouter>,
    ),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DistrictBills', () => {
  test('lists the district representatives bills in the activity format, without naming the members', async () => {
    renderBills()

    expect(await screen.findByText('To expand hospital coverage')).toBeTruthy()
    expect(screen.getByText('To fund district schools')).toBeTruthy()
    expect(screen.getByText('New York · District 13')).toBeTruthy()

    // Same format as "Latest activity": a compact list of bill links.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /H\.R\. 7/ })).toBeTruthy()

    // The representatives are listed on the Members page, not in this section.
    expect(screen.queryByText('Lowey, NY-13')).toBeNull()
    expect(screen.queryByText('Schumer, Chuck')).toBeNull()
    expect(screen.getByRole('link', { name: 'My representatives' })).toBeTruthy()
  })

  test('does not load or list bills from members of other districts', async () => {
    const { fetchMock } = renderBills()

    await screen.findByText('To expand hospital coverage')
    expect(screen.queryByText('To do something for another district')).toBeNull()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/members/M000147'))).toBe(false)
  })

  test('explains the gap when the directory has no one for the state', async () => {
    renderBills([])

    expect(await screen.findByText('No representatives on record')).toBeTruthy()
  })
})
