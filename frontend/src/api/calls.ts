import type { BillType } from './bills'
import { request } from './client'

export interface CallEntry {
  action_id: number
  bioguide_id: string
  member_name: string
  created_at: string
  note: string | null
}

export function listCalls(congress: number, type: BillType, number: number, token: string): Promise<CallEntry[]> {
  return request<CallEntry[]>(`/api/bills/${congress}/${type}/${number}/calls`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function saveCall(
  congress: number, type: BillType, number: number, requestId: string, bioguideId: string, token: string, note?: string,
): Promise<CallEntry> {
  return request<CallEntry>(`/api/bills/${congress}/${type}/${number}/calls/${requestId}`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bioguide_id: bioguideId, note }),
  })
}
