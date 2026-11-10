import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { BILL_TYPES, getBill } from '../api/bills'
import type { BillType } from '../api/bills'
import { ActionTimeline } from '../components/bills/ActionTimeline'
import { BillExplanation } from '../components/bills/BillExplanation'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ChamberFlags } from '../components/ui/ChamberFlags'
import { CacheNotice } from '../components/ui/CacheNotice'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { billNumber, billUrl, formatDate, initialsOf, districtLabel } from '../lib/format'
import { ExternalLinkIcon } from '../components/icons'

export default function BillDetailPage() {
  const { congress: congressParam, type: typeParam, number: numberParam } = useParams()
  const congress = Number(congressParam)
  const number = Number(numberParam)
  const valid =
    Number.isInteger(congress) &&
    Number.isInteger(number) &&
    typeParam !== undefined &&
    (BILL_TYPES as readonly string[]).includes(typeParam)

  const { data: bill, loading, error, refetch } = useApi(
    () =>
      valid
        ? getBill(congress, typeParam as BillType, number)
        : Promise.reject(new ApiError('This bill does not exist in the tracker.', 404)),
    [congressParam, typeParam, numberParam],
  )

  if (error) {
    const notFound = error.status === 404
    return (
      <div className="container page">
        <ErrorState
          title={notFound ? 'Bill not found' : 'This bill could not be loaded'}
          message={error.message}
          onRetry={notFound ? undefined : refetch}
        />
        <p>
          <Link to="/bills" className="btn btn--secondary">
            Back to all bills
          </Link>
        </p>
      </div>
    )
  }

  if (loading || !bill) {
    return (
      <div className="container page">
        <LoadingState message="Loading the bill…" />
      </div>
    )
  }

  const sponsor = bill.sponsor

  return (
    <div className="container page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/bills">Bills</Link>
        <span className="breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span aria-current="page">{billNumber(bill.type, bill.number)}</span>
      </nav>

      <article className="bill-detail">
        <header className="bill-detail__header">
          <h1 className="bill-detail__title">
            <span className="bill-detail__id">{billNumber(bill.type, bill.number)}</span>
            {bill.title}
          </h1>
          <div className="bill-detail__badges">
            <StatusBadge status={bill.status} />
            <ChamberFlags passedHouse={bill.passed_house} passedSenate={bill.passed_senate} />
            <a
              className="ext-link"
              href={billUrl(bill.congress, bill.type, bill.number)}
              target="_blank"
              rel="noreferrer"
            >
              View on congress.gov <ExternalLinkIcon size={14} />
            </a>
          </div>
          <dl className="bill-detail__meta">
            <div>
              <dt>Introduced</dt>
              <dd>{bill.introduced_date ? formatDate(bill.introduced_date) : '—'}</dd>
            </div>
            <div>
              <dt>Latest action</dt>
              <dd>{bill.latest_action_date ? formatDate(bill.latest_action_date) : '—'}</dd>
            </div>
            <div>
              <dt>Policy area</dt>
              <dd>{bill.policy_area ?? '—'}</dd>
            </div>
            <div>
              <dt>Congress</dt>
              <dd>{bill.congress}th</dd>
            </div>
          </dl>
        </header>

        <CacheNotice cache={bill.cache} what="This bill's full record" />

        <BillExplanation congress={bill.congress} type={bill.type} number={bill.number} title={bill.title} />

        <div className="bill-detail__grid">
          <section className="panel" aria-label="Sponsor">
            <h2>Sponsor</h2>
            {sponsor ? (
              <Link to={`/members/${sponsor.bioguide_id}`} className="sponsor-card">
                <span className="sponsor-card__photo">
                  {sponsor.image_url ? (
                    <img src={sponsor.image_url} alt="" />
                  ) : (
                    <span className="member-card__initials" aria-hidden="true">
                      {initialsOf(sponsor.name)}
                    </span>
                  )}
                </span>
                <span className="sponsor-card__body">
                  <span className="sponsor-card__name">{sponsor.name}</span>
                  <span className="sponsor-card__meta">
                    {[sponsor.party, sponsor.chamber, districtLabel(sponsor.district), sponsor.state]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>
            ) : (
              <p className="muted">The sponsor has not been recorded for this bill yet.</p>
            )}
          </section>

          <section className="panel" aria-label="Action history">
            <div className="panel__heading-row">
              <h2>Action history</h2>
              <span className="panel__count">
                {bill.actions.length} {bill.actions.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            <ActionTimeline actions={bill.actions} />
          </section>
        </div>
      </article>
    </div>
  )
}
