import { districtHeading } from '../../lib/districts'
import type { DistrictSelection } from '../../profile/types'

interface MemberBrief {
  bioguide_id: string
  name: string
  party: string | null
  state: string
  image_url: string | null
}

export interface DistrictSearchResult {
  source: 'address' | 'zip' | 'state'
  districts: (Pick<DistrictSelection, 'state' | 'district'> & { representative: MemberBrief | null })[]
  senators: MemberBrief[]
}

type District = Pick<DistrictSelection, 'state' | 'district'>

interface DistrictChoicesProps {
  result: DistrictSearchResult
  selected: District | null
  onSelect: (district: District) => void
}

const INTRO = {
  address: 'That address sits on more than one district. Choose the one you live in.',
  zip: 'That ZIP code covers more than one district. Choose the one you live in.',
  state: 'Add a street address or ZIP code to narrow this down, or choose your district.',
}

function memberLabel(member: MemberBrief): string {
  return member.party ? `${member.name} (${member.party})` : member.name
}

// List a search's districts with their House members, and the senators who represent the state.
export function DistrictChoices({ result, selected, onSelect }: DistrictChoicesProps) {
  const many = result.districts.length > 1
  const only = many ? null : result.districts[0]
  return (
    <div className="onboard-results">
      {many ? (
        <>
          <p className="muted">{INTRO[result.source]}</p>
          <ul className="onboard-results__list" aria-label="Matching districts">
            {result.districts.map((match) => {
              const chosen = selected?.state === match.state && selected.district === match.district
              return (
                <li key={`${match.state}-${match.district ?? 0}`} className="onboard-results__option">
                  <span>
                    <strong>{districtHeading(match.state, match.district)}</strong>
                    <span className="muted">
                      {match.representative ? memberLabel(match.representative) : 'Representative not listed'}
                    </span>
                  </span>
                  <button type="button" className={`btn btn--sm ${chosen ? 'btn--primary' : 'btn--secondary'}`}
                    aria-pressed={chosen} onClick={() => onSelect({ state: match.state, district: match.district })}>
                    {chosen ? 'Chosen' : 'Choose'}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
      {only?.representative || result.senators.length ? (
        <p className="muted">
          {only?.representative ? <>Representative: {memberLabel(only.representative)}. </> : null}
          {result.senators.length ? <>Senators: {result.senators.map(memberLabel).join(' and ')}.</> : null}
        </p>
      ) : null}
    </div>
  )
}
