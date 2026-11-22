import { Link } from 'react-router-dom'
import { districtHeading } from '../../lib/districts'
import type { Profile } from '../../profile/types'

// Confirm the save and link to the pages that use the profile.
export function ProfileSaved({ district, topics }: Pick<Profile, 'district' | 'topics'>) {
  return (
    <div className="onboard-done">
      <h2>Profile saved</h2>
      <p>
        {district ? `Your dashboard shows bills for ${districtHeading(district.state, district.district)}` : 'Your dashboard is ready'}
        {topics.length > 0 ? ' and bills on your topics' : ''}.
      </p>
      <div className="onboard-done__actions">
        <Link to="/" className="btn btn--primary">Go to my dashboard</Link>
        <Link to="/social" className="btn btn--secondary">Open the Social page</Link>
      </div>
    </div>
  )
}
