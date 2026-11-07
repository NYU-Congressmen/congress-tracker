import { Link } from 'react-router-dom'
import type { Member } from '../../api/members'
import { initialsOf } from '../../lib/format'

interface MemberCardProps {
  member: Member
}

// The card carries the member's party as a class hook so the directory can
// tint it (pale red for Republicans, pale blue for Democrats, grey for
// independents) in both light and dark themes.
const PARTY_CLASSES: Record<string, string> = {
  R: 'member-card--r',
  D: 'member-card--d',
  I: 'member-card--i',
}

// One member in the directory grid.
export function MemberCard({ member }: MemberCardProps) {
  const partyClass = member.party ? (PARTY_CLASSES[member.party] ?? '') : ''
  const meta = [
    member.chamber ?? '',
    member.party ?? '',
    member.state ?? '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className={`member-card${partyClass ? ` ${partyClass}` : ''}`}>
      <Link to={`/members/${member.bioguide_id}`} className="member-card__link">
        <span className="member-card__photo">
          {member.image_url ? (
            <img src={member.image_url} alt="" loading="lazy" />
          ) : (
            <span className="member-card__initials" aria-hidden="true">
              {initialsOf(member.name)}
            </span>
          )}
        </span>
        <span className="member-card__body">
          <span className="member-card__name">{member.name}</span>
          <span className="member-card__meta">{meta}</span>
        </span>
      </Link>
    </li>
  )
}
