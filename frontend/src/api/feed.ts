import { request } from './client'
import type { BillPage } from './bills'

// Keep these types in step with the models in backend/app/models.py

// Describe an issue a person can choose for their feed.
export interface Issue {
  issue_id: number
  name: string
}

export interface FeedParams {
  issueIds: number[]
  page?: number
  limit?: number
  customToken?: string
}

// The backend reads a list from repeated `issue_id=` parameters, so one
// parameter per chosen issue.
function feedQuery(params: FeedParams): string {
  const search = new URLSearchParams()
  for (const issueId of params.issueIds) search.append('issue_id', String(issueId))
  if (params.page) search.set('page', String(params.page))
  if (params.limit) search.set('limit', String(params.limit))
  if (params.customToken) search.set('include_custom', 'true')
  return `/api/feed?${search.toString()}`
}

// Return the issues a person can follow, in alphabetical order.
export function listIssues(): Promise<Issue[]> {
  return request<Issue[]>('/api/issues')
}

// Return bills whose title or summary mentions a chosen issue, newest action first.
export function getFeed(params: FeedParams): Promise<BillPage> {
  return request<BillPage>(feedQuery(params), params.customToken
    ? { headers: { Authorization: `Bearer ${params.customToken}` } }
    : undefined)
}

// Return the verified account's saved custom topics.
export function listCustomTopics(token: string): Promise<string[]> {
  return request('/api/account/custom-topics', { headers: { Authorization: `Bearer ${token}` } })
}

// Replace the account's custom topics and return the saved names.
export function saveCustomTopics(token: string, names: string[]): Promise<string[]> {
  return request('/api/account/custom-topics', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(names),
  })
}
