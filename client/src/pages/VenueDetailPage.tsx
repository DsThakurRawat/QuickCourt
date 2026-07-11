import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { VenueDetail, Availability, Court } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Card, Label, Select, Spinner, Stars, Empty, ErrorText, Badge } from '../components/ui'
import { money, timeOnly, dateOnly, todayISO } from '../lib/format'

export default function VenueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const query = useQuery({
    queryKey: ['venue', id],
    queryFn: () => api.get<VenueDetail>(`/venues/${id}`),
  })

  if (query.isLoading) return <Spinner />
  if (query.error || !query.data)
    return <Empty>Venue not found or not yet approved.</Empty>

  const { venue, photos, courts, reviews } = query.data
  const avgRating = Number(venue.average_rating ?? 0)

  return (
    <div>
      <Link to="/" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← Back to venues
      </Link>

      {photos.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2 overflow-hidden rounded-xl md:grid-cols-4">
          {photos.slice(0, 4).map((p, i) => (
            <img
              key={i}
              src={p.url}
              alt=""
              className={`h-40 w-full object-cover ${i === 0 ? 'col-span-2 row-span-2 h-full md:h-80' : ''}`}
            />
          ))}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{venue.name}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <Stars rating={avgRating} />
          <span>{avgRating.toFixed(1)}</span>
          <span>·</span>
          <span>{courts.length} courts</span>
        </div>
        <p className="mt-3 max-w-2xl text-slate-600">{venue.description}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BookingWidget courts={courts} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Reviews</h2>
          {reviews.length === 0 ? (
            <Empty>No reviews yet.</Empty>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <Stars rating={r.rating} />
                    <span className="text-xs text-slate-400">{dateOnly(r.created_at)}</span>
                  </div>
                  {r.comment && <p className="mt-2 text-sm text-slate-600">{r.comment}</p>}
                  <p className="mt-2 text-xs text-slate-400">{r.email}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BookingWidget({ courts }: { courts: Court[] }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courtId, setCourtId] = useState(courts[0]?.id ?? '')
  const [date, setDate] = useState(todayISO())
  const [notice, setNotice] = useState<string | null>(null)

  const availability = useQuery({
    queryKey: ['availability', courtId, date],
    queryFn: () => api.get<Availability>(`/courts/${courtId}/availability?date_str=${date}`),
    enabled: !!courtId,
  })

  const book = useMutation({
    mutationFn: (slot: string) => {
      const start = new Date(slot)
      const end = new Date(start.getTime() + 60 * 60 * 1000)
      return api.post<{ booking_id: string }>('/bookings', {
        court_id: courtId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      })
    },
    onSuccess: () => {
      setNotice(null)
      navigate('/my-bookings')
    },
    onError: (err) => {
      setNotice(err instanceof ApiError ? err.message : 'Could not book that slot')
      availability.refetch()
    },
  })

  const selectedCourt = courts.find((c) => c.id === courtId)

  if (courts.length === 0) return <Empty>This venue has no courts yet.</Empty>

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Book a slot</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Court</Label>
          <Select
            value={courtId}
            onChange={(e) => {
              setCourtId(e.target.value)
              setNotice(null)
            }}
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.sport} · {money(c.price_per_hour)}/hr
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <input
            type="date"
            value={date}
            min={todayISO()}
            onChange={(e) => {
              setDate(e.target.value)
              setNotice(null)
            }}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {selectedCourt && (
        <p className="mt-3 text-sm text-slate-500">
          Open {selectedCourt.open_time.slice(0, 5)}–{selectedCourt.close_time.slice(0, 5)} ·{' '}
          <Badge>{selectedCourt.sport}</Badge>
        </p>
      )}

      <div className="mt-5">
        {availability.isLoading ? (
          <Spinner />
        ) : (availability.data?.available_slots.length ?? 0) === 0 ? (
          <Empty>No open slots on this date.</Empty>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {availability.data!.available_slots.map((slot) => (
              <button
                key={slot}
                disabled={book.isPending}
                onClick={() => {
                  if (!user) {
                    navigate('/login')
                    return
                  }
                  book.mutate(slot)
                }}
                className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-50"
              >
                {timeOnly(slot)}
              </button>
            ))}
          </div>
        )}
      </div>

      <ErrorText>{notice}</ErrorText>
      {!user && <p className="mt-3 text-sm text-slate-500">Log in to reserve a slot.</p>}
    </Card>
  )
}
