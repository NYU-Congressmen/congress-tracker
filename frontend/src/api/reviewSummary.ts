import type { BillType } from './bills'
import { request } from './client'

export interface ReviewHighlights {
  support: string
  oppose: string
  unsure: string
  themes: string[]
}

// What a bill's shared stories say, for readers who will not read them all.
export interface ReviewSummary {
  story_count: number
  min_stories: number
  includes_sample: boolean
  words: { word: string; count: number }[]
  highlights: ReviewHighlights | null
  highlights_at: string | null
}

function summaryPath(congress: number, type: BillType, number: number) {
  return `/api/bills/${congress}/${type}/${number}/reviews/summary`
}

export function getReviewSummary(congress: number, type: BillType, number: number, token?: string): Promise<ReviewSummary> {
  return request<ReviewSummary>(summaryPath(congress, type, number), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

// Ask for fresh highlights, which only a signed-in reader within the daily limit can cause.
export function writeReviewSummary(congress: number, type: BillType, number: number, token: string): Promise<ReviewSummary> {
  return request<ReviewSummary>(summaryPath(congress, type, number), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
