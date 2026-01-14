import { Car, Lock, Clock } from 'lucide-react'
import { ParkingSpot, Booking, SpotBlock, Profile } from '../types'
import { cn } from '../lib/utils'

interface BookingWithUser extends Booking {
  user?: Profile
}

interface ParkingMapProps {
  spots: ParkingSpot[]
  bookings?: (Booking | BookingWithUser)[]
  spotBlocks?: SpotBlock[]
  selectedDate?: string
  userId?: string
  user?: Profile | null
  executiveProfiles?: Map<string, Profile>
  onSpotSelect?: (spotId: number) => void
  onReleaseSpot?: (spotId: number) => Promise<void>
  onOccupySpot?: (spotId: number) => Promise<void>
  releasingSpot?: number | null
  occupyingSpot?: number | null
}

type SpotStatus = 'free' | 'occupied' | 'reserved_by_me' | 'reserved_by_me_pending' | 'blocked' | 'executive_assigned' | 'executive_released'

interface SpotWithStatus extends ParkingSpot {
  status: SpotStatus
  occupiedBy?: string // Nombre del usuario
  occupiedByName?: string // Nombre completo del usuario
  bookingStatus?: 'confirmed' | 'pending' // Estado de la reserva del usuario
}

export default function ParkingMap({
  spots,
  bookings = [],
  spotBlocks = [],
  selectedDate,
  userId,
  user,
  executiveProfiles = new Map(),
  onSpotSelect,
  onReleaseSpot,
  onOccupySpot,
  releasingSpot,
  occupyingSpot,
}: ParkingMapProps) {
  // Determinar el estado de cada plaza
  const getSpotStatus = (spot: ParkingSpot): { status: SpotStatus; bookingStatus?: 'confirmed' | 'pending' } => {
    const date = selectedDate || new Date().toISOString().split('T')[0]
    
    // Verificar si está bloqueada permanentemente o por fecha
    if (spot.is_blocked) return { status: 'blocked' }
    const isBlockedForDate = spotBlocks.some(block => block.spot_id === spot.id && block.date === date)
    if (isBlockedForDate) return { status: 'blocked' }
    
    // Si es plaza de directivo
    if (spot.is_executive) {
      // Si no hay directivo asignado aún, la plaza está libre
      if (!spot.assigned_to) {
        // Buscar reservas de cualquier usuario para este día
        const anyBooking = bookings.find(
          (b) => b.spot_id === spot.id && 
                 b.date === date && 
                 b.status !== 'cancelled'
        )
        if (anyBooking) {
          // Si hay una reserva, mostrar como ocupada
          if (userId && anyBooking.user_id === userId) {
            if (anyBooking.status === 'pending') {
              return { status: 'reserved_by_me_pending', bookingStatus: 'pending' }
            }
            return { status: 'reserved_by_me', bookingStatus: 'confirmed' }
          }
          return { status: 'occupied' }
        }
        // Si no hay reservas, la plaza está libre
        return { status: 'free' }
      }
      
      // Si hay directivo asignado, verificar si tiene una reserva activa para este día específico
      const executiveBooking = bookings.find(
        (b) => b.spot_id === spot.id && 
               b.date === date && 
               b.status !== 'cancelled' &&
               b.user_id === spot.assigned_to
      )
      
      // Si el directivo tiene una reserva activa para este día, la plaza está ocupada por él
      if (executiveBooking) {
        // Si es el usuario actual y es el directivo, mostrar como reservada por él
        if (userId && executiveBooking.user_id === userId) {
          if (executiveBooking.status === 'pending') {
            return { status: 'reserved_by_me_pending', bookingStatus: 'pending' }
          }
          return { status: 'reserved_by_me', bookingStatus: 'confirmed' }
        }
        // Si es otro usuario viendo, mostrar como ocupada por el directivo
        return { status: 'executive_assigned' }
      }
      
      // Si el directivo NO tiene reserva activa para este día, verificar si está liberada globalmente
      // o si hay reservas de otros usuarios
      if (spot.is_released === true) {
        // Si está liberada globalmente, verificar reservas de otros usuarios
        const otherUserBooking = bookings.find(
          (b) => b.spot_id === spot.id && 
                 b.date === date && 
                 b.status !== 'cancelled' &&
                 b.user_id !== spot.assigned_to
        )
        if (otherUserBooking) {
          // Si hay una reserva de otro usuario, mostrar como ocupada
          if (userId && otherUserBooking.user_id === userId) {
            if (otherUserBooking.status === 'pending') {
              return { status: 'reserved_by_me_pending', bookingStatus: 'pending' }
            }
            return { status: 'reserved_by_me', bookingStatus: 'confirmed' }
          }
          return { status: 'occupied' }
        }
        // Si está liberada globalmente y no tiene reserva de otros usuarios, tratarla como libre
        return { status: 'free' }
      }
      
      // Si NO está liberada globalmente y el directivo NO tiene reserva para este día,
      // la plaza está libre para este día específico (el directivo canceló su reserva de este día)
      // Buscar reservas de otros usuarios
      const otherUserBooking = bookings.find(
        (b) => b.spot_id === spot.id && 
               b.date === date && 
               b.status !== 'cancelled' &&
               b.user_id !== spot.assigned_to
      )
      if (otherUserBooking) {
        // Si hay una reserva de otro usuario, mostrar como ocupada
        if (userId && otherUserBooking.user_id === userId) {
          if (otherUserBooking.status === 'pending') {
            return { status: 'reserved_by_me_pending', bookingStatus: 'pending' }
          }
          return { status: 'reserved_by_me', bookingStatus: 'confirmed' }
        }
        return { status: 'occupied' }
      }
      // Si no hay reserva del directivo ni de otros usuarios, la plaza está libre para este día
      return { status: 'free' }
    }
    
    // Verificar si está ocupada (tiene una reserva activa para la fecha seleccionada)
    const activeBooking = bookings.find(
      (b) => b.spot_id === spot.id && b.date === date && b.status !== 'cancelled'
    )
    
    if (activeBooking) {
      // Si la reserva es del usuario actual, mostrar como "reservada por mí"
      if (userId && activeBooking.user_id === userId) {
        // Distinguir entre confirmada y pendiente
        if (activeBooking.status === 'pending') {
          return { status: 'reserved_by_me_pending', bookingStatus: 'pending' }
        }
        return { status: 'reserved_by_me', bookingStatus: 'confirmed' }
      }
      return { status: 'occupied' }
    }
    return { status: 'free' }
  }

  // Obtener información del usuario que tiene la reserva
  const getOccupiedBy = (spot: ParkingSpot): { name?: string; initials?: string } => {
    const date = selectedDate || new Date().toISOString().split('T')[0]
    
    // Para plazas de directivo liberadas, excluir las reservas del directivo asignado
    const booking = bookings.find(
      (b) => b.spot_id === spot.id && 
             b.date === date && 
             b.status !== 'cancelled' &&
             // Si es plaza de directivo liberada, excluir reservas del directivo asignado
             (!spot.is_executive || spot.is_released !== true || b.user_id !== spot.assigned_to)
    ) as BookingWithUser | undefined
    
    if (!booking) {
      return {}
    }
    
    // Solo mostrar nombre si la reserva está confirmada (no pendiente)
    if (booking.status !== 'confirmed') {
      return {}
    }
    
    if (booking.user) {
      const fullName = booking.user.full_name
      if (fullName && fullName.trim()) {
        // Obtener iniciales del nombre completo
        const nameParts = fullName.trim().split(' ')
        const initials = nameParts.length > 1 
          ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
          : fullName[0].toUpperCase()
        return { name: fullName, initials }
      } else if (booking.user.email) {
        // Si no hay nombre, usar email
        const emailName = booking.user.email.split('@')[0] // Usar la parte antes del @ como nombre
        return { name: emailName, initials: emailName[0].toUpperCase() }
      }
    } else {
      // Si no hay información del usuario, podría ser un problema de permisos RLS
      console.warn(`No hay información de usuario para la reserva en plaza ${spot.id} para la fecha ${date}`)
      console.warn('Esto indica que las políticas RLS no permiten ver los perfiles de otros usuarios.')
      console.warn('Ejecuta el script ENABLE_PROFILES_VIEW_FOR_ALL.sql en Supabase para solucionarlo.')
    }
    
    return {}
  }

  // Función para obtener el label de la plaza (con nombre del directivo si aplica)
  const getSpotLabel = (spot: ParkingSpot): string => {
    if (spot.is_executive && spot.assigned_to && executiveProfiles.has(spot.assigned_to)) {
      const executiveProfile = executiveProfiles.get(spot.assigned_to)
      const executiveName = executiveProfile?.full_name || executiveProfile?.email?.split('@')[0] || 'Directivo'
      return `Plaza ${executiveName}`
    }
    return spot.label
  }

  const spotsWithStatus: SpotWithStatus[] = spots.map((spot) => {
    const spotStatus = getSpotStatus(spot)
    const occupiedInfo = getOccupiedBy(spot)
    
    // Debug: Log para plazas de directivo liberadas
    if (spot.is_executive && spot.is_released === true && spotStatus.status !== 'free' && spotStatus.status !== 'occupied') {
      console.log('⚠️ Plaza de directivo liberada no se muestra como libre:', {
        spotId: spot.id,
        label: spot.label,
        is_released: spot.is_released,
        status: spotStatus.status,
        date: selectedDate || new Date().toISOString().split('T')[0],
        assigned_to: spot.assigned_to
      })
    }
    
    return {
      ...spot,
      status: spotStatus.status,
      bookingStatus: spotStatus.bookingStatus,
      occupiedBy: occupiedInfo.initials,
      occupiedByName: occupiedInfo.name,
    }
  })

  const handleSpotClick = (spotId: number, status: SpotStatus) => {
    // Verificar si la fecha seleccionada es pasada
    const date = selectedDate || new Date().toISOString().split('T')[0]
    const selectedDateObj = new Date(date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const isPastDate = selectedDateObj < today
    
    // Si es fecha pasada, no permitir ningún clic
    if (isPastDate) return
    
    // No permitir clic en plazas bloqueadas, ocupadas por otros, o ya reservadas por el usuario
    if (status === 'blocked' || status === 'occupied' || status === 'reserved_by_me' || status === 'reserved_by_me_pending' || status === 'executive_assigned') return
    
    // Permitir clic en plazas libres o plazas de directivo liberadas
    if (status === 'free') {
      onSpotSelect?.(spotId)
    }
  }

  if (spots.length === 0) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <p className="text-gray-500">No hay plazas para mostrar</p>
        </div>
      </div>
    )
  }

  // Verificar si la fecha seleccionada es pasada
  const date = selectedDate || new Date().toISOString().split('T')[0]
  const selectedDateObj = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isPastDate = selectedDateObj < today

  return (
    <div className="p-4">
      <div 
        className="grid grid-cols-2 gap-3 rounded-[20px] p-3"
        style={{ backgroundColor: '#F5F5F7' }}
      >
        {spotsWithStatus.map((spot) => {
          const isFree = spot.status === 'free'
          const isOccupied = spot.status === 'occupied'
          const isReservedByMe = spot.status === 'reserved_by_me'
          const isReservedByMePending = spot.status === 'reserved_by_me_pending'
          const isBlocked = spot.status === 'blocked'
          const isExecutiveAssigned = spot.status === 'executive_assigned'

          return (
            <button
              key={spot.id}
              onClick={() => handleSpotClick(spot.id, spot.status)}
              disabled={isBlocked || isOccupied || isReservedByMe || isReservedByMePending || isPastDate || isExecutiveAssigned}
              className={cn(
                'relative transition-all duration-300',
                !isPastDate && 'active:scale-[0.97]',
                'disabled:cursor-not-allowed',
                // Fondo blanco sólido
                'bg-white',
                'border',
                'rounded-[20px]', // Squircle style
                'p-4',
                // Glow effect para reserva propia (solo si no es fecha pasada)
                (isReservedByMe || isReservedByMePending) && !isPastDate && 'shadow-[0_0_20px_rgba(255,149,0,0.4)]',
                // Escala de grises para fechas pasadas
                isPastDate && 'grayscale'
              )}
              style={{
                // Estados específicos con fondos blancos y bordes de color
                // Si es fecha pasada, usar colores grises
                ...(isPastDate && {
                  borderColor: '#D1D5DB',
                  backgroundColor: '#F9FAFB',
                }),
                // Plazas de directivo asignadas (azul oscuro)
                ...(!isPastDate && isExecutiveAssigned && {
                  borderColor: '#111C4E',
                  backgroundColor: '#111C4E',
                }),
                ...(!isPastDate && isReservedByMe && {
                  borderColor: '#FF9500',
                  backgroundColor: '#FF9500',
                }),
                ...(!isPastDate && isReservedByMePending && {
                  borderColor: '#FFB800',
                  backgroundColor: '#FFB800',
                }),
                ...(!isPastDate && isOccupied && {
                  borderColor: '#FF3B30',
                  backgroundColor: '#FFFFFF',
                }),
                ...(!isPastDate && isBlocked && {
                  borderColor: 'rgba(0, 0, 0, 0.2)',
                  backgroundColor: '#F5F5F5',
                  opacity: 0.8,
                }),
                ...(!isPastDate && isFree && {
                  borderColor: 'rgba(0, 0, 0, 0.1)',
                  backgroundColor: '#FFFFFF',
                }),
              }}
            >
              {/* Número de plaza - discreto */}
              <div className={cn(
                "absolute top-2.5 left-2.5 text-[10px] font-semibold tracking-wider",
                isPastDate ? "text-gray-500" : 
                (isReservedByMe || isReservedByMePending || isExecutiveAssigned) ? "text-white" : 
                isOccupied ? "text-[#FF3B30]" : 
                isBlocked ? "text-gray-400" : 
                "text-gray-600"
              )}>
                {getSpotLabel(spot)}
              </div>

              {/* Contenido central */}
              <div className="flex flex-col items-center justify-center h-full min-h-[90px] pt-3">
                {isBlocked ? (
                  <Lock className="w-9 h-9 text-gray-400" strokeWidth={2} />
                ) : isExecutiveAssigned ? (
                  <Car 
                    className="w-11 h-11" 
                    style={{ color: isPastDate ? '#9CA3AF' : '#FFFFFF' }} 
                    strokeWidth={2.5} 
                  />
                ) : isOccupied ? (
                  <div className="flex flex-col items-center gap-2">
                    <Car 
                      className="w-11 h-11" 
                      style={{ color: isPastDate ? '#9CA3AF' : '#FF3B30' }} 
                      strokeWidth={2.5} 
                    />
                    {spot.occupiedByName && (
                      <p 
                        className="text-[10px] font-medium text-center max-w-[80px] truncate"
                        style={{ color: isPastDate ? '#6B7280' : '#FF3B30' }}
                        title={spot.occupiedByName}
                      >
                        {spot.occupiedByName}
                      </p>
                    )}
                  </div>
                ) : isReservedByMePending ? (
                  <Clock 
                    className="w-11 h-11" 
                    style={{ color: isPastDate ? '#9CA3AF' : '#FFFFFF' }} 
                    strokeWidth={2.5} 
                  />
                ) : isReservedByMe ? (
                  <Car 
                    className="w-11 h-11" 
                    style={{ color: isPastDate ? '#9CA3AF' : '#FFFFFF' }} 
                    strokeWidth={2.5} 
                  />
                ) : (
                  <Car 
                    className="w-11 h-11 transition-colors" 
                    style={{ color: isPastDate ? '#9CA3AF' : '#34C759' }} 
                    strokeWidth={2.5} 
                  />
                )}
              </div>

              {/* Indicador de estado reservado por mí - glow sutil */}
              {(isReservedByMe || isReservedByMePending) && (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ 
                      backgroundColor: isReservedByMePending ? '#FFB800' : '#FF9500',
                      boxShadow: isReservedByMePending 
                        ? '0 0 8px rgba(255, 184, 0, 0.8)' 
                        : '0 0 8px rgba(255, 149, 0, 0.8)'
                    }}
                  ></div>
                </div>
              )}

              {/* Botones para directivos: liberar/ocupar su plaza */}
              {!isPastDate && user?.role === 'directivo' && spot.is_executive && spot.assigned_to === user.id && (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-2">
                  {spot.is_released ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOccupySpot?.(spot.id)
                      }}
                      disabled={occupyingSpot === spot.id}
                      className="px-3 py-1.5 rounded-[10px] text-[10px] font-semibold text-white transition-all duration-200 active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: '#111C4E' }}
                      title="Ocupar mi plaza"
                    >
                      {occupyingSpot === spot.id ? 'Ocupando...' : 'Ocupar'}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onReleaseSpot?.(spot.id)
                      }}
                      disabled={releasingSpot === spot.id}
                      className="px-3 py-1.5 rounded-[10px] text-[10px] font-semibold text-white transition-all duration-200 active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: '#3B82F6' }}
                      title="Liberar mi plaza"
                    >
                      {releasingSpot === spot.id ? 'Liberando...' : 'Liberar'}
                    </button>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
