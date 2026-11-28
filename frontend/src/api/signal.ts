import type { BillType } from './bills'
import { request } from './client'

// Counts are null when fewer than the minimum number of constituents are counted.
export interface SignalCounts {
  support: number | null
  oppose: number | null
  unsure: number | null
  calls: number | null
  withheld: boolean
}

export interface SignalOffice extends SignalCounts {
  bioguide_id: string
  name: string
  party: string | null
  chamber: string | null
  state: string | null
  district: number | null
}

export interface SignalBill extends SignalCounts {
  bill_id: string
  congress: number
  type: BillType
  number: number
  title: string
}

// Describe the Constituent Signal one office received over the past week.
export interface MemberSignal {
  window_start: string
  window_end: string
  includes_sample: boolean
  min_counted: number
  bills: SignalBill[]
  withheld_bills: number
}

export type OwnReviewInSignal = 'none' | 'not_consented' | 'not_included' | 'included'

// Describe the Constituent Signal each of the reader's offices would get for a bill this week.
export interface SignalPage {
  window_start: string
  window_end: string
  includes_sample: boolean
  min_counted: number
  your_review: OwnReviewInSignal
  offices: SignalOffice[]
}

export function getSignal(congress: number, type: BillType, number: number, token: string): Promise<SignalPage> {
  return request<SignalPage>(`/api/bills/${congress}/${type}/${number}/signal`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function getMemberSignal(bioguideId: string, token?: string): Promise<MemberSignal> {
  return request<MemberSignal>(`/api/members/${bioguideId}/signal`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}
