import { fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { mockApi } from '../../test/fetchMock'
import { RepresentativeTiles } from './RepresentativeTiles'

afterEach(() => vi.unstubAllGlobals())

const READER = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User

function office(id: string, name: string, chamber: string, extra: Record<string, unknown>) {
  return {
    bioguide_id: id, name, party: 'D', chamber, state: 'NY', district: chamber === 'House' ? 12 : null,
    image_url: null, office_phone: '(202) 225-5635', website_url: null, signal_bills: 0, signal_constituents: 0,
    your_calls: 0, voting_record: null, ...extra,
  }
}

function vote(number: number, stance: string, position: string | null, agrees: boolean | null) {
  return {
    bill_id: `119-hr-${number}`, congress: 119, type: 'hr', number, title: `Bill ${number}`, stance,
    question: 'On Passage', vote_date: '2026-01-10T00:00:00Z', roll_number: number, position, agrees,
  }
}

test('shows each office\'s voting record, signal and calls', async () => {
  mockApi([{
    match: '/api/account/representatives',
    body: [
      office('N000002', 'Nadler, Jerrold', 'House', {
        signal_bills: 7, signal_constituents: 68, your_calls: 1,
        voting_record: {
          compared: 2, agreed: 1, missed: 1,
          votes: [vote(1, 'oppose', 'No', true), vote(2, 'support', 'Nay', false), vote(3, 'support', 'Not Voting', null)],
        },
      }),
      office('S000148', 'Schumer, Charles E.', 'Senate', {}),
    ],
  }])
  render(
    <SessionContext.Provider value={{ user: READER, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter><RepresentativeTiles /></MemoryRouter>
    </SessionContext.Provider>,
  )

  const house = (await screen.findByRole('link', { name: 'Nadler, Jerrold' })).closest('li')!
  expect(within(house).getByText('1 of 2')).toBeTruthy()
  expect(within(house).getByText('Missed 1 vote')).toBeTruthy()
  expect(within(house).getByText('68 constituents on 7 bills')).toBeTruthy()
  expect(within(house).getByRole('link', { name: 'Call (202) 225-5635' }).getAttribute('href')).toBe('tel:2022255635')
  fireEvent.click(within(house).getByText('The votes'))
  expect(within(house).getByText('Voted against you')).toBeTruthy()
  expect(within(house).getByText('Did not vote')).toBeTruthy()

  const senate = screen.getByRole('link', { name: 'Schumer, Charles E.' }).closest('li')!
  expect(within(senate).getByText('Senate votes are not tracked yet')).toBeTruthy()
  expect(within(senate).getByText('No bill reached the public minimum')).toBeTruthy()
})
