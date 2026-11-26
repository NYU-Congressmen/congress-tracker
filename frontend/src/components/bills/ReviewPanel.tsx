import type { User } from '@firebase/auth'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BillType } from '../../api/bills'
import { getReview, saveStance, STANCE_LABELS, STANCES } from '../../api/reviews'
import type { Review, Stance } from '../../api/reviews'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { timeAgo } from '../../lib/format'

interface ReviewPanelProps {
  congress: number
  type: BillType
  number: number
  onStanceSaved?: () => void
}

export function ReviewPanel(props: ReviewPanelProps) {
  const { user, loading } = useSession()
  if (user) return <AccountReview key={user.uid} user={user} {...props} />
  return (
    <section className="panel panel--stack" aria-label="Your stance">
      <h2>Your stance</h2>
      {loading ? <p className="muted">Checking your account…</p> : (
        <p className="muted">
          <Link to="/sign-in">Sign in</Link> to record your stance on this bill.
        </p>
      )}
    </section>
  )
}

function AccountReview({ congress, type, number, user, onStanceSaved }: ReviewPanelProps & { user: User }) {
  const { data, loading, error } = useApi(
    async () => getReview(congress, type, number, await getAccountToken(user)),
    [congress, type, number, user],
  )
  const [saved, setSaved] = useState<Review | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const review = saved ?? data
  const discussionPath = `/social?bill=${congress}-${type}-${number}#bill-review`

  async function recordStance(stance: Stance) {
    if (saving || stance === review?.stance) return
    setSaving(true)
    setSaveError('')
    try {
      setSaved(await saveStance(congress, type, number, stance, await getAccountToken(user)))
      onStanceSaved?.()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Your stance could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel panel--stack" aria-label="Your stance">
      <div className="panel__heading-row">
        <h2>Your stance</h2>
        <Link to={discussionPath} className="link-more">
          {review?.story ? 'Edit your review' : 'Write a review'}
        </Link>
      </div>
      {loading ? (
        <p className="muted">Loading your stance…</p>
      ) : !review && error?.status === 401 ? (
        <p className="muted"><Link to="/sign-in">Sign in again</Link> to view your review.</p>
      ) : !review && error && error.status !== 404 ? (
        <p className="muted">Your stance could not be loaded right now.</p>
      ) : (
        <>
          <div className="stance-actions" role="group" aria-label="Choose your stance">
            {STANCES.map((stance) => (
              <button key={stance} type="button" className="btn" aria-pressed={review?.stance === stance}
                disabled={saving} onClick={() => void recordStance(stance)}>
                {STANCE_LABELS[stance]}
              </button>
            ))}
          </div>
          {saveError ? <p role="alert" className="form-error">{saveError}</p> : null}
          <p role="status" className="muted">
            {saving ? 'Saving stance…' : saved ? `${STANCE_LABELS[saved.stance]} saved.` : null}
          </p>
          {review ? (
            <div className="review">
              {review.story ? <p className="review__story">{review.story}</p> : null}
              {review.action_taken ? <p className="review__action"><strong>Action taken</strong>{' '}{review.action_taken}</p> : null}
              <p className="muted review__meta">Saved {timeAgo(review.updated_at) || 'recently'}</p>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
