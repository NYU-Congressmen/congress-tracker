import { Link, useParams } from 'react-router-dom'
import { getMember } from '../api/members'
import { PageBand } from '../components/layout/PageBand'
import { BillListItem } from '../components/bills/BillListItem'
import { MemberAvatar } from '../components/members/MemberAvatar'
import { ChevronLeftIcon, ExternalLinkIcon } from '../components/icons'
import { CacheNotice } from '../components/ui/CacheNotice'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { useApi } from '../hooks/useApi'
import { memberUrl, officeAddressLines, stateName } from '../lib/format'
import { CONGRESS_NUMBER, PARTY_LABELS } from '../lib/constants'
import { useProfile } from '../profile/ProfileContext'

function BackLink() {
  return (
    <Link to="/members" className="back">
      <ChevronLeftIcon />
      Members
    </Link>
  )
}

// Show the site without its scheme: "hill.house.gov".
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export default function MemberDetailPage() {
  const { bioguideId } = useParams()
  const id = bioguideId ?? ''
  const { profile } = useProfile()

  const { data: member, loading, error, refetch } = useApi(() => getMember(id), [id])

  if (error) {
    const notFound = error.status === 404
    return (
      <PageBand>
        <BackLink />
        <ErrorState
          title={notFound ? 'Member not found' : 'This member could not be loaded'}
          message={error.message}
          onRetry={notFound ? undefined : refetch}
        />
      </PageBand>
    )
  }

  if (loading || !member) {
    return (
      <PageBand>
        <BackLink />
        <LoadingState message="Loading the member profile…" />
      </PageBand>
    )
  }

  const chips = [
    member.party ? (PARTY_LABELS[member.party] ?? member.party) : null,
    stateName(member.state),
    member.chamber === 'House' && member.district !== null ? `District ${member.district}` : null,
    member.chamber,
  ].filter((chip): chip is string => Boolean(chip))
  const officeAddress = officeAddressLines(member.office_address ?? '')
  const hasContacts = Boolean(member.office_phone || officeAddress.length || member.website_url)

  // Flag the member when they sit in the signed-in person's district, so the
  // profile page doubles as the "my representatives" detail view.
  const district = profile?.district ?? null
  const isMine =
    district !== null &&
    (member.state ?? '').toUpperCase() === district.state.toUpperCase() &&
    (member.chamber === 'Senate' ||
      (district.district !== null && member.district === district.district) ||
      (district.district === null && member.district === null))

  // The backend records co-sponsorship once Congress.gov reports it; the
  // section is here either way, ready to fill in.
  const coSponsored = member.co_sponsored_bills ?? []

  return (
    <div className="member-page">
      <PageBand labelledBy="member-name">
        <BackLink />
        <section className="profile glass" aria-labelledby="member-name">
          <MemberAvatar key={member.bioguide_id} member={member} size="lg" describePhoto />
          <div className="profile__info">
            {isMine ? <p className="profile__mine">Your representative</p> : null}
            <h1 id="member-name" className="profile__name">
              {member.name}
            </h1>
            <ul className="profile__chips" aria-label="Party and seat">
              {chips.map((chip) => (
                <li key={chip} className="chip">
                  {chip}
                </li>
              ))}
            </ul>
            {!member.is_current ? <p className="profile__note">Not a current member of Congress.</p> : null}
          </div>
          <div className="profile__actions">
            <a className="btn btn--hl" href={memberUrl(member.bioguide_id)} target="_blank" rel="noreferrer">
              View on congress.gov <ExternalLinkIcon size={14} />
            </a>
            {member.website_url ? (
              <a className="btn" href={member.website_url} target="_blank" rel="noreferrer">
                Official website
              </a>
            ) : null}
          </div>
        </section>
      </PageBand>

      <div className="container page-body member-grid-page">
        <div className="member-grid-page__main">
          <section className="card panel--stack" aria-labelledby="sponsored-title">
            <div className="card__head">
              <h2 id="sponsored-title">Sponsored bills</h2>
              <span className="card__note">
                {member.sponsored_bills.length} in the {CONGRESS_NUMBER}th Congress
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

          <section className="card panel--stack" aria-labelledby="cosponsored-title">
            <div className="card__head">
              <h2 id="cosponsored-title">Co-sponsored bills</h2>
              {coSponsored.length > 0 ? (
                <span className="card__note">
                  {coSponsored.length} in the {CONGRESS_NUMBER}th Congress
                </span>
              ) : null}
            </div>
            {coSponsored.length > 0 ? (
              <ul className="bill-list">
                {coSponsored.map((bill) => (
                  <BillListItem key={bill.bill_id} bill={bill} showLatestAction={false} />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No co-sponsored bills on record yet"
                hint="Bills this member has co-sponsored appear here once the tracker records them from Congress.gov."
              />
            )}
          </section>
        </div>

        <section className="card panel--stack" aria-labelledby="office-title">
          <h2 id="office-title" className="card__title">
            Reach their office
          </h2>
          {hasContacts ? (
            <dl className="office">
              {member.office_phone ? (
                <div>
                  <dt>Washington office</dt>
                  <dd className="office__phone">
                    <a href={`tel:${member.office_phone.replace(/[^\d+]/g, '')}`}>{member.office_phone}</a>
                  </dd>
                </div>
              ) : null}
              {officeAddress.length > 0 && (
                <div>
                  <dt>Address</dt>
                  <dd className="office__address">
                    {officeAddress.map((line, index) => <span key={index}>{line}</span>)}
                  </dd>
                </div>
              )}
              {member.website_url ? (
                <div>
                  <dt>Website</dt>
                  <dd>
                    <a href={member.website_url} target="_blank" rel="noreferrer">
                      {displayUrl(member.website_url)}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="muted">No office contact is on file for this member yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}
