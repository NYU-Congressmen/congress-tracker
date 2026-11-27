import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BillDetail } from '../../api/bills'
import { getTracking, markUpdatesRead, setTracking } from '../../api/tracking'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'

// Track or stop tracking a bill, and mark its updates read once the reader opens it.
export function TrackButton({ bill }: { bill: BillDetail }) {
  const { user, loading } = useSession()
  const [tracking, setTrackingState] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const { congress, type, number, bill_id: billId } = bill

  useEffect(() => {
    if (!user) return
    let active = true
    void (async () => {
      try {
        const token = await getAccountToken(user)
        const status = await getTracking(congress, type, number, token)
        if (!active) return
        setTrackingState(status.tracking)
        if (status.tracking) await markUpdatesRead(token, billId)
      } catch {
        if (active) setTrackingState(false)
      }
    })()
    return () => { active = false }
  }, [user, congress, type, number, billId])

  if (loading) return null
  if (!user) return <Link to="/sign-in" className="btn">Sign in to track</Link>

  async function toggle() {
    if (!user || tracking === null) return
    setBusy(true)
    setFailed(false)
    try {
      const status = await setTracking(congress, type, number, !tracking, await getAccountToken(user))
      setTrackingState(status.tracking)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={`btn${tracking ? ' btn--ink' : ''}`} aria-pressed={tracking ?? false}
      disabled={busy || tracking === null} onClick={() => void toggle()}
      title={tracking ? 'Stop tracking this bill' : 'Get an update when this bill has a new official action'}>
      {failed ? 'Try again' : tracking ? 'Tracking' : 'Track this bill'}
    </button>
  )
}
