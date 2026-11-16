// The person's discussion records on this device. The backend keeps the
// official copy once sign-in is live; this local list keeps the thread visible
// in the meantime and remembers which drafts are still unsaved.

import type { BillType } from '../api/bills'
import type { Stance } from '../api/reviews'

export interface DiscussionRecord {
  bill: { congress: number; type: BillType; number: number; title: string }
  stance: Stance
  story: string | null
  action_taken: string | null
  consent: boolean
  // True when the backend accepted the review; false while it is a local draft.
  saved: boolean
  at: string
}

const KEY = 'pull:discussions'
const MAX_RECORDS = 50

export function listDiscussions(): DiscussionRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DiscussionRecord[]) : []
  } catch {
    return []
  }
}

// One record per bill: a second review of the same bill replaces the first,
// matching the backend's one-review-per-bill rule.
export function recordDiscussion(record: DiscussionRecord): void {
  const rest = listDiscussions().filter(
    (existing) =>
      existing.bill.congress !== record.bill.congress ||
      existing.bill.type !== record.bill.type ||
      existing.bill.number !== record.bill.number,
  )
  localStorage.setItem(KEY, JSON.stringify([record, ...rest].slice(0, MAX_RECORDS)))
}

export function clearDiscussions(): void {
  localStorage.removeItem(KEY)
}
