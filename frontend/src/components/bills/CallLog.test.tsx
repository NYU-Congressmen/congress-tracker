import type { User } from '@firebase/auth'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { CallLog } from './CallLog'

vi.mock('../../profile/ProfileContext', () => ({
  useProfile: () => ({ profile: { district: { state: 'NY', district: 12 } } }),
}))

afterEach(() => vi.unstubAllGlobals())

test('logs the phone link, retries the same entry and adds a note later', async () => {
  const writes: { url: string; body: unknown }[] = []
  const entry = { action_id: 1, bioguide_id: 'R000001', member_name: 'District office',
    created_at: '2026-11-25T12:00:00Z', note: null as string | null }
  let deleted = false
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      writes.push({ url, body: init.body })
      if (writes.length === 1) return Response.json({ detail: 'Try again.' }, { status: 502 })
      return Response.json(entry)
    }
    if (init?.method === 'PATCH') {
      entry.note = JSON.parse(String(init.body)).note
      return Response.json(entry)
    }
    if (init?.method === 'DELETE') {
      deleted = true
      return new Response(null, { status: 204 })
    }
    if (url.includes('/members')) {
      return Response.json({
        data: [
          { bioguide_id: 'R000001', name: 'District office', state: 'NY', chamber: 'House', district: 12, office_phone: '(202) 555-0101' },
          { bioguide_id: 'R000002', name: 'Other district office', state: 'NY', chamber: 'House', district: 13, office_phone: '(202) 555-0102' },
        ],
      })
    }
    return Response.json(writes.length > 1 && !deleted ? [entry] : [])
  })
  vi.stubGlobal('fetch', fetchMock)
  const user = { uid: 'fixture', getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User

  render(
    <MemoryRouter>
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <CallLog congress={119} type="hr" number={7} />
      </SessionContext.Provider>
    </MemoryRouter>,
  )

  const phone = await screen.findByRole('link', { name: 'Call District office' })
  expect(phone.getAttribute('href')).toBe('tel:2025550101')
  expect(screen.queryByRole('link', { name: 'Call Other district office' })).toBeNull()
  expect(screen.queryByLabelText('Office called')).toBeNull()
  expect(screen.getByRole('region', { name: 'Call log' })).toBeTruthy()
  expect(writes).toHaveLength(0)

  expect(screen.queryByRole('button', { name: 'I called District office' })).toBeNull()
  window.addEventListener('click', (event) => event.preventDefault(), { once: true })
  fireEvent.click(phone)
  expect((await screen.findByRole('alert')).textContent).toContain('Try again.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
  expect(await screen.findByRole('button', { name: 'Add note' })).toBeTruthy()
  expect(screen.queryByText('Call logged.')).toBeNull()
  expect(writes).toHaveLength(2)
  expect(writes[0]).toEqual(writes[1])
  expect(writes[1].body).toBe(JSON.stringify({ bioguide_id: 'R000001' }))

  fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
  fireEvent.change(screen.getByLabelText('Call note'), { target: { value: 'Asked about the bill.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
  expect(await screen.findByText('Asked about the bill.')).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/7/calls/1/note', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ note: 'Asked about the bill.' }),
  }))

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep call' }))
  expect(deleted).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete call' }))
  expect(await screen.findByText('No calls logged for this bill.')).toBeTruthy()
  expect(screen.queryByText('Asked about the bill.')).toBeNull()
})

test('shows each office\'s Constituent Signal and withholds a small count', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/signal')) {
      return Response.json({
        window_start: '2026-11-20T18:00:00Z', window_end: '2026-11-27T18:00:00Z', includes_sample: true,
        min_counted: 5, your_review: 'included',
        offices: [
          { bioguide_id: 'R000001', name: 'District office', party: 'D', chamber: 'House', state: 'NY', district: 12,
            support: 13, oppose: 8, unsure: 1, calls: 2, withheld: false },
          { bioguide_id: 'S000001', name: 'State office', party: 'D', chamber: 'Senate', state: 'NY', district: null,
            support: null, oppose: null, unsure: null, calls: null, withheld: true },
        ],
      })
    }
    if (url.includes('/members')) {
      return Response.json({
        data: [
          { bioguide_id: 'R000001', name: 'District office', state: 'NY', chamber: 'House', district: 12, office_phone: '(202) 555-0101' },
          { bioguide_id: 'S000001', name: 'State office', state: 'NY', chamber: 'Senate', district: null, office_phone: '(202) 555-0103' },
        ],
      })
    }
    return Response.json([])
  }))
  const user = { uid: 'fixture', getIdToken: vi.fn().mockResolvedValue('test-token') } as unknown as User
  render(
    <MemoryRouter>
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <CallLog congress={119} type="hr" number={7} />
      </SessionContext.Provider>
    </MemoryRouter>,
  )

  const house = (await screen.findByRole('link', { name: 'Call District office' })).closest('li')!
  expect(await within(house).findByText('13')).toBeTruthy()
  expect(within(house).getByRole('link', { name: 'Public record' }).getAttribute('href')).toBe('/members/R000001#signal')
  const senate = screen.getByRole('link', { name: 'Call State office' }).closest('li')!
  expect(within(senate).getByText('Fewer than 5 constituents counted this week')).toBeTruthy()
  expect(screen.getByText('Sample data')).toBeTruthy()
})
