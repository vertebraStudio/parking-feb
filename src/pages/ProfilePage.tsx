import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { User, LogOut, Calendar, CheckCircle, Clock, TrendingUp, BarChart3, ArrowLeft, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Profile, Booking, ParkingSpot } from '../types'
import ConfirmModal from '../components/ui/ConfirmModal'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from 'date-fns'
import { es } from 'date-fns/locale'

interface BookingWithSpot extends Booking {
  spot?: ParkingSpot
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { userId } = useParams<{ userId?: string }>()
  const [user, setUser] = useState<Profile | null>(null)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [bookings, setBookings] = useState<BookingWithSpot[]>([])
  const [loading, setLoading] = useState(true)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [newRole, setNewRole] = useState<'user' | 'directivo' | 'admin'>('user')
  const [processing, setProcessing] = useState(false)
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false)
  const [deletingUser, setDeletingUser] = useState(false)
  const [showVerifyUserModal, setShowVerifyUserModal] = useState(false)
  const [verifyingUser, setVerifyingUser] = useState(false)
  const [showBookingHistory, setShowBookingHistory] = useState(false)
  const isViewingOtherUser = userId && userId !== currentUser?.id
  // Solo permitir que un admin elimine usuarios normales (no admins/directivos) y nunca a sí mismo
  const canDeleteUser = currentUser?.role === 'admin' && isViewingOtherUser && user?.role === 'user'
  const canVerifyUser = currentUser?.role === 'admin' && isViewingOtherUser && user?.role === 'user' && !user?.is_verified
  const canChangeRole = currentUser?.role === 'admin' && isViewingOtherUser

  useEffect(() => {
    loadCurrentUser()
  }, [])

  useEffect(() => {
    if (currentUser) {
      if (userId && userId !== currentUser.id) {
        // Si hay un userId y es diferente al usuario actual, verificar si es admin
        if (currentUser.role === 'admin') {
          loadUser(userId)
        } else {
          // Si no es admin, redirigir a su propio perfil
          navigate('/profile', { replace: true })
        }
      } else {
        // Cargar perfil propio
        setUser(currentUser)
        setLoading(false) // Asegurar que se establece loading a false cuando se carga el perfil propio
      }
    }
  }, [currentUser, userId, navigate])

  useEffect(() => {
    if (user) {
      loadBookings()
    }
  }, [user])

  const loadCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        setCurrentUser(null)
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        setLoading(false)
        return
      }

      setCurrentUser(profile)
    } catch (error) {
      console.error('Error loading user:', error)
      setLoading(false)
    }
  }

  const loadUser = async (targetUserId: string) => {
    setLoading(true)
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        setLoading(false)
        setUser(null)
        return
      }

      setUser(profile)
      // loadBookings se llamará automáticamente cuando se establezca user
    } catch (error) {
      console.error('Error loading user:', error)
      setLoading(false)
      setUser(null)
    }
  }

  const loadBookings = async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .order('date', { ascending: false })

      if (bookingsError) {
        console.error('Error loading bookings:', bookingsError)
        setBookings([])
      } else if (bookingsData && bookingsData.length > 0) {
        // Cargar información de las plazas
        const spotIds = [...new Set(bookingsData.map(b => b.spot_id))]
        const { data: spotsData, error: spotsError } = await supabase
          .from('parking_spots')
          .select('*')
          .in('id', spotIds)

        if (spotsError) {
          console.error('Error loading spots:', spotsError)
        }

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
      setBookings([])
    } finally {
      setLoading(false)
    }
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
      return format(date, 'EEEE, d \'de\' MMMM', { locale: es })
    }
  }

  // Estadísticas semanales
  const getWeeklyStats = () => {
    const now = new Date()
    const weekStart = startOfWeek(now, { locale: es })
    const weekEnd = endOfWeek(now, { locale: es })
    
    const weekBookings = bookings.filter(b => {
      const bookingDate = new Date(b.date)
      return bookingDate >= weekStart && bookingDate <= weekEnd
    })

    const confirmed = weekBookings.filter(b => b.status === 'confirmed').length
    const pending = weekBookings.filter(b => b.status === 'pending').length

    return {
      total: weekBookings.length,
      confirmed,
      pending
    }
  }

  // Estadísticas mensuales
  const getMonthlyStats = () => {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    
    const monthBookings = bookings.filter(b => {
      const bookingDate = new Date(b.date)
      return bookingDate >= monthStart && bookingDate <= monthEnd
    })

    const confirmed = monthBookings.filter(b => b.status === 'confirmed').length
    const pending = monthBookings.filter(b => b.status === 'pending').length

    return {
      total: monthBookings.length,
      confirmed,
      pending
    }
  }

  const handleBackClick = () => {
    navigate('/admin')
  }

  const handleDeleteUserClick = () => {
    setShowDeleteUserModal(true)
  }

  const handleVerifyUserClick = () => {
    setShowVerifyUserModal(true)
  }

  const confirmDeleteUser = async () => {
    if (!user || !currentUser) return

    setDeletingUser(true)
    try {
      // 1) Intentar borrar completamente usando la Edge Function (auth.users + datos públicos).
      try {
        const { data, error } = await supabase.functions.invoke('delete-user-completely', {
          body: { userId: user.id },
        })
        console.log('delete-user-completely (ProfilePage) result:', { data, error })
      } catch (fnErr: any) {
        console.warn('⚠️ Error llamando a delete-user-completely (ProfilePage), se continuará con borrado local:', fnErr)
      }

      // 2) Borrado local en tablas públicas como respaldo (no depende de la Edge Function)
      try {
        const { error: bookingsError } = await supabase
          .from('bookings')
          .delete()
          .eq('user_id', user.id)
        if (bookingsError) {
          console.error('Error deleting user bookings (ProfilePage, fallback):', bookingsError)
        }

        const { error: carpoolError } = await supabase
          .from('booking_carpool_users')
          .delete()
          .eq('user_id', user.id)
        if (carpoolError) {
          console.error('Error deleting booking_carpool_users (ProfilePage, fallback):', carpoolError)
        }

        const { error: notificationsError } = await supabase
          .from('notifications')
          .delete()
          .eq('user_id', user.id)
        if (notificationsError) {
          console.error('Error deleting user notifications (ProfilePage, fallback):', notificationsError)
        }

        const { error: pushTokensError } = await supabase
          .from('push_tokens')
          .delete()
          .eq('user_id', user.id)
        if (pushTokensError) {
          console.error('Error deleting user push tokens (ProfilePage, fallback):', pushTokensError)
        }

        const { error: spotsError } = await supabase
          .from('parking_spots')
          .update({ assigned_to: null, is_released: false })
          .eq('assigned_to', user.id)
        if (spotsError) {
          console.error('Error clearing executive spots for user (ProfilePage, fallback):', spotsError)
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id)

        if (profileError) {
          console.error('Error deleting user profile (ProfilePage, fallback):', profileError)
          alert('No se ha podido eliminar el usuario. Revisa la consola para más detalles.')
          return
        }
      } catch (fallbackErr: any) {
        console.error('❌ Error en el borrado local de datos del usuario (ProfilePage):', fallbackErr)
        alert('No se ha podido eliminar el usuario. Revisa la consola para más detalles.')
        return
      }

      // 3) Navegar de vuelta al panel de admin después de eliminar
      setShowDeleteUserModal(false)
      navigate('/admin')
    } catch (err: any) {
      console.error('Error deleting user:', err)
      alert(`Error al eliminar el usuario: ${err.message || 'Error desconocido'}`)
    } finally {
      setDeletingUser(false)
    }
  }

  const confirmVerifyUser = async () => {
    if (!user || !currentUser) return

    setVerifyingUser(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', user.id)

      if (error) throw error

      // Recargar el perfil del usuario para reflejar el estado verificado
      await loadUser(user.id)
      setShowVerifyUserModal(false)
    } catch (err: any) {
      console.error('Error verifying user:', err)
      alert(`Error al verificar el usuario: ${err.message || 'Error desconocido'}`)
    } finally {
      setVerifyingUser(false)
    }
  }

  const confirmChangeRole = async () => {
    if (!user) return

    setProcessing(true)
    try {
      // Si se está asignando el rol de directivo
      if (newRole === 'directivo' && user!.role !== 'directivo') {
        // 1. Buscar una plaza de directivo disponible
        const { data: availableSpots, error: spotsError } = await supabase
          .from('parking_spots')
          .select('*')
          .eq('is_executive', true)
          .is('assigned_to', null)
          .limit(1)

        if (spotsError) throw spotsError

        if (!availableSpots || availableSpots.length === 0) {
          alert('No hay plazas de directivo disponibles. Por favor, crea más plazas de directivo primero.')
          setProcessing(false)
          return
        }

        const assignedSpot = availableSpots[0]

        // 2. Asignar la plaza al usuario
        const { error: assignError } = await supabase
          .from('parking_spots')
          .update({ assigned_to: user.id, is_released: false })
          .eq('id', assignedSpot.id)

        if (assignError) throw assignError

        // 3. Crear reservas automáticas para todos los días futuros (hasta 1 año)
        const today = new Date()
        const oneYearLater = new Date(today)
        oneYearLater.setFullYear(today.getFullYear() + 1)
        
        const bookingsToCreate = []
        const currentDate = new Date(today)
        
        while (currentDate <= oneYearLater) {
          // Solo crear reservas para días laborables (lunes a viernes)
          const dayOfWeek = currentDate.getDay()
          if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            const dateString = currentDate.toISOString().split('T')[0]
            bookingsToCreate.push({
              user_id: user.id,
              spot_id: assignedSpot.id,
              date: dateString,
              status: 'confirmed', // Las reservas de directivos están confirmadas automáticamente
            })
          }
          currentDate.setDate(currentDate.getDate() + 1)
        }

        // Insertar todas las reservas en lotes (Supabase permite hasta 1000 por batch)
        const batchSize = 500
        for (let i = 0; i < bookingsToCreate.length; i += batchSize) {
          const batch = bookingsToCreate.slice(i, i + batchSize)
          const { error: bookingsError } = await supabase
            .from('bookings')
            .insert(batch)

          if (bookingsError) {
            // Si hay un error de duplicado, continuar (puede que ya existan algunas reservas)
            if (!bookingsError.message?.includes('duplicate') && !bookingsError.message?.includes('unique')) {
              console.error('Error creando reservas:', bookingsError)
              // No lanzar error, solo registrar
            }
          }
        }
      }
      
      // Si se está quitando el rol de directivo
      if (user!.role === 'directivo' && newRole !== 'directivo') {
        // 1. Buscar la plaza asignada al usuario
        const { data: assignedSpots, error: spotsError } = await supabase
          .from('parking_spots')
          .select('*')
          .eq('assigned_to', user.id)
          .eq('is_executive', true)

        if (spotsError) throw spotsError

        if (assignedSpots && assignedSpots.length > 0) {
          const assignedSpot = assignedSpots[0]

          // 2. Liberar la plaza
          const { error: releaseError } = await supabase
            .from('parking_spots')
            .update({ assigned_to: null, is_released: false })
            .eq('id', assignedSpot.id)

          if (releaseError) throw releaseError

          // 3. Cancelar todas las reservas futuras del usuario en esa plaza
          const today = new Date().toISOString().split('T')[0]
          const { error: cancelBookingsError } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('user_id', user.id)
            .eq('spot_id', assignedSpot.id)
            .gte('date', today)

          if (cancelBookingsError) {
            console.error('Error cancelando reservas:', cancelBookingsError)
            // No lanzar error, solo registrar
          }
        }
      }

      // Actualizar el rol del usuario
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', user.id)

      if (error) throw error

      // Recargar el perfil del usuario
      await loadUser(user.id)
      setShowRoleModal(false)
    } catch (err: any) {
      console.error('Error updating role:', err)
      alert(`Error al cambiar el rol: ${err.message || 'Error desconocido'}`)
    } finally {
      setProcessing(false)
    }
  }

  const handleLogoutClick = () => {
    setShowLogoutModal(true)
  }

  const handleConfirmLogout = async () => {
    setLoggingOut(true)
    try {
      await supabase.auth.signOut()
      navigate('/login')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
      setLoggingOut(false)
      setShowLogoutModal(false)
    }
  }

  const weeklyStats = getWeeklyStats()
  const monthlyStats = getMonthlyStats()

  if (loading) {
    return (
      <div className="p-4 min-h-screen flex items-center justify-center bg-white">
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user && !loading) {
    return (
      <div className="p-4 min-h-screen flex items-center justify-center bg-white">
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">
            {isViewingOtherUser 
              ? 'No se pudo cargar el perfil del usuario' 
              : 'Debes iniciar sesión para ver tu perfil'}
          </p>
          {isViewingOtherUser && (
            <button
              onClick={handleBackClick}
              className="px-4 py-2 rounded-[14px] bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-8 min-h-screen bg-white">
      <div className="flex items-center gap-4 mb-6">
        {isViewingOtherUser && (
          <button
            onClick={handleBackClick}
            className="p-2 rounded-[14px] transition-all duration-200 active:scale-95 bg-gray-100 hover:bg-gray-200"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" strokeWidth={2.5} />
          </button>
        )}
        <h1 
          className="text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight flex-1"
          style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
            letterSpacing: '-0.5px'
          }}
        >
          {isViewingOtherUser ? 'Perfil de Usuario' : 'Mi Perfil'}
        </h1>
      </div>

      {/* Información del usuario */}
      <div 
        className="mb-6 p-4 rounded-[20px] border border-gray-200 bg-gray-50"
      >
        <div className="flex items-center gap-4">
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#FF9500' }}
          >
            <User className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 
                  className="text-xl font-bold text-gray-900"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                  }}
                >
                  {user!.full_name || 'Usuario'}
                </h2>
                <p className="text-sm text-gray-600">{user!.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  {user!.role === 'admin' && (
                    <span 
                      className="px-2 py-0.5 text-xs font-bold text-white rounded-[8px]"
                      style={{ backgroundColor: '#FF9500' }}
                    >
                      ADMINISTRADOR
                    </span>
                  )}
                  {user!.role === 'directivo' && (
                    <span 
                      className="px-2 py-0.5 text-xs font-bold text-white rounded-[8px]"
                      style={{ backgroundColor: '#111C4E' }}
                    >
                      DIRECTIVO
                    </span>
                  )}
                  {user!.is_verified && user!.role === 'user' && (
                    <span 
                      className="px-2 py-0.5 text-xs font-bold text-white rounded-[8px] flex items-center gap-1"
                      style={{ backgroundColor: '#34C759' }}
                    >
                      <CheckCircle className="w-3 h-3" strokeWidth={2.5} />
                      Verificado
                    </span>
                  )}
                </div>
              </div>
              {canDeleteUser && (
                <button
                  onClick={handleDeleteUserClick}
                  className="p-2 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 transition-all duration-200"
                  title="Eliminar usuario permanentemente"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
        {canChangeRole && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="mb-3">
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Rol del usuario</label>
              <div className="flex items-center gap-2">
                <select
                  value={user!.role}
                  onChange={(e) => {
                    setNewRole(e.target.value as 'user' | 'directivo' | 'admin')
                    setShowRoleModal(true)
                  }}
                  className="flex-1 px-3 py-2 rounded-[14px] border border-gray-300 bg-white text-gray-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="user">Usuario</option>
                  <option value="directivo">Directivo</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
          </div>
        )}
        {canVerifyUser && (
          <div className="mt-3">
            <button
              onClick={handleVerifyUserClick}
              className="w-full px-4 py-2.5 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
            >
              <CheckCircle className="w-4 h-4" strokeWidth={2.5} />
              Aceptar usuario
            </button>
          </div>
        )}
      </div>

      {/* Estadísticas semanales y mensuales */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 mb-6">
      <div className="mb-6 lg:mb-0">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-gray-600" strokeWidth={2.5} />
          <h2 
            className="text-lg font-bold text-gray-900"
            style={{ 
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
              letterSpacing: '-0.2px'
            }}
          >
            Esta Semana
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div 
            className="p-4 rounded-[20px] border border-gray-200 bg-white"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-gray-600" strokeWidth={2} />
              <span className="text-xs font-medium text-gray-600">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{weeklyStats.total}</p>
          </div>
          <div 
            className="p-4 rounded-[20px] border border-green-200 bg-green-50"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4" style={{ color: '#34C759' }} strokeWidth={2} />
              <span className="text-xs font-medium" style={{ color: '#34C759' }}>Confirmadas</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#34C759' }}>{weeklyStats.confirmed}</p>
          </div>
          <div 
            className="p-4 rounded-[20px] border border-orange-200 bg-orange-50"
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" style={{ color: '#FF9500' }} strokeWidth={2} />
              <span className="text-xs font-medium" style={{ color: '#FF9500' }}>Pendientes</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#FF9500' }}>{weeklyStats.pending}</p>
          </div>
        </div>
      </div>

      {/* Estadísticas mensuales */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-gray-600" strokeWidth={2.5} />
          <h2 
            className="text-lg font-bold text-gray-900"
            style={{ 
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
              letterSpacing: '-0.2px'
            }}
          >
            Este Mes ({format(new Date(), 'MMMM yyyy', { locale: es })})
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div 
            className="p-4 rounded-[20px] border border-gray-200 bg-white"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-gray-600" strokeWidth={2} />
              <span className="text-xs font-medium text-gray-600">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{monthlyStats.total}</p>
          </div>
          <div 
            className="p-4 rounded-[20px] border border-green-200 bg-green-50"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4" style={{ color: '#34C759' }} strokeWidth={2} />
              <span className="text-xs font-medium" style={{ color: '#34C759' }}>Confirmadas</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#34C759' }}>{monthlyStats.confirmed}</p>
          </div>
          <div 
            className="p-4 rounded-[20px] border border-orange-200 bg-orange-50"
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4" style={{ color: '#FF9500' }} strokeWidth={2} />
              <span className="text-xs font-medium" style={{ color: '#FF9500' }}>Pendientes</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#FF9500' }}>{monthlyStats.pending}</p>
          </div>
        </div>
      </div>
      </div>

      {/* Historial de reservas - ocultable */}
      {bookings.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowBookingHistory(!showBookingHistory)}
            className="w-full flex items-center justify-between p-4 rounded-[20px] border border-gray-200 bg-white hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-600" strokeWidth={2.5} />
              <h2 
                className="text-lg font-bold text-gray-900"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                  letterSpacing: '-0.2px'
                }}
              >
                Historial de Reservas
              </h2>
              <span className="text-sm text-gray-500">({bookings.length})</span>
            </div>
            {showBookingHistory ? (
              <ChevronUp className="w-5 h-5 text-gray-600" strokeWidth={2.5} />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" strokeWidth={2.5} />
            )}
          </button>
          {showBookingHistory && (
            <div className="mt-3 space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="p-4 rounded-[20px] border bg-white transition-all duration-200"
                style={{
                  borderColor: booking.status === 'confirmed' ? '#34C759' : '#FF9500',
                  backgroundColor: booking.status === 'confirmed' ? '#F0FDF4' : '#FFF7ED'
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-5 h-5" style={{ color: booking.status === 'confirmed' ? '#34C759' : '#FF9500' }} strokeWidth={2.5} />
                      <div>
                        <p className="text-base font-bold text-gray-900 mb-0.5">
                          {format(new Date(booking.created_at), 'EEEE, d \'de\' MMMM yyyy', { locale: es })}
                        </p>
                        <p className="text-xs font-medium text-gray-500">
                          {format(new Date(booking.created_at), 'HH:mm', { locale: es })} • Para el día {formatDateDisplay(booking.date)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] flex-shrink-0 ${
                      booking.status === 'confirmed'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}
                  >
                    {booking.status === 'confirmed' ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" strokeWidth={2.5} />
                        Confirmada
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" strokeWidth={2.5} />
                        Pendiente
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      {bookings.length === 0 && !loading && (
        <div className="mb-6 p-4 rounded-[20px] border border-gray-200 bg-gray-50 text-center">
          <Calendar className="w-8 h-8 text-gray-400 mx-auto mb-2" strokeWidth={2} />
          <p className="text-sm text-gray-600">No hay reservas registradas</p>
        </div>
      )}

      {/* Botón de cerrar sesión - solo mostrar si es el perfil propio */}
      {!isViewingOtherUser && (
        <button
          onClick={handleLogoutClick}
          className="w-full p-4 rounded-[20px] border border-red-200 bg-red-50 flex items-center justify-center gap-3 transition-all duration-200 active:scale-95"
        >
          <LogOut className="w-5 h-5" style={{ color: '#FF3B30' }} strokeWidth={2.5} />
          <span 
            className="font-semibold"
            style={{ color: '#FF3B30' }}
          >
            Cerrar Sesión
          </span>
        </button>
      )}

      {/* Modal de confirmación de cierre de sesión */}
      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
        title="Cerrar sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
        confirmText="Sí, cerrar sesión"
        cancelText="Cancelar"
        loading={loggingOut}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      <ConfirmModal
        isOpen={showDeleteUserModal}
        onClose={() => setShowDeleteUserModal(false)}
        onConfirm={confirmDeleteUser}
        title="Eliminar usuario"
        message={
          user
            ? `¿Estás seguro de que deseas eliminar permanentemente a ${user!.full_name || user!.email}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        loading={deletingUser}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      <ConfirmModal
        isOpen={showVerifyUserModal}
        onClose={() => setShowVerifyUserModal(false)}
        onConfirm={confirmVerifyUser}
        title="Aceptar usuario"
        message={
          user
            ? `¿Estás seguro de que deseas aceptar y verificar a ${user!.full_name || user!.email}?`
            : ''
        }
        confirmText="Sí, aceptar"
        cancelText="Cancelar"
        loading={verifyingUser}
        confirmButtonClass="bg-green-600 hover:bg-green-700"
      />

      <ConfirmModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        onConfirm={confirmChangeRole}
        title="Cambiar Rol de Usuario"
        message={
          user
            ? `¿Estás seguro de que deseas cambiar el rol de ${user!.full_name || user!.email} de "${user!.role === 'admin' ? 'Administrador' : user!.role === 'directivo' ? 'Directivo' : 'Usuario'}" a "${newRole === 'admin' ? 'Administrador' : newRole === 'directivo' ? 'Directivo' : 'Usuario'}"?`
            : ''
        }
        confirmText="Sí, cambiar rol"
        cancelText="Cancelar"
        loading={processing}
        confirmButtonClass="bg-blue-600 hover:bg-blue-700"
      />
    </div>
  )
}
