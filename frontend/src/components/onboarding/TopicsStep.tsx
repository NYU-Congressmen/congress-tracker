import { useState } from 'react'
import { listIssues } from '../../api/feed'
import { useApi } from '../../hooks/useApi'
import { ErrorState } from '../ui/ErrorState'
import { TextField } from '../ui/Fields'
import { LoadingState } from '../ui/LoadingState'
import { StepActions } from './StepActions'

interface TopicsStepProps {
  initial: number[]
  nextLabel?: string
  onBack?: () => void
  onDone: (topics: number[]) => void
}

const STARTERS = ['Health care', 'Housing', 'Jobs and wages', 'Climate and energy', 'Education']

// Match catalog names so the suggestions work across databases with different issue IDs.
const RELATED: Record<string, string[]> = {
  'Health care': ['Retirement and Social Security', 'Veterans', 'Civil rights'],
  Housing: ['Taxes', 'Public safety', 'Veterans'],
  'Jobs and wages': ['Technology and AI', 'Taxes', 'Immigration'],
  'Climate and energy': ['Technology and AI', 'Taxes', 'Public safety'],
  Education: ['Technology and AI', 'Civil rights', 'Public safety'],
  Taxes: ['Retirement and Social Security', 'Housing', 'Jobs and wages'],
  Veterans: ['Health care', 'Housing', 'Retirement and Social Security'],
  'Technology and AI': ['Public safety', 'Civil rights', 'Jobs and wages'],
  'Civil rights': ['Immigration', 'Public safety', 'Education'],
  'Public safety': ['Civil rights', 'Veterans', 'Technology and AI'],
  Immigration: ['Civil rights', 'Jobs and wages', 'Public safety'],
  'Retirement and Social Security': ['Health care', 'Taxes', 'Veterans'],
}

// Choose which topics appear on the dashboard.
export function TopicsStep({ initial, nextLabel = 'Continue to social profiles', onBack, onDone }: TopicsStepProps) {
  const [chosen, setChosen] = useState<number[]>(initial)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const { data: issues, loading, error, refetch } = useApi(() => listIssues(), [])

  function toggle(issueId: number) {
    setChosen((current) => (current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId]))
    if (!chosen.includes(issueId)) {
      setSearch('')
    }
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

  const byName = new Map(issues.map((issue) => [issue.name, issue]))
  const byId = new Map(issues.map((issue) => [issue.issue_id, issue]))
  const starters = STARTERS.filter((name) => byName.has(name))
  const starterNames = starters.length ? starters : issues.slice(0, STARTERS.length).map((issue) => issue.name)
  const cloudNames = new Set(starterNames)
  // Keep each pick's suggestions in the cloud so later picks can expand it.
  for (const id of chosen) {
    const issue = byId.get(id)
    if (issue) {
      cloudNames.add(issue.name)
      for (const name of RELATED[issue.name] ?? []) cloudNames.add(name)
    }
  }
  const cloud = [...cloudNames].flatMap((name) => byName.get(name) ?? [])
  const query = search.trim().toLowerCase()
  const visible = query ? issues.filter((issue) => issue.name.toLowerCase().includes(query)) : showAll ? issues : cloud

  return (
    <div className="onboard-step onboard-step--spaced">
      <div className="onboard-step__intro">
        <h2>Topics to follow</h2>
        <p className="muted">Choose topics for your dashboard. Related topics appear as you go.</p>
      </div>

      <TextField id="topic-search" label="Search topics" type="search" value={search} onChange={setSearch} />
      <div className="topics__chips" role="group" aria-label="Topics to follow">
        {!visible.length && <p className="muted">No matching topics.</p>}
        {visible.map((issue) => (
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
      {!query && cloud.length < issues.length && (
        <button className="btn btn--ghost btn--sm topics__browse" type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer topics' : 'Browse all topics'}
        </button>
      )}

      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" onClick={() => onDone(chosen)}>
          {nextLabel}
        </button>
      </StepActions>
    </div>
  )
}
