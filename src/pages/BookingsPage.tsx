import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Car, X, CheckCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Booking, Profile, ParkingSpot } from '../types'
import ConfirmModal from '../components/ui/ConfirmModal'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface BookingWithSpot extends Booking {
  spot?: ParkingSpot
}

export default function BookingsPage() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<BookingWithSpot[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<Profile | null>(null)
  const [executiveProfiles, setExecutiveProfiles] = useState<Map<string, Profile>>(new Map())
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showReleaseModal, setShowReleaseModal] = useState(false)
  const [bookingToCancel, setBookingToCancel] = useState<BookingWithSpot | null>(null)
  const [bookingToRelease, setBookingToRelease] = useState<BookingWithSpot | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<Date>(() => {
    // Inicializar con el lunes de la semana actual
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysFromMonday)
    monday.setHours(0, 0, 0, 0)
    return monday
  })

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    if (user) {
      loadBookings()
    }
  }, [user, selectedWeekMonday])

  const loadUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        setUser(null)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        return
      }

      setUser(profile)
    } catch (error) {
      console.error('Error loading user:', error)
    }
  }

  const loadBookings = async () => {
    if (!user) return

    setLoading(true)
    try {
      // Usar la semana seleccionada
      const monday = new Date(selectedWeekMonday)
      monday.setHours(0, 0, 0, 0)
      
      // Calcular el viernes de la semana seleccionada
      const friday = new Date(monday)
      friday.setDate(monday.getDate() + 4) // Lunes + 4 días = Viernes
      friday.setHours(23, 59, 59, 999)
      
      const mondayString = monday.toISOString().split('T')[0]
      const fridayString = friday.toISOString().split('T')[0]

      // Cargar reservas activas (no canceladas) solo de la semana en curso (lunes a viernes)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', mondayString)
        .lte('date', fridayString)
        .neq('status', 'cancelled')
        .order('date', { ascending: true })

      if (bookingsError) {
        console.error('Error loading bookings:', bookingsError)
        setError('Error al cargar las reservas')
        setBookings([])
        return
      }

      // Cargar información de las plazas
      if (bookingsData && bookingsData.length > 0) {
        const spotIds = [...new Set(bookingsData.map(b => b.spot_id))]
        const { data: spotsData, error: spotsError } = await supabase
          .from('parking_spots')
          .select('*')
          .in('id', spotIds)

        if (spotsError) {
          console.error('Error loading spots:', spotsError)
        }

        // Cargar perfiles de directivos asignados a las plazas
        if (spotsData) {
          const executiveUserIds = spotsData
            .filter(spot => spot.is_executive && spot.assigned_to)
            .map(spot => spot.assigned_to)
            .filter((id): id is string => id !== null)
          
          if (executiveUserIds.length > 0) {
            const { data: executiveProfilesData, error: executiveProfilesError } = await supabase
              .from('profiles')
              .select('*')
              .in('id', executiveUserIds)
            
            if (executiveProfilesError) {
              console.error('Error cargando perfiles de directivos:', executiveProfilesError)
            } else if (executiveProfilesData) {
              const profilesMap = new Map<string, Profile>()
              executiveProfilesData.forEach(profile => {
                profilesMap.set(profile.id, profile)
              })
              setExecutiveProfiles(profilesMap)
            }
          }
        }

        // Combinar reservas con información de plazas
        const bookingsWithSpots: BookingWithSpot[] = bookingsData.map(booking => ({
          ...booking,
          spot: spotsData?.find(spot => spot.id === booking.spot_id)
        }))

        setBookings(bookingsWithSpots)
      } else {
        setBookings([])
      }
    } catch (error) {
      console.error('Error loading bookings:', error)
      setError('Error al cargar las reservas')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelBooking = (booking: BookingWithSpot) => {
    setBookingToCancel(booking)
    setShowCancelModal(true)
  }

  const handleReleaseSpot = (booking: BookingWithSpot) => {
    setBookingToRelease(booking)
    setShowReleaseModal(true)
  }

  const confirmCancel = async () => {
    if (!bookingToCancel) return

    setCancelling(true)
    try {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingToCancel.id)

      if (updateError) throw updateError

      // Recargar reservas
      await loadBookings()
      setShowCancelModal(false)
      setBookingToCancel(null)
      setError(null)
    } catch (err: any) {
      console.error('Error cancelling booking:', err)
      setError(err.message || 'Error al cancelar la reserva')
    } finally {
      setCancelling(false)
    }
  }

  const confirmRelease = async () => {
    if (!bookingToRelease || !user) return

    setReleasing(true)
    try {
      // Solo cancelar la reserva del directivo para ese día específico
      // NO cambiar is_released globalmente, solo liberar para este día
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingToRelease.id)

      if (updateError) throw updateError

      // Recargar reservas
      await loadBookings()
      setShowReleaseModal(false)
      setBookingToRelease(null)
      setError(null)
    } catch (err: any) {
      console.error('Error releasing spot:', err)
      setError(err.message || 'Error al liberar la plaza')
    } finally {
      setReleasing(false)
    }
  }

  // Verificar si una reserva es de una plaza ejecutiva asignada al usuario directivo
  const isExecutiveBooking = (booking: BookingWithSpot): boolean => {
    return user?.role === 'directivo' && 
           booking.spot?.is_executive === true && 
           booking.spot?.assigned_to === user.id
  }

  // Función para obtener el label de la plaza (con nombre del directivo si aplica)
  const getSpotLabel = (spot?: ParkingSpot): string => {
    if (!spot) return 'Plaza desconocida'
    if (spot.is_executive && spot.assigned_to && executiveProfiles.has(spot.assigned_to)) {
      const executiveProfile = executiveProfiles.get(spot.assigned_to)
      const executiveName = executiveProfile?.full_name || executiveProfile?.email?.split('@')[0] || 'Directivo'
      return `Plaza ${executiveName}`
    }
    return spot.label
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (dateString === today.toISOString().split('T')[0]) {
      return 'Hoy'
    } else if (dateString === tomorrow.toISOString().split('T')[0]) {
      return 'Mañana'
    } else {
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
      const dayName = days[date.getDay()]
      const day = date.getDate()
      const month = months[date.getMonth()]
      return `${dayName}, ${day} de ${month}`
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'confirmed') {
      return (
        <span 
          className="px-3 py-1.5 text-xs font-semibold rounded-[10px] flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(52, 199, 89, 0.2)',
            color: '#34C759',
            border: '1px solid rgba(52, 199, 89, 0.3)',
          }}
        >
          <CheckCircle className="w-3 h-3" strokeWidth={2.5} />
          Confirmada
        </span>
      )
    }
    return (
      <span 
        className="px-3 py-1.5 text-xs font-semibold rounded-[10px] flex items-center gap-1"
        style={{
          backgroundColor: 'rgba(255, 149, 0, 0.2)',
          color: '#FF9500',
          border: '1px solid rgba(255, 149, 0, 0.3)',
        }}
      >
        <Clock className="w-3 h-3" strokeWidth={2.5} />
        Pendiente
      </span>
    )
  }

  // Obtener todos los días laborables (lunes a viernes) de la semana seleccionada
  const getWeekDays = (): string[] => {
    const monday = new Date(selectedWeekMonday)
    monday.setHours(0, 0, 0, 0)
    
    // Generar todos los días de lunes a viernes de la semana seleccionada
    const weekDays: string[] = []
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      weekDays.push(date.toISOString().split('T')[0])
    }
    
    return weekDays
  }

  // Navegar a la semana anterior
  const handlePreviousWeek = () => {
    const newMonday = new Date(selectedWeekMonday)
    newMonday.setDate(selectedWeekMonday.getDate() - 7)
    setSelectedWeekMonday(newMonday)
  }

  // Navegar a la semana siguiente
  const handleNextWeek = () => {
    const newMonday = new Date(selectedWeekMonday)
    newMonday.setDate(selectedWeekMonday.getDate() + 7)
    setSelectedWeekMonday(newMonday)
  }

  // Ir a la semana actual
  const handleCurrentWeek = () => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(today)
    monday.setDate(today.getDate() - daysFromMonday)
    monday.setHours(0, 0, 0, 0)
    setSelectedWeekMonday(monday)
  }

  // Formatear el rango de fechas de la semana
  const formatWeekRange = (): string => {
    const monday = new Date(selectedWeekMonday)
    const friday = new Date(monday)
    friday.setDate(monday.getDate() + 4)
    
    const mondayFormatted = format(monday, 'd MMM', { locale: es })
    const fridayFormatted = format(friday, 'd MMM', { locale: es })
    
    return `${mondayFormatted} - ${fridayFormatted}`
  }

  // Obtener el estado de la reserva para un día específico
  const getBookingStatusOnDate = (dateString: string): 'confirmed' | 'pending' | null => {
    const booking = bookings.find(b => b.date === dateString)
    if (!booking) return null
    return booking.status === 'confirmed' ? 'confirmed' : 'pending'
  }

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (dateString === today.toISOString().split('T')[0]) {
      return 'Hoy'
    } else if (dateString === tomorrow.toISOString().split('T')[0]) {
      return 'Mañana'
    } else {
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
      const dayName = days[date.getDay()]
      const day = date.getDate()
      const month = months[date.getMonth()]
      return `${dayName}, ${day} de ${month}`
    }
  }

  if (loading) {
    return (
      <div 
        className="p-4 min-h-screen flex items-center justify-center bg-white"
      >
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando reservas...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div 
        className="p-4 min-h-screen flex items-center justify-center bg-white"
      >
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">Debes iniciar sesión para ver tus reservas</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="p-4 pb-24 min-h-screen bg-white"
    >
      <h1 
        className="text-3xl font-semibold mb-6 text-gray-900 tracking-tight"
        style={{ 
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
          letterSpacing: '-0.5px'
        }}
      >
        Mis Reservas
      </h1>

      {/* Calendario de navegación de semanas */}
      <div 
        className="mb-4 p-4 bg-gray-50 rounded-[20px] border border-gray-200"
      >
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={handlePreviousWeek}
            className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50"
            title="Semana anterior"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
          </button>
          
          <div className="flex-1 text-center">
            <button
              onClick={handleCurrentWeek}
              className="px-4 py-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-gray-900">{formatWeekRange()}</span>
            </button>
          </div>
          
          <button
            onClick={handleNextWeek}
            className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50"
            title="Semana siguiente"
          >
            <ChevronRight className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Días de la semana (lunes a viernes) */}
      <div 
        className="mb-6 p-4 bg-gray-50 rounded-[20px] border border-gray-200"
      >
        <p 
          className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider"
          style={{ letterSpacing: '0.5px' }}
        >
          Días de la semana
        </p>
        <div className="flex flex-wrap gap-2">
          {getWeekDays().map((date) => {
            const dateObj = new Date(date)
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
            const dayName = dayNames[dateObj.getDay()]
            const dayNumber = dateObj.getDate()
            const isToday = date === new Date().toISOString().split('T')[0]
            const bookingStatus = getBookingStatusOnDate(date)
            const hasBooking = bookingStatus !== null
            
            // Colores según el estado de la reserva
            let backgroundColor = '#FFFFFF'
            let borderColor = 'rgb(209 213 219)' // gray-300
            let textColor = '#111827'
            let dayNameColor = 'rgb(75 85 99)' // gray-600
            let boxShadow = 'none'
            
            if (bookingStatus === 'confirmed') {
              // Confirmada: naranja
              backgroundColor = '#FF9500'
              borderColor = '#FF9500'
              textColor = '#FFFFFF'
              dayNameColor = '#FFFFFF'
              boxShadow = '0 2px 8px rgba(255, 149, 0, 0.3)'
            } else if (bookingStatus === 'pending') {
              // Pendiente: amarillo/ámbar para indicar "en proceso"
              backgroundColor = '#FFB800'
              borderColor = '#FFB800'
              textColor = '#FFFFFF'
              dayNameColor = '#FFFFFF'
              boxShadow = '0 2px 8px rgba(255, 184, 0, 0.3)'
            }
            
            return (
              <button
                key={date}
                onClick={() => {
                  navigate('/', { state: { selectedDate: date } })
                }}
                className="px-3 py-2 rounded-[12px] transition-all duration-200 active:scale-95 border"
                style={{
                  backgroundColor,
                  borderColor,
                  boxShadow,
                }}
                title={formatDateDisplay(date)}
              >
                <div className="flex flex-col items-center">
                  <span 
                    className="text-[10px] font-medium"
                    style={{ 
                      letterSpacing: '0.3px',
                      color: dayNameColor,
                      opacity: hasBooking ? 1 : 0.7
                    }}
                  >
                    {dayName}
                  </span>
                  <span 
                    className={isToday ? "font-bold text-base" : "text-sm font-semibold"}
                    style={{ 
                      color: textColor,
                      opacity: hasBooking ? 1 : 0.9
                    }}
                  >
                    {dayNumber}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div 
          className="mb-4 p-4 rounded-[20px] border border-red-300 bg-red-50"
        >
          <p className="text-red-800 text-sm font-semibold">{error}</p>
        </div>
      )}

      {bookings.length === 0 ? (
        <div 
          className="text-center py-12 rounded-[20px] border border-gray-200 bg-gray-50"
        >
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-700 font-medium mb-2">No tienes reservas activas</p>
          <p className="text-gray-500 text-sm">Tus próximas reservas aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Reservas Confirmadas */}
          {bookings.filter(b => b.status === 'confirmed').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5" style={{ color: '#34C759' }} strokeWidth={2.5} />
                <h2 
                  className="text-lg font-bold text-gray-900"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                    letterSpacing: '-0.2px'
                  }}
                >
                  Reservas Confirmadas ({bookings.filter(b => b.status === 'confirmed').length})
                </h2>
              </div>
              <div className="space-y-3">
                {bookings
                  .filter(b => b.status === 'confirmed')
                  .map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-[20px] p-4 transition-all duration-200 active:scale-[0.98] bg-white border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Car className="w-5 h-5" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                            <h3 
                              className="font-bold text-gray-900"
                              style={{ 
                                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                              }}
                            >
                              {getSpotLabel(booking.spot)}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" strokeWidth={2} />
                            <span className="text-sm font-medium">{formatDate(booking.date)}</span>
                          </div>
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      {isExecutiveBooking(booking) ? (
                        <button
                          onClick={() => handleReleaseSpot(booking)}
                          className="w-full mt-3 px-4 py-2 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <X className="w-4 h-4" strokeWidth={2.5} />
                          Liberar Plaza
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCancelBooking(booking)}
                          className="w-full mt-3 px-4 py-2 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          <X className="w-4 h-4" strokeWidth={2.5} />
                          Cancelar Reserva
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Reservas Pendientes */}
          {bookings.filter(b => b.status === 'pending').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                <h2 
                  className="text-lg font-bold text-gray-900"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                    letterSpacing: '-0.2px'
                  }}
                >
                  Reservas Pendientes ({bookings.filter(b => b.status === 'pending').length})
                </h2>
              </div>
              <div className="space-y-3">
                {bookings
                  .filter(b => b.status === 'pending')
                  .map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-[20px] p-4 transition-all duration-200 active:scale-[0.98] bg-white border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Car className="w-5 h-5" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                            <h3 
                              className="font-bold text-gray-900"
                              style={{ 
                                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                              }}
                            >
                              {getSpotLabel(booking.spot)}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" strokeWidth={2} />
                            <span className="text-sm font-medium">{formatDate(booking.date)}</span>
                          </div>
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      {isExecutiveBooking(booking) ? (
                        <button
                          onClick={() => handleReleaseSpot(booking)}
                          className="w-full mt-3 px-4 py-2 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <X className="w-4 h-4" strokeWidth={2.5} />
                          Liberar Plaza
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCancelBooking(booking)}
                          className="w-full mt-3 px-4 py-2 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          <X className="w-4 h-4" strokeWidth={2.5} />
                          Cancelar Reserva
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false)
          setBookingToCancel(null)
        }}
        onConfirm={confirmCancel}
        title="Cancelar Reserva"
        message={
          bookingToCancel
            ? `¿Estás seguro de que deseas cancelar la reserva de ${getSpotLabel(bookingToCancel.spot)} para el ${formatDate(bookingToCancel.date)}?`
            : ''
        }
        confirmText="Sí, cancelar"
        cancelText="No, mantener"
        loading={cancelling}
      />

      <ConfirmModal
        isOpen={showReleaseModal}
        onClose={() => {
          setShowReleaseModal(false)
          setBookingToRelease(null)
        }}
        onConfirm={confirmRelease}
        title="Liberar Plaza"
        message={
          bookingToRelease
            ? `¿Estás seguro de que deseas liberar la plaza ${getSpotLabel(bookingToRelease.spot)} para el ${formatDate(bookingToRelease.date)}? La plaza quedará disponible para que otros usuarios la reserven ese día.`
            : ''
        }
        confirmText="Sí, liberar"
        cancelText="No, mantener"
        loading={releasing}
        confirmButtonClass="bg-blue-600 hover:bg-blue-700"
      />
    </div>
  )
}
