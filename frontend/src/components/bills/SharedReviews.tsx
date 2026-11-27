import { useState } from 'react'
import type { FormEvent } from 'react'
import type { BillDetail } from '../../api/bills'
import { ApiError } from '../../api/client'
import { listSharedReviews, REPORT_REASONS, reportReview, setReviewHidden, STANCE_LABELS } from '../../api/reviews'
import type { PublicReview, ReportReason } from '../../api/reviews'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { districtHeading, stateName } from '../../lib/districts'
import { timeAgo } from '../../lib/format'
import { useProfile } from '../../profile/ProfileContext'
import type { DistrictSelection } from '../../profile/types'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

type Scope = Pick<DistrictSelection, 'state' | 'district'> | null

interface SharedReviewsProps {
  bill: BillDetail
  revision?: number
  // Called after the author hides or shows their review, so the stance panel and counts reload
  onVisibilityChange?: () => void
}

// List the stories readers shared about a bill, by default from the reader's own district.
export function SharedReviews({ bill, revision = 0, onVisibilityChange }: SharedReviewsProps) {
  const district = useProfile().profile?.district ?? null
  const [showAll, setShowAll] = useState(false)
  const scope = showAll ? null : district
  const key = `${scope ? `${scope.state}-${scope.district}` : 'all'}-${revision}`

  return (
    <section className="panel panel--stack" aria-labelledby="shared-reviews">
      <h2 id="shared-reviews">Shared reviews</h2>
      {district ? (
        <label className="field bill-stances__scope">
          <span className="field__label">Reviews from</span>
          <select className="field__control" value={showAll ? 'all' : 'district'}
            onChange={(event) => setShowAll(event.target.value === 'all')}>
            <option value="district">{districtHeading(district.state, district.district)}</option>
            <option value="all">Everyone</option>
          </select>
        </label>
      ) : null}
      <ReviewList key={key} bill={bill} scope={scope} onVisibilityChange={onVisibilityChange} />
    </section>
  )
}

function ReviewList({ bill, scope, onVisibilityChange }: { bill: BillDetail; scope: Scope; onVisibilityChange?: () => void }) {
  const { congress, type, number } = bill
  const { user } = useSession()
  const first = useApi(
    async () => listSharedReviews(congress, type, number, {
      state: scope?.state, district: scope?.district, token: user ? await getAccountToken(user) : undefined,
    }),
    [congress, type, number, scope?.state, scope?.district, user],
  )
  const [more, setMore] = useState<PublicReview[]>([])
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')

  if (first.loading) return <LoadingState message="Loading shared reviews…" />
  if (first.error) return <ErrorState title="Shared reviews could not be loaded" message={first.error.message} onRetry={first.refetch} />
  const total = first.data?.total ?? 0
  const reviews = [...(first.data?.data ?? []), ...more]
  const ownHidden = first.data?.mine_hidden ?? null
  if (total === 0 && !ownHidden) {
    const area = scope && (scope.district === null ? stateName(scope.state) : districtHeading(scope.state, scope.district))
    return <p className="muted">{area ? `No shared reviews from ${area} yet.` : 'No one has shared a review of this bill yet.'}</p>
  }

  async function loadMore() {
    setLoadingMore(true)
    setMoreError('')
    try {
      const next = await listSharedReviews(congress, type, number, {
        page: page + 1, state: scope?.state, district: scope?.district,
        token: user ? await getAccountToken(user) : undefined,
      })
      setMore((current) => [...current, ...next.data])
      setPage(page + 1)
    } catch {
      setMoreError('More reviews could not be loaded. Try again.')
    } finally {
      setLoadingMore(false)
    }
  }

  const shown = first.data!.data.length + more.length
  return (
    <>
      <p className="muted">
        {total.toLocaleString('en-US')} shared {total === 1 ? 'review' : 'reviews'}
        {reviews.some((review) => review.is_sample) ? <span className="bill-stances__sample">Sample data</span> : null}
      </p>
      <ul className="shared-reviews">
        {ownHidden ? (
          <SharedReview key={`hidden-${ownHidden.review_id}`} review={ownHidden} bill={bill} hidden
            onVisibilityChange={onVisibilityChange} />
        ) : null}
        {reviews.map((review) => (
          <SharedReview key={review.review_id} review={review} bill={bill} onVisibilityChange={onVisibilityChange} />
        ))}
      </ul>
      {moreError ? <p role="alert" className="form-error">{moreError}</p> : null}
      {shown < total ? (
        <button type="button" className="btn btn--secondary" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading…' : 'Show more reviews'}
        </button>
      ) : null}
    </>
  )
}

