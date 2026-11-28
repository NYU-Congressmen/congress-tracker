import type { BillSummary, BillType } from './bills'
import { request } from './client'
import type { Stance } from './reviews'

export interface VoteComparison {
  bill_id: string
  congress: number
  type: BillType
  number: number
  title: string
  stance: Stance
  question: string | null
  vote_date: string | null
  roll_number: number
  position: string | null
  // Null when the member did not vote Yea, Aye, Nay or No
  agrees: boolean | null
}

export interface VotingRecord {
  compared: number
  agreed: number
  missed: number
  votes: VoteComparison[]
}

// One of the reader's offices and its record toward the reader.
export interface Representative {
  bioguide_id: string
  name: string
  party: string | null
  chamber: string | null
  state: string | null
  district: number | null
  image_url: string | null
  office_phone: string | null
  website_url: string | null
  signal_bills: number
  signal_constituents: number
  your_calls: number
  // Null for senators, whose roll calls Pull does not sync
  voting_record: VotingRecord | null
}

// A bill the reader took a stance on or tracks.
export interface Ask extends BillSummary {
  stance: Stance | null
  tracking: boolean
  unread: number
  calls: number
}

export function listRepresentatives(token: string): Promise<Representative[]> {
  return request<Representative[]>('/api/account/representatives', { headers: { Authorization: `Bearer ${token}` } })
}

export function listAsks(token: string): Promise<Ask[]> {
  return request<Ask[]>('/api/account/asks', { headers: { Authorization: `Bearer ${token}` } })
}
