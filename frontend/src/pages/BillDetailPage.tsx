import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { BILL_STATUSES, BILL_TYPES, getBill } from '../api/bills'
import type { BillDetail, BillType } from '../api/bills'
import { PageBand } from '../components/layout/PageBand'
import { ActionTimeline } from '../components/bills/ActionTimeline'
import { BillDiff } from '../components/bills/BillDiff'
import { BillCosponsors } from '../components/bills/BillCosponsors'
import { BillExplanation } from '../components/bills/BillExplanation'
import { BillStances } from '../components/bills/BillStances'
import { CallLog } from '../components/bills/CallLog'
import { ReviewPanel } from '../components/bills/ReviewPanel'
import { SharedReviews } from '../components/bills/SharedReviews'
import { TrackButton } from '../components/bills/TrackButton'
import { MemberAvatar } from '../components/members/MemberAvatar'
import { ChamberFlags } from '../components/ui/ChamberFlags'
import { CacheNotice } from '../components/ui/CacheNotice'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { ChevronLeftIcon, ExternalLinkIcon } from '../components/icons'
import { useApi } from '../hooks/useApi'
import { PARTY_LABELS, STATUS_LABELS } from '../lib/constants'
import {
  billNumber,
  billUrl,
  districtLabel,
  formatDate,
  originChamber,
  sessionLabel,
} from '../lib/format'

const LADDER_LABELS = ['Intro', 'Cmte', 'Chamber', 'Both', 'Pres.', 'Law']

function BackLink() {
  return (
    <Link to="/bills" className="back">
      <ChevronLeftIcon />
      Bills
    </Link>
  )
}

// One line under the stage name: the latest action, plus the paper fact for a
// bill that has passed the House and waits on the Senate.
function stageNote(bill: BillDetail): string {
  const parts: string[] = []
  if (bill.latest_action_date) parts.push(`Latest action ${formatDate(bill.latest_action_date)}.`)
  if (bill.status === 'passed_one_chamber' && bill.passed_house && !bill.passed_senate) {
    parts.push('House-passed bills are printed on blue paper. The Senate is next.')
  }
  return parts.join(' ')
}

// Copies the page address, and says so, without leaving the page.
function CopyLinkButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button type="button" className="btn" onClick={copy}>
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed' : 'Copy link'}
    </button>
  )
}

