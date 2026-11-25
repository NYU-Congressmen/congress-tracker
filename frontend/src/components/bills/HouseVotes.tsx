import { useState } from 'react'
import type { BillDetail } from '../../api/bills'
import { listMembers } from '../../api/members'
import { getHouseVotes } from '../../api/votes'
import type { HouseVote } from '../../api/votes'
import { useApi } from '../../hooks/useApi'
import { representativesForDistrict } from '../../lib/districts'
import { formatDate } from '../../lib/format'
import type { DistrictSelection } from '../../profile/types'
import { ErrorState } from '../ui/ErrorState'
import { LoadingState } from '../ui/LoadingState'

function voteKey(vote: HouseVote): string {
  return `${vote.congress}-${vote.session}-${vote.roll_number}`
}

export function HouseVotes({ bill, district }: { bill: BillDetail; district: DistrictSelection | null }) {
  const [selected, setSelected] = useState('')
  const { congress, type, number } = bill
  const { data, loading, error, refetch } = useApi(async () => {
    const directory = district ? await listMembers({ state: district.state }).catch(() => null) : null
    const representative = district && directory
      ? representativesForDistrict(directory.data, district.state, district.district).house[0]
      : undefined
    const votes = await getHouseVotes(congress, type, number, representative?.bioguide_id)
    return { votes, representative }
  }, [congress, type, number, district?.state, district?.district])

  const votes = data?.votes ?? []
  const latest = votes.findLast((vote) => vote.vote_date) ?? votes.at(-1)
  const vote = votes.find((item) => voteKey(item) === selected) ?? latest
  const representative = data?.representative
  const position = vote?.positions.find((item) => item.bioguide_id === representative?.bioguide_id)
  const source = vote?.source_url
  const trustedSource = source && /^https:\/\/(clerk\.house\.gov|(?:www\.)?congress\.gov)\//i.test(source)

  return (
    <div className="bill-stances__outcome">
      <h3>House roll calls</h3>
      {loading ? <LoadingState message="Loading House votes…" /> : error ? (
        <ErrorState title="House votes could not be loaded" message={error.message} onRetry={refetch} />
      ) : !vote ? (
        <p className="muted">Pull has no House roll call on file for this bill.</p>
      ) : (
        <>
          {votes.length > 1 ? (
            <label className="field bill-stances__scope">
              <span className="field__label">Recorded vote</span>
              <select className="field__control" value={voteKey(vote)} onChange={(event) => setSelected(event.target.value)}>
                {votes.map((item) => <option key={voteKey(item)} value={voteKey(item)}>
                  Roll call {item.roll_number}{item.vote_date ? ` · ${formatDate(item.vote_date)}` : ''}
                </option>)}
              </select>
            </label>
          ) : null}
          <p><strong>Roll call {vote.roll_number}</strong>{vote.vote_date ? ` · ${formatDate(vote.vote_date)}` : ''}</p>
          {vote.question ? <p>{vote.question}</p> : null}
          {vote.result ? <p>House result <strong>{vote.result}</strong></p> : null}
          {Object.entries(vote.totals).length > 0 ? (
            <p>{Object.entries(vote.totals).map(([label, count]) => `${label} ${count}`).join(' · ')}</p>
          ) : null}
          {representative ? (
            <p>{representative.name} · {position ? <strong>{position.position}</strong> : (
              vote.positions_complete ? 'No position on file' : 'Member positions pending'
            )}</p>
          ) : null}
          {trustedSource ? <a href={source} target="_blank" rel="noreferrer">Official roll call record</a> : null}
        </>
      )}
    </div>
  )
}
