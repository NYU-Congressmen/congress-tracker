import { useState } from 'react'
import { listIssues } from '../../api/feed'
import { useApi } from '../../hooks/useApi'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'
import { StepActions } from './StepActions'

interface TopicsStepProps {
  initial: number[]
  nextLabel?: string
  onBack?: () => void
  onDone: (topics: number[]) => void
}

// Choose which topics appear on the dashboard.
export function TopicsStep({ initial, nextLabel = 'Continue to social profiles', onBack, onDone }: TopicsStepProps) {
  const [chosen, setChosen] = useState<number[]>(initial)
  const { data: issues, loading, error, refetch } = useApi(() => listIssues(), [])

  function toggle(issueId: number) {
    setChosen((current) => (current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId]))
  }

  if (loading) {
    return (
      <div className="onboard-step">
        <LoadingState message="Loading the topics you can follow…" />
        <StepActions onBack={onBack} />
      </div>
    )
  }

  if (error || !issues) {
    return (
      <div className="onboard-step">
        <ErrorState title="Topics could not be loaded" message={error?.message} onRetry={refetch} />
        <StepActions onBack={onBack} />
      </div>
    )
  }

  return (
    <div className="onboard-step onboard-step--spaced">
      <div className="onboard-step__intro">
        <h2>Topics to follow</h2>
        <p className="muted">Choose topics to see related bills on your dashboard.</p>
      </div>

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

      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" onClick={() => onDone(chosen)}>
          {nextLabel}
        </button>
      </StepActions>
    </div>
  )
}
