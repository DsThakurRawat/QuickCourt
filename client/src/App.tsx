import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import VenuesPage from './pages/VenuesPage'
import VenueDetailPage from './pages/VenueDetailPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import MyBookingsPage from './pages/MyBookingsPage'
import OwnerPage from './pages/OwnerPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<VenuesPage />} />
        <Route path="venues/:id" element={<VenueDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="my-bookings" element={<MyBookingsPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={['owner', 'admin']} />}>
          <Route path="owner" element={<OwnerPage />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<div className="py-20 text-center text-slate-500">Page not found.</div>} />
      </Route>
    </Routes>
  )
}
