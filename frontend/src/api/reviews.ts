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

export interface BillResponses {
  label: string
  total: number
  counts: Record<Stance, number>
  includes_sample: boolean
}

// Count stances on a bill; a sample account's token also counts the sample responses.
export function getBillResponses(
  congress: number, type: BillType, number: number, state?: string, district?: number | null, token?: string,
): Promise<BillResponses> {
  const query = new URLSearchParams()
  if (state) {
    query.set('state', state)
    if (district != null) query.set('district', String(district))
  }
  const filters = query.size ? `?${query}` : ''
  return request<BillResponses>(`/api/bills/${congress}/${type}/${number}/responses${filters}`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
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
  // The author hid it from the shared list and the stance counts.
  hidden: boolean
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

export function saveStance(
  congress: number, type: BillType, number: number, stance: Stance, token: string,
): Promise<Review> {
  return request<Review>(`/api/bills/${congress}/${type}/${number}/review/stance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ stance }),
  })
}

// Describe a review its author shared on the bill page, with the district they saved.
export interface PublicReview {
  review_id: number
  bill_id: string
  stance: Stance
  story: string | null
  action_taken: string | null
  state: string | null
  district: number | null
  created_at: string
  updated_at: string
  posted_to: string[]
  mine: boolean
  is_sample: boolean
}

export interface ReviewPage {
  total: number
  page: number
  limit: number
  data: PublicReview[]
  // The signed-in reader's own review when they hid it, which only they see
  mine_hidden?: PublicReview | null
}

// List a bill's shared reviews, optionally from one state or district, newest first.
export function listSharedReviews(
  congress: number, type: BillType, number: number,
  options: { page?: number; state?: string; district?: number | null; token?: string } = {},
): Promise<ReviewPage> {
  const query = new URLSearchParams({ page: String(options.page ?? 1), limit: '10' })
  if (options.state) {
    query.set('state', options.state)
    if (options.district != null) query.set('district', String(options.district))
  }
  return request<ReviewPage>(`/api/bills/${congress}/${type}/${number}/reviews?${query}`,
    options.token ? { headers: { Authorization: `Bearer ${options.token}` } } : undefined)
}

export type ReportReason = 'spam' | 'harassment' | 'misinformation' | 'personal_info' | 'other'

export const REPORT_REASONS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  misinformation: 'Misinformation',
  personal_info: 'Personal information',
  other: 'Something else',
}

// Report a shared review, as a signed-in reader when a token is given or as a visitor.
export async function reportReview(
  reviewId: number, reason: ReportReason, details: string | null, token?: string,
): Promise<void> {
  await request<null>(`/api/reviews/${reviewId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ reason, details }),
  })
}

// Hide the signed-in author's review from the shared list and counts, or show it again.
export function setReviewHidden(
  congress: number, type: BillType, number: number, hidden: boolean, token: string,
): Promise<Review> {
  return request<Review>(`/api/bills/${congress}/${type}/${number}/review/visibility`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hidden }),
  })
}
