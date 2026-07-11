import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import type { MyBooking } from '../api/types'
import { Button, Card, Badge, Spinner, Empty, Textarea, ErrorText } from '../components/ui'
import { money, dateTime, timeOnly } from '../lib/format'

type Scope = 'upcoming' | 'past'

export default function MyBookingsPage() {
  const [scope, setScope] = useState<Scope>('upcoming')
  const query = useQuery({
    queryKey: ['my-bookings', scope],
    queryFn: () => api.get<MyBooking[]>(`/me/bookings?scope=${scope}`),
  })

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold text-slate-900">My bookings</h1>

      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {(['upcoming', 'past'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              scope === s ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-brand-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : (query.data?.length ?? 0) === 0 ? (
        <Empty>No {scope} bookings.</Empty>
      ) : (
        <div className="space-y-3">
          {query.data!.map((b) => (
            <BookingRow key={b.id} booking={b} scope={scope} />
          ))}
        </div>
      )}
    </div>
  )
}

function BookingRow({ booking, scope }: { booking: MyBooking; scope: Scope }) {
  const qc = useQueryClient()
  const [reviewing, setReviewing] = useState(false)

  const cancel = useMutation({
    mutationFn: () => api.patch(`/bookings/${booking.id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bookings'] }),
  })

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{booking.venue_name}</h3>
            <Badge>{booking.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {booking.court_name} · {booking.sport}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {dateTime(booking.start_time)} – {timeOnly(booking.end_time)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-slate-900">{money(booking.price_snapshot)}</p>
          <div className="mt-2 flex justify-end gap-2">
            {scope === 'upcoming' && booking.status === 'confirmed' && (
              <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancel
              </Button>
            )}
            {booking.status === 'completed' && !reviewing && (
              <Button variant="secondary" onClick={() => setReviewing(true)}>
                Leave review
              </Button>
            )}
          </div>
        </div>
      </div>

      {cancel.error instanceof ApiError && <ErrorText>{cancel.error.message}</ErrorText>}
      {reviewing && <ReviewForm bookingId={booking.id} onDone={() => setReviewing(false)} />}
    </Card>
  )
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  const submit = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId}/review`, { rating, comment: comment || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] })
      onDone()
    },
  })

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`text-2xl leading-none ${n <= rating ? 'text-amber-400' : 'text-slate-300'}`}
            aria-label={`${n} stars`}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        rows={2}
        placeholder="Share your experience (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="mt-3 flex gap-2">
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : 'Submit review'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {submit.error instanceof ApiError && <ErrorText>{submit.error.message}</ErrorText>}
    </div>
  )
}
