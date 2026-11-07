import type { Member } from '../api/members'

export interface PartyCounts {
  total: number
  R: number
  D: number
  I: number
}

// Count current members by party for the dashboard composition panel.
export function countByParty(members: Member[]): PartyCounts {
  const counts: PartyCounts = { total: members.length, R: 0, D: 0, I: 0 }
  for (const member of members) {
    if (member.party === 'R') counts.R += 1
    else if (member.party === 'D') counts.D += 1
    else if (member.party === 'I') counts.I += 1
  }
  return counts
}
