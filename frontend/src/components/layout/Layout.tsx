import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'

// Return to the top of the page whenever the route changes. The scrollY
// check keeps the call a no-op at the top of the page and in test
// environments that do not implement scrolling.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Shared page shell: banner, header, main content area and footer.
// New routes render through the <Outlet /> below, so the chrome never changes.
export function Layout() {
  return (
    <div className="site-shell">
      <ScrollToTop />
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" className="site-main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
