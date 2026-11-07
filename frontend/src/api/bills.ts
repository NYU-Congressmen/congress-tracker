import { request } from './client'
import type { Member } from './members'

// Keep these types in step with the models in backend/app/models.py

export type BillType = 'hr' | 's' | 'hjres' | 'sjres' | 'hconres' | 'sconres' | 'hres' | 'sres'
export const BILL_TYPES: readonly BillType[] = [
  'hr',
  's',
  'hjres',
  'sjres',
  'hconres',
  'sconres',
  'hres',
  'sres',
]

export type BillStatus =
  | 'introduced'
  | 'committee'
  | 'passed_one_chamber'
  | 'passed_both_chambers'
  | 'to_president'
  | 'became_law'

export const BILL_STATUSES: readonly BillStatus[] = [
  'introduced',
  'committee',
  'passed_one_chamber',
  'passed_both_chambers',
  'to_president',
  'became_law',
]

// Describe completeness, freshness and retry timing for one cached resource.
export interface CacheInfo {
  complete: boolean
  stale: boolean
  refreshed_at: string | null
  refresh_failed: boolean
  retry_after: string | null
}

// Describe a searchable bill and the chamber milestones observed so far.
export interface BillSummary {
  bill_id: string
  congress: number
  type: BillType
  number: number
  title: string
  status: BillStatus
  passed_house: boolean
  passed_senate: boolean
  introduced_date: string | null
  latest_action_date: string | null
  latest_action_text: string | null
}

// Describe a page of matching bills and the total number of matches.
export interface BillPage {
  total: number
  page: number
  limit: number
  data: BillSummary[]
}

// Describe an action in the sequence supplied by Congress.gov.
export interface BillAction {
  action_date: string | null
  type: string | null
  text: string | null
}

// Describe a bill with its cached sponsor, action history and freshness.
export interface BillDetail extends BillSummary {
  policy_area: string | null
  sponsor_id: string | null
  sponsor: Member | null
  actions: BillAction[]
  cache: CacheInfo
}

export interface BillSearchParams {
  q?: string
  status?: BillStatus
  from?: string
  to?: string
  page?: number
  limit?: number
}

function billQuery(params: BillSearchParams): string {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.status) search.set('status', params.status)
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  if (params.page) search.set('page', String(params.page))
  if (params.limit) search.set('limit', String(params.limit))
  const query = search.toString()
  return query ? `/api/bills?${query}` : '/api/bills'
}

// Search bills by title keyword, status and introduced-date range, newest action first.
export function searchBills(params: BillSearchParams = {}): Promise<BillPage> {
  return request<BillPage>(billQuery(params))
}

// Return one bill with its sponsor and actions, refreshing them when the cache is stale.
export function getBill(congress: number, type: BillType, number: number): Promise<BillDetail> {
  return request<BillDetail>(`/api/bills/${congress}/${type}/${number}`)
}
