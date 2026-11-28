import type { User } from '@firebase/auth'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BillType } from '../../api/bills'
import { getReview, saveReviewSharingChoice, saveStance, setReviewHidden, STANCE_LABELS, STANCES } from '../../api/reviews'
import type { ModerationStatus, Review, ReviewSharingField, Stance } from '../../api/reviews'
import type { OwnReviewInSignal } from '../../api/signal'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { timeAgo } from '../../lib/format'
import { LockIcon } from '../icons'

// Tell the author why a review with text is not yet on the public list.
const MODERATION_NOTICES: Record<ModerationStatus, string | null> = {
  pending: 'Moderation pending',
  flagged: 'Held for review',
  held: 'Hidden after review',
  cleared: null,
}

interface ReviewPanelProps {
  congress: number
  type: BillType
  number: number
  signalStatus?: OwnReviewInSignal
  onStanceSaved?: () => void
}

// Say in plain terms what other readers and offices can see of this review.
function whatOthersSee(review: Review): string[] {
  const listed = review.share_publicly && !review.hidden && review.moderation_status === 'cleared'
  return [
    review.hidden
      ? 'Your review is hidden, so it is left out of Shared reviews and the stance totals.'
      : 'Your stance appears only inside the stance totals, never with your name.',
    review.story
      ? listed
        ? 'Your story appears in Shared reviews without your name, labeled with your district.'
        : 'No one else sees your story.'
      : 'You have not written a story.',
    review.consent_to_share
      ? 'You opted in to the Constituent Signal. Public member pages show aggregate totals.'
      : 'Your representatives\' offices do not count you in their Constituent Signal.',
  ]
}

export function ReviewPanel(props: ReviewPanelProps) {
  const { user, loading } = useSession()
  if (user) return <AccountReview key={user.uid} user={user} {...props} />
  return (
    <section className="panel panel--stack" aria-label="Your contribution">
      <h2>Your contribution</h2>
      {loading ? <p className="muted">Checking your account…</p> : (
        <p className="muted">
          <Link to="/sign-in">Sign in</Link> to record your stance on this bill.
        </p>
      )}
    </section>
  )
}

function AccountReview({ congress, type, number, signalStatus, user, onStanceSaved }: ReviewPanelProps & { user: User }) {
  const { data, loading, error } = useApi(
    async () => getReview(congress, type, number, await getAccountToken(user)),
    [congress, type, number, user],
  )
  const [saved, setSaved] = useState<Review | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [saveError, setSaveError] = useState('')
  const review = saved ?? data
  const discussionPath = `/social?bill=${congress}-${type}-${number}#bill-review`

  async function run(action: () => Promise<Review>, done: string, failed: string) {
    setSaving(true)
    setSaveError('')
    setStatus('')
    try {
      setSaved(await action())
      setStatus(done)
      onStanceSaved?.()
    } catch (cause) {
      setSaveError(cause instanceof Error && cause.message ? cause.message : failed)
    } finally {
      setSaving(false)
    }
  }

  async function recordStance(stance: Stance) {
    if (saving || stance === review?.stance) return
    await run(
      async () => saveStance(congress, type, number, stance, await getAccountToken(user)),
      `${STANCE_LABELS[stance]} saved.`, 'Your stance could not be saved.',
    )
  }

  async function setChoice(field: ReviewSharingField, value: boolean) {
    if (!review || saving) return
    await run(
      async () => saveReviewSharingChoice(congress, type, number, field, value, await getAccountToken(user)),
      'Your choice is saved.', 'Your choice could not be saved.',
    )
  }

  async function showAgain() {
    await run(
      async () => setReviewHidden(congress, type, number, false, await getAccountToken(user)),
      'Your review is back in Shared reviews and the stance totals.', 'Your review could not be shown again.',
    )
  }

  return (
    <section className="panel panel--stack private-box" aria-labelledby="your-contribution">
      <div className="panel__heading-row">
        <h2 id="your-contribution">Your contribution</h2>
        <span className="private-box__badge"><LockIcon size={14} /> Only you can see this box</span>
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
          <p role="status" className="muted">{saving ? 'Saving…' : status}</p>
          {review ? (
            <>
              <div className="review">
                {review.story ? <p className="review__story">{review.story}</p> : null}
                {review.action_taken ? <p className="review__action"><strong>Action taken</strong>{' '}{review.action_taken}</p> : null}
                {MODERATION_NOTICES[review.moderation_status] ? (
                  <p className="muted review__meta">{MODERATION_NOTICES[review.moderation_status]}</p>
                ) : null}
                <p className="muted review__meta">
                  Saved {timeAgo(review.updated_at) || 'recently'} ·{' '}
                  <Link to={discussionPath} className="link-more">{review.story ? 'Edit your story' : 'Write a story'}</Link>
                </p>
              </div>
              {review.hidden ? (
                <p className="muted review__meta">
                  Hidden from shared reviews and stance counts.{' '}
                  <button type="button" className="link-more" disabled={saving} onClick={() => void showAgain()}>
                    Show it again
                  </button>
                </p>
              ) : null}
              <fieldset className="private-box__choices" disabled={saving}>
                <legend>Who sees it</legend>
                <label className="review-consent">
                  <input type="checkbox" checked={review.share_publicly ?? false}
                    onChange={(event) => void setChoice('share_publicly', event.target.checked)} />
                  <span>List my story in Shared reviews</span>
                </label>
                <label className="review-consent">
                  <input type="checkbox" checked={review.consent_to_share}
                    onChange={(event) => void setChoice('consent_to_share', event.target.checked)} />
                  <span>Count me in my representatives' Constituent Signal</span>
                </label>
              </fieldset>
              {signalStatus ? (
                <p className="muted review__meta">
                  {signalStatus === 'included' ? 'You are counted in this week\'s Constituent Signal.' : 'You are not counted in this week\'s Constituent Signal.'}
                </p>
              ) : null}
              <div className="private-box__others">
                <span className="private-box__others-title">What others see</span>
                <ul>{whatOthersSee(review).map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            </>
          ) : (
            <p className="muted">Choose a stance, then decide who sees it.</p>
          )}
        </>
      )}
    </section>
  )
}
