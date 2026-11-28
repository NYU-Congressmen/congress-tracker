// Keep a local discussion history for each account in the browser. A signed-out visitor's drafts
// stay in this tab only, so the next person on a shared browser never sees them.

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

function storageFor(username: string | null): Storage {
  if (username === null) {
    // Earlier builds kept signed-out drafts in one browser-wide list, which no one should inherit.
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Storage can be unavailable in private modes, and there is then nothing to clear
    }
    return sessionStorage
  }
  return localStorage
}

export function listDiscussions(username: string | null): DiscussionRecord[] {
  try {
    const raw = storageFor(username).getItem(storageKey(username))
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
  storageFor(username).setItem(storageKey(username), JSON.stringify([record, ...rest].slice(0, MAX_RECORDS)))
}
