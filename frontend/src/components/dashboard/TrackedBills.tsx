import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listTracked, markUpdatesRead, UPDATES_CHANGED } from '../../api/tracking'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { BillListItem } from '../bills/BillListItem'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

// List the bills the signed-in reader tracks, with the ones that changed since they last looked first.
export function TrackedBills() {
  const { user } = useSession()
  const tracked = useApi(async () => user ? listTracked(await getAccountToken(user)) : [], [user])
  const { refetch } = tracked

  useEffect(() => {
    window.addEventListener(UPDATES_CHANGED, refetch)
    return () => window.removeEventListener(UPDATES_CHANGED, refetch)
  }, [refetch])

  const bills = tracked.data ?? []
  const unread = bills.filter((bill) => bill.unread > 0).length

  async function markAllRead() {
    if (user) await markUpdatesRead(await getAccountToken(user))
  }

  return (
    <>
      <div className="panel__heading-row">
        <h2>Bills you track</h2>
        {unread > 0 ? (
          <button type="button" className="link-more" onClick={() => void markAllRead()}>Mark all read</button>
        ) : null}
      </div>
      {tracked.loading ? (
        <LoadingState message="Loading the bills you track…" />
      ) : tracked.error ? (
        <ErrorState title="Your tracked bills could not be loaded" message={tracked.error.message} onRetry={refetch} />
      ) : bills.length === 0 ? (
        <p className="muted">
          Open a bill and choose Track this bill to see its new official actions here. <Link to="/bills" className="link-more">Browse bills</Link>
        </p>
      ) : (
        <>
          <p className="panel__count">
            {unread > 0 ? `${unread} with a new update` : 'No new updates'} · {bills.length} tracked
          </p>
          <ul className="bill-list bill-list--compact" aria-label="Bills you track">
            {bills.map((bill) => <BillListItem key={bill.bill_id} bill={bill} isNew={bill.unread > 0} />)}
          </ul>
        </>
      )}
    </>
  )
}
