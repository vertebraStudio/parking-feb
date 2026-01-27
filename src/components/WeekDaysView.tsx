import { format, addDays, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, Users, Clock, ChevronRight, UserPlus, Lock } from 'lucide-react'
import { Booking, Profile, SpotBlock } from '../types'
import { cn } from '../lib/utils'

interface WeekDaysViewProps {
  bookings: (Booking & { user?: Profile })[]
  userBookings: Booking[]
  userId?: string
  weekMonday: Date // Lunes de la semana a mostrar
  onDayClick: (date: string) => void
  onRequestBooking: (date: string) => void
  onJoinWaitlist?: (date: string) => void
  spotBlocks?: SpotBlock[]
}

const MAX_SPOTS_PER_DAY = 8

export default function WeekDaysView({
  bookings,
  userBookings,
  userId,
  weekMonday,
  onDayClick,
  onRequestBooking,
  onJoinWaitlist,
  spotBlocks = [],
}: WeekDaysViewProps) {
  // Obtener los días de la semana seleccionada (lunes a viernes)
  const getWeekDays = (): Date[] => {
    const monday = new Date(weekMonday)
    const weekDays: Date[] = []
    
    for (let i = 0; i < 5; i++) {
      weekDays.push(addDays(monday, i))
    }
    
    return weekDays
  }

  const weekDays = getWeekDays()

  // Contar plazas bloqueadas para un día (solo plazas normales, IDs 1-8)
  const getBlockedSpotsCount = (date: string): number => {
    const dateString = format(new Date(date), 'yyyy-MM-dd')
    // Solo contar bloqueos de plazas normales (IDs 1-8)
    return spotBlocks.filter(
      block => block.date === dateString && block.spot_id >= 1 && block.spot_id <= 8
    ).length
  }

  // Contar reservas confirmadas para un día (excluyendo directivos)
  // Solo contamos las confirmadas, las waitlist no ocupan plaza
  const getBookingsCount = (date: string): number => {
    const dateString = format(new Date(date), 'yyyy-MM-dd')
    return bookings.filter(
      b => b.date === dateString && 
           b.status !== 'cancelled' &&
           b.status === 'confirmed' &&
           // Excluir reservas de directivos (tienen su propio cupo nominal)
           b.user?.role !== 'directivo'
    ).length
  }

  // Obtener plazas disponibles (8 menos las bloqueadas)
  const getAvailableSpots = (date: string): number => {
    return MAX_SPOTS_PER_DAY - getBlockedSpotsCount(date)
  }

  // Verificar si el usuario tiene reserva para un día
  const hasUserBooking = (date: string): boolean => {
    if (!userId) return false
    const dateString = format(new Date(date), 'yyyy-MM-dd')
    return userBookings.some(
      b => b.date === dateString && b.status !== 'cancelled'
    )
  }

  // Obtener el estado de la reserva del usuario
  const getUserBookingStatus = (date: string): 'confirmed' | 'pending' | 'waitlist' | null => {
    if (!userId) return null
    const dateString = format(new Date(date), 'yyyy-MM-dd')
    const booking = userBookings.find(
      b => b.date === dateString && b.status !== 'cancelled'
    )
    return booking?.status === 'confirmed' ? 'confirmed' : 
           booking?.status === 'pending' ? 'pending' :
           booking?.status === 'waitlist' ? 'waitlist' : null
  }

  // Contar cuántos están en lista de espera para un día (excluyendo directivos)
  const getWaitlistCount = (date: string): number => {
    const dateString = format(new Date(date), 'yyyy-MM-dd')
    return bookings.filter(
      b => b.date === dateString && 
           b.status === 'waitlist' &&
           // Excluir directivos de la lista de espera
           b.user?.role !== 'directivo'
    ).length
  }

  // Verificar si está lleno (considerando plazas bloqueadas)
  const isFull = (date: string): boolean => {
    const availableSpots = getAvailableSpots(date)
    return getBookingsCount(date) >= availableSpots
  }

  // Verificar si es un día pasado
  const isPastDate = (date: Date): boolean => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  return (
    <div className="space-y-3">
      {weekDays.map((day) => {
        const dateString = format(day, 'yyyy-MM-dd')
        const dayName = format(day, 'EEEE', { locale: es })
        const isToday = isSameDay(day, new Date())
        const isPast = isPastDate(day)
        const bookingsCount = getBookingsCount(dateString)
        const blockedSpotsCount = getBlockedSpotsCount(dateString)
        const availableSpots = getAvailableSpots(dateString)
        const waitlistCount = getWaitlistCount(dateString)
        const hasBooking = hasUserBooking(dateString)
        const bookingStatus = getUserBookingStatus(dateString)
        const full = isFull(dateString)
        const isInWaitlist = bookingStatus === 'waitlist'

        return (
          <div
            key={dateString}
            className={cn(
              "bg-white rounded-[20px] border p-4 transition-all duration-200",
              isPast && "opacity-60 grayscale",
              hasBooking && bookingStatus === 'confirmed' && "border-orange-500 bg-orange-50",
              hasBooking && bookingStatus === 'pending' && "border-amber-400 bg-amber-50",
              hasBooking && bookingStatus === 'waitlist' && "border-purple-400 bg-purple-50",
              !hasBooking && !isPast && "border-gray-200 hover:border-gray-300 cursor-pointer",
              full && !hasBooking && "border-red-200 bg-red-50"
            )}
            onClick={() => !isPast && onDayClick(dateString)}
          >
            <div className="flex items-center justify-between">
              {/* Información del día */}
              <div className="flex items-center gap-3 flex-1">
                <div className="flex-shrink-0">
                  {hasBooking && bookingStatus === 'waitlist' ? (
                    <Clock 
                      className={cn(
                        "w-6 h-6",
                        isPast ? "text-gray-400" : "text-purple-600"
                      )} 
                      strokeWidth={2.5} 
                    />
                  ) : (
                    <Calendar 
                      className={cn(
                        "w-6 h-6",
                        isPast ? "text-gray-400" :
                        hasBooking && bookingStatus === 'confirmed' ? "text-orange-600" :
                        hasBooking && bookingStatus === 'pending' ? "text-amber-600" :
                        full ? "text-red-500" :
                        "text-gray-600"
                      )} 
                      strokeWidth={2.5} 
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 
                      className={cn(
                        "text-lg font-bold",
                        isPast ? "text-gray-500" :
                        hasBooking ? "text-gray-900" :
                        "text-gray-900"
                      )}
                      style={{ 
                        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                      }}
                    >
                      {dayName.charAt(0).toUpperCase() + dayName.slice(1)}
                    </h3>
                    {isToday && (
                      <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-green-100 text-green-700">
                        Hoy
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {format(day, 'd MMMM yyyy', { locale: es })}
                  </p>
                  {blockedSpotsCount > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Lock className="w-3 h-3 text-gray-500" strokeWidth={2} />
                      <span className="text-xs text-gray-500">
                        {blockedSpotsCount} {blockedSpotsCount === 1 ? 'plaza bloqueada' : 'plazas bloqueadas'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Estado y acciones */}
              <div className="flex items-center gap-3">
                {/* Contador de plazas */}
                <div className="text-right">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users 
                      className={cn(
                        "w-4 h-4",
                        isPast ? "text-gray-400" :
                        full ? "text-red-500" :
                        "text-gray-600"
                      )} 
                      strokeWidth={2.5} 
                    />
                    <span 
                      className={cn(
                        "text-sm font-semibold",
                        isPast ? "text-gray-500" :
                        full ? "text-red-600" :
                        "text-gray-700"
                      )}
                    >
                      {bookingsCount}/{availableSpots}
                    </span>
                  </div>
                  {hasBooking && (
                    <div className="flex items-center gap-1">
                      {bookingStatus === 'pending' ? (
                        <Clock className="w-3 h-3 text-amber-600" strokeWidth={2.5} />
                      ) : bookingStatus === 'waitlist' ? (
                        <UserPlus className="w-3 h-3 text-purple-600" strokeWidth={2.5} />
                      ) : null}
                      <span 
                        className={cn(
                          "text-xs font-medium",
                          bookingStatus === 'pending' ? "text-amber-600" :
                          bookingStatus === 'waitlist' ? "text-purple-600" :
                          "text-orange-600"
                        )}
                      >
                        {bookingStatus === 'pending' ? 'Pendiente' :
                         bookingStatus === 'waitlist' ? 'En lista de espera' :
                         'Tienes plaza'}
                      </span>
                    </div>
                  )}
                  {waitlistCount > 0 && !isInWaitlist && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <UserPlus className="w-3 h-3 text-purple-500" strokeWidth={2.5} />
                      <span className="text-xs font-medium text-purple-600">
                        {waitlistCount} en espera
                      </span>
                    </div>
                  )}
                </div>

                {/* Botón de acción o flecha */}
                {!isPast && (
                  <div className="flex-shrink-0">
                    {hasBooking ? (
                      <ChevronRight 
                        className="w-5 h-5 text-gray-400" 
                        strokeWidth={2.5} 
                      />
                    ) : full ? (
                      isInWaitlist ? (
                        <ChevronRight 
                          className="w-5 h-5 text-purple-400" 
                          strokeWidth={2.5} 
                        />
                      ) : onJoinWaitlist ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onJoinWaitlist(dateString)
                          }}
                          className="px-3 py-1.5 rounded-[12px] bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 transition-colors"
                        >
                          Lista de espera
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-red-600">
                          Lleno
                        </span>
                      )
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestBooking(dateString)
                        }}
                        className="px-4 py-2 rounded-[12px] bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors active:scale-95"
                      >
                        Solicitar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
