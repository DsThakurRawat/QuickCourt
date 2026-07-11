import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Input, Label, ErrorText } from '../components/ui'

export default function LoginPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => api.post('/auth/login', { email, password }),
    onSuccess: () => {
      refresh()
      navigate('/')
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate()
  }

  const error = login.error instanceof ApiError ? login.error.message : login.error ? 'Something went wrong' : null

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Welcome back</h1>
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Logging in…' : 'Log in'}
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-500">
        No account?{' '}
        <Link to="/signup" className="font-medium text-brand-700 hover:underline">
          Sign up
        </Link>
      </p>
      <p className="mt-6 text-center text-xs text-slate-400">
        Demo: admin@quickcourt.com / owner1@quickcourt.com / user1@quickcourt.com — password <code>password123</code>
      </p>
    </div>
  )
}
