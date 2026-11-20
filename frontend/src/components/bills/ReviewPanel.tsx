import { Link } from 'react-router-dom'
import { getReview } from '../../api/reviews'
import type { BillType } from '../../api/bills'
import type { Review } from '../../api/reviews'
import { ApiError } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useProfile } from '../../profile/ProfileContext'
import { STANCE_LABELS } from '../../api/reviews'
import { timeAgo } from '../../lib/format'

interface ReviewPanelProps {
  congress: number
  type: BillType
  number: number
}

// The reader's own stance on this bill. The backend keeps one review per bill
// per person; the full discussion flow lives on the Social page.
export function ReviewPanel({ congress, type, number }: ReviewPanelProps) {
  const { profile } = useProfile()
  const { data, loading, error } = useApi(
    () => getReview(congress, type, number),
    [congress, type, number],
  )

  if (!profile) {
    return (
      <section className="panel" aria-label="Your stance">
        <h2>Your stance</h2>
        <p className="muted">
          Set up your profile and tell the world where you stand on this bill —{' '}
          <Link to="/onboarding">get started</Link>.
        </p>
      </section>
    )
  }

  const notFound = error instanceof ApiError && error.status === 404
  const notSignedIn = error instanceof ApiError && error.status === 401

  return (
    <section className="panel" aria-label="Your stance">
      <div className="panel__heading-row">
        <h2>Your stance</h2>
        <Link to={`/social?bill=${congress}-${type}-${number}`} className="link-more">
          {data ? 'Edit your review' : 'Share your stance'}
        </Link>
      </div>
      {loading ? (
        <p className="muted">Loading your stance…</p>
      ) : data ? (
        <div className="review">
          <span className={`review__stance review__stance--${data.stance}`}>{STANCE_LABELS[data.stance]}</span>
          {data.story ? <p className="review__story">{data.story}</p> : null}
          {data.action_taken ? <p className="review__action">What they did: {data.action_taken}</p> : null}
          <p className="muted review__meta">
            Saved {timeAgo(data.updated_at) || 'recently'}
          </p>
        </div>
      ) : notFound ? (
        <p className="muted">
          You haven’t reviewed this bill yet.{' '}
          <Link to={`/social?bill=${congress}-${type}-${number}`}>Say where you stand</Link>.
        </p>
      ) : notSignedIn ? (
        <p className="muted">
          Sign-in through the backend is not live yet, so your stance can’t be saved to your account. You can still{' '}
          <Link to={`/social?bill=${congress}-${type}-${number}`}>draft it on the Social page</Link>.
        </p>
      ) : error ? (
        <p className="muted">Your stance could not be loaded right now.</p>
      ) : null}
    </section>
  )
}

export type { Review }
