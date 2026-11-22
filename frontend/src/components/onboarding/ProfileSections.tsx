import { Link } from 'react-router-dom'
import { PROFILE_SECTIONS, type ProfileSection } from '../../profile/types'

// Link to each editable section in any order.
export function ProfileSections({ active, saving }: { active?: ProfileSection; saving?: boolean }) {
  return (
    <nav aria-label="Profile sections">
      <ul className="onboard-steps">
        {Object.entries(PROFILE_SECTIONS).map(([section, label]) => (
          <li key={section}>
            <Link
              to={`/profile?section=${section}`}
              aria-current={active === section ? 'page' : undefined}
              aria-disabled={saving || undefined}
              onClick={saving ? (event) => event.preventDefault() : undefined}
              className={`onboard-steps__item${active === section ? ' is-current' : ''}`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
