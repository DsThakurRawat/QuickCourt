import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { Venue, User, PlatformStats } from '../api/types'
import { Button, Card, Input, Badge, Spinner, Empty, ErrorText } from '../components/ui'

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-slate-900">Admin console</h1>
      <StatsPanel />
      <PendingVenues />
      <UsersPanel />
    </div>
  )
}

function StatsPanel() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api.get<PlatformStats>('/admin/stats') })
  if (stats.isLoading) return <Spinner />
  const s = stats.data
  const tiles = [
    { label: 'Users', value: s?.users ?? 0 },
    { label: 'Completed bookings', value: s?.completed_bookings ?? 0 },
    { label: 'Approved venues', value: s?.approved_venues ?? 0 },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <Card key={t.label} className="p-5">
          <p className="text-sm text-slate-500">{t.label}</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{t.value}</p>
        </Card>
      ))}
    </div>
  )
}

function PendingVenues() {
  const qc = useQueryClient()
  const pending = useQuery({ queryKey: ['pending-venues'], queryFn: () => api.get<Venue[]>('/admin/venues/pending') })

  const decide = useMutation({
    mutationFn: (v: { id: string; status: 'approved' | 'rejected'; comment: string }) =>
      api.patch(`/admin/venues/${v.id}/status`, { status: v.status, comment: v.comment || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-venues'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-slate-900">Pending venues</h2>
      {pending.isLoading ? (
        <Spinner />
      ) : (pending.data?.length ?? 0) === 0 ? (
        <Empty>No venues awaiting approval.</Empty>
      ) : (
        <div className="space-y-3">
          {pending.data!.map((v) => (
            <PendingRow key={v.id} venue={v} onDecide={(status, comment) => decide.mutate({ id: v.id, status, comment })} pending={decide.isPending} />
          ))}
        </div>
      )}
      {decide.error instanceof ApiError && <ErrorText>{decide.error.message}</ErrorText>}
    </section>
  )
}

function PendingRow({
  venue,
  onDecide,
  pending,
}: {
  venue: Venue
  onDecide: (status: 'approved' | 'rejected', comment: string) => void
  pending: boolean
}) {
  const [comment, setComment] = useState('')
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-900">{venue.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{venue.description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:w-80">
          <Input placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => onDecide('approved', comment)} disabled={pending}>
              Approve
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => onDecide('rejected', comment)} disabled={pending}>
              Reject
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function UsersPanel() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<User[]>('/admin/users') })

  const ban = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/users/${id}/ban`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-slate-900">Users</h2>
      {users.isLoading ? (
        <Spinner />
      ) : (
        <Card className="divide-y divide-slate-100">
          {users.data!.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-slate-800">{u.email}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge>{u.role}</Badge>
                  {u.is_banned && <Badge>cancelled</Badge>}
                </div>
              </div>
              <Button
                variant={u.is_banned ? 'secondary' : 'danger'}
                onClick={() => ban.mutate(u.id)}
                disabled={ban.isPending}
              >
                {u.is_banned ? 'Unban' : 'Ban'}
              </Button>
            </div>
          ))}
        </Card>
      )}
    </section>
  )
}
