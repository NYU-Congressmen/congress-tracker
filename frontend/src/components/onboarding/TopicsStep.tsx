import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { listCustomTopics, listIssues } from '../../api/feed'
import type { Issue } from '../../api/feed'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { ErrorState } from '../ui/ErrorState'
import { TextField } from '../ui/Fields'
import { LoadingState } from '../ui/LoadingState'
import { StepActions } from './StepActions'

interface TopicsStepProps {
  initial: number[]
  initialCustom?: string[]
  loadSavedCustom?: boolean
  nextLabel?: string
  onBack?: () => void
  onDone: (topics: number[], custom: string[]) => void
}

// Start with concerns relevant to students and people entering the workforce.
const STARTERS = ['Jobs and wages', 'Housing', 'Technology and AI', 'Education', 'Health care']

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
export function TopicsStep({
  initial, initialCustom, loadSavedCustom, nextLabel = 'Continue to social profiles', onBack, onDone,
}: TopicsStepProps) {
  const [chosen, setChosen] = useState<number[]>(initial)
  const [custom, setCustom] = useState(initialCustom)
  const [search, setSearch] = useState('')
  const [hint, setHint] = useState('')
  const [confirmTopic, setConfirmTopic] = useState('')
  const [showAll, setShowAll] = useState(false)
  const { user } = useSession()
  const { data: issues, loading, error, refetch } = useApi(() => listIssues(), [])
  const saved = useApi(
    async () => loadSavedCustom && user
      ? { uid: user.uid, topics: await listCustomTopics(await getAccountToken(user)) }
      : null,
    [loadSavedCustom, user],
  )
  const selectedCustom = custom ?? (user && saved.data?.uid === user.uid ? saved.data.topics : [])

  function changeSearch(value: string) {
    setSearch(value)
    setConfirmTopic('')
    setHint('')
  }

  function confirmSearch(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.repeat || event.nativeEvent.isComposing) return
    event.preventDefault()
    const phrase = search.trim().replace(/\s+/g, ' ')
    if (!phrase) return
    const key = phrase.toLowerCase()
    const preset = issues?.find((issue) => issue.name.toLowerCase() === key)
    if (preset) {
      if (!chosen.includes(preset.issue_id)) toggle(preset.issue_id)
      changeSearch('')
      return
    }
    if (selectedCustom.some((topic) => topic.toLowerCase() === key)) {
      setHint('You already selected this topic.')
      return
    }
    if (phrase.length > 80 || selectedCustom.length >= 8) {
      setHint(phrase.length > 80 ? 'Use 80 characters or fewer.' : 'You can follow up to eight custom topics.')
      return
    }
    if (confirmTopic === key) {
      setCustom([...selectedCustom, phrase])
      changeSearch('')
      return
    }
    setConfirmTopic(key)
    setHint(`Press Enter again to add “${phrase}”.`)
  }

  function toggle(issueId: number) {
    setChosen((current) => (current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId]))
    if (!chosen.includes(issueId)) {
      changeSearch('')
    }
  }

  if (loading || (loadSavedCustom && saved.loading)) {
    return (
      <div className="onboard-step">
        <LoadingState message="Loading the topics you can follow…" />
        <StepActions onBack={onBack} />
      </div>
    )
  }

  if (error || !issues || (loadSavedCustom && saved.error)) {
    return (
      <div className="onboard-step">
        <ErrorState title="Topics could not be loaded" message={error?.message ?? saved.error?.message}
          onRetry={saved.error ? saved.refetch : refetch} />
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
  const visibleIds = new Set(visible.map((issue) => issue.issue_id))
  const hiddenChoices = chosen.flatMap((id) => visibleIds.has(id) ? [] : byId.get(id) ?? [])
  const scope = query ? 'Search results' : showAll ? 'All topics' : 'Suggested topics'

  function chip(issue: Issue) {
    const selected = chosen.includes(issue.issue_id)
    return (
      <button
        key={issue.issue_id}
        type="button"
        className={`chip${selected ? ' chip--active' : ''}`}
        aria-pressed={selected}
        onClick={() => toggle(issue.issue_id)}
      >
        {issue.name}
      </button>
    )
  }

  return (
    <div className="onboard-step onboard-step--spaced">
      <div className="onboard-step__intro">
        <h2>Topics to follow</h2>
        <p className="muted">Choose topics for your dashboard. Related topics appear as you go.</p>
      </div>

      <TextField id="topic-search" label="Search topics" type="search" value={search} onChange={changeSearch}
        onKeyDown={confirmSearch} describedBy={hint ? 'topic-search-hint' : undefined} />
      {hint ? <p id="topic-search-hint" className="muted" role="status">{hint}</p> : null}
      <p className="muted" role="status">
        {chosen.length + selectedCustom.length} {chosen.length + selectedCustom.length === 1 ? 'topic' : 'topics'} selected
      </p>
      {selectedCustom.length > 0 ? (
        <div className="topics__chips" role="group" aria-label="Selected custom topics">
          {selectedCustom.map((topic) => (
            <button type="button" key={topic} className="chip chip--active" aria-pressed="true"
              onClick={() => setCustom(selectedCustom.filter((name) => name !== topic))}>
              {topic}
            </button>
          ))}
        </div>
      ) : null}
      {hiddenChoices.length > 0 ? (
        <div className="topics__chips" role="group" aria-label="Selected topics outside the results">
          {hiddenChoices.map(chip)}
        </div>
      ) : null}
      <h3>{scope}</h3>
      <div className="topics__chips" role="group" aria-label={scope}>
        {!visible.length && <p className="muted">No matching topics.</p>}
        {visible.map(chip)}
      </div>
      {!query && cloud.length < issues.length && (
        <button className="btn btn--ghost btn--sm topics__browse" type="button" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer topics' : 'Browse all topics'}
        </button>
      )}

      <StepActions onBack={onBack}>
        <button type="button" className="btn btn--primary" onClick={() => onDone(chosen, selectedCustom)}>
          {nextLabel}
        </button>
      </StepActions>
    </div>
  )
}
