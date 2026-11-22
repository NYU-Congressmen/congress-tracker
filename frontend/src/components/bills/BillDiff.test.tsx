import { fireEvent, render, screen } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { BillDiff } from './BillDiff'
import { mockApi } from '../../test/fetchMock'

const VERSIONS = [
  {
    version_type: 'Reported in House',
    version_date: '2025-05-20T04:00:00Z',
    text_url: 'https://www.congress.gov/119/bills/hr1/BILLS-119hr1rh.htm',
    pdf_url: 'https://www.congress.gov/119/bills/hr1/BILLS-119hr1rh.pdf',
    downloaded: false,
  },
  {
    version_type: 'Engrossed in House',
    version_date: '2025-05-22T04:00:00Z',
    text_url: 'https://www.congress.gov/119/bills/hr1/BILLS-119hr1eh.htm',
    pdf_url: null,
    downloaded: true,
  },
]

const DIFF = {
  from_version: 'Reported in House',
  to_version: 'Engrossed in House',
  changes: [
    '--- Reported in House', '+++ Engrossed in House', '@@ -1,2 +1,2 @@',
    ' 119th Congress', '-H.R. 1 RH', '+H.R. 1 EH',
    '+    Filing deadline extended.', '+', '+The effective date is unchanged.',
  ],
}

function renderDiff(versions: unknown[] = VERSIONS, diff: unknown = DIFF, diffStatus = 200, user: User | null = null) {
  const fetchMock = mockApi([
    { match: '/diff', body: diff, status: diffStatus },
    { match: '/texts', body: versions },
  ])
  const result = render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <BillDiff congress={119} type="hr" number={1} />
    </SessionContext.Provider>,
  )
  return { result, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BillDiff', () => {
  test('lists the versions and links their text', async () => {
    renderDiff()

    expect((await screen.findAllByText('Reported in House')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Engrossed in House').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /Read text/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /PDF/ })).toBeTruthy()
  })

  test('compares the oldest and newest versions by default and renders the changes', async () => {
    const { fetchMock } = renderDiff()

    const compare = await screen.findByRole('button', { name: 'Compare versions' })
    fireEvent.click(compare)

    expect(await screen.findByText('H.R. 1 EH Filing deadline extended.')).toBeTruthy()
    expect(screen.getByText('The effective date is unchanged.').tagName).toBe('P')
    expect(screen.getByText('H.R. 1 RH')).toBeTruthy()
    expect(screen.getByText('Added')).toBeTruthy()
    expect(screen.getByText('Removed')).toBeTruthy()
    expect(screen.queryByText('119th Congress')).toBeNull()
    const context = screen.getByRole('checkbox', { name: 'Show surrounding text' })
    fireEvent.click(context)
    expect(screen.getByText('119th Congress')).toBeTruthy()
    expect(screen.queryByText(/@@/)).toBeNull()
    fireEvent.click(context)
    expect(screen.queryByText('119th Congress')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Changes' })).toBeNull()
    const call = fetchMock.mock.calls.find((candidate) => String(candidate[0]).includes('/diff'))
    expect(call).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith(call?.[0], undefined)
    // URLSearchParams encodes spaces as "+", which decodeURIComponent leaves alone.
    const url = decodeURIComponent(String(call?.[0])).replace(/\+/g, ' ')
    expect(url).toContain('from=Reported in House')
    expect(url).toContain('to=Engrossed in House')
  })

  test('shows the saved change summary before the line-by-line diff', async () => {
    const summary = 'The second version extends the filing deadline by 30 days.'
    renderDiff(VERSIONS, { ...DIFF, summary })

    fireEvent.click(await screen.findByRole('button', { name: 'Compare versions' }))

    const heading = await screen.findByRole('heading', { name: 'Changes' })
    const changes = screen.getByLabelText('Changes between the two versions')
    expect(heading.compareDocumentPosition(changes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(summary)).toBeTruthy()
    expect(screen.getByText('AI-generated')).toBeTruthy()
  })

  test('requests generation with a Firebase token for a signed-in reader', async () => {
    const user = { getIdToken: async () => 'test-token' } as User
    const { fetchMock } = renderDiff(VERSIONS, DIFF, 200, user)
    fireEvent.click(await screen.findByRole('button', { name: 'Compare versions' }))
    await screen.findByLabelText('Changes between the two versions')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/diff'), {
      method: 'POST', headers: { Authorization: 'Bearer test-token' },
    })
  })

  test('shows an empty state when no text has been published', async () => {
    renderDiff([])

    expect(await screen.findByText('No published text yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Compare versions' })).toBeNull()
  })

  test('reports a failed comparison', async () => {
    renderDiff(VERSIONS, { detail: 'One of these versions has no formatted text to compare' }, 404)

    fireEvent.click(await screen.findByRole('button', { name: 'Compare versions' }))

    expect(await screen.findByText(/no formatted text to compare/)).toBeTruthy()
  })
})
