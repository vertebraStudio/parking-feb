import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { User, Clock, CheckCircle, X, UserPlus, Users } from 'lucide-react'
import { Booking, Profile } from '../types'
import { cn } from '../lib/utils'

interface DayBookingsListProps {
  date: string
  bookings: (Booking & { user?: Profile; carpoolUser?: Profile })[]
  onClose: () => void
  onCancelBooking?: (bookingId: number) => void
  currentUserId?: string
}

export default function DayBookingsList({
  date,
  bookings,
  onClose,
  onCancelBooking,
  currentUserId,
}: DayBookingsListProps) {
  // Filtrar reservas para esta fecha (excluyendo canceladas)
  const allDayBookings = bookings.filter(
    b => b.date === date && b.status !== 'cancelled'
  )

  // Separar reservas activas (confirmed/pending) de lista de espera
  const activeBookings = allDayBookings.filter(
    b => b.status === 'confirmed' || b.status === 'pending'
  )
  const waitlistBookings = allDayBookings.filter(
    b => b.status === 'waitlist'
  )

  // Ordenar: confirmadas primero, luego pendientes
  const sortedActiveBookings = [...activeBookings].sort((a, b) => {
    if (a.status === 'confirmed' && b.status === 'pending') return -1
    if (a.status === 'pending' && b.status === 'confirmed') return 1
    return 0
  })

  // Ordenar lista de espera por fecha de creación (primero en llegar, primero en salir)
  const sortedWaitlist = [...waitlistBookings].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString)
    return format(date, 'EEEE, d MMMM yyyy', { locale: es })
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div 
        className="bg-white rounded-t-[24px] sm:rounded-[24px] w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Reservas del día
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {formatDateDisplay(date)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-[12px] hover:bg-gray-100 transition-colors active:scale-95"
          >
            <X className="w-5 h-5 text-gray-600" strokeWidth={2.5} />
          </button>
        </div>

        {/* Lista de reservas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Reservas activas (confirmed/pending) */}
          {sortedActiveBookings.length === 0 && sortedWaitlist.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-3" strokeWidth={2} />
              <p className="text-gray-500 font-medium">No hay reservas para este día</p>
            </div>
          ) : (
            <>
              {sortedActiveBookings.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Reservas ({sortedActiveBookings.length}/8)</h3>
                  {sortedActiveBookings.map((booking) => {
                    const isCurrentUser = currentUserId && booking.user_id === currentUserId
                    const userName = booking.user?.full_name || 
                                    booking.user?.email?.split('@')[0] || 
                                    'Usuario desconocido'
                    
                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "p-4 rounded-[16px] border transition-all",
                          isCurrentUser && "bg-orange-50 border-orange-200",
                          !isCurrentUser && booking.status === 'confirmed' && "bg-white border-gray-200",
                          !isCurrentUser && booking.status === 'pending' && "bg-amber-50 border-amber-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                              isCurrentUser ? "bg-orange-500" :
                              booking.status === 'confirmed' ? "bg-green-500" :
                              "bg-amber-500"
                            )}>
                              {booking.status === 'pending' ? (
                                <Clock className="w-5 h-5 text-white" strokeWidth={2.5} />
                              ) : (
                                <CheckCircle className="w-5 h-5 text-white" strokeWidth={2.5} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "font-semibold truncate",
                                isCurrentUser ? "text-orange-900" : "text-gray-900"
                              )}>
                                {isCurrentUser ? 'Tú' : userName}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {booking.status === 'pending' ? 'Pendiente de confirmación' : 'Confirmada'}
                              </p>
                              {booking.carpoolUser && (
                                <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                                  <Users className="w-3 h-3" strokeWidth={2.5} />
                                  Con {booking.carpoolUser.full_name || booking.carpoolUser.email?.split('@')[0] || 'otro usuario'}
                                </p>
                              )}
                            </div>
                          </div>
                          {isCurrentUser && onCancelBooking && (
                            <button
                              onClick={() => onCancelBooking(booking.id)}
                              className="ml-3 p-2 rounded-[10px] bg-red-100 text-red-700 hover:bg-red-200 transition-colors active:scale-95 flex-shrink-0"
                              title="Cancelar reserva"
                            >
                              <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Lista de espera */}
              {sortedWaitlist.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Lista de espera ({sortedWaitlist.length})</h3>
                  {sortedWaitlist.map((booking, index) => {
                    const isCurrentUser = currentUserId && booking.user_id === currentUserId
                    const userName = booking.user?.full_name || 
                                    booking.user?.email?.split('@')[0] || 
                                    'Usuario desconocido'
                    
                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "p-4 rounded-[16px] border transition-all",
                          isCurrentUser && "bg-purple-50 border-purple-200",
                          !isCurrentUser && "bg-white border-purple-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                              isCurrentUser ? "bg-purple-500" : "bg-purple-400"
                            )}>
                              <UserPlus className="w-5 h-5 text-white" strokeWidth={2.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "font-semibold truncate",
                                isCurrentUser ? "text-purple-900" : "text-gray-900"
                              )}>
                                {isCurrentUser ? 'Tú' : userName}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Posición {index + 1} en lista de espera
                              </p>
                            </div>
                          </div>
                          {isCurrentUser && onCancelBooking && (
                            <button
                              onClick={() => onCancelBooking(booking.id)}
                              className="ml-3 p-2 rounded-[10px] bg-red-100 text-red-700 hover:bg-red-200 transition-colors active:scale-95 flex-shrink-0"
                              title="Salir de lista de espera"
                            >
                              <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer con contador */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-[24px]">
          <p className="text-sm text-gray-600 text-center">
            <span className="font-semibold text-gray-900">{sortedActiveBookings.length}</span> de 8 plazas ocupadas
            {sortedWaitlist.length > 0 && (
              <span className="block mt-1 text-xs text-purple-600">
                {sortedWaitlist.length} {sortedWaitlist.length === 1 ? 'persona' : 'personas'} en lista de espera
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
