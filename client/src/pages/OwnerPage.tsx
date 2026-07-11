import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { Venue, Court, EarningPoint } from '../api/types'
import { Button, Card, Input, Label, Select, Badge, Spinner, Empty, ErrorText } from '../components/ui'
import { money } from '../lib/format'

export default function OwnerPage() {
  const venues = useQuery({ queryKey: ['my-venues'], queryFn: () => api.get<Venue[]>('/me/venues') })

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-slate-900">Owner console</h1>

      <EarningsPanel />

      <section>
        <h2 className="mb-3 text-xl font-semibold text-slate-900">Add a venue</h2>
        <CreateVenueForm />
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-slate-900">My venues</h2>
        {venues.isLoading ? (
          <Spinner />
        ) : (venues.data?.length ?? 0) === 0 ? (
          <Empty>You haven’t added any venues yet.</Empty>
        ) : (
          <div className="space-y-4">
            {venues.data!.map((v) => (
              <VenueCard key={v.id} venue={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EarningsPanel() {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<{ earnings: EarningPoint[] }>('/me/dashboard') })
  const points = dash.data?.earnings ?? []
  const total = points.reduce((sum, p) => sum + Number(p.earnings), 0)
  const max = Math.max(1, ...points.map((p) => Number(p.earnings)))

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Earnings (last 30 days)</h2>
        <span className="text-2xl font-bold text-brand-700">{money(total)}</span>
      </div>
      {dash.isLoading ? (
        <Spinner />
      ) : points.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No completed bookings yet.</p>
      ) : (
        <div className="mt-5 flex h-32 items-end gap-1">
          {[...points].reverse().map((p) => (
            <div key={p.date} className="flex flex-1 flex-col items-center gap-1" title={`${p.date}: ${money(p.earnings)}`}>
              <div
                className="w-full rounded-t bg-brand-400"
                style={{ height: `${(Number(p.earnings) / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function CreateVenueForm() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => api.post('/venues', { name, description: description || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-venues'] })
      setName('')
      setDescription('')
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    create.mutate()
  }

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Venue name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create venue (pending approval)'}
          </Button>
          {create.error instanceof ApiError && <ErrorText>{create.error.message}</ErrorText>}
        </div>
      </form>
    </Card>
  )
}

function VenueCard({ venue }: { venue: Venue }) {
  const [open, setOpen] = useState(false)
  const courts = useQuery({
    queryKey: ['venue-courts', venue.id],
    queryFn: () => api.get<Court[]>(`/me/venues/${venue.id}/courts`),
    enabled: open,
  })

  return (
    <Card className="p-5">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{venue.name}</h3>
            <Badge>{venue.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{venue.description}</p>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Courts</h4>
          {courts.isLoading ? (
            <Spinner />
          ) : (courts.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">No courts yet.</p>
          ) : (
            <div className="space-y-3">
              {courts.data!.map((c) => (
                <CourtRow key={c.id} court={c} />
              ))}
            </div>
          )}
          <div className="mt-5">
            <AddCourtForm venueId={venue.id} />
          </div>
        </div>
      )}
    </Card>
  )
}

function CourtRow({ court }: { court: Court }) {
  const [blocking, setBlocking] = useState(false)
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium text-slate-800">{court.name}</span>{' '}
          <span className="text-slate-500">
            · {court.sport} · {money(court.price_per_hour)}/hr · {court.open_time.slice(0, 5)}–
            {court.close_time.slice(0, 5)}
          </span>
        </div>
        <Button variant="ghost" onClick={() => setBlocking((b) => !b)}>
          {blocking ? 'Close' : 'Block time'}
        </Button>
      </div>
      {blocking && <BlockForm courtId={court.id} onDone={() => setBlocking(false)} />}
    </div>
  )
}

function AddCourtForm({ venueId }: { venueId: string }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', sport: 'Tennis', price_per_hour: '40', open_time: '08:00', close_time: '22:00' })

  const create = useMutation({
    mutationFn: () =>
      api.post(`/venues/${venueId}/courts`, {
        name: form.name,
        sport: form.sport,
        price_per_hour: Number(form.price_per_hour),
        open_time: form.open_time,
        close_time: form.close_time,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venue-courts', venueId] })
      setForm((f) => ({ ...f, name: '' }))
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
      className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-5"
    >
      <div className="sm:col-span-2">
        <Label>Court name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div>
        <Label>Sport</Label>
        <Select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })}>
          {['Basketball', 'Tennis', 'Padel', 'Squash', 'Soccer'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Price/hr</Label>
        <Input type="number" min={0} value={form.price_per_hour} onChange={(e) => setForm({ ...form, price_per_hour: e.target.value })} required />
      </div>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={create.isPending}>
          Add
        </Button>
      </div>
      <div>
        <Label>Opens</Label>
        <Input type="time" value={form.open_time} onChange={(e) => setForm({ ...form, open_time: e.target.value })} />
      </div>
      <div>
        <Label>Closes</Label>
        <Input type="time" value={form.close_time} onChange={(e) => setForm({ ...form, close_time: e.target.value })} />
      </div>
      {create.error instanceof ApiError && (
        <div className="sm:col-span-5">
          <ErrorText>{create.error.message}</ErrorText>
        </div>
      )}
    </form>
  )
}

function BlockForm({ courtId, onDone }: { courtId: string; onDone: () => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.post(`/courts/${courtId}/blocks`, {
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
      }),
    onSuccess: onDone,
  })

  return (
    <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
      <div>
        <Label>From</Label>
        <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div>
        <Label>To</Label>
        <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="flex items-end">
        <Button variant="danger" className="w-full" onClick={() => create.mutate()} disabled={!start || !end || create.isPending}>
          Block
        </Button>
      </div>
      {create.error instanceof ApiError && (
        <div className="sm:col-span-3">
          <ErrorText>{create.error.message}</ErrorText>
        </div>
      )}
    </div>
  )
}
