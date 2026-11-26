import { useState } from 'react'
import type { Member } from '../../api/members'
import { PARTY_ICON_PATHS, SMALLER_PARTY_NAMES } from '../../lib/constants'
import { initialsOf } from '../../lib/format'

interface MemberAvatarProps {
  member: Pick<Member, 'bioguide_id' | 'name' | 'image_url' | 'party'>
  size?: 'sm' | 'lg'
  describePhoto?: boolean
}

const ABBREVIATIONS = new Map(Array.from(SMALLER_PARTY_NAMES, ([code, name]) => [name, code]))

export function MemberAvatar({ member, size, describePhoto = false }: MemberAvatarProps) {
  const [failed, setFailed] = useState<string[]>([])
  const id = member.bioguide_id.toUpperCase()
  const bioguide = /^[A-Z][0-9]{6}$/.test(id) ? `https://bioguide.congress.gov/photo/${id}.jpg` : null
  // Try the directory's photo first, then the official Bioguide copy.
  const photo = [member.image_url, bioguide].find((url) => url && !failed.includes(url))
  const party = member.party?.trim()
  const icon = party ? PARTY_ICON_PATHS.get(party) : undefined
  const badgeColor = party === 'D' || party === 'R' || party === 'I' ? party.toLowerCase() : 'neutral'

  return (
    <span className={size ? `avatar avatar--${size}` : 'avatar'}>
      {photo ? (
        <img src={photo} alt={describePhoto ? `Official photo of ${member.name}` : ''}
          loading={describePhoto ? 'eager' : 'lazy'} onError={() => setFailed((urls) => [...urls, photo])} />
      ) : <span aria-hidden="true">{initialsOf(member.name)}</span>}
      {party ? (
        <i className={`pb pb--${badgeColor}${icon ? ' pb--icon' : ''}`} aria-hidden="true">
          {icon ? <span className="pb__icon" style={{ maskImage: `url(${icon})` }} /> : ABBREVIATIONS.get(party) ?? party}
        </i>
      ) : null}
    </span>
  )
}
