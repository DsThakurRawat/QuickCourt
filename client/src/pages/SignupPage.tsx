import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Input, Label, ErrorText } from '../components/ui'
import type { Role } from '../api/types'

export default function SignupPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Extract<Role, 'user' | 'owner'>>('user')

  const signup = useMutation({
    mutationFn: () => api.post('/auth/signup', { email, password, role }),
    onSuccess: () => {
      refresh()
      navigate(role === 'owner' ? '/owner' : '/')
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    signup.mutate()
  }

  const error = signup.error instanceof ApiError ? signup.error.message : signup.error ? 'Something went wrong' : null

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Create your account</h1>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <Label>I want to</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['user', 'owner'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    role === r
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-300 text-slate-600 hover:border-brand-300'
                  }`}
                >
                  {r === 'user' ? 'Book courts' : 'List my venue'}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={signup.isPending}>
            {signup.isPending ? 'Creating…' : 'Sign up'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
