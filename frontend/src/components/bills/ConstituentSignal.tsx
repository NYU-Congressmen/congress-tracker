import { Link } from 'react-router-dom'
import type { BillDetail } from '../../api/bills'
import { getSignal } from '../../api/signal'
import type { OwnReviewInSignal, SignalOffice } from '../../api/signal'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { districtHeading, stateName } from '../../lib/districts'
import { formatDate } from '../../lib/format'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

const OWN_REVIEW: Record<OwnReviewInSignal, string> = {
  included: 'Your review is counted in these drafts.',
  not_consented: 'Your review is not counted, because it is not included in the Constituent Signal brief.',
  not_included: 'Your review is not counted, because it was saved more than a week ago or is waiting for review.',
  none: 'Save a stance on this bill to be counted.',
}

function officeTitle(office: SignalOffice): string {
  const role = office.chamber === 'Senate' ? 'Senator' : 'Representative'
  return `${role} ${office.name}`
}

function officeArea(office: SignalOffice): string {
  if (!office.state) return ''
  return office.chamber === 'Senate' ? stateName(office.state) : districtHeading(office.state, office.district)
}

// Preview the weekly Constituent Signal draft for each of the signed-in reader's offices.
export function ConstituentSignal({ bill, revision = 0 }: { bill: BillDetail; revision?: number }) {
  const { user } = useSession()
  const { congress, type, number } = bill
  const signal = useApi(
    async () => user ? getSignal(congress, type, number, await getAccountToken(user)) : null,
    [congress, type, number, user, revision],
  )
  if (!user) return null

  const page = signal.data
  const discussionPath = `/social?bill=${congress}-${type}-${number}#bill-review`
  return (
    <section className="panel panel--stack" aria-labelledby="constituent-signal">
      <div className="panel__heading-row">
        <h2 id="constituent-signal">Constituent Signal</h2>
        <span className="bill-stances__sample">Draft</span>
      </div>
      <p className="muted">
        Pull drafts a weekly brief for each of your offices from constituents who chose to include their review. It
        reports counts and logged calls, never names, phone numbers or stories. This preview covers the past seven days.
      </p>
      {signal.loading ? (
        <LoadingState message="Drafting this week's signal…" />
      ) : signal.error ? (
        <ErrorState title="The Constituent Signal could not be loaded" message={signal.error.message} onRetry={signal.refetch} />
      ) : !page || page.offices.length === 0 ? (
        <p className="muted">
          <Link to="/profile?section=district" className="link-more">Save your district</Link> to see the offices that
          receive your signal.
        </p>
      ) : (
        <>
          <p className="panel__count">
            {formatDate(page.window_start.slice(0, 10))} to {formatDate(page.window_end.slice(0, 10))}
            {page.includes_sample ? <span className="bill-stances__sample">Sample data</span> : null}
          </p>
          <ul className="signal-offices" aria-label="Drafts for your offices">
            {page.offices.map((office) => (
              <li key={office.bioguide_id} className="signal-office">
                <span className="signal-office__name">{officeTitle(office)}</span>
                <span className="muted review__meta">{officeArea(office)}</span>
                <dl className="signal-office__counts">
                  <div><dt>Support</dt><dd>{office.support}</dd></div>
                  <div><dt>Oppose</dt><dd>{office.oppose}</dd></div>
                  <div><dt>Unsure</dt><dd>{office.unsure}</dd></div>
                  <div><dt>Calls</dt><dd>{office.calls}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          <p className="muted">
            {OWN_REVIEW[page.your_review]}
            {page.your_review === 'not_consented' ? (
              <>{' '}<Link to={discussionPath} className="link-more">Include it on Social</Link></>
            ) : null}
          </p>
        </>
      )}
    </section>
  )
}
