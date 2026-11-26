import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    { match: '/texts/content', body: { version_type: 'Engrossed in House', text: 'Full text of H.R. 1.\n\nSection 1. Filing deadlines.' } },
    { match: 'full_text=true', body: { ...DIFF, changes: [...DIFF.changes, ' A later unchanged section.'] } },
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

async function openComparison() {
  const select = await screen.findByRole('combobox', { name: 'Compare with' })
  fireEvent.change(select, { target: { value: 'Reported in House' } })
  fireEvent.click(screen.getByRole('button', { name: 'View' }))
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

  test('opens the newest version in place without comparison controls', async () => {
    const { fetchMock } = renderDiff()
    expect(await screen.findByRole('combobox', { name: 'Version' })).toHaveProperty('value', 'Engrossed in House')
    expect(screen.getByRole('combobox', { name: 'Compare with' })).toHaveProperty('value', '')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(await screen.findByRole('region', { name: 'Full bill text' })).toBeTruthy()
    expect(screen.getByText('Section 1. Filing deadlines.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Comparison display' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/texts/content?version=Engrossed+in+House'), undefined)

    await openComparison()
    expect(await screen.findByRole('group', { name: 'Comparison display' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Compare with' }), { target: { value: '' } })
    expect(screen.queryByRole('group', { name: 'Comparison display' })).toBeNull()
  })

  test('opens the text when a bill has only one version', async () => {
    renderDiff(VERSIONS.slice(1))
    fireEvent.click(await screen.findByRole('button', { name: 'View' }))
    expect(await screen.findByText('Full text of H.R. 1.')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Compare with' })).toBeNull()
  })

  test('compares from older to newer and renders the three comparison modes', async () => {
    const { fetchMock } = renderDiff()

    await openComparison()

    expect(await screen.findByText('H.R. 1 EH Filing deadline extended.')).toBeTruthy()
    expect(screen.getByText('The effective date is unchanged.').tagName).toBe('P')
    expect(screen.getByText('H.R. 1 RH')).toBeTruthy()
    expect(screen.getByText('Added')).toBeTruthy()
    expect(screen.getByText('Removed')).toBeTruthy()
    expect(screen.queryByText('119th Congress')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Context' }))
    expect(screen.getByText('119th Congress')).toBeTruthy()
    expect(screen.queryByText('A later unchanged section.')).toBeNull()
    expect(screen.queryByText(/@@/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Full text' }))
    expect(await screen.findByText('A later unchanged section.')).toBeTruthy()
    expect(screen.getByText('Added')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }))
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

    await openComparison()

    const heading = await screen.findByRole('heading', { name: 'Changes' })
    const changes = screen.getByLabelText('Changes between the two versions')
    expect(heading.compareDocumentPosition(changes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(summary)).toBeTruthy()
    expect(screen.getByText('AI-generated')).toBeTruthy()
  })

  test('shows the diff at once and then asks for a summary for a signed-in reader', async () => {
    const summary = 'The second version extends the filing deadline by 30 days.'
    let finishSummary: (response: Response) => void = () => {}
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/texts')) return Promise.resolve(json(VERSIONS))
      if (init?.method === 'POST') return new Promise<Response>((resolve) => { finishSummary = resolve })
      return Promise.resolve(json(DIFF))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = { getIdToken: async () => 'test-token' } as User
    render(
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <BillDiff congress={119} type="hr" number={1} />
      </SessionContext.Provider>,
    )

    await openComparison()

    // The comparison is on screen while the summary is still being written
    expect(await screen.findByText('H.R. 1 EH Filing deadline extended.')).toBeTruthy()
    expect(await screen.findByText('Summarizing the changes…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy()
    const diffCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/diff'))
    expect(diffCalls[0][1]).toBeUndefined()
    expect(diffCalls[1][1]).toEqual({ method: 'POST', headers: { Authorization: 'Bearer test-token' } })

    finishSummary(json({ ...DIFF, summary }))
    expect(await screen.findByText(summary)).toBeTruthy()
    expect(screen.queryByText('Summarizing the changes…')).toBeNull()
  })

  test('keeps the diff when the summary request fails', async () => {
    const user = { getIdToken: async () => 'test-token' } as User
    const fetchMock = mockApi([{ match: '/texts', body: VERSIONS }])
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const [body, status] = url.includes('/texts') ? [VERSIONS, 200]
        : init?.method === 'POST' ? [{ detail: 'Sign-in is unavailable' }, 503] : [DIFF, 200]
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    })
    render(
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <BillDiff congress={119} type="hr" number={1} />
      </SessionContext.Provider>,
    )

    await openComparison()

    expect(await screen.findByText('H.R. 1 EH Filing deadline extended.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Summarizing the changes…')).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/diff'))).toHaveLength(2)
  })

  test('shows an empty state when no text has been published', async () => {
    renderDiff([])

    expect(await screen.findByText('No published text yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
  })

  test('reports a failed comparison', async () => {
    renderDiff(VERSIONS, { detail: 'One of these versions has no formatted text to compare' }, 404)

    await openComparison()

    expect(await screen.findByText(/no formatted text to compare/)).toBeTruthy()
  })
})
