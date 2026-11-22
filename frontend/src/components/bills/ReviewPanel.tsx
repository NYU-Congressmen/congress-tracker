import type { User } from '@firebase/auth'
import { Link } from 'react-router-dom'
import type { BillType } from '../../api/bills'
import { getReview, STANCE_LABELS } from '../../api/reviews'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { useApi } from '../../hooks/useApi'
import { timeAgo } from '../../lib/format'

interface ReviewPanelProps {
  congress: number
  type: BillType
  number: number
}

export function ReviewPanel(props: ReviewPanelProps) {
  const { user, loading } = useSession()
  if (user) return <AccountReview key={user.uid} user={user} {...props} />
  return (
    <section className="panel panel--stack" aria-label="Your stance">
      <h2>Your stance</h2>
      {loading ? <p className="muted">Checking your account…</p> : (
        <p className="muted">
          <Link to="/sign-in">Sign in</Link> to view your saved review for this bill.
        </p>
      )}
    </section>
  )
}

function AccountReview({ congress, type, number, user }: ReviewPanelProps & { user: User }) {
  const { data, loading, error } = useApi(
    async () => getReview(congress, type, number, await getAccountToken(user)),
    [congress, type, number, user],
  )
  const discussionPath = `/social?bill=${congress}-${type}-${number}#bill-review`

  return (
    <section className="panel panel--stack" aria-label="Your stance">
      <div className="panel__heading-row">
        <h2>Your stance</h2>
        <Link to={discussionPath} className="link-more">
          {data ? 'Edit your review' : 'Share your stance'}
        </Link>
      </div>
      {loading ? (
        <p className="muted">Loading your stance…</p>
      ) : error?.status === 404 ? (
        <p className="muted">You haven’t reviewed this bill yet.</p>
      ) : error?.status === 401 ? (
        <p className="muted"><Link to="/sign-in">Sign in again</Link> to view your review.</p>
      ) : error ? (
        <p className="muted">Your stance could not be loaded right now.</p>
      ) : data ? (
        <div className="review">
          <span className={`review__stance review__stance--${data.stance}`}>{STANCE_LABELS[data.stance]}</span>
          {data.story ? <p className="review__story">{data.story}</p> : null}
          {data.action_taken ? <p className="review__action"><strong>Action taken</strong>{' '}{data.action_taken}</p> : null}
          <p className="muted review__meta">Saved {timeAgo(data.updated_at) || 'recently'}</p>
        </div>
      ) : null}
    </section>
  )
}
