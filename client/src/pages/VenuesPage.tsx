import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, qs } from '../api/client'
import type { Venue } from '../api/types'
import { Button, Card, Input, Label, Select, Spinner, Stars, Empty } from '../components/ui'

interface Filters {
  sport: string
  max_price: string
  min_rating: string
}

const SPORTS = ['', 'Basketball', 'Tennis', 'Padel', 'Squash', 'Soccer']

export default function VenuesPage() {
  const [filters, setFilters] = useState<Filters>({ sport: '', max_price: '', min_rating: '' })
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['venues', filters, page],
    queryFn: () =>
      api.get<Venue[]>(
        `/venues${qs({
          sport: filters.sport || undefined,
          max_price: filters.max_price || undefined,
          min_rating: filters.min_rating || undefined,
          page,
        })}`,
      ),
    placeholderData: keepPreviousData,
  })

  function update<K extends keyof Filters>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  const venues = query.data ?? []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Find a court</h1>
        <p className="mt-1 text-slate-500">Browse approved venues and book your slot in seconds.</p>
      </div>

      <Card className="mb-6 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Sport</Label>
            <Select value={filters.sport} onChange={(e) => update('sport', e.target.value)}>
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s || 'Any sport'}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Max price / hour</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 60"
              value={filters.max_price}
              onChange={(e) => update('max_price', e.target.value)}
            />
          </div>
          <div>
            <Label>Min rating</Label>
            <Select value={filters.min_rating} onChange={(e) => update('min_rating', e.target.value)}>
              <option value="">Any rating</option>
              <option value="4">4★ & up</option>
              <option value="3">3★ & up</option>
              <option value="2">2★ & up</option>
            </Select>
          </div>
        </div>
      </Card>

      {query.isLoading ? (
        <Spinner />
      ) : venues.length === 0 ? (
        <Empty>No venues match your filters.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((v) => (
            <Link key={v.id} to={`/venues/${v.id}`}>
              <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-md">
                <h2 className="text-lg font-semibold text-slate-900">{v.name}</h2>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-500">{v.description}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{v.court_count ?? 0} courts</span>
                  <span className="flex items-center gap-1">
                    <Stars rating={Number(v.average_rating ?? 0)} />
                    <span className="text-slate-400">{Number(v.average_rating ?? 0).toFixed(1)}</span>
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-center gap-4">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-sm text-slate-500">Page {page}</span>
        <Button variant="secondary" disabled={venues.length < 10} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}
