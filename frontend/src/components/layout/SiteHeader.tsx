import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/constants'
import { CapitolIcon } from '../icons'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useProfile } from '../../profile/ProfileContext'
import { initialsOf } from '../../lib/format'
import { districtHeading } from '../../lib/districts'

// The floating glass bar: wordmark, primary navigation and the theme toggle.
// On phones the links move to the tab bar at the bottom of the screen.
export function SiteHeader() {
  const { profile } = useProfile()
  return (
    <header className="site-header">
      <div className="container">
        <div className="site-header__bar glass">
          <Link to="/" className="brand" aria-label="Pull, home">
            <CapitolIcon size={24} />
            <span className="brand__name">Pull</span>
            <span className="brand__tag">Get a seat at the review</span>
          </Link>
          <nav className="site-nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `site-nav__link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="site-header__end">
            {profile ? (
              <Link to="/onboarding" className="site-user" title="Edit your profile">
                <span className="site-user__avatar" aria-hidden="true">
                  {initialsOf(profile.username)}
                </span>
                <span className="site-user__text">
                  <span className="site-user__name">{profile.username}</span>
                  {profile.district ? (
                    <span className="site-user__district">{districtHeading(profile.district.state, profile.district.district)}</span>
                  ) : null}
                </span>
              </Link>
            ) : (
              <Link to="/onboarding" className="btn btn--ink btn--sm site-user-cta">
                Get started
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