export default function BillDetailPage() {
  const [stanceRevision, setStanceRevision] = useState(0)
  // Hiding a review from the shared list reloads the author's own panel.
  const [reviewRevision, setReviewRevision] = useState(0)
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
      <PageBand>
        <BackLink />
        <ErrorState
          title={notFound ? 'Bill not found' : 'This bill could not be loaded'}
          message={error.message}
          onRetry={notFound ? undefined : refetch}
        />
      </PageBand>
    )
  }

  if (loading || !bill) {
    return (
      <PageBand>
        <BackLink />
        <LoadingState message="Loading the bill…" />
      </PageBand>
    )
  }

  const sponsor = bill.sponsor
  const session = sessionLabel(bill.congress, bill.introduced_date)
  const reached = BILL_STATUSES.indexOf(bill.status) + 1
  const law = bill.status === 'became_law'

  return (
    <div className="bill-page">
      <PageBand labelledBy="bill-title">
        <BackLink />
        <div className="bill-top">
          <article className="cover glass" aria-labelledby="bill-title">
            <div className="cover__top">
              <p className="caps cover__congress">
                {bill.congress}th Congress
                {session ? (
                  <>
                    <br />
                    {session}
                  </>
                ) : null}
              </p>
              <p className="cover__num">{billNumber(bill.type, bill.number)}</p>
            </div>
            <h1 id="bill-title" className="cover__title">
              {bill.title}
            </h1>
            <p className="cover__house caps">
              In the {originChamber(bill.type) === 'House' ? 'House of Representatives' : 'Senate'}
            </p>
            {bill.introduced_date ? <p className="cover__date caps">{formatDate(bill.introduced_date)}</p> : null}
            <p className="cover__intro">
              {sponsor ? (
                <>
                  <Link to={`/members/${sponsor.bioguide_id}`}>{sponsor.name}</Link> introduced this bill.
                </>
              ) : (
                'The sponsor has not been recorded for this bill yet.'
              )}
              {bill.policy_area ? ` Policy area: ${bill.policy_area}.` : null}
            </p>
          </article>

          <aside className="stage-box glass" aria-label="Stage and links">
            <p className="caps">Stage</p>
            <div className={`stage-box__now${law ? ' stage-box__now--law' : ''}`}>
              <b>{STATUS_LABELS[bill.status] ?? bill.status}</b>
              {stageNote(bill) ? <p>{stageNote(bill)}</p> : null}
            </div>
            <ol className="ladder" aria-label={`Stage ${reached} of ${BILL_STATUSES.length}`}>
              {BILL_STATUSES.map((status, index) => (
                <li
                  key={status}
                  className={[index < reached ? 'on' : '', index + 1 === reached ? 'cur' : ''].join(' ').trim() || undefined}
                >
                  {LADDER_LABELS[index]}
                </li>
              ))}
            </ol>
            <div className="stage-box__acts">
              <a
                className="btn btn--hl"
                href={billUrl(bill.congress, bill.type, bill.number)}
                target="_blank"
                rel="noreferrer"
              >
                View on congress.gov <ExternalLinkIcon size={14} />
              </a>
              <TrackButton bill={bill} />
              <CopyLinkButton />
            </div>
            <dl className="facts">
              <div>
                <dt>Introduced</dt>
                <dd>{bill.introduced_date ? formatDate(bill.introduced_date) : '—'}</dd>
              </div>
              <div>
                <dt>Latest action</dt>
                <dd>{bill.latest_action_date ? formatDate(bill.latest_action_date) : '—'}</dd>
              </div>
              <div>
                <dt>Passed</dt>
                <dd>
                  <ChamberFlags passedHouse={bill.passed_house} passedSenate={bill.passed_senate} />
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </PageBand>

      <div className="container page-body bill-body">
        <CacheNotice cache={bill.cache} what="This bill's full record" />
        <div className="bill-grid">
          <section className="card" aria-labelledby="sponsor-title">
            <h2 id="sponsor-title" className="card__title">
              Sponsor
            </h2>
            {sponsor ? (
              <Link to={`/members/${sponsor.bioguide_id}`} className="person">
                <MemberAvatar key={sponsor.bioguide_id} member={sponsor} />
                <span className="person__body">
                  <b>{sponsor.name}</b>
                  <small>
                    {[
                      sponsor.party ? (PARTY_LABELS[sponsor.party] ?? sponsor.party) : null,
                      sponsor.chamber,
                      sponsor.chamber === 'House' ? districtLabel(sponsor.district) : null,
                      sponsor.state,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
              </Link>
            ) : (
              <p className="muted">The sponsor has not been recorded for this bill yet.</p>
            )}

            <BillCosponsors key={bill.bill_id} bill={bill} />
          </section>

          <section className="card chat" aria-labelledby="history-title">
            <div className="chat__head">
              <span className="chat__avatar" aria-hidden="true">
                {billNumber(bill.type, bill.number).split(' ')[0]}
              </span>
              <span>
                <h2 id="history-title">Action history</h2>
                <small>
                  {bill.actions.length} {bill.actions.length === 1 ? 'action' : 'actions'}, oldest first
                </small>
              </span>
            </div>
            <div className="chat__scroll" role="region" aria-label="Messages" tabIndex={0}>
              <ActionTimeline actions={bill.actions} />
            </div>
            <p className="chat__foot">
              Messages quote the official action history. The sender is inferred from each action's wording.
            </p>
          </section>
        </div>

        <BillExplanation congress={bill.congress} type={bill.type} number={bill.number} title={bill.title} />

        <BillDiff key={`diff-${bill.bill_id}`} congress={bill.congress} type={bill.type} number={bill.number} />

        <ReviewPanel key={`review-${bill.bill_id}-${reviewRevision}`} congress={bill.congress} type={bill.type} number={bill.number}
          onStanceSaved={() => setStanceRevision((value) => value + 1)} />
        <BillStances key={`stances-${bill.bill_id}`} bill={bill} revision={stanceRevision} />
        <SharedReviews key={`shared-${bill.bill_id}`} bill={bill} revision={stanceRevision} onVisibilityChange={() => {
          setReviewRevision((value) => value + 1)
          setStanceRevision((value) => value + 1)
        }} />
        <CallLog key={`calls-${bill.bill_id}`} congress={bill.congress} type={bill.type} number={bill.number}
          revision={stanceRevision} />
      </div>
    </div>
  )
}
