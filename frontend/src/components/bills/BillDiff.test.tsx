import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
  changes: ['--- Reported in House', '+++ Engrossed in House', '@@ -1 +1 @@', '-H.R. 1 RH', '+H.R. 1 EH'],
}

function renderDiff(versions: unknown[] = VERSIONS, diff: unknown = DIFF, diffStatus = 200) {
  const fetchMock = mockApi([
    { match: '/diff', body: diff, status: diffStatus },
    { match: '/texts', body: versions },
  ])
  const result = render(<BillDiff congress={119} type="hr" number={1} />)
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

    expect(await screen.findByText((content) => (content ?? '').includes('H.R. 1 EH'))).toBeTruthy()
    expect(screen.getByText((content) => (content ?? '').includes('H.R. 1 RH'))).toBeTruthy()
    const call = fetchMock.mock.calls.find((candidate) => String(candidate[0]).includes('/diff'))
    expect(call).toBeTruthy()
    // URLSearchParams encodes spaces as "+", which decodeURIComponent leaves alone.
    const url = decodeURIComponent(String(call?.[0])).replace(/\+/g, ' ')
    expect(url).toContain('from=Reported in House')
    expect(url).toContain('to=Engrossed in House')
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
