import type { Member } from '../api/members'
import { SMALLER_PARTY_NAMES } from './constants'

export interface PartyCounts {
  total: number
  R: number
  D: number
  I: number
  unaffiliated: number
  other: Record<string, number>
}

const UNRECORDED_AFFILIATIONS = new Set(['unaffiliated', 'no party affiliation', 'other', 'others'])

// Count members by affiliation and track members without one separately.
function countParties(members: Member[]): PartyCounts {
  const counts: PartyCounts = { total: members.length, R: 0, D: 0, I: 0, unaffiliated: 0, other: {} }
  const other = new Map<string, number>()
  for (const member of members) {
    const party = member.party?.trim()
    if (party === 'R' || party === 'D' || party === 'I') counts[party] += 1
    else if (!party || UNRECORDED_AFFILIATIONS.has(party.toLowerCase())) counts.unaffiliated += 1
    else {
      const label = SMALLER_PARTY_NAMES.get(party) ?? party
      other.set(label, (other.get(label) ?? 0) + 1)
    }
  }
  counts.other = Object.fromEntries(other)
  return counts
}

// Count current members by party for the dashboard composition panel.
export function countByParty(members: Member[]): PartyCounts {
  return countParties(members)
}

// The composition the dashboard's chamber view can select: both chambers
// combined, or a single chamber on its own.
export interface ChamberCounts {
  both: PartyCounts
  house: PartyCounts
  senate: PartyCounts
}

// Split the membership by chamber so the dashboard can show the combined
// composition or the composition of one chamber at a time.
export function countByChamber(members: Member[]): ChamberCounts {
  return {
    both: countParties(members),
    house: countParties(members.filter((member) => member.chamber === 'House')),
    senate: countParties(members.filter((member) => member.chamber === 'Senate')),
  }
}
