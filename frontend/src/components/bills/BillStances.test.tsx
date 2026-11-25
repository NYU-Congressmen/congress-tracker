import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { BillDetail } from '../../api/bills'
import { BillStances } from './BillStances'

vi.mock('../../profile/ProfileContext', () => ({
  useProfile: () => ({ profile: { district: { state: 'NY', district: 12 } } }),
}))

afterEach(() => vi.unstubAllGlobals())

const bill = { congress: 119, type: 'hr', number: 7, status: 'committee' } as BillDetail
const label = 'Verified Pull users who responded'

test('shows sample district shares and official stage, then loads the all-respondents view', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/house-votes')) return Response.json([])
    if (url.includes('/members')) return Response.json({ data: [] })
    return Response.json(url.includes('?') ? {
      label, total: 100, counts: { support: 8, oppose: 90, unsure: 2 },
    } : {
      label, total: 200, counts: { support: 108, oppose: 90, unsure: 2 },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<BillStances bill={bill} />)

  const panel = screen.getByRole('region', { name: 'Stances and bill outcome' })
  expect(await within(panel).findByText(`${label} · 100`)).toBeTruthy()
  for (const text of ['8% · 8', '90% · 90', '2% · 2']) {
    expect(within(panel).getByText(text)).toBeTruthy()
  }
  expect(within(panel).getByRole('heading', { name: 'Official bill stage' })).toBeTruthy()
  expect(within(panel).getByRole('link', { name: 'Bill record on Congress.gov' }).getAttribute('href'))
    .toContain('congress.gov')
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/7/responses?state=NY&district=12', undefined)

  fireEvent.change(within(panel).getByLabelText('Response area'), { target: { value: 'all' } })
  expect(await within(panel).findByText('54% · 108')).toBeTruthy()
  expect(within(panel).queryByText('90% · 90')).toBeNull()
  expect(fetchMock).toHaveBeenLastCalledWith('/api/bills/119/hr/7/responses', undefined)
})

test('keeps the official stage visible when there are no responses', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(
    url.includes('/house-votes') ? [] : url.includes('/members') ? { data: [] } : {
      label, total: 0, counts: { support: 0, oppose: 0, unsure: 0 },
    },
  )))
  render(<BillStances bill={bill} />)

  expect(await screen.findByText('No verified Pull responses for this area yet.')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Official bill stage' })).toBeTruthy()
})

test('shows the district representative’s position beside the full official roll call', async () => {
  const official = 'https://clerk.house.gov/Votes/2025190'
  const directory = { data: [
    { bioguide_id: 'N000002', name: 'Jerrold Nadler', chamber: 'House', state: 'NY', district: 12 },
    { bioguide_id: 'A000001', name: 'Another member', chamber: 'House', state: 'NY', district: 13 },
  ] }
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/members')) return Response.json(directory)
    if (url.includes('/responses')) return Response.json({ label, total: 0 })
    return Response.json([{
      congress: 119, session: 1, roll_number: 190, vote_date: '2025-07-03T18:31:00Z',
      question: 'On Motion to Concur in the Senate Amendment', result: 'Passed', source_url: official,
      positions_complete: true, totals: { Aye: 218, No: 214 },
      positions: [{ bioguide_id: 'N000002', position: 'No' }],
    }])
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<BillStances bill={{ ...bill, number: 1 }} />)

  expect(await screen.findByText('Roll call 190')).toBeTruthy()
  expect(screen.getByText('Aye 218 · No 214')).toBeTruthy()
  expect(screen.getByText('Jerrold Nadler ·').parentElement?.textContent).toContain('No')
  expect(screen.getByRole('link', { name: 'Official roll call record' }).getAttribute('href')).toBe(official)
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/1/house-votes?bioguide_id=N000002', undefined)
})
