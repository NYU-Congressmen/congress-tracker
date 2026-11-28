import { useEffect, useState } from 'react'
import { BILL_STATUSES, type BillStatus } from '../api/bills'
import { request } from '../api/client'

export type StageCounts = Record<BillStatus, number>

let pending: Promise<StageCounts> | null = null

// How many bills sit at each stage, from one grouped count on the server. The result is shared by
// every page in the visit, and a failed load is forgotten so the next caller tries again.
export function loadStageCounts(): Promise<StageCounts> {
  pending ??= request<StageCounts>('/api/bills/stage-counts').catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

export function totalOf(counts: StageCounts): number {
  return BILL_STATUSES.reduce((sum, status) => sum + counts[status], 0)
}

// Stage counts for the dot header. The load starts after the page's own
// requests, since the dots are decoration, and stays null if it fails.
export function useStageCounts(): StageCounts | null {
  const [counts, setCounts] = useState<StageCounts | null>(null)
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      loadStageCounts().then(
        (value) => {
          if (active) setCounts(value)
        },
        () => undefined,
      )
    }, 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [])
  return counts
}
