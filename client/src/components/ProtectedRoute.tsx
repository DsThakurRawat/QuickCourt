import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from './ui'
import type { Role } from '../api/types'

export default function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        You don’t have access to this page.
      </div>
    )
  }
  return <Outlet />
}
