import type { BillSummary, BillType } from './bills'
import { request } from './client'

export interface TrackStatus {
  tracking: boolean
}

// Describe a bill the reader tracks and how many of its updates they have not opened.
export interface TrackedBill extends BillSummary {
  followed_at: string
  unread: number
}

export interface BillUpdate {
  notification_id: number
  bill_id: string
  congress: number
  type: BillType
  number: number
  title: string
  message: string
  is_read: boolean
  created_at: string
}

export interface UpdatePage {
  unread: number
  data: BillUpdate[]
}

// The header and dashboard listen for this so their unread counts follow changes made elsewhere.
export const UPDATES_CHANGED = 'pull:updates-changed'

function announce() {
  window.dispatchEvent(new Event(UPDATES_CHANGED))
}

function trackPath(congress: number, type: BillType, number: number) {
  return `/api/bills/${congress}/${type}/${number}/track`
}

export function getTracking(congress: number, type: BillType, number: number, token: string): Promise<TrackStatus> {
  return request<TrackStatus>(trackPath(congress, type, number), { headers: { Authorization: `Bearer ${token}` } })
}

// Start or stop tracking a bill and return the new state.
export async function setTracking(
  congress: number, type: BillType, number: number, tracking: boolean, token: string,
): Promise<TrackStatus> {
  const status = await request<TrackStatus>(trackPath(congress, type, number), {
    method: tracking ? 'PUT' : 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  announce()
  return status
}

export function listTracked(token: string): Promise<TrackedBill[]> {
  return request<TrackedBill[]>('/api/account/tracked', { headers: { Authorization: `Bearer ${token}` } })
}

export function listUpdates(token: string): Promise<UpdatePage> {
  return request<UpdatePage>('/api/account/notifications', { headers: { Authorization: `Bearer ${token}` } })
}

// Mark one bill's updates read, or all of them when no bill is given.
export async function markUpdatesRead(token: string, billId?: string): Promise<UpdatePage> {
  const page = await request<UpdatePage>('/api/account/notifications/read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bill_id: billId ?? null }),
  })
  announce()
  return page
}
