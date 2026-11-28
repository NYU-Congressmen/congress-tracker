import { Link } from 'react-router-dom'
import { getMemberSignal } from '../../api/signal'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { billNumber, formatDate } from '../../lib/format'
import { SignalTally } from '../bills/SignalTally'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

// Show the public record of what this office heard from its constituents through Pull this week.
export function MemberSignal({ bioguideId }: { bioguideId: string }) {
  const { user, loading } = useSession()
  const signal = useApi(
    async () => loading ? null : getMemberSignal(bioguideId, user ? await getAccountToken(user) : undefined),
    [bioguideId, user, loading],
  )
  const page = signal.data
  return (
    <section className="card panel--stack" id="signal" aria-labelledby="signal-title">
      <div className="panel__heading-row">
        <h2 id="signal-title">Constituent Signal</h2>
        {page?.includes_sample ? <span className="bill-stances__sample">Sample data</span> : null}
      </div>
      <p className="muted">
        What constituents told this office through Pull over the past seven days. Each bill counts
        constituents who included their review in the weekly brief and the calls they logged to this office. Counts
        appear once at least {page?.min_counted ?? 5} constituents are counted, and never name anyone.
      </p>
      {signal.loading || (!page && !signal.error) ? (
        <LoadingState message="Loading this office's signal…" />
      ) : signal.error ? (
        <ErrorState title="The Constituent Signal could not be loaded" message={signal.error.message} onRetry={signal.refetch} />
      ) : page ? (
        <>
          <p className="panel__count">{formatDate(page.window_start.slice(0, 10))} to {formatDate(page.window_end.slice(0, 10))}</p>
          {page.bills.length ? (
            <ul className="signal-bills" aria-label="Bills in this office's signal">
              {page.bills.map((bill) => (
                <li key={bill.bill_id}>
                  <Link to={`/bills/${bill.congress}/${bill.type}/${bill.number}`} className="signal-bills__bill">
                    <span className="entry__num">{billNumber(bill.type, bill.number)}</span>
                    <span>{bill.title}</span>
                  </Link>
                  <SignalTally counts={bill} minimum={page.min_counted} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No bill reached {page.min_counted} counted constituents this week.</p>
          )}
          {page.withheld_bills ? (
            <p className="muted">
              {page.withheld_bills} more {page.withheld_bills === 1 ? 'bill has' : 'bills have'} fewer than{' '}
              {page.min_counted} counted constituents.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
