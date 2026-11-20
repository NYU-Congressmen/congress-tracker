import type { Member } from '../api/members'

export interface PartyCounts {
  total: number
  R: number
  D: number
  I: number
}

// Party split of a group of members.
function countParties(members: Member[]): PartyCounts {
  const counts: PartyCounts = { total: members.length, R: 0, D: 0, I: 0 }
  for (const member of members) {
    if (member.party === 'R') counts.R += 1
    else if (member.party === 'D') counts.D += 1
    else if (member.party === 'I') counts.I += 1
  }
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
