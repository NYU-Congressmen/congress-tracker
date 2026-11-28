import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BILL_STATUSES, searchBills, type BillStatus, type BillSummary } from '../api/bills'
import { listMembers } from '../api/members'
import { PageBand } from '../components/layout/PageBand'
import { ChamberComposition } from '../components/dashboard/ChamberComposition'
import { DistrictBills } from '../components/dashboard/DistrictBills'
import { TopicFeed } from '../components/dashboard/TopicFeed'
import { RepresentativeTiles } from '../components/dashboard/RepresentativeTiles'
import { YourAsks } from '../components/dashboard/YourAsks'
import { AlertIcon, ChevronRightIcon, SearchIcon } from '../components/icons'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { CONGRESS_NUMBER, STATUS_META } from '../lib/constants'
import { billNumber, billTypeShort, formatShortDate } from '../lib/format'
import { loadStageCounts, totalOf } from '../lib/stageCounts'
import { countByChamber } from '../lib/stats'
import { useProfile } from '../profile/ProfileContext'
import { useSession } from '../auth/SessionContext'

// Keyword shortcuts under the search box. They run an ordinary title search.
const TOPICS: { label: string; q: string }[] = [
  { label: 'Crypto', q: 'crypto' },
  { label: 'Student loans', q: 'student loan' },
  { label: 'Elections', q: 'election' },
  { label: 'Health care', q: 'health' },
]

// What happened to a bill most recently, in a few words.
function eventLabel(bill: BillSummary): string {
  switch (bill.status) {
    case 'became_law':
      return 'Became law'
    case 'to_president':
      return 'Sent to the President'
    case 'passed_both_chambers':
      return 'Passed both chambers'
    case 'passed_one_chamber':
      return bill.passed_senate && !bill.passed_house ? 'Passed the Senate' : 'Passed the House'
    case 'committee':
      return 'In committee'
    default:
      return 'Introduced'
  }
}

function stageNumber(status: BillStatus): number {
  return BILL_STATUSES.indexOf(status) + 1
}

