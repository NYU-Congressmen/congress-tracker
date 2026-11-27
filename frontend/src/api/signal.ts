import type { BillType } from './bills'
import { request } from './client'

export interface SignalOffice {
  bioguide_id: string
  name: string
  party: string | null
  chamber: string | null
  state: string | null
  district: number | null
  support: number
  oppose: number
  unsure: number
  calls: number
}

export type OwnReviewInSignal = 'none' | 'not_consented' | 'not_included' | 'included'

// Describe the Constituent Signal each of the reader's offices would get for a bill this week.
export interface SignalPage {
  window_start: string
  window_end: string
  includes_sample: boolean
  your_review: OwnReviewInSignal
  offices: SignalOffice[]
}

export function getSignal(congress: number, type: BillType, number: number, token: string): Promise<SignalPage> {
  return request<SignalPage>(`/api/bills/${congress}/${type}/${number}/signal`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}
