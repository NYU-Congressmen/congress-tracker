import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listMembers } from '../api/members'
import { PageBand } from '../components/layout/PageBand'
import { MemberCard } from '../components/members/MemberCard'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { SelectField } from '../components/ui/Fields'
import { useApi } from '../hooks/useApi'
import { CHAMBER_OPTIONS, PARTY_OPTIONS, STATE_OPTIONS, CONGRESS_NUMBER } from '../lib/constants'
import { districtHeading, representativesForDistrict, stateName } from '../lib/districts'
import { useProfile } from '../profile/ProfileContext'

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

// The person's representatives from the directory: the House member for the
// district and the state's senators, each with their role labeled.
function MyRepresentativesView() {
  const { profile } = useProfile()
  const district = profile?.district ?? null

  const { data, loading, error, refetch } = useApi(
    () => (district ? listMembers({ state: district.state }) : Promise.resolve(null)),
    [district?.state],
  )

  if (!district) {
    return (
      <div className="mymembers__empty">
        <EmptyState
          title="No district on your profile yet"
          hint="Pick your congressional district and this view lists the House member and senators who represent you."
        />
        <Link to="/onboarding" className="btn btn--primary">
          Set up my district
        </Link>
      </div>
    )
  }

  if (loading) {
    return <LoadingState message="Finding your representatives…" />
  }

  if (error) {
    return <ErrorState title="Your representatives could not be loaded" message={error.message} onRetry={refetch} />
  }

  const { house, senate } = representativesForDistrict(data?.data ?? [], district.state, district.district)
  const mine = [
    ...house.map((member) => ({ member, role: 'Your House member' })),
    ...senate.map((member) => ({ member, role: 'Your senator' })),
  ]

  if (mine.length === 0) {
    return (
      <EmptyState
        title="No representatives on record"
        hint={`The directory has no current representatives for ${stateName(district.state)} yet.`}
      />
    )
  }

  return (
    <div className="mymembers">
      <p className="mymembers__heading" aria-live="polite">
        {districtHeading(district.state, district.district)} · {mine.length}{' '}
        {mine.length === 1 ? 'representative' : 'representatives'}
      </p>
      <ul className="member-grid mymembers__grid">
        {mine.map(({ member, role }) => (
          <MemberCard key={member.bioguide_id} member={member} role={role} />
        ))}
      </ul>
      <p className="muted mymembers__hint">
        Your senators represent the whole of {stateName(district.state)}
        {district.district !== null ? `; your House member represents District ${district.district}.` : ', who represent you directly.'}
      </p>
    </div>
  )
}

// The directory with state, party and chamber filters, kept in the URL so a
// filtered view can be shared, plus a "My representatives" view driven by the
// signed-in person's district.
export default function MembersPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'all'
  const state = params.get('state') ?? ''
  const party = params.get('party') ?? ''
  const chamber = params.get('chamber') ?? ''

  const { data, loading, error, refetch } = useApi(
    () =>
      view === 'all'
        ? listMembers({
            state: state || undefined,
            party: party || undefined,
            chamber: chamber || undefined,
          })
        : Promise.resolve(null),
    [view, state, party, chamber],
  )

  function setView(next: string) {
    const search = new URLSearchParams(params)
    if (next === 'all') {
      search.delete('view')
    } else {
      search.set('view', next)
    }
    setParams(search)
  }

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
    <div className="members-page">
      <PageBand labelledBy="members-title">
        <h1 id="members-title" className="page-title">
          Members of Congress
        </h1>
        <p className="page-lede">
          Find your representatives in the {CONGRESS_NUMBER}th Congress, browse their sponsored bills, and get in touch with their offices.
        </p>
        <div className="page-views" role="group" aria-label="Choose a view">
          <button
            type="button"
            className={`btn btn--sm ${view === 'all' ? 'btn--primary' : 'btn--ghost'}`}
            aria-pressed={view === 'all'}
            onClick={() => setView('all')}
          >
            All members
          </button>
          <button
            type="button"
            className={`btn btn--sm ${view === 'mine' ? 'btn--primary' : 'btn--ghost'}`}
            aria-pressed={view === 'mine'}
            onClick={() => setView('mine')}
          >
            My representatives
          </button>
        </div>
        {view === 'mine' ? null : (
          <MembersFiltersForm
            key={filtersKey}
            initial={{ state, party, chamber }}
            hasFilters={hasFilters}
            onApply={applyFilters}
          />
        )}
      </PageBand>

      <div className="container page-body">
        {view === 'mine' ? (
          <MyRepresentativesView />
        ) : error ? (
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
    </div>
  )
}
