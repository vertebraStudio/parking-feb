import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Car, X, CheckCircle, Clock, ChevronLeft, ChevronRight, Users, Edit2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Booking, Profile, ParkingSpot } from '../types'
import ConfirmModal from '../components/ui/ConfirmModal'
import BookingModal from '../components/ui/BookingModal'
import { format, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'

interface BookingWithSpot extends Booking {
  spot?: ParkingSpot
  carpoolUser?: Profile
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
  const [showCarpoolModal, setShowCarpoolModal] = useState(false)
  const [bookingForCarpool, setBookingForCarpool] = useState<BookingWithSpot | null>(null)
  const [availableCarpoolUsers, setAvailableCarpoolUsers] = useState<Profile[]>([])
  const [loadingCarpoolUsers, setLoadingCarpoolUsers] = useState(false)
  const [updatingCarpool, setUpdatingCarpool] = useState(false)
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<Date>(() => {
    // Inicializar con el lunes de la semana actual usando startOfWeek
    const today = new Date()
    return startOfWeek(today, { weekStartsOn: 1 }) // 1 = lunes
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

        // Cargar perfiles de usuarios con los que van en coche
        const carpoolUserIds = bookingsData
          .map(b => b.carpool_with_user_id)
          .filter((id): id is string => id !== null)
        
        let carpoolProfilesMap = new Map<string, Profile>()
        if (carpoolUserIds.length > 0) {
          const { data: carpoolProfilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', carpoolUserIds)
          
          if (carpoolProfilesData) {
            carpoolProfilesData.forEach(profile => {
              carpoolProfilesMap.set(profile.id, profile)
            })
          }
        }

        // Combinar reservas con información de plazas y carpooling
        const bookingsWithSpots: BookingWithSpot[] = bookingsData.map(booking => ({
          ...booking,
          spot: spotsData?.find(spot => spot.id === booking.spot_id),
          carpoolUser: booking.carpool_with_user_id ? carpoolProfilesMap.get(booking.carpool_with_user_id) : undefined
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
    if (!spot) return '' // No mostrar nada si no hay plaza (nuevo paradigma)
    if (spot.is_executive && spot.assigned_to && executiveProfiles.has(spot.assigned_to)) {
      const executiveProfile = executiveProfiles.get(spot.assigned_to)
      const executiveName = executiveProfile?.full_name || executiveProfile?.email?.split('@')[0] || 'Directivo'
      return `Plaza ${executiveName}`
    }
    return spot.label
  }

  // Cargar todos los usuarios disponibles para carpooling (no solo los que tienen reserva)
  const loadAvailableCarpoolUsers = async () => {
    setLoadingCarpoolUsers(true)
    try {
      // Cargar todos los usuarios verificados, excluyendo al usuario actual
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('is_verified', true)
        .neq('id', user?.id || '')
        .order('full_name', { ascending: true, nullsFirst: false })

      if (error) {
        console.error('Error loading carpool users:', error)
        setAvailableCarpoolUsers([])
      } else {
        setAvailableCarpoolUsers(profilesData || [])
      }
    } catch (err) {
      console.error('Error loading carpool users:', err)
      setAvailableCarpoolUsers([])
    } finally {
      setLoadingCarpoolUsers(false)
    }
  }

  // Abrir modal para seleccionar compañero de coche
  const handleOpenCarpoolModal = async (booking: BookingWithSpot) => {
    setBookingForCarpool(booking)
    await loadAvailableCarpoolUsers()
    setShowCarpoolModal(true)
  }

  // Actualizar compañero de coche
  const handleUpdateCarpool = async (carpoolUserId: string | null) => {
    if (!bookingForCarpool || !user) return

    setUpdatingCarpool(true)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ carpool_with_user_id: carpoolUserId })
        .eq('id', bookingForCarpool.id)
        .eq('user_id', user.id)

      if (error) throw error

      // Recargar reservas
      await loadBookings()
      setShowCarpoolModal(false)
      setBookingForCarpool(null)
      setAvailableCarpoolUsers([])
    } catch (err: any) {
      console.error('Error updating carpool:', err)
      setError(err.message || 'Error al actualizar el compañero de coche')
    } finally {
      setUpdatingCarpool(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const dayName = days[date.getDay()]
    const day = date.getDate()
    const month = months[date.getMonth()]
    return `${dayName}, ${day} de ${month}`
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
    if (status === 'waitlist') {
      return (
        <span 
          className="px-3 py-1.5 text-xs font-semibold rounded-[10px] flex items-center gap-1"
          style={{
            backgroundColor: 'rgba(175, 82, 222, 0.2)',
            color: '#AF52DE',
            border: '1px solid rgba(175, 82, 222, 0.3)',
          }}
        >
          <UserPlus className="w-3 h-3" strokeWidth={2.5} />
          Lista de espera
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
    // Asegurarse de que selectedWeekMonday es realmente un lunes
    const monday = startOfWeek(new Date(selectedWeekMonday), { weekStartsOn: 1 })
    monday.setHours(0, 0, 0, 0)
    
    // Generar todos los días de lunes a viernes de la semana seleccionada
    const weekDays: string[] = []
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday)
      date.setDate(monday.getDate() + i)
      // Usar formato YYYY-MM-DD para evitar problemas de zona horaria
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      weekDays.push(`${year}-${month}-${day}`)
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
    setSelectedWeekMonday(startOfWeek(today, { weekStartsOn: 1 })) // 1 = lunes
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
  const getBookingStatusOnDate = (dateString: string): 'confirmed' | 'pending' | 'waitlist' | null => {
    const booking = bookings.find(b => b.date === dateString)
    if (!booking) return null
    if (booking.status === 'confirmed') return 'confirmed'
    if (booking.status === 'waitlist') return 'waitlist'
    return 'pending'
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
        <div className="flex items-center justify-between">
          <button
            onClick={handlePreviousWeek}
            className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
            title="Semana anterior"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
          </button>
          
          <div className="flex-1 text-center px-2">
            <button
              onClick={handleCurrentWeek}
              className="w-full px-4 py-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
            >
              <span className="text-sm font-semibold text-gray-900">{formatWeekRange()}</span>
            </button>
          </div>
          
          <button
            onClick={handleNextWeek}
            className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
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
        <div className="flex gap-2">
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
              // Confirmada: verde
              backgroundColor = '#34C759'
              borderColor = '#34C759'
              textColor = '#FFFFFF'
              dayNameColor = '#FFFFFF'
              boxShadow = '0 2px 8px rgba(52, 199, 89, 0.3)'
            } else if (bookingStatus === 'pending') {
              // Pendiente: naranja
              backgroundColor = '#FF9500'
              borderColor = '#FF9500'
              textColor = '#FFFFFF'
              dayNameColor = '#FFFFFF'
              boxShadow = '0 2px 8px rgba(255, 149, 0, 0.3)'
            } else if (bookingStatus === 'waitlist') {
              // Lista de espera: morado
              backgroundColor = '#AF52DE'
              borderColor = '#AF52DE'
              textColor = '#FFFFFF'
              dayNameColor = '#FFFFFF'
              boxShadow = '0 2px 8px rgba(175, 82, 222, 0.3)'
            }
            
            return (
              <button
                key={date}
                onClick={() => {
                  navigate('/', { state: { selectedDate: date } })
                }}
                className="flex-1 px-2 py-2.5 rounded-[12px] transition-all duration-200 active:scale-95 border min-w-0"
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
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4" style={{ color: '#34C759' }} strokeWidth={2.5} />
                <h2 
                  className="text-base font-bold text-gray-900"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                    letterSpacing: '-0.2px'
                  }}
                >
                  Reservas Confirmadas ({bookings.filter(b => b.status === 'confirmed').length})
                </h2>
              </div>
              <div className="space-y-2">
                {bookings
                  .filter(b => b.status === 'confirmed')
                  .map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-[16px] p-3 transition-all duration-200 active:scale-[0.98] bg-white border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          {getSpotLabel(booking.spot) && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Car className="w-4 h-4" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                              <h3 
                                className="text-sm font-bold text-gray-900"
                                style={{ 
                                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                                }}
                              >
                                {getSpotLabel(booking.spot)}
                              </h3>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-gray-900">
                            <Calendar className="w-4 h-4" strokeWidth={2.5} />
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-bold">{formatDate(booking.date)}</span>
                              {(() => {
                                const date = new Date(booking.date)
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)
                                const tomorrow = new Date(today)
                                tomorrow.setDate(tomorrow.getDate() + 1)
                                const bookingDate = new Date(date)
                                bookingDate.setHours(0, 0, 0, 0)
                                
                                if (bookingDate.getTime() === today.getTime()) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-green-100 text-green-700">
                                      Hoy
                                    </span>
                                  )
                                } else if (bookingDate.getTime() === tomorrow.getTime()) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-blue-100 text-blue-700">
                                      Mañana
                                    </span>
                                  )
                                }
                                return null
                              })()}
                            </div>
                          </div>
                          {booking.carpoolUser && (
                            <div className="flex items-center gap-1.5 text-orange-600 mt-1.5">
                              <Users className="w-3.5 h-3.5" strokeWidth={2.5} />
                              <span className="text-xs font-medium">
                                Con {booking.carpoolUser.full_name || booking.carpoolUser.email?.split('@')[0] || 'otro usuario'}
                              </span>
                            </div>
                          )}
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleOpenCarpoolModal(booking)}
                          className="px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-gray-700 hover:bg-gray-50"
                        >
                          <Edit2 className="w-3 h-3" strokeWidth={2} />
                          {booking.carpoolUser ? 'Cambiar' : 'Añadir'} compañero
                        </button>
                        {isExecutiveBooking(booking) ? (
                          <button
                            onClick={() => handleReleaseSpot(booking)}
                            className="ml-auto px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-blue-600 hover:bg-blue-50"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                            Liberar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelBooking(booking)}
                            className="ml-auto px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-red-600 hover:bg-red-50"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Reservas Pendientes */}
          {bookings.filter(b => b.status === 'pending').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                <h2 
                  className="text-base font-bold text-gray-900"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                    letterSpacing: '-0.2px'
                  }}
                >
                  Reservas Pendientes ({bookings.filter(b => b.status === 'pending').length})
                </h2>
              </div>
              <div className="space-y-2">
                {bookings
                  .filter(b => b.status === 'pending')
                  .map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-[16px] p-3 transition-all duration-200 active:scale-[0.98] bg-white border border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          {getSpotLabel(booking.spot) && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Car className="w-4 h-4" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                              <h3 
                                className="text-sm font-bold text-gray-900"
                                style={{ 
                                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                                }}
                              >
                                {getSpotLabel(booking.spot)}
                              </h3>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-gray-900">
                            <Calendar className="w-4 h-4" strokeWidth={2.5} />
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-bold">{formatDate(booking.date)}</span>
                              {(() => {
                                const date = new Date(booking.date)
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)
                                const tomorrow = new Date(today)
                                tomorrow.setDate(tomorrow.getDate() + 1)
                                const bookingDate = new Date(date)
                                bookingDate.setHours(0, 0, 0, 0)
                                
                                if (bookingDate.getTime() === today.getTime()) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-green-100 text-green-700">
                                      Hoy
                                    </span>
                                  )
                                } else if (bookingDate.getTime() === tomorrow.getTime()) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-blue-100 text-blue-700">
                                      Mañana
                                    </span>
                                  )
                                }
                                return null
                              })()}
                            </div>
                          </div>
                          {booking.carpoolUser && (
                            <div className="flex items-center gap-1.5 text-orange-600 mt-1.5">
                              <Users className="w-3.5 h-3.5" strokeWidth={2.5} />
                              <span className="text-xs font-medium">
                                Con {booking.carpoolUser.full_name || booking.carpoolUser.email?.split('@')[0] || 'otro usuario'}
                              </span>
                            </div>
                          )}
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleOpenCarpoolModal(booking)}
                          className="px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-gray-700 hover:bg-gray-50"
                        >
                          <Edit2 className="w-3 h-3" strokeWidth={2} />
                          {booking.carpoolUser ? 'Cambiar' : 'Añadir'} compañero
                        </button>
                        {isExecutiveBooking(booking) ? (
                          <button
                            onClick={() => handleReleaseSpot(booking)}
                            className="ml-auto px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-blue-600 hover:bg-blue-50"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                            Liberar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelBooking(booking)}
                            className="ml-auto px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-red-600 hover:bg-red-50"
                          >
                            <X className="w-3 h-3" strokeWidth={2} />
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Reservas en Lista de Espera */}
          {bookings.filter(b => b.status === 'waitlist').length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4" style={{ color: '#AF52DE' }} strokeWidth={2.5} />
                <h2 
                  className="text-base font-bold text-gray-900"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                    letterSpacing: '-0.2px'
                  }}
                >
                  Lista de Espera ({bookings.filter(b => b.status === 'waitlist').length})
                </h2>
              </div>
              <div className="space-y-2">
                {bookings
                  .filter(b => b.status === 'waitlist')
                  .map((booking) => (
                    <div
                      key={booking.id}
                      className="rounded-[16px] p-3 transition-all duration-200 active:scale-[0.98] bg-white border border-purple-200"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-gray-900">
                            <Calendar className="w-4 h-4" strokeWidth={2.5} />
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-bold">{formatDate(booking.date)}</span>
                              {(() => {
                                const date = new Date(booking.date)
                                const today = new Date()
                                today.setHours(0, 0, 0, 0)
                                const tomorrow = new Date(today)
                                tomorrow.setDate(tomorrow.getDate() + 1)
                                const bookingDate = new Date(date)
                                bookingDate.setHours(0, 0, 0, 0)
                                
                                if (bookingDate.getTime() === today.getTime()) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-green-100 text-green-700">
                                      Hoy
                                    </span>
                                  )
                                } else if (bookingDate.getTime() === tomorrow.getTime()) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-[6px] text-xs font-semibold bg-blue-100 text-blue-700">
                                      Mañana
                                    </span>
                                  )
                                }
                                return null
                              })()}
                            </div>
                          </div>
                          {booking.carpoolUser && (
                            <div className="flex items-center gap-2 text-orange-600 mt-2">
                              <Users className="w-4 h-4" strokeWidth={2.5} />
                              <span className="text-sm font-medium">
                                Con {booking.carpoolUser.full_name || booking.carpoolUser.email?.split('@')[0] || 'otro usuario'}
                              </span>
                            </div>
                          )}
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => handleOpenCarpoolModal(booking)}
                          className="px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-gray-700 hover:bg-gray-50"
                        >
                          <Edit2 className="w-3 h-3" strokeWidth={2} />
                          {booking.carpoolUser ? 'Cambiar' : 'Añadir'} compañero
                        </button>
                        <button
                          onClick={() => handleCancelBooking(booking)}
                          className="ml-auto px-2.5 py-1 rounded-[6px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1 text-red-600 hover:bg-red-50"
                        >
                          <X className="w-3 h-3" strokeWidth={2} />
                          Cancelar
                        </button>
                      </div>
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
            ? `¿Estás seguro de que deseas cancelar la reserva para el ${formatDate(bookingToCancel.date)}?`
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
            ? `¿Estás seguro de que deseas liberar la plaza para el ${formatDate(bookingToRelease.date)}? La plaza quedará disponible para que otros usuarios la reserven ese día.`
            : ''
        }
        confirmText="Sí, liberar"
        cancelText="No, mantener"
        loading={releasing}
        confirmButtonClass="bg-blue-600 hover:bg-blue-700"
      />

      {/* Modal para seleccionar compañero de coche */}
      <BookingModal
        isOpen={showCarpoolModal}
        onClose={() => {
          setShowCarpoolModal(false)
          setBookingForCarpool(null)
          setAvailableCarpoolUsers([])
        }}
        onConfirm={handleUpdateCarpool}
        title="Seleccionar Compañero de Coche"
        message={bookingForCarpool 
          ? `¿Con quién vas en coche el ${formatDate(bookingForCarpool.date)}?`
          : ''
        }
        confirmText="Guardar"
        cancelText="Cancelar"
        loading={updatingCarpool}
        availableCarpoolUsers={availableCarpoolUsers}
        loadingCarpoolUsers={loadingCarpoolUsers}
        selectedCarpoolUser={bookingForCarpool?.carpool_with_user_id || null}
        onSelectCarpoolUser={(userId) => {
          if (bookingForCarpool) {
            setBookingForCarpool({ ...bookingForCarpool, carpool_with_user_id: userId })
          }
        }}
      />
    </div>
  )
}
