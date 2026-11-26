import type { User } from '@firebase/auth'
import { fireEvent, render, screen } from '@testing-library/react'
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
    if (url.includes('/members')) {
      return Response.json({
        data: [
          { bioguide_id: 'R000001', name: 'District office', state: 'NY', chamber: 'House', district: 12, office_phone: '(202) 555-0101' },
          { bioguide_id: 'R000002', name: 'Other district office', state: 'NY', chamber: 'House', district: 13, office_phone: '(202) 555-0102' },
        ],
      })
    }
    return Response.json(writes.length > 1 ? [entry] : [])
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
  expect(writes).toHaveLength(0)

  expect(screen.queryByRole('button', { name: 'I called District office' })).toBeNull()
  window.addEventListener('click', (event) => event.preventDefault(), { once: true })
  fireEvent.click(phone)
  expect((await screen.findByRole('alert')).textContent).toContain('Try again.')
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
  expect(await screen.findByText('Call logged.')).toBeTruthy()
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
})
