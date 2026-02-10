import { describe, it, expect } from 'vitest'
import { format, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Profile, Booking, BookingStatus, UserRole, ParkingSpot, AppNotification } from '../../types'

describe('Tipos de datos - validación de estructura', () => {
  it('Profile tiene todos los campos requeridos', () => {
    const profile: Profile = {
      id: 'uuid-1',
      email: 'test@example.com',
      full_name: 'Test User',
      role: 'user',
      is_verified: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(profile.id).toBeDefined()
    expect(profile.email).toContain('@')
    expect(['admin', 'user', 'directivo']).toContain(profile.role)
  })

  it('Booking acepta todos los estados válidos', () => {
    const statuses: BookingStatus[] = ['confirmed', 'pending', 'cancelled', 'waitlist']
    statuses.forEach(status => {
      const booking: Booking = {
        id: 1,
        user_id: 'uuid-1',
        spot_id: null,
        date: '2026-01-27',
        status,
        carpool_with_user_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      expect(booking.status).toBe(status)
    })
  })

  it('UserRole solo acepta los roles definidos', () => {
    const validRoles: UserRole[] = ['admin', 'user', 'directivo']
    validRoles.forEach(role => {
      expect(['admin', 'user', 'directivo']).toContain(role)
    })
  })

  it('ParkingSpot puede tener assigned_to null', () => {
    const spot: ParkingSpot = {
      id: 1,
      label: 'A1',
      is_blocked: false,
      is_executive: false,
      assigned_to: null,
      is_released: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(spot.assigned_to).toBeNull()
    expect(spot.is_blocked).toBe(false)
  })

  it('AppNotification tiene estructura correcta', () => {
    const notification: AppNotification = {
      id: 'notif-1',
      user_id: 'uuid-1',
      type: 'booking_confirmed',
      title: 'Reserva confirmada',
      body: 'Tu reserva ha sido confirmada',
      data: { bookingId: 123 },
      read_at: null,
      created_at: new Date().toISOString(),
    }
    expect(notification.read_at).toBeNull()
    expect(notification.data).toHaveProperty('bookingId')
  })
})

describe('Lógica de fechas (date-fns)', () => {
  it('startOfWeek con weekStartsOn: 1 devuelve lunes', () => {
    // 27 enero 2026 es martes
    const tuesday = new Date(2026, 0, 27)
    const monday = startOfWeek(tuesday, { weekStartsOn: 1 })
    expect(monday.getDay()).toBe(1) // 1 = lunes
    expect(monday.getDate()).toBe(26) // 26 enero 2026
  })

  it('genera los 5 días laborables de la semana (L-V)', () => {
    const monday = startOfWeek(new Date(2026, 0, 27), { weekStartsOn: 1 })
    const weekDays = Array.from({ length: 5 }, (_, i) => addDays(monday, i))
    
    expect(weekDays).toHaveLength(5)
    expect(weekDays[0].getDay()).toBe(1) // lunes
    expect(weekDays[4].getDay()).toBe(5) // viernes
  })

  it('formatea fechas en español correctamente', () => {
    const date = new Date(2026, 0, 27) // 27 enero 2026
    const formatted = format(date, 'd MMM', { locale: es })
    expect(formatted).toBe('27 ene')
  })

  it('formatea fecha de booking yyyy-MM-dd', () => {
    const date = new Date(2026, 0, 27)
    const bookingDate = format(date, 'yyyy-MM-dd')
    expect(bookingDate).toBe('2026-01-27')
    expect(bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('formato de día completo en español', () => {
    const date = new Date(2026, 0, 27) // martes
    const dayName = format(date, 'EEEE, d \'de\' MMMM', { locale: es })
    expect(dayName).toContain('martes')
    expect(dayName).toContain('27')
    expect(dayName).toContain('enero')
  })
})
