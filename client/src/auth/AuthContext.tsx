import { createContext, useContext } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { User } from '../api/types'

interface AuthState {
  user: User | null
  isLoading: boolean
  refresh: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

async function fetchMe(): Promise<User | null> {
  try {
    return await api.get<User>('/auth/me')
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null
    throw err
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  })

  const value: AuthState = {
    user: data ?? null,
    isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
  }
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
