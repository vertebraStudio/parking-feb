export type UserRole = 'admin' | 'user' | 'directivo'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  is_verified: boolean
  created_at: string
  updated_at: string
}

export type BookingStatus = 'confirmed' | 'pending' | 'cancelled'

export interface ParkingSpot {
  id: number
  label: string
  is_blocked: boolean
  is_executive: boolean
  assigned_to: string | null
  is_released: boolean
  created_at: string
  updated_at: string
}

export interface Booking {
  id: number
  user_id: string
  spot_id: number
  date: string
  status: BookingStatus
  created_at: string
  updated_at: string
}

export interface SpotBlock {
  id: number
  spot_id: number
  date: string
  created_by: string
  created_at: string
}
