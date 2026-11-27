import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '../../lib/constants'
import { CapitolIcon, ChevronRightIcon, PeopleIcon } from '../icons'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useProfile } from '../../profile/ProfileContext'
import { initialsOf } from '../../lib/format'
import { districtHeading } from '../../lib/districts'
import { useSession } from '../../auth/SessionContext'
import { loadFirebaseAuth } from '../../auth/firebase'

// Render the wordmark, primary links, account controls and theme switch.
export function SiteHeader() {
  const { user, loading } = useSession()
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
            {!loading && (user ? <ProfileMenu /> : (
              <>
                <Link to="/onboarding" className="site-user" aria-label="Get started">
                  <span className="site-user__avatar" aria-hidden="true"><ChevronRightIcon /></span>
                  <span className="site-user__text">
                    <span className="site-user__name">Get started</span>
                  </span>
                </Link>
                <NavLink to="/sign-in" className="site-user site-user--sign-in">Sign in</NavLink>
              </>
            ))}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}

// Open the signed-in profile and handle sign-out from the header.
function ProfileMenu() {
  const { profile } = useProfile()
  const navigate = useNavigate()
  const disclosure = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const menu = disclosure.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  async function leave() {
    setBusy(true)
    setError(false)
    try {
      const { signOut } = await import('@firebase/auth')
      await signOut(await loadFirebaseAuth())
      navigate('/')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="site-profile" ref={disclosure} onKeyDown={(event) => {
      if (event.key === 'Escape' && event.currentTarget.open) {
        event.currentTarget.open = false
        summary.current?.focus()
      }
    }}>
      <summary className="site-user" ref={summary} aria-label={profile ? `${profile.username} profile options` : 'Account options'}>
        <span className="site-user__avatar" aria-hidden="true">
          {profile ? initialsOf(profile.username) : <PeopleIcon size={17} />}
        </span>
        <span className="site-user__text">
          <span className="site-user__name">{profile?.username ?? 'Account'}</span>
          {profile?.district ? (
            <span className="site-user__district">{districtHeading(profile.district.state, profile.district.district)}</span>
          ) : null}
        </span>
        <ChevronRightIcon size={14} className="site-profile__arrow" />
      </summary>
      <div className="site-profile__panel">
        <Link
          to="/profile"
          className="btn btn--ghost"
          onClick={() => { if (disclosure.current) disclosure.current.open = false }}
        >
          Edit profile
        </Link>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void leave()}>Sign out</button>
        {error ? <p className="form-error" role="alert">Sign-out failed. Try again.</p> : null}
      </div>
    </details>
  )
}
