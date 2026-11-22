import { Link } from 'react-router-dom'
import { getFeed, listIssues } from '../../api/feed'
import type { BillSummary } from '../../api/bills'
import { useApi } from '../../hooks/useApi'
import { BillListItem } from '../bills/BillListItem'
import { EmptyState } from '../ui/EmptyState'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

const FEED_SIZE = 8

interface TopicFeedProps {
  // The issue ids the person chose in onboarding.
  topicIds: number[]
}

// The newest bills on the topics the person follows, listed in the same
// format as "Latest activity". The topics themselves are chosen in
// onboarding, so this panel only shows and links back.
export function TopicFeed({ topicIds }: TopicFeedProps) {
  const { data: issues, loading: issuesLoading } = useApi(
    () => (topicIds.length > 0 ? listIssues() : Promise.resolve(null)),
    [topicIds.join(',')],
  )

  const feed = useApi(
    () => (topicIds.length > 0 ? getFeed({ issueIds: topicIds, limit: FEED_SIZE }) : Promise.resolve(null)),
    [topicIds.join(',')],
  )

  const names = (issues ?? [])
    .filter((issue) => topicIds.includes(issue.issue_id))
    .map((issue) => issue.name)
    .join(' · ')

  return (
    <>
      <div className="panel__heading-row">
        <h2>Topics you follow</h2>
        <Link to="/onboarding" className="link-more">
          {topicIds.length > 0 ? 'Change topics' : 'Choose topics'}
        </Link>
      </div>

      {topicIds.length === 0 ? (
        <EmptyState
          title="No topics chosen yet"
          hint="Choose topics to see related bills."
        />
      ) : issuesLoading || feed.loading ? (
        <LoadingState message="Loading the bills on your topics…" />
      ) : feed.error ? (
        <ErrorState title="The topic feed could not be loaded" message={feed.error.message} onRetry={feed.refetch} />
      ) : (
        <>
          {names ? <p className="panel__count">{names}</p> : null}
          <ul className="bill-list bill-list--compact" aria-label="Bills on your topics">
            {(feed.data?.data ?? []).map((bill: BillSummary) => (
              <BillListItem key={bill.bill_id} bill={bill} />
            ))}
          </ul>
          {(feed.data?.data.length ?? 0) === 0 ? <p className="muted">No bills match those topics yet.</p> : null}
        </>
      )}
    </>
  )
}
