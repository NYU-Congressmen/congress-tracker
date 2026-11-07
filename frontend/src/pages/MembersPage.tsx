import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listMembers } from '../api/members'
import { MemberCard } from '../components/members/MemberCard'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { SelectField } from '../components/ui/Fields'
import { useApi } from '../hooks/useApi'
import { CHAMBER_OPTIONS, PARTY_OPTIONS, STATE_OPTIONS, CONGRESS_NUMBER } from '../lib/constants'

interface FilterValues {
  state: string
  party: string
  chamber: string
}

interface MembersFiltersFormProps {
  initial: FilterValues
  hasFilters: boolean
  onApply: (values: FilterValues) => void
}

// Draft state is seeded from the URL, and the page remounts the form with a key
// whenever the URL changes, so the fields always match the live filters.
function MembersFiltersForm({ initial, hasFilters, onApply }: MembersFiltersFormProps) {
  const [formState, setFormState] = useState(initial.state)
  const [formParty, setFormParty] = useState(initial.party)
  const [formChamber, setFormChamber] = useState(initial.chamber)

  return (
    <form
      className="filters"
      role="search"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onApply({ state: formState, party: formParty, chamber: formChamber })
      }}
    >
      <SelectField
        id="member-state"
        label="State"
        value={formState}
        onChange={setFormState}
        options={[{ value: '', label: 'Any state' }, ...STATE_OPTIONS]}
      />
      <SelectField
        id="member-party"
        label="Party"
        value={formParty}
        onChange={setFormParty}
        options={[{ value: '', label: 'Any party' }, ...PARTY_OPTIONS]}
      />
      <SelectField
        id="member-chamber"
        label="Chamber"
        value={formChamber}
        onChange={setFormChamber}
        options={[{ value: '', label: 'Any chamber' }, ...CHAMBER_OPTIONS]}
      />
      <div className="filters__actions">
        <button type="submit" className="btn btn--primary">
          Apply filters
        </button>
        {hasFilters ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onApply({ state: '', party: '', chamber: '' })}
          >
            Clear
          </button>
        ) : null}
      </div>
    </form>
  )
}

// The directory with state, party and chamber filters, kept in the URL so a
// filtered view can be shared.
export default function MembersPage() {
  const [params, setParams] = useSearchParams()
  const state = params.get('state') ?? ''
  const party = params.get('party') ?? ''
  const chamber = params.get('chamber') ?? ''

  const { data, loading, error, refetch } = useApi(
    () =>
      listMembers({
        state: state || undefined,
        party: party || undefined,
        chamber: chamber || undefined,
      }),
    [state, party, chamber],
  )

  function applyFilters(values: FilterValues) {
    const search = new URLSearchParams()
    if (values.state) search.set('state', values.state)
    if (values.party) search.set('party', values.party)
    if (values.chamber) search.set('chamber', values.chamber)
    setParams(search)
  }

  const hasFilters = Boolean(state || party || chamber)
  const filtersKey = [state, party, chamber].join('|')

  return (
    <div className="container page">
      <header className="page__header">
        <h1>Members of Congress</h1>
        <p className="page__lede">
          Every current member of the {CONGRESS_NUMBER}th Congress, with the bills they have sponsored.
        </p>
      </header>

      <MembersFiltersForm
        key={filtersKey}
        initial={{ state, party, chamber }}
        hasFilters={hasFilters}
        onApply={applyFilters}
      />

      {error ? (
        <ErrorState title="Members could not be loaded" message={error.message} onRetry={refetch} />
      ) : loading ? (
        <LoadingState message="Loading the directory…" />
      ) : data && data.data.length === 0 ? (
        <EmptyState
          title="No members match those filters"
          hint="Try a different state, party or chamber combination."
        />
      ) : data ? (
        <>
          <p className="results-count" aria-live="polite">
            {data.total.toLocaleString()} {data.total === 1 ? 'member' : 'members'}
          </p>
          <ul className="member-grid">
            {data.data.map((member) => (
              <MemberCard key={member.bioguide_id} member={member} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
