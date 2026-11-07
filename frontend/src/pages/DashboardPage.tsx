import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BILL_STATUSES, searchBills } from '../api/bills'
import { listMembers } from '../api/members'
import { BillListItem } from '../components/bills/BillListItem'
import { PartyComposition } from '../components/members/PartyComposition'
import { AlertIcon } from '../components/icons'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingState } from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { STATUS_META, CONGRESS_NUMBER } from '../lib/constants'
import { countByParty } from '../lib/stats'
import type { BillStatus } from '../api/bills'
import type { MemberList } from '../api/members'

interface Overview {
  totalBills: number
  byStatus: Record<BillStatus, number>
  members: { total: number; counts: { total: number; R: number; D: number; I: number } } | null
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const { data: latest, loading: latestLoading, error: latestError, refetch } = useApi(
    () => searchBills({ limit: 8 }),
    [],
  )

  // One aggregate request per stage plus the membership gives the dashboard
  // its tallies, and each call returns just a total, so they stay cheap.
  const { data: overview, loading: overviewLoading } = useApi(async () => {
    const [total, ...byStatus] = await Promise.all([
      searchBills({ limit: 1 }),
      ...BILL_STATUSES.map((status) => searchBills({ status, limit: 1 })),
    ])
    const memberList: MemberList | null = await listMembers().catch(() => null)
    const members = memberList?.data ?? null
    const byStage = {} as Record<BillStatus, number>
    BILL_STATUSES.forEach((status, index) => {
      byStage[status] = byStatus[index].total
    })
    const result: Overview = {
      totalBills: total.total,
      byStatus: byStage,
      members: members ? { total: members.length, counts: countByParty(members) } : null,
    }
    return result
  }, [])

  function onSearch(event: FormEvent) {
    event.preventDefault()
    const keyword = query.trim()
    navigate(keyword ? `/bills?q=${encodeURIComponent(keyword)}` : '/bills')
  }

  const liveUnreachable = latestError !== null

  return (
    <div className="dashboard">
      <section className="hero">
        <div className="container hero__inner">
          <h1 className="hero__title">Follow the work of the {CONGRESS_NUMBER}th Congress</h1>
          <p className="hero__lede">
            Search every bill, find your members of Congress, and watch legislation move from introduction to law.
          </p>
          <form className="hero__search" role="search" onSubmit={onSearch}>
            <label className="sr-only" htmlFor="hero-search">
              Search bills by keyword
            </label>
            <input
              id="hero-search"
              className="hero__search-input"
              type="search"
              placeholder="Search bills by keyword, for example “clean water”"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="btn btn--primary btn--lg">
              Search bills
            </button>
          </form>
          <ul className="hero__chips" aria-label="Filter bills by stage">
            {STATUS_META.map((meta) => (
              <li key={meta.value}>
                <Link to={`/bills?status=${meta.value}`} className="chip">
                  {meta.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {liveUnreachable ? (
        <div className="container dashboard__offline">
          <div className="state state--error" role="alert">
            <span className="state__icon">
              <AlertIcon />
            </span>
            <div className="state__body">
              <h3>Live data unavailable</h3>
              <p>
                {latestError?.message} Start the backend with <code>npm run dev</code> to see bills and members.
              </p>
            </div>
            <button type="button" className="btn btn--secondary" onClick={refetch}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="container dashboard__grid" aria-busy={latestLoading || overviewLoading}>
          <section className="panel dashboard__panel" aria-label="Latest bill activity">
            <div className="panel__heading-row">
              <h2>Latest activity</h2>
              <Link to="/bills" className="link-more">
                View all bills
              </Link>
            </div>
            {latestLoading ? (
              <LoadingState message="Loading the latest bills…" />
            ) : latest && latest.data.length > 0 ? (
              <ul className="bill-list bill-list--compact">
                {latest.data.map((bill) => (
                  <BillListItem key={bill.bill_id} bill={bill} />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No bills in the database yet"
                hint="Run the list sync with `npm run sync` to fill the database, or check the About page for API status."
              />
            )}
          </section>

          <div className="dashboard__side">
            <section className="panel" aria-label="Bills by stage">
              <h2>Bills by stage</h2>
              {overview ? (
                <>
                  <p className="panel__count">
                    {overview.totalBills.toLocaleString()} bills tracked in the {CONGRESS_NUMBER}th Congress
                  </p>
                  <ul className="stage-list">
                    {STATUS_META.map((meta) => {
                      const count = overview.byStatus[meta.value] ?? 0
                      const percent = overview.totalBills > 0 ? Math.round((count / overview.totalBills) * 100) : 0
                      return (
                        <li key={meta.value}>
                          <Link to={`/bills?status=${meta.value}`} className="stage-row">
                            <span className="stage-row__label">
                              <span className={`stage-dot stage-dot--${meta.value}`} aria-hidden="true" />
                              {meta.label}
                            </span>
                            <span className="stage-row__count">{count.toLocaleString()}</span>
                          </Link>
                          <span className="stage-bar" aria-hidden="true">
                            <span className="stage-bar__fill" style={{ width: `${percent}%` }} />
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <LoadingState message="Tallying bills by stage…" />
              )}
            </section>

            <section className="panel" aria-label="Chamber composition">
              <div className="panel__heading-row">
                <h2>Chamber composition</h2>
                <Link to="/members" className="link-more">
                  All members
                </Link>
              </div>
              {overview?.members ? (
                <PartyComposition counts={overview.members.counts} />
              ) : (
                <LoadingState message="Counting current members…" />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
