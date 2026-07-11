export type Role = 'user' | 'owner' | 'admin'
export type VenueStatus = 'pending' | 'approved' | 'rejected'
export type BookingStatus = 'confirmed' | 'completed' | 'cancelled'

export interface User {
  id: string
  email: string
  role: Role
  is_banned: boolean
}

export interface Venue {
  id: string
  owner_id: string
  name: string
  description: string | null
  status: VenueStatus
  court_count?: number | null
  average_rating?: number | null
}

export interface Photo {
  url: string
  display_order: number
}

export interface Court {
  id: string
  name: string
  sport: string
  price_per_hour: number
  open_time: string
  close_time: string
}

export interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  email: string
}

export interface VenueDetail {
  venue: Venue
  photos: Photo[]
  courts: Court[]
  reviews: Review[]
}

export interface Availability {
  court_id: string
  date: string
  price_per_hour: number
  available_slots: string[]
}

export interface MyBooking {
  id: string
  start_time: string
  end_time: string
  status: BookingStatus
  price_snapshot: number
  court_name: string
  sport: string
  venue_name: string
}

export interface EarningPoint {
  date: string
  earnings: number
}

export interface PlatformStats {
  users: number
  completed_bookings: number
  approved_venues: number
}
