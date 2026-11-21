import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { SessionProvider } from './auth/SessionProvider'
import { ProfileProvider } from './profile/ProfileContext'
import { LoadingState } from './components/ui/LoadingState'
import AboutPage from './pages/AboutPage'
import BillDetailPage from './pages/BillDetailPage'
import BillsPage from './pages/BillsPage'
import DashboardPage from './pages/DashboardPage'
import MemberDetailPage from './pages/MemberDetailPage'
import MembersPage from './pages/MembersPage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingPage from './pages/OnboardingPage'
import SocialPage from './pages/SocialPage'

const SignInPage = lazy(() => import('./pages/SignInPage'))

// Render application routes with the shared header and footer.
export default function App() {
  return (
    <SessionProvider>
      <ProfileProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="bills" element={<BillsPage />} />
              <Route path="bills/:congress/:type/:number" element={<BillDetailPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="members/:bioguideId" element={<MemberDetailPage />} />
              <Route path="social" element={<SocialPage />} />
              <Route path="onboarding" element={<OnboardingPage />} />
              <Route path="sign-in" element={
                <Suspense fallback={<LoadingState message="Loading sign-in…" />}>
                  <SignInPage />
                </Suspense>
              } />
              <Route path="about" element={<AboutPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProfileProvider>
    </SessionProvider>
  )
}
