import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAsks } from '../../api/representatives'
import { STANCE_LABELS } from '../../api/reviews'
import { markUpdatesRead, UPDATES_CHANGED } from '../../api/tracking'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { BillListItem } from '../bills/BillListItem'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

// The list opens short, since the representatives above it matter more at a glance.
const FIRST_ASKS = 6

// List the bills the reader took a stance on or tracks, with new updates first.
export function YourAsks() {
  const [showAll, setShowAll] = useState(false)
  const { user } = useSession()
  const asks = useApi(async () => user ? listAsks(await getAccountToken(user)) : [], [user])
  const { refetch } = asks

  useEffect(() => {
    window.addEventListener(UPDATES_CHANGED, refetch)
    return () => window.removeEventListener(UPDATES_CHANGED, refetch)
  }, [refetch])

  const bills = asks.data ?? []
  const unread = bills.filter((bill) => bill.unread > 0).length

  async function markAllRead() {
    if (user) await markUpdatesRead(await getAccountToken(user))
  }

  return (
    <>
      <div className="panel__heading-row">
        <h2>Your asks</h2>
        {unread > 0 ? (
          <button type="button" className="link-more" onClick={() => void markAllRead()}>Mark all read</button>
        ) : null}
      </div>
      {asks.loading ? (
        <LoadingState message="Loading your bills…" />
      ) : asks.error ? (
        <ErrorState title="Your bills could not be loaded" message={asks.error.message} onRetry={refetch} />
      ) : bills.length === 0 ? (
        <p className="muted">
          Take a stance on a bill or track it to follow it here. <Link to="/bills" className="link-more">Browse bills</Link>
        </p>
      ) : (
        <>
          <p className="panel__count">
            The bills you took a side on or track. {unread > 0 ? `${unread} with a new update.` : 'No new updates.'}
          </p>
          <ul className="bill-list bill-list--compact" aria-label="Your asks">
            {(showAll ? bills : bills.slice(0, FIRST_ASKS)).map((bill) => (
              <BillListItem key={bill.bill_id} bill={bill} isNew={bill.unread > 0} note={[
                bill.stance ? `You: ${STANCE_LABELS[bill.stance]}` : null,
                bill.tracking ? 'Tracking' : null,
                bill.calls ? `${bill.calls} ${bill.calls === 1 ? 'call' : 'calls'} logged` : null,
              ].filter(Boolean).join(' · ')} />
            ))}
          </ul>
          {bills.length > FIRST_ASKS ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${bills.length}`}
            </button>
          ) : null}
        </>
      )}
    </>
  )
}
