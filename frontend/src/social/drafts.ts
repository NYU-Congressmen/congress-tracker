// Keep a local discussion history for each profile in the browser.

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

function storageKey(username: string | null): string {
  return username === null ? KEY : `${KEY}:${username}`
}

export function listDiscussions(username: string | null): DiscussionRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(username))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DiscussionRecord[]) : []
  } catch {
    return []
  }
}

// One record per bill: a second review of the same bill replaces the first,
// matching the backend's one-review-per-bill rule.
export function recordDiscussion(username: string | null, record: DiscussionRecord): void {
  const rest = listDiscussions(username).filter(
    (existing) =>
      existing.bill.congress !== record.bill.congress ||
      existing.bill.type !== record.bill.type ||
      existing.bill.number !== record.bill.number,
  )
  localStorage.setItem(storageKey(username), JSON.stringify([record, ...rest].slice(0, MAX_RECORDS)))
}
