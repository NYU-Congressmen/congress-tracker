import { Link } from 'react-router-dom'
import { getBillGraph, type BillDetail } from '../../api/bills'
import { useApi } from '../../hooks/useApi'
import { originChamber, seatLabel } from '../../lib/format'
import { MemberAvatar } from '../members/MemberAvatar'

// Load the bill's recorded cosponsors alongside its sponsor.
export function BillCosponsors({ bill }: { bill: BillDetail }) {
  const { congress, type, number } = bill
  const { data, error, loading, refetch } = useApi(
    () => getBillGraph(congress, type, number),
    [congress, type, number],
  )
  const cosponsors = data?.cosponsors ?? []
  const current = data?.cache.complete && !data.cache.stale && !data.cache.refresh_failed
  const chamber = originChamber(type)

  return (
    <div className="sponsor-panel__cosponsors">
      <h3>Co-sponsors</h3>
      {cosponsors.length ? (
        <ul className="cosponsor-grid" aria-label="Co-sponsor list">
          {cosponsors.map((member) => (
            <li key={member.bioguide_id}>
              <Link to={`/members/${member.bioguide_id}`} className="cosponsor-card">
                <MemberAvatar member={{ ...member, image_url: null }} size="sm" />
                <span className="cosponsor-card__body">
                  <span className="cosponsor-card__name">{member.name.replace(/\s+\[[^\]]+\]$/, '')}</span>
                  <span className="cosponsor-card__meta">
                    {seatLabel(member.state, chamber, member.district)}
                    {member.withdrawn_date ? ' · Withdrawn' : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : loading ? (
        <p className="muted" role="status">Loading co-sponsors…</p>
      ) : current && !error ? (
        <p className="muted">Congress.gov lists no co-sponsors for this bill.</p>
      ) : (
        <p className="muted">
          Co-sponsor data is unavailable.{' '}
          <button type="button" className="link-more" onClick={refetch}>Try again</button>
        </p>
      )}
    </div>
  )
}
