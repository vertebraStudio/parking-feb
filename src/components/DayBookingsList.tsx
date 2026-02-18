import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { User, CheckCircle, X, Users } from 'lucide-react'
import { Booking, Profile } from '../types'
import { cn } from '../lib/utils'
import ConfirmModal from './ui/ConfirmModal'

interface DayBookingsListProps {
  date: string
  bookings: (Booking & { user?: Profile; carpoolUsers?: Profile[] })[]
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
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)

  function getFaceHashColor(key: string) {
    const colors = ['#FF9500', '#34C759', '#0A84FF', '#AF52DE', '#FF2D55', '#FF9F0A', '#5AC8FA', '#FFCC00']
    let hash = 0
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) | 0
    }
    const index = Math.abs(hash) % colors.length
    return colors[index]
  }

  function getProfileInitials(profile?: Profile) {
    const base = (profile?.full_name && profile.full_name.trim()) || profile?.email || ''
    if (!base) return '?'
    const parts = base.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }

  // Filtrar reservas para esta fecha (excluyendo canceladas)
  const allDayBookings = bookings.filter(
    b => b.date === date && b.status !== 'cancelled'
  )

  // Separar reservas activas (confirmed) de lista de espera
  // Nota: 'pending' ya no se usa; si existe por datos legacy lo tratamos como 'waitlist'
  const activeBookings = allDayBookings.filter(
    b => b.status === 'confirmed'
  )
  const waitlistBookings = allDayBookings.filter(
    b => b.status === 'waitlist' || (b as any).status === 'pending'
  )

  // Ordenar: solo confirmadas (mantener orden estable)
  const sortedActiveBookings = [...activeBookings]

  // Ordenar lista de espera por fecha de creación (primero en llegar, primero en salir)
  const sortedWaitlist = [...waitlistBookings].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString)
    return format(date, 'EEEE, d MMMM yyyy', { locale: es })
  }

  const handleCancelClick = (booking: Booking) => {
    setBookingToCancel(booking)
    setShowCancelModal(true)
  }

  const handleConfirmCancel = async () => {
    if (!bookingToCancel || !onCancelBooking) return

    setCancelling(true)
    try {
      await onCancelBooking(bookingToCancel.id)
      setShowCancelModal(false)
      setBookingToCancel(null)
    } catch (error) {
      console.error('Error canceling booking:', error)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4"
      style={{
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-t-[24px] w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl"
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          animation: 'slideUp 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
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
                    const initials = getProfileInitials(booking.user)
                    const color = getFaceHashColor(booking.user?.id || booking.user_id || booking.user?.email || initials)
                    
                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "p-4 rounded-[16px] border transition-all",
                          isCurrentUser && "bg-orange-50 border-orange-200",
                          !isCurrentUser && "bg-white border-gray-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white shadow-sm ring-2 ring-offset-2 ring-offset-white",
                                isCurrentUser ? "ring-orange-200" : "ring-gray-100",
                                !isCurrentUser && "ring-green-200"
                              )}
                              style={{
                                background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 45%), ${color}`,
                              }}
                            >
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "font-semibold truncate",
                                isCurrentUser ? "text-orange-900" : "text-gray-900"
                              )}>
                                {isCurrentUser ? 'Tú' : userName}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                                <CheckCircle className="w-3.5 h-3.5 text-green-600" strokeWidth={2.5} />
                                <span>Confirmada</span>
                              </p>
                              {booking.carpoolUsers && booking.carpoolUsers.length > 0 && (
                                <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                                  <Users className="w-3 h-3" strokeWidth={2.5} />
                                  <span>
                                    {(() => {
                                      const names = booking.carpoolUsers!.map(
                                        (u) => u.full_name || u.email?.split('@')[0] || 'otro usuario'
                                      )
                                      if (names.length === 1) {
                                        return `Con ${names[0]}`
                                      }
                                      if (names.length === 2) {
                                        return `Con ${names[0]} y ${names[1]}`
                                      }
                                      return `Con ${names[0]} y ${names.length - 1} más`
                                    })()}
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                          {isCurrentUser && onCancelBooking && booking.status === 'waitlist' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelClick(booking)
                              }}
                              className="ml-3 p-2 rounded-[10px] bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors active:scale-95 flex-shrink-0"
                              title="Salir de lista de espera"
                            >
                              <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                          ) : isCurrentUser && onCancelBooking ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelClick(booking)
                              }}
                              className="ml-3 p-2 rounded-[10px] bg-red-100 text-red-700 hover:bg-red-200 transition-colors active:scale-95 flex-shrink-0"
                              title="Cancelar reserva"
                            >
                              <X className="w-4 h-4" strokeWidth={2.5} />
                            </button>
                          ) : null}
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
                    const initials = getProfileInitials(booking.user)
                    const queuePos = index + 1
                    const color = getFaceHashColor(booking.user?.id || booking.user_id || booking.user?.email || initials)
                    
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
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white shadow-sm ring-2 ring-offset-2 ring-offset-white",
                                isCurrentUser ? "ring-purple-200" : "ring-purple-100"
                              )}
                              style={{
                                background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 45%), ${color}`,
                              }}
                            >
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p
                                  className={cn(
                                    "font-semibold truncate",
                                    isCurrentUser ? "text-purple-900" : "text-gray-900"
                                  )}
                                >
                                  {isCurrentUser ? 'Tú' : userName}
                                </p>
                                <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-600 text-white">
                                  #{queuePos}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Posición {queuePos} en lista de espera
                              </p>
                            </div>
                          </div>
                          {isCurrentUser && onCancelBooking && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelClick(booking)
                              }}
                              className="ml-3 p-2 rounded-[10px] bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors active:scale-95 flex-shrink-0"
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

      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false)
          setBookingToCancel(null)
        }}
        onConfirm={handleConfirmCancel}
        title={bookingToCancel?.status === 'waitlist' ? 'Salir de lista de espera' : 'Cancelar reserva'}
        message={
          bookingToCancel?.status === 'waitlist'
            ? `¿Estás seguro de que deseas salir de la lista de espera para el ${formatDateDisplay(date)}?`
            : `¿Estás seguro de que deseas cancelar tu reserva para el ${formatDateDisplay(date)}?`
        }
        confirmText={bookingToCancel?.status === 'waitlist' ? 'Sí, salir' : 'Sí, cancelar'}
        cancelText="No, mantener"
        loading={cancelling}
        confirmButtonClass={bookingToCancel?.status === 'waitlist' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-red-600 hover:bg-red-700'}
      />
    </div>
  )
}
