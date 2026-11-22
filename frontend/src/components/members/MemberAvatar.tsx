import { useState } from 'react'
import type { Member } from '../../api/members'
import { initialsOf } from '../../lib/format'

interface MemberAvatarProps {
  member: Pick<Member, 'bioguide_id' | 'name' | 'image_url' | 'party'>
  size?: 'sm' | 'lg'
  describePhoto?: boolean
}

export function MemberAvatar({ member, size, describePhoto = false }: MemberAvatarProps) {
  const [failed, setFailed] = useState<string[]>([])
  const id = member.bioguide_id.toUpperCase()
  const bioguide = /^[A-Z][0-9]{6}$/.test(id) ? `https://bioguide.congress.gov/photo/${id}.jpg` : null
  // Try the directory's photo first, then the official Bioguide copy.
  const photo = [member.image_url, bioguide].find((url) => url && !failed.includes(url))

  return (
    <span className={size ? `avatar avatar--${size}` : 'avatar'}>
      {photo ? (
        <img src={photo} alt={describePhoto ? `Official photo of ${member.name}` : ''}
          loading={describePhoto ? 'eager' : 'lazy'} onError={() => setFailed((urls) => [...urls, photo])} />
      ) : <span aria-hidden="true">{initialsOf(member.name)}</span>}
      {member.party ? (
        <i className={`pb pb--${member.party.toLowerCase()}`} aria-hidden="true">{member.party}</i>
      ) : null}
    </span>
  )
}
