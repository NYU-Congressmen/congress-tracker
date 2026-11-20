import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ActionTimeline } from './ActionTimeline'
import { speakerOf, threadRows } from '../../lib/actionThread'

// Congress.gov order: newest first.
const ACTIONS = [
  { action_date: '2025-07-21', type: 'IntroReferral', text: 'Received in the Senate.' },
  { action_date: '2025-07-17', type: 'Floor', text: 'Passed/agreed to in House: On passage Passed by the Yeas and Nays: 294 - 134.' },
  { action_date: '2025-06-10', type: 'Committee', text: 'Ordered to be Reported (Amended) by the Yeas and Nays: 32 - 19.' },
  { action_date: '2025-05-29', type: 'IntroReferral', text: 'Referred to the House Committee on Financial Services.' },
  { action_date: '2025-05-29', type: 'IntroReferral', text: 'Introduced in House' },
]

describe('threadRows', () => {
  test('reads oldest first, keeps same-day actions in sequence and stamps each new day', () => {
    const rows = threadRows(ACTIONS)
    expect(rows.map((row) => (row.kind === 'date' ? row.date : row.kind === 'event' ? 'event' : row.text))).toEqual([
      '2025-05-29',
      'Introduced in House',
      'Referred to the House Committee on Financial Services.',
      '2025-06-10',
      'Ordered to be Reported (Amended) by the Yeas and Nays: 32 - 19.',
      '2025-07-17',
      'event',
      '2025-07-21',
      'Received in the Senate.',
    ])
  })

  test('labels the sender from the action type and wording', () => {
    expect(speakerOf(ACTIONS[0])).toBe('Senate')
    expect(speakerOf(ACTIONS[2])).toBe('Committee')
    expect(speakerOf(ACTIONS[4])).toBe('House')
    expect(speakerOf({ action_date: null, type: 'BecameLaw', text: 'Became Public Law No: 119-27.' })).toBe('President')
    expect(speakerOf({ action_date: null, type: null, text: 'Motion to reconsider laid on the table.' })).toBe('Congress')
  })
})

describe('ActionTimeline', () => {
  test('shows milestones as events and other actions as messages', () => {
    render(<ActionTimeline actions={ACTIONS} />)

    const event = screen.getByText(/Passed\/agreed to in House/)
    expect(event.closest('.thread__event')).toBeTruthy()
    const message = screen.getByText('Received in the Senate.')
    expect(message.closest('.thread__msg')?.textContent).toContain('Senate')
    expect(screen.getByText('Jul 17, 2025')).toBeTruthy()
  })

  test('says so when there is no history yet', () => {
    render(<ActionTimeline actions={[]} />)
    expect(screen.getByText('No action history has been recorded for this bill yet.')).toBeTruthy()
  })
})
