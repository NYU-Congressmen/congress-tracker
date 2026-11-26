import { useState } from 'react'
import type { BillDetail } from '../../api/bills'
import { getBillResponses, STANCE_LABELS, STANCES } from '../../api/reviews'
import { useApi } from '../../hooks/useApi'
import { districtHeading, stateName } from '../../lib/districts'
import { billUrl, formatDate } from '../../lib/format'
import { useProfile } from '../../profile/ProfileContext'
import type { DistrictSelection } from '../../profile/types'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'
import { StatusBadge } from '../ui/StatusBadge'
import { HouseVotes } from './HouseVotes'

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

export function BillStances({ bill, revision = 0 }: { bill: BillDetail; revision?: number }) {
  const district = useProfile().profile?.district ?? null
  const [showAll, setShowAll] = useState(false)
  const scope = showAll ? null : district

  return (
    <section className="panel panel--stack" aria-labelledby="bill-stances">
      <h2 id="bill-stances">Stances and bill outcome</h2>
      <div className="bill-stances__layout">
        <div className="bill-stances__card">
          <h3>Pull responses</h3>
          {district ? (
            <label className="field bill-stances__scope">
              <span className="field__label">Response area</span>
              <select className="field__control" value={showAll ? 'all' : 'district'}
                onChange={(event) => setShowAll(event.target.value === 'all')}>
                <option value="district">{districtHeading(district.state, district.district)}</option>
                <option value="all">All respondents</option>
              </select>
            </label>
          ) : null}
          <StanceCounts key={scope ? `stances-${scope.state}-${scope.district}` : 'stances-all'}
            bill={bill} scope={scope} revision={revision} />
        </div>
        <div className="bill-stances__card">
          <div className="bill-stances__stage">
            <div className="bill-stances__heading">
              <h3>Official bill stage</h3>
              <StatusBadge status={bill.status} />
            </div>
            {bill.latest_action_date ? <p className="muted">Latest action {formatDate(bill.latest_action_date)}</p> : null}
            <a href={billUrl(bill.congress, bill.type, bill.number)} target="_blank" rel="noreferrer">Bill record on Congress.gov</a>
          </div>
          <HouseVotes key={district ? `votes-${district.state}-${district.district}` : 'votes-all'}
            bill={bill} district={district} />
        </div>
      </div>
    </section>
  )
}

function StanceCounts({ bill, scope, revision }: { bill: BillDetail; scope: DistrictSelection | null; revision: number }) {
  const { congress, type, number } = bill
  const { data, error, loading, refetch } = useApi(
    () => getBillResponses(congress, type, number, scope?.state, scope?.district),
    [congress, type, number, scope?.state, scope?.district, revision],
  )
  if (loading) return <LoadingState message="Loading stances…" />
  if (error) return <ErrorState title="Stances could not be loaded" message={error.message} onRetry={refetch} />
  if (!data || data.total === 0) {
    const area = scope && (scope.district === null
      ? stateName(scope.state)
      : `District ${scope.district} in ${stateName(scope.state)}`)
    const message = area ? `No responses from ${area} yet.` : 'No responses to this bill yet.'
    return <p className="muted">{message}</p>
  }

  return (
    <>
      <p className="muted">{data.label} · {data.total.toLocaleString('en-US')}</p>
      <ul className="bill-stances__counts">
        {STANCES.map((stance) => {
          const count = data.counts[stance]
          const share = count / data.total
          return (
            <li key={stance}>
              <span>{STANCE_LABELS[stance]}</span>
              <span>{percent.format(share)} · {count.toLocaleString('en-US')}</span>
              <span aria-hidden="true" className="bill-stances__bar">
                <span style={{ width: `${share * 100}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
