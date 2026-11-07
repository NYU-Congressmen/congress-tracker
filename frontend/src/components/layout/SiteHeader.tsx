import { Link, NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/constants'
import { CapitolIcon } from '../icons'
import { ThemeToggle } from '../ui/ThemeToggle'

// Show the wordmark and primary navigation.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__main">
        <div className="container site-header__row">
          <Link to="/" className="brand" aria-label="Pull, home">
            <span className="brand__mark">
              <CapitolIcon />
            </span>
            <span className="brand__text">
              <span className="brand__name">Pull</span>
              <span className="brand__tag">Get a seat at the review</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Primary">
            {/* Light/dark toggle sits at the left edge of the nav, before Home */}
            <ThemeToggle />
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
        </div>
      </div>
    </header>
  )
}