interface SharedReviewProps {
  review: PublicReview
  bill: BillDetail
  // The author's own review that everyone else no longer sees
  hidden?: boolean
  onVisibilityChange?: () => void
}

function SharedReview({ review, bill, hidden = false, onVisibilityChange }: SharedReviewProps) {
  const { user } = useSession()
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const [changing, setChanging] = useState(false)
  const [error, setError] = useState('')
  const place = review.state ? districtHeading(review.state, review.district) : 'District not saved'

  async function setHidden(next: boolean) {
    if (!user) return
    setChanging(true)
    setError('')
    try {
      await setReviewHidden(bill.congress, bill.type, bill.number, next, await getAccountToken(user))
      onVisibilityChange?.()
    } catch {
      setError(next ? 'Your review could not be hidden. Try again.' : 'Your review could not be shown again. Try again.')
      setChanging(false)
    }
  }

  let action = null
  if (review.mine) {
    action = (
      <button type="button" className="link-more" disabled={changing} onClick={() => void setHidden(!hidden)}>
        {hidden
          ? changing ? 'Showing…' : 'Show in shared reviews'
          : changing ? 'Hiding…' : 'Hide from shared reviews'}
      </button>
    )
  } else if (reported) {
    action = <span role="status" className="muted review__meta">Report sent.</span>
  } else if (!reporting) {
    action = <button type="button" className="link-more" onClick={() => setReporting(true)}>Report</button>
  }

  return (
    <li className={`shared-review${hidden ? ' shared-review--hidden' : ''}`}>
      <div className="shared-review__head">
        <span className={`review__stance review__stance--${review.stance}`}>{STANCE_LABELS[review.stance]}</span>
        <span className="muted review__meta">Constituent in {place} · {timeAgo(review.updated_at) || 'recently'}</span>
        {review.mine ? (
          <span className="bill-stances__sample">{hidden ? 'Only you can see this' : 'Your review'}</span>
        ) : null}
        {action ? <span className="shared-review__action">{action}</span> : null}
      </div>
      {review.story ? <p className="review__story">{review.story}</p> : null}
      {review.action_taken ? <p className="review__action"><strong>Action taken</strong>{' '}{review.action_taken}</p> : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {reporting && !reported ? (
        <ReportForm reviewId={review.review_id} onCancel={() => setReporting(false)} onSent={() => setReported(true)} />
      ) : null}
    </li>
  )
}

function ReportForm({ reviewId, onCancel, onSent }: { reviewId: number; onCancel: () => void; onSent: () => void }) {
  const { user } = useSession()
  const [reason, setReason] = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function send(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await reportReview(reviewId, reason, details.trim() || null, user ? await getAccountToken(user) : undefined)
      onSent()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The report could not be sent. Try again.')
      setSending(false)
    }
  }

  const reasonId = `report-reason-${reviewId}`
  const detailsId = `report-details-${reviewId}`
  return (
    <form className="shared-review__report" onSubmit={send}>
      <label className="field" htmlFor={reasonId}>
        <span className="field__label">Reason</span>
        <select id={reasonId} className="field__control" value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}>
          {Object.entries(REPORT_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field" htmlFor={detailsId}>
        <span className="field__label">Details (optional)</span>
        <textarea id={detailsId} className="field__control" rows={2} maxLength={1000} value={details}
          onChange={(event) => setDetails(event.target.value)} />
      </label>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <div className="shared-review__report-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={sending}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
