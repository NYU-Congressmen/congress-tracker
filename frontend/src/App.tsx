import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import AboutPage from './pages/AboutPage'
import BillDetailPage from './pages/BillDetailPage'
import BillsPage from './pages/BillsPage'
import DashboardPage from './pages/DashboardPage'
import MemberDetailPage from './pages/MemberDetailPage'
import MembersPage from './pages/MembersPage'
import NotFoundPage from './pages/NotFoundPage'

// Every route renders through the shared Layout, so the header, footer and
// banner stay consistent. Add a new tracking category by registering a page
// here and an entry in NAV_ITEMS.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="bills/:congress/:type/:number" element={<BillDetailPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="members/:bioguideId" element={<MemberDetailPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
