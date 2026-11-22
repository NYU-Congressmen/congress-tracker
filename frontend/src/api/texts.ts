import { request } from './client'
import type { BillType } from './bills'

// Keep these types in step with the models in backend/app/models.py

// Describe one published version of a bill's text and where to read it.
export interface TextVersion {
  version_type: string
  version_date: string | null
  text_url: string | null
  pdf_url: string | null
  downloaded: boolean
}

// Describe the line-by-line changes and any saved summary for two versions.
export interface BillDiff {
  from_version: string
  to_version: string
  changes: string[]
  summary?: string | null
}

// Return a bill's text versions, oldest first, fetching the list if none is stored yet.
export function listTextVersions(congress: number, type: BillType, number: number): Promise<TextVersion[]> {
  return request<TextVersion[]>(`/api/bills/${congress}/${type}/${number}/texts`)
}

// Return the diff and request a summary for the reader's comparison.
export function diffTextVersions(
  congress: number,
  type: BillType,
  number: number,
  from: string,
  to: string,
): Promise<BillDiff> {
  const search = new URLSearchParams({ from, to })
  return request<BillDiff>(`/api/bills/${congress}/${type}/${number}/diff?${search.toString()}`, {
    method: 'POST',
  })
}
