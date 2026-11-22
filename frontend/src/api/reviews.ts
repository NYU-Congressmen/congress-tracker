import { request } from './client'
import type { BillType } from './bills'

// Keep these types in step with the models in backend/app/models.py

export type Stance = 'support' | 'oppose' | 'unsure'
export type ModerationStatus = 'pending' | 'flagged' | 'held' | 'cleared'

export const STANCES: readonly Stance[] = ['support', 'oppose', 'unsure']

export const STANCE_LABELS: Record<Stance, string> = {
  support: 'Support',
  oppose: 'Oppose',
  unsure: 'Unsure',
}

// Describe what a user writes when reviewing a bill.
export interface ReviewIn {
  stance: Stance
  story?: string | null
  action_taken?: string | null
  // Include the review in the Constituent Signal brief for the author's office.
  consent_to_share: boolean
  // List the review on the bill page with the author's state and district. Saving replaces
  // the whole review, so send back the value loaded from GET or it returns to false.
  share_publicly?: boolean
}

// Describe a saved review of one bill by the signed-in user.
export interface Review extends ReviewIn {
  bill_id: string
  moderation_status: ModerationStatus
  created_at: string
  updated_at: string
}

// Return the signed-in user's review of a bill.
export function getReview(congress: number, type: BillType, number: number, token: string): Promise<Review> {
  return request<Review>(`/api/bills/${congress}/${type}/${number}/review`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// Create or replace the signed-in user's review of a bill and return it.
export function saveReview(
  congress: number,
  type: BillType,
  number: number,
  review: ReviewIn,
  token: string,
): Promise<Review> {
  return request<Review>(`/api/bills/${congress}/${type}/${number}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(review),
  })
}
