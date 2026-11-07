import { request } from './client'
import type { BillSummary, CacheInfo } from './bills'

// Keep these types in step with the models in backend/app/models.py

// Describe a current or former member of Congress.
export interface Member {
  bioguide_id: string
  name: string
  party: string | null
  state: string | null
  chamber: string | null
  district: number | null
  image_url: string | null
  is_current: boolean
}

// Describe the current members matching a set of filters.
export interface MemberList {
  total: number
  data: Member[]
}

// Describe a member with current-Congress sponsored bills and their cache freshness.
export interface MemberDetail extends Member {
  sponsored_bills: BillSummary[]
  cache: CacheInfo
}

export interface MemberFilters {
  state?: string
  party?: string
  chamber?: string
}

function memberQuery(filters: MemberFilters): string {
  const search = new URLSearchParams()
  if (filters.state) search.set('state', filters.state)
  if (filters.party) search.set('party', filters.party)
  if (filters.chamber) search.set('chamber', filters.chamber)
  const query = search.toString()
  return query ? `/api/members?${query}` : '/api/members'
}

// List current members of Congress, optionally filtered by state, party and chamber.
export function listMembers(filters: MemberFilters = {}): Promise<MemberList> {
  return request<MemberList>(memberQuery(filters))
}

// Return one member with their current-Congress sponsored bills, refreshed daily.
export function getMember(bioguideId: string): Promise<MemberDetail> {
  return request<MemberDetail>(`/api/members/${encodeURIComponent(bioguideId)}`)
}
