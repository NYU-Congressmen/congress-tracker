import { Link } from 'react-router-dom'
import { useSession } from '../../auth/SessionContext'
import { getAccountToken } from '../../auth/accountToken'
import { getFeed, listCustomTopics, listIssues } from '../../api/feed'
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

// Show bills on followed topics and link to the profile settings.
export function TopicFeed({ topicIds }: TopicFeedProps) {
  const { user } = useSession()
  const custom = useApi(async () => user
    ? { uid: user.uid, topics: await listCustomTopics(await getAccountToken(user)) }
    : null, [user])
  const customTopics = user && custom.data?.uid === user.uid ? custom.data.topics : []
  const hasTopics = topicIds.length > 0 || customTopics.length > 0
  const { data: issues, loading: issuesLoading } = useApi(
    () => (topicIds.length > 0 ? listIssues() : Promise.resolve(null)),
    [topicIds.join(',')],
  )

  // The feed reads a signed-in reader's custom topics itself, so it starts without waiting
  // for their names.
  const feed = useApi(
    async () => {
      if (!user && topicIds.length === 0) return null
      const customToken = user ? await getAccountToken(user) : undefined
      return getFeed({ issueIds: topicIds, limit: FEED_SIZE, customToken })
    },
    [topicIds.join(','), user],
  )

  const names = [...(issues ?? [])
    .filter((issue) => topicIds.includes(issue.issue_id))
    .map((issue) => issue.name), ...customTopics].join(' · ')

  return (
    <>
      <div className="panel__heading-row">
        <h2>Topics you follow</h2>
        <Link to={user ? '/profile?section=topics' : '/onboarding'} className="link-more">
          {hasTopics ? 'Change topics' : 'Choose topics'}
        </Link>
      </div>

      {user && custom.loading ? (
        <LoadingState message="Loading your topics…" />
      ) : user && custom.error ? (
        <ErrorState title="Your topics could not be loaded" message={custom.error.message} onRetry={custom.refetch} />
      ) : !hasTopics ? (
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
