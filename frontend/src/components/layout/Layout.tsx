import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'
import { TabBar } from './TabBar'

// Scroll to the linked section or the top of the new page.
function RouteScroll() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null
    if (target) target.scrollIntoView?.()
    else if (window.scrollY > 0) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

// Shared page shell: header, main content area, footer, and the tab bar that
// takes over navigation on phones. New routes render through the <Outlet />
// below, so the chrome never changes.
export function Layout() {
  return (
    <div className="site-shell">
      <RouteScroll />
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="site-main">
        <Outlet />
      </main>
      <SiteFooter />
      <TabBar />
    </div>
  )
}
