import { Link, useParams } from 'react-router-dom'
import { getMember } from '../api/members'
import { BillListItem } from '../components/bills/BillListItem'
import { ExternalLinkIcon } from '../components/icons'
import { CacheNotice } from '../components/ui/CacheNotice'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { districtLabel, initialsOf, memberUrl } from '../lib/format'
import { PARTY_LABELS } from '../lib/constants'

export default function MemberDetailPage() {
  const { bioguideId } = useParams()
  const id = bioguideId ?? ''

  const { data: member, loading, error, refetch } = useApi(() => getMember(id), [id])

  if (error) {
    const notFound = error.status === 404
    return (
      <div className="container page">
        <ErrorState
          title={notFound ? 'Member not found' : 'This member could not be loaded'}
          message={error.message}
          onRetry={notFound ? undefined : refetch}
        />
        <p>
          <Link to="/members" className="btn btn--secondary">
            Back to all members
          </Link>
        </p>
      </div>
    )
  }

  if (loading || !member) {
    return (
      <div className="container page">
        <LoadingState message="Loading the member profile…" />
      </div>
    )
  }

  return (
    <div className="container page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/members">Members</Link>
        <span className="breadcrumbs__sep" aria-hidden="true">
          ›
        </span>
        <span aria-current="page">{member.name}</span>
      </nav>

      <article className="member-detail">
        <header className="member-detail__profile panel">
          <div className="member-detail__photo">
            {member.image_url ? (
              <img src={member.image_url} alt={`Official photo of ${member.name}`} />
            ) : (
              <span className="member-detail__initials" aria-hidden="true">
                {initialsOf(member.name)}
              </span>
            )}
          </div>
          <div className="member-detail__info">
            <h1 className="member-detail__name">{member.name}</h1>
            <p className="member-detail__meta">
              {[
                member.chamber,
                member.party ? `${PARTY_LABELS[member.party] ?? member.party}` : null,
                districtLabel(member.district),
                member.state,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {!member.is_current ? <p className="member-detail__note">Not a current member of Congress.</p> : null}
            <div className="member-detail__links">
              <a className="ext-link" href={memberUrl(member.bioguide_id)} target="_blank" rel="noreferrer">
                View on congress.gov <ExternalLinkIcon size={14} />
              </a>
            </div>
          </div>
        </header>

        <section className="panel member-detail__bills" aria-label="Sponsored bills">
          <div className="panel__heading-row">
            <h2>Sponsored bills, 119th Congress</h2>
            <span className="panel__count">
              {member.sponsored_bills.length} {member.sponsored_bills.length === 1 ? 'bill' : 'bills'}
            </span>
          </div>
          <CacheNotice cache={member.cache} what="This member's sponsored bills" />
          {member.sponsored_bills.length > 0 ? (
            <ul className="bill-list">
              {member.sponsored_bills.map((bill) => (
                <BillListItem key={bill.bill_id} bill={bill} showLatestAction={false} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No sponsored bills recorded yet"
              hint="Bills sponsored in the current Congress appear here once Congress.gov reports them."
            />
          )}
        </section>
      </article>
    </div>
  )
}
