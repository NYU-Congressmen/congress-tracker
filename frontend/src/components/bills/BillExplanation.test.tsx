import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BillExplanation } from './BillExplanation'
import { mockApi } from '../../test/fetchMock'

const BASE = {
  bill_id: '119-s-240',
  does_not: 'It does not create a new settlement.',
  stands: 'It became law.',
  decides: 'Both chambers and the President.',
  model: 'gpt-6-luna',
  cached: true,
  missing: [],
  from_stored: false,
}

const LONG_SUMMARY = ['Example Act', `This bill ${'revises the agreement '.repeat(80)}end.`].join('\n\n')

function renderPart(body: object) {
  mockApi([{ match: '/explanation', body }])
  return render(<BillExplanation congress={119} type="s" number={240} title="Example Act" />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BillExplanation', () => {
  test('labels the CRS summary as official and the other parts as AI-generated', async () => {
    renderPart({ ...BASE, does: 'Example Act\n\nThis bill revises the agreement.', does_source: 'crs_summary', source: 'Explained from the CRS summary (Introduced in Senate)' })

    expect(await screen.findByText('This bill revises the agreement.')).toBeTruthy()
    expect(screen.getByText(/Official summary/)).toBeTruthy()
    expect(screen.getAllByText('AI-generated')).toHaveLength(3)
    // The summary's first paragraph only repeats the title, so it is not shown
    expect(screen.queryByText('Example Act')).toBeNull()
    expect(screen.queryByText('Official summary not yet available.')).toBeNull()
  })

  test('notes the missing official summary and tags every part as AI-generated', async () => {
    renderPart({ ...BASE, does: 'Requires reports.', does_source: 'ai', source: 'Explained from the bill text (Introduced in Senate)' })

    expect(await screen.findByText('Official summary not yet available.')).toBeTruthy()
    expect(screen.getAllByText('AI-generated')).toHaveLength(4)
  })

  test('shortens a long summary until the reader asks for the rest', async () => {
    renderPart({ ...BASE, does: LONG_SUMMARY, does_source: 'crs_summary', source: 'Explained from the CRS summary' })

    const more = await screen.findByRole('button', { name: 'Read more' })
    expect(screen.queryByText(/end\.$/)).toBeNull()
    fireEvent.click(more)
    expect(screen.getByText(/end\.$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })

  test('notes missing lookups and a saved version briefly', async () => {
    renderPart({ ...BASE, does: 'Requires reports.', does_source: 'ai', source: 'Explained from the bill text', missing: ['committees'], from_stored: true })

    expect(await screen.findByText(/Committees unavailable\./)).toBeTruthy()
    expect(screen.getByText(/Showing the last saved version\./)).toBeTruthy()
  })
})