// One update in the home feed, shaped like a phone notification.
function UpdateCard({ bill }: { bill: BillSummary }) {
  const law = bill.status === 'became_law'
  return (
    <li>
      <Link to={`/bills/${bill.congress}/${bill.type}/${bill.number}`} className="note glass">
        <span className={`note__icon note__icon--s${stageNumber(bill.status)}`} aria-hidden="true">
          {law ? 'LAW' : billTypeShort(bill.type)}
        </span>
        <span className="note__title">{bill.title}</span>
        {bill.latest_action_date ? (
          <time className="note__time" dateTime={bill.latest_action_date}>
            {formatShortDate(bill.latest_action_date)}
          </time>
        ) : null}
        <span className="note__meta">
          {billNumber(bill.type, bill.number)} · {eventLabel(bill)}
        </span>
      </Link>
    </li>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data: latest, loading: latestLoading, error: latestError, refetch } = useApi(
    () => searchBills({ limit: 4 }),
    [],
  )
  // One aggregate request per stage gives the tallies; each returns just a total.
  const { data: counts } = useApi(loadStageCounts, [])
  const { data: memberList } = useApi(() => listMembers(), [])

  function onSearch(event: FormEvent) {
    event.preventDefault()
    const keyword = query.trim()
    navigate(keyword ? `/bills?q=${encodeURIComponent(keyword)}` : '/bills')
  }

  const total = counts ? totalOf(counts) : null
  const chambers = memberList ? countByChamber(memberList.data) : null

  // The signed-in person's district and topics drive the personalized
  // panels, which sit between "At a glance" and "Latest activity".
  const { profile, loading: profileLoading } = useProfile()
  const { user } = useSession()
  const district = profile?.district ?? null
  const topics = profile?.topics ?? []

  const personal = Boolean(user && district)

  const latestFeed = (
    <section className={personal ? 'card panel--stack' : 'home__feed'} aria-labelledby="updates-title" aria-busy={latestLoading}>
      <h2 id="updates-title" className={personal ? undefined : 'home__feed-title'}>
        Latest updates
      </h2>
      {latestError ? (
        <div className="state state--error" role="alert">
          <span className="state__icon">
            <AlertIcon />
          </span>
          <div className="state__body">
            <h3>Live data unavailable</h3>
            <p>Bill updates could not be loaded.</p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={refetch}>
            Try again
          </button>
        </div>
      ) : latestLoading ? (
        <LoadingState message="Loading the latest bills…" />
      ) : latest && latest.data.length > 0 ? (
        <>
          <ul className="notes">
            {latest.data.map((bill) => (
              <UpdateCard key={bill.bill_id} bill={bill} />
            ))}
          </ul>
          <Link to="/bills" className="more home__more">
            See all bills
          </Link>
        </>
      ) : (
        <EmptyState title="No bills available" />
      )}
    </section>
  )

  const stages = (
    <section className="card" aria-labelledby="stages-title">
      <div className="card__head">
        <h2 id="stages-title">Stage</h2>
        <Link to="/bills" className="more">
          See all bills
        </Link>
      </div>
      {counts ? (
        <ul className="stages">
          {STATUS_META.map((meta) => (
            <li key={meta.value}>
              <Link to={`/bills?status=${meta.value}`} className="stages__row" title={meta.description}>
                <span className={`stages__icon note__icon--s${stageNumber(meta.value)}`} aria-hidden="true">
                  {stageNumber(meta.value)}
                </span>
                <span className="stages__label">{meta.label}</span>
                <span className="stages__count">{counts[meta.value].toLocaleString()}</span>
                <ChevronRightIcon className="stages__chev" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <LoadingState message="Tallying bills by stage…" />
      )}
    </section>
  )

  const seats = (
    <section className="card" aria-labelledby="chambers-title">
      {chambers ? (
        <ChamberComposition counts={chambers} />
      ) : (
        <>
          <div className="composition-toolbar"><h2 id="chambers-title">Seats</h2></div>
          <LoadingState message="Counting current members…" />
        </>
      )}
    </section>
  )

  return (
    <div className="home">
      <PageBand labelledBy="home-title">
        <div className={`home__hero${personal ? ' home__hero--personal' : ''}`}>
          <div className="home__intro">
            <h1 id="home-title" className="home__title">
              Your representatives work for you
            </h1>
            <p className="home__lede">
              {personal
                ? 'See how they vote on the bills you care about, tell them where you stand and track what happens next.'
                : <>Find your members of Congress, see how they vote on the bills you care about and tell them where you stand. {total !== null ? `${total.toLocaleString()} bills` : 'Every bill'} in the {CONGRESS_NUMBER}th Congress, one dot each. The ones that <mark>stand out</mark> became law.</>}
            </p>
            <form className="home__search glass" role="search" onSubmit={onSearch}>
              <SearchIcon size={20} />
              <label className="sr-only" htmlFor="home-search">
                Search bills by keyword
              </label>
              <input
                id="home-search"
                type="search"
                placeholder="Bill title or number"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="btn btn--hl">
                Search
              </button>
            </form>
            {personal ? null : <ul className="home__topics" aria-label="Suggested topics">
              {TOPICS.map((topic) => (
                <li key={topic.q}>
                  <Link to={`/bills?q=${encodeURIComponent(topic.q)}`} className="chip">
                    {topic.label}
                  </Link>
                </li>
              ))}
            </ul>}
          </div>
          {personal ? null : latestFeed}
        </div>
      </PageBand>

      <div className="container page-body home__body">
        {personal ? <RepresentativeTiles /> : (
          <section className="card home__setup" aria-labelledby="setup-title">
            <div>
              <h2 id="setup-title">Find your representatives</h2>
              <p>
                Save your district to see your House member and senators, how they vote on the bills you care about and
                what your neighbors are telling them.
              </p>
            </div>
            <Link to={user && profile ? '/profile?section=district' : '/onboarding'} className="btn btn--ink">
              Find your representatives
            </Link>
          </section>
        )}

        {user ? (
          <section className="card panel--stack" id="tracked" aria-label="Your asks">
            <YourAsks />
          </section>
        ) : null}

        {user && !profileLoading ? (
          <section className="home-section" aria-labelledby="issues-title">
            <h2 id="issues-title" className="home-section__title">Your issues</h2>
            <div className="home__mine">
              <section className="card panel--stack" aria-label="Topics you follow">
                <TopicFeed topicIds={topics} />
              </section>
              {district ? (
                <section className="card panel--stack" aria-label="Your district">
                  <DistrictBills state={district.state} district={district.district} />
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

        {latestError && !personal ? null : (
          <section className="home-section" aria-labelledby="glance-title">
            <h2 id="glance-title" className="home-section__title">Congress at a glance</h2>
            <div className={personal ? 'home__glance' : 'home__grid'}>
              {personal ? latestFeed : null}
              {stages}
              {seats}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
