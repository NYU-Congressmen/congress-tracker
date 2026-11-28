import { Link } from 'react-router-dom'
import { listRepresentatives } from '../../api/representatives'
import type { Representative, VotingRecord } from '../../api/representatives'
import { STANCE_LABELS } from '../../api/reviews'
import { getAccountToken } from '../../auth/accountToken'
import { useSession } from '../../auth/SessionContext'
import { useApi } from '../../hooks/useApi'
import { PARTY_LABELS } from '../../lib/constants'
import { districtHeading, stateName } from '../../lib/districts'
import { billNumber } from '../../lib/format'
import { MemberAvatar } from '../members/MemberAvatar'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

function role(member: Representative): string {
  if (member.chamber === 'Senate') return `Senator · ${member.state ? stateName(member.state) : ''}`
  return `Representative · ${member.state ? districtHeading(member.state, member.district) : ''}`
}

// Say how a vote lined up with the reader, in the words the record list uses.
function voteResult(agrees: boolean | null): string {
  return agrees === null ? 'Did not vote' : agrees ? 'Voted with you' : 'Voted against you'
}

function Record({ record }: { record: VotingRecord | null }) {
  if (record === null) {
    return <p className="rep-tile__fact"><span>Voting record</span><strong>Senate votes are not tracked yet</strong></p>
  }
  if (record.compared + record.missed === 0) {
    return (
      <p className="rep-tile__fact">
        <span>Voting record</span>
        <strong>No House votes yet on bills you took a side on</strong>
      </p>
    )
  }
  return (
    <>
      <p className="rep-tile__fact rep-tile__fact--lead">
        <span>Voted with you</span>
        <strong>{record.agreed} of {record.compared}</strong>
        {record.missed ? <em>Missed {record.missed} {record.missed === 1 ? 'vote' : 'votes'}</em> : null}
      </p>
      <details className="rep-tile__votes">
        <summary>The votes</summary>
        <ul>
          {record.votes.map((vote) => (
            <li key={vote.bill_id} className={vote.agrees === null ? 'is-missed' : vote.agrees ? 'is-with' : 'is-against'}>
              <Link to={`/bills/${vote.congress}/${vote.type}/${vote.number}`}>{billNumber(vote.type, vote.number)}</Link>
              <span>You: {STANCE_LABELS[vote.stance]} · {vote.position ?? 'No record'}</span>
              <strong>{voteResult(vote.agrees)}</strong>
            </li>
          ))}
        </ul>
        <p className="muted">Each bill's final House vote to pass or concur, beside your Support or Oppose stance.</p>
      </details>
    </>
  )
}

function Tile({ member }: { member: Representative }) {
  const phone = member.office_phone?.replace(/[^\d+]/g, '')
  return (
    <li className="rep-tile">
      <div className="rep-tile__head">
        <MemberAvatar member={member} size="lg" />
        <div>
          <Link to={`/members/${member.bioguide_id}`} className="rep-tile__name">{member.name}</Link>
          <span className="muted review__meta">
            {role(member)}{member.party ? ` · ${PARTY_LABELS[member.party] ?? member.party}` : ''}
          </span>
        </div>
      </div>
      <Record record={member.voting_record} />
      <p className="rep-tile__fact">
        <span>Constituent Signal this week</span>
        <strong>
          {member.signal_constituents
            ? `${member.signal_constituents} constituents on ${member.signal_bills} ${member.signal_bills === 1 ? 'bill' : 'bills'}`
            : 'No bill reached the public minimum'}
        </strong>
      </p>
      <p className="rep-tile__fact">
        <span>Your calls</span>
        <strong>{member.your_calls}</strong>
      </p>
      <div className="rep-tile__actions">
        {phone ? <a className="btn btn--sm btn--ink" href={`tel:${phone}`}>Call {member.office_phone}</a> : null}
        <Link to={`/members/${member.bioguide_id}#signal`} className="link-more">Public record</Link>
      </div>
    </li>
  )
}

// Show each of the reader's members of Congress with how they answer to this reader.
export function RepresentativeTiles() {
  const { user } = useSession()
  const reps = useApi(async () => user ? listRepresentatives(await getAccountToken(user)) : [], [user])
  return (
    <section className="home-section" aria-labelledby="reps-title">
      <div className="home-section__head">
        <h2 id="reps-title">Your representatives</h2>
        <p className="muted">How they vote on the bills you took a side on, and what your neighbors are telling them.</p>
      </div>
      {reps.loading ? (
        <LoadingState message="Loading your representatives…" />
      ) : reps.error ? (
        <ErrorState title="Your representatives could not be loaded" message={reps.error.message} onRetry={reps.refetch} />
      ) : (
        <ul className="rep-tiles" aria-label="Your members of Congress">
          {(reps.data ?? []).map((member) => <Tile key={member.bioguide_id} member={member} />)}
        </ul>
      )}
    </section>
  )
}
