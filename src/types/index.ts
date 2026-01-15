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

export type BookingStatus = 'confirmed' | 'pending' | 'cancelled' | 'waitlist'

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
  spot_id: number | null // Ahora puede ser null para el nuevo modelo
  date: string
  status: BookingStatus
  carpool_with_user_id: string | null // Usuario con el que va en coche (carpooling)
  created_at: string
  updated_at: string
}

export interface WaitlistEntry {
  id: number
  user_id: string
  date: string
  position: number
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
