import { useState } from 'react'
import { listIssues } from '../../api/feed'
import { useApi } from '../../hooks/useApi'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

interface TopicsStepProps {
  initial: number[]
  onDone: (topics: number[]) => void
}

// Step three: pick the topics the person wants Pull to follow. Issues come
// from the backend, so a new tracking category is a database row, not a code
// change. The dashboard then lists the newest bills on the chosen topics.
export function TopicsStep({ initial, onDone }: TopicsStepProps) {
  const [chosen, setChosen] = useState<number[]>(initial)
  const { data: issues, loading, error, refetch } = useApi(() => listIssues(), [])

  function toggle(issueId: number) {
    setChosen((current) => (current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId]))
  }

  if (loading) {
    return (
      <div className="onboard-step">
        <LoadingState message="Loading the topics you can follow…" />
      </div>
    )
  }

  if (error || !issues) {
    return (
      <div className="onboard-step">
        <ErrorState title="Topics could not be loaded" message={error?.message} onRetry={refetch} />
      </div>
    )
  }

  return (
    <div className="onboard-step">
      <p className="muted">
        Pick the topics you want Pull to follow. Your dashboard lists the newest bills working on them, and the
        Social page groups discussion around them. This step is optional.
      </p>

      <div className="topics__chips" role="group" aria-label="Topics to follow">
        {issues.map((issue) => (
          <button
            key={issue.issue_id}
            type="button"
            className={`chip${chosen.includes(issue.issue_id) ? ' chip--active' : ''}`}
            aria-pressed={chosen.includes(issue.issue_id)}
            onClick={() => toggle(issue.issue_id)}
          >
            {issue.name}
          </button>
        ))}
      </div>

      {chosen.length === 0 ? <p className="muted onboard-social__empty">No topics chosen yet.</p> : null}

      <div className="onboard-step__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={() => onDone(chosen)}>
          Continue to social profiles
        </button>
      </div>
    </div>
  )
}
