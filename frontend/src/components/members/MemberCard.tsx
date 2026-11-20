import { Link } from 'react-router-dom'
import type { Member } from '../../api/members'
import { initialsOf, seatLabel } from '../../lib/format'

interface MemberCardProps {
  member: Member
}

// The card keeps the member's party as a class hook, and the avatar carries
// the party letter, so party never relies on color alone.
const PARTY_CLASSES: Record<string, string> = {
  R: 'member-card--r',
  D: 'member-card--d',
  I: 'member-card--i',
}

// One member in the directory grid: photo or initials, name and seat.
export function MemberCard({ member }: MemberCardProps) {
  const partyClass = member.party ? (PARTY_CLASSES[member.party] ?? '') : ''
  return (
    <li className={`member-card${partyClass ? ` ${partyClass}` : ''}`}>
      <Link to={`/members/${member.bioguide_id}`} className="member-card__link glass">
        <span className="avatar">
          {member.image_url ? (
            <img src={member.image_url} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">{initialsOf(member.name)}</span>
          )}
          {member.party ? (
            <i className={`pb pb--${member.party.toLowerCase()}`} aria-hidden="true">
              {member.party}
            </i>
          ) : null}
        </span>
        <span className="member-card__body">
          <span className="member-card__name">{member.name}</span>
          <span className="member-card__meta">{seatLabel(member.state, member.chamber, member.district)}</span>
        </span>
      </Link>
    </li>
  )
}
