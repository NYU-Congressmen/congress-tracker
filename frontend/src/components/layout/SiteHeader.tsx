import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/constants'
import { CapitolIcon } from '../icons'
import { ThemeToggle } from '../ui/ThemeToggle'

// The floating glass bar: wordmark, primary navigation and the theme toggle.
// On phones the links move to the tab bar at the bottom of the screen.
export function SiteHeader() {
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
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  )
}
