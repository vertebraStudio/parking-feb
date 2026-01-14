import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Lock, Unlock, CheckCircle, XCircle, Calendar, Car, Shield, X, Clock, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Profile, ParkingSpot, Booking, SpotBlock } from '../types'
import ConfirmModal from '../components/ui/ConfirmModal'

interface BookingWithSpot extends Booking {
  spot?: ParkingSpot
  user?: Profile
}

export default function AdminPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [spots, setSpots] = useState<ParkingSpot[]>([])
  const [bookings, setBookings] = useState<BookingWithSpot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'users' | 'spots' | 'bookings'>('users')
  const [selectedDate, setSelectedDate] = useState<string | null>(null) // null = todas las fechas (para bookings)
  const [selectedSpotDate, setSelectedSpotDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  ) // Fecha seleccionada para bloquear plazas
  const [spotBlocks, setSpotBlocks] = useState<SpotBlock[]>([]) // Bloqueos para la fecha seleccionada
  const [loadingSpotBlocks, setLoadingSpotBlocks] = useState(false)
  const [showConfirmedBookings, setShowConfirmedBookings] = useState(true) // Mostrar reservas confirmadas
  
  // Estados para modales
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showConfirmBookingModal, setShowConfirmBookingModal] = useState(false)
  const [showRejectBookingModal, setShowRejectBookingModal] = useState(false)
  const [spotToToggle, setSpotToToggle] = useState<ParkingSpot | null>(null)
  const [bookingToConfirm, setBookingToConfirm] = useState<BookingWithSpot | null>(null)
  const [bookingToReject, setBookingToReject] = useState<BookingWithSpot | null>(null)
  const [processing, setProcessing] = useState(false)
  const loadingBookingsRef = useRef(false)

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadData()
    }
  }, [user])

  useEffect(() => {
    if (user && user.role === 'admin' && activeTab === 'bookings' && !loadingBookingsRef.current) {
      console.log('Loading bookings - activeTab:', activeTab, 'selectedDate:', selectedDate)
      loadBookings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, activeTab])

  useEffect(() => {
    if (user && user.role === 'admin' && activeTab === 'spots') {
      loadSpotBlocks()
    }
  }, [selectedSpotDate, activeTab, user])

  const loadUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        setUser(null)
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

      setUser(profile)
    } catch (error) {
      console.error('Error loading user:', error)
      setLoading(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadProfiles(), loadSpots()])
    } catch (error) {
      console.error('Error loading data:', error)
      setError('Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const loadProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProfiles(data || [])
    } catch (error) {
      console.error('Error loading profiles:', error)
    }
  }

  const loadSpots = async () => {
    try {
      const { data, error } = await supabase
        .from('parking_spots')
        .select('*')
        .order('id')

      if (error) throw error
      setSpots(data || [])
    } catch (error) {
      console.error('Error loading spots:', error)
    }
  }

  const loadBookings = async () => {
    // Evitar múltiples llamadas simultáneas
    if (loadingBookingsRef.current) {
      console.log('loadBookings already in progress, skipping...')
      return
    }
    
    console.log('loadBookings called')
    loadingBookingsRef.current = true
    setLoadingBookings(true)
    setError(null)
    try {
      let query = supabase
        .from('bookings')
        .select('*')
        .neq('status', 'cancelled')

      // Si hay una fecha seleccionada, filtrar por esa fecha
      if (selectedDate) {
        query = query.eq('date', selectedDate)
      } else {
        // Si no hay fecha seleccionada, mostrar solo reservas futuras
        const today = new Date().toISOString().split('T')[0]
        query = query.gte('date', today)
      }

      const { data: bookingsData, error: bookingsError } = await query.order('date', { ascending: true })

      console.log('Bookings query result:', { bookingsData, bookingsError, count: bookingsData?.length })

      if (bookingsError) {
        console.error('Error loading bookings:', bookingsError)
        console.error('Error details:', {
          message: bookingsError.message,
          code: bookingsError.code,
          details: bookingsError.details,
          hint: bookingsError.hint,
        })
        setError(`Error al cargar reservas: ${bookingsError.message}`)
        setBookings([])
        return
      }

      // Cargar información de plazas y usuarios
      if (bookingsData && bookingsData.length > 0) {
        const spotIds = [...new Set(bookingsData.map(b => b.spot_id))]
        const userIds = [...new Set(bookingsData.map(b => b.user_id))]

        const [spotsResult, usersResult] = await Promise.all([
          supabase.from('parking_spots').select('*').in('id', spotIds),
          supabase.from('profiles').select('*').in('id', userIds)
        ])

        if (spotsResult.error) {
          console.error('Error loading spots:', spotsResult.error)
        }
        if (usersResult.error) {
          console.error('Error loading users:', usersResult.error)
        }

        const bookingsWithDetails: BookingWithSpot[] = bookingsData.map(booking => ({
          ...booking,
          spot: spotsResult.data?.find(s => s.id === booking.spot_id),
          user: usersResult.data?.find(u => u.id === booking.user_id)
        }))

        // Filtrar reservas de directivos (no deben aparecer en el panel de administración)
        const bookingsWithoutDirectivos = bookingsWithDetails.filter(booking => {
          // Excluir reservas de usuarios con rol 'directivo'
          return booking.user?.role !== 'directivo'
        })

        // Ordenar: primero las pendientes, luego las confirmadas
        // Dentro de cada grupo, ordenar por fecha (ascendente)
        bookingsWithoutDirectivos.sort((a, b) => {
          // Primero ordenar por estado: pending primero
          if (a.status === 'pending' && b.status !== 'pending') return -1
          if (a.status !== 'pending' && b.status === 'pending') return 1
          
          // Si tienen el mismo estado, ordenar por fecha
          if (a.date < b.date) return -1
          if (a.date > b.date) return 1
          
          // Si tienen la misma fecha, ordenar por fecha de creación (más recientes primero)
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

        console.log('Setting bookings:', bookingsWithoutDirectivos.length)
        setBookings(bookingsWithoutDirectivos)
      } else {
        console.log('No bookings data, setting empty array')
        setBookings([])
      }
    } catch (error: any) {
      console.error('Error loading bookings:', error)
      setError('Error al cargar las reservas. Ver consola para más detalles.')
      setBookings([])
    } finally {
      setLoadingBookings(false)
      loadingBookingsRef.current = false
      console.log('loadBookings finished, loadingBookings set to false')
    }
  }


  const loadSpotBlocks = async () => {
    if (!user || !selectedSpotDate) return

    setLoadingSpotBlocks(true)
    try {
      const { data, error } = await supabase
        .from('spot_blocks')
        .select('*')
        .eq('date', selectedSpotDate)

      if (error) {
        // Si la tabla no existe, mostrar un mensaje pero no fallar
        if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          setError('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase para habilitar esta funcionalidad.')
          setSpotBlocks([])
          return
        }
        throw error
      }

      setSpotBlocks(data || [])
    } catch (err: any) {
      console.error('Error loading spot blocks:', err)
      setError(err.message || 'Error al cargar los bloqueos')
    } finally {
      setLoadingSpotBlocks(false)
    }
  }

  const isSpotBlocked = (spotId: number): boolean => {
    return spotBlocks.some(block => block.spot_id === spotId)
  }

  const handleToggleSpot = (spot: ParkingSpot) => {
    if (!selectedSpotDate) {
      setError('Por favor, selecciona una fecha primero')
      return
    }
    setSpotToToggle(spot)
    setShowBlockModal(true)
  }

  const confirmToggleSpot = async () => {
    if (!spotToToggle || !user || !selectedSpotDate) return

    setProcessing(true)
    try {
      const isBlocked = isSpotBlocked(spotToToggle.id)

      if (isBlocked) {
        // Eliminar bloqueo
        const block = spotBlocks.find(b => b.spot_id === spotToToggle.id && b.date === selectedSpotDate)
        if (block) {
          const { error } = await supabase
            .from('spot_blocks')
            .delete()
            .eq('id', block.id)

          if (error) {
            if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
              throw new Error('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase.')
            }
            throw error
          }
        }
      } else {
        // Crear bloqueo
        const { error } = await supabase
          .from('spot_blocks')
          .insert({
            spot_id: spotToToggle.id,
            date: selectedSpotDate,
            created_by: user.id
          })

        if (error) {
          if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
            throw new Error('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          }
          throw error
        }
      }

      await loadSpotBlocks()
      setShowBlockModal(false)
      setSpotToToggle(null)
      setError(null)
    } catch (err: any) {
      console.error('Error updating spot block:', err)
      setError(err.message || 'Error al actualizar el bloqueo de la plaza')
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirmBooking = (booking: BookingWithSpot) => {
    setBookingToConfirm(booking)
    setShowConfirmBookingModal(true)
  }

  const confirmBookingStatus = async () => {
    if (!bookingToConfirm) return

    setProcessing(true)
    setError(null)
    try {
      const newStatus = bookingToConfirm.status === 'pending' ? 'confirmed' : 'pending'
      const { error } = await supabase
        .from('bookings')
        .update({ status: newStatus })
        .eq('id', bookingToConfirm.id)

      if (error) throw error

      // Cerrar el modal primero
      setShowConfirmBookingModal(false)
      setBookingToConfirm(null)
      
      // Esperar un momento antes de recargar para asegurar que la BD se actualizó
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Recargar las reservas
      await loadBookings()
    } catch (err: any) {
      console.error('Error updating booking:', err)
      setError(err.message || 'Error al actualizar la reserva')
      setShowConfirmBookingModal(false)
      setBookingToConfirm(null)
    } finally {
      setProcessing(false)
    }
  }

  const handleRejectBooking = (booking: BookingWithSpot) => {
    setBookingToReject(booking)
    setShowRejectBookingModal(true)
  }

  const confirmRejectBooking = async () => {
    if (!bookingToReject) return

    setProcessing(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingToReject.id)

      if (error) throw error

      // Cerrar el modal primero
      setShowRejectBookingModal(false)
      setBookingToReject(null)
      
      // Esperar un momento antes de recargar para asegurar que la BD se actualizó
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Recargar las reservas
      await loadBookings()
    } catch (err: any) {
      console.error('Error rejecting booking:', err)
      setError(err.message || 'Error al rechazar la reserva')
      setShowRejectBookingModal(false)
      setBookingToReject(null)
    } finally {
      setProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`
  }

  const formatDateDisplay = (dateString: string | null) => {
    if (!dateString) return 'Todas las fechas'
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
      <div className="p-4 min-h-screen flex items-center justify-center bg-white">
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-4 min-h-screen flex items-center justify-center bg-white">
        <div className="text-center py-12 rounded-[20px] border border-gray-200 bg-gray-50 px-8">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" strokeWidth={1.5} />
          <h2 
            className="text-xl font-semibold text-gray-900 mb-2"
            style={{ 
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
              letterSpacing: '-0.3px'
            }}
          >
            Acceso Restringido
          </h2>
          <p className="text-gray-600">Solo los administradores pueden acceder a esta sección</p>
        </div>
      </div>
    )
  }

  const unverifiedUsers = profiles.filter(p => !p.is_verified && p.role === 'user')
  const verifiedUsers = profiles.filter(p => p.is_verified || p.role === 'admin')

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
        Panel de Administración
      </h1>

      {error && (
        <div 
          className="mb-4 p-4 rounded-[20px] border border-red-400/30"
          style={{
            backgroundColor: 'rgba(255, 59, 48, 0.15)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          }}
        >
          <p className="text-red-200 text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* Tabs - iOS Style */}
      <div 
        className="flex gap-2 mb-6 rounded-[20px] p-2 border border-gray-200 bg-gray-50"
      >
        <button
          onClick={() => {
            setActiveTab('users')
            setError(null)
          }}
          className={`px-4 py-2.5 font-semibold text-sm rounded-[14px] transition-all duration-200 active:scale-95 ${
            activeTab === 'users'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'users' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Users className="w-4 h-4 inline mr-2" strokeWidth={activeTab === 'users' ? 2.5 : 2} />
          Usuarios
        </button>
        <button
          onClick={() => {
            setActiveTab('spots')
            setError(null)
          }}
          className={`px-4 py-2.5 font-semibold text-sm rounded-[14px] transition-all duration-200 active:scale-95 ${
            activeTab === 'spots'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'spots' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Car className="w-4 h-4 inline mr-2" strokeWidth={activeTab === 'spots' ? 2.5 : 2} />
          Plazas
        </button>
        <button
          onClick={() => {
            setActiveTab('bookings')
            setError(null)
          }}
          className={`px-4 py-2.5 font-semibold text-sm rounded-[14px] transition-all duration-200 active:scale-95 ${
            activeTab === 'bookings'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'bookings' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Calendar className="w-4 h-4 inline mr-2" strokeWidth={activeTab === 'bookings' ? 2.5 : 2} />
          Reservas
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Usuarios sin verificar */}
          {unverifiedUsers.length > 0 && (
            <div>
              <h2 
                className="text-lg font-bold text-gray-900 mb-3"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                  letterSpacing: '-0.2px'
                }}
              >
                Usuarios Pendientes de Verificación ({unverifiedUsers.length})
              </h2>
              <div className="space-y-3">
                {unverifiedUsers.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-[20px] p-5 transition-all duration-200 bg-white border border-orange-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 mb-1.5">{profile.full_name || 'Sin nombre'}</p>
                        <p className="text-sm text-gray-600 mb-2">{profile.email}</p>
                        <p className="text-xs text-gray-500">
                          Registrado: {new Date(profile.created_at).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <button
                          onClick={() => navigate(`/profile/${profile.id}`)}
                          className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-[14px] font-medium hover:bg-gray-50 transition-colors active:scale-95 flex items-center gap-1.5"
                          title="Ver perfil"
                        >
                          <User className="w-4 h-4" strokeWidth={2} />
                          Ver Perfil
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Usuarios verificados */}
          <div>
            <h2 
              className="text-lg font-bold text-gray-900 mb-3"
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                letterSpacing: '-0.2px'
              }}
            >
              Usuarios Verificados ({verifiedUsers.length})
            </h2>
            <div className="space-y-2">
              {verifiedUsers.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-[20px] p-4 transition-all duration-200 bg-white border border-gray-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{profile.full_name || 'Sin nombre'}</p>
                        {profile.role === 'admin' && (
                          <span 
                            className="px-2 py-0.5 text-xs font-bold text-white rounded-[8px]"
                            style={{
                              backgroundColor: '#FF9500',
                            }}
                          >
                            ADMIN
                          </span>
                        )}
                        {profile.is_verified && profile.role === 'user' && (
                          <CheckCircle className="w-4 h-4" style={{ color: '#34C759' }} strokeWidth={2.5} />
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{profile.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/profile/${profile.id}`)}
                        className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-[14px] font-medium hover:bg-gray-50 transition-colors active:scale-95 flex items-center gap-1.5"
                        title="Ver perfil"
                      >
                        <User className="w-4 h-4" strokeWidth={2} />
                        Ver Perfil
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spots' && (
        <div className="space-y-4">
          {/* Selector de fecha para bloquear plazas */}
          <div 
            className="rounded-[20px] p-4 border border-gray-200 bg-gray-50"
          >
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Seleccionar fecha para bloquear plazas
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                value={selectedSpotDate}
                onChange={(e) => setSelectedSpotDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-[14px] focus:outline-none transition-colors text-gray-900 bg-white"
                onFocus={(e) => {
                  e.target.style.borderColor = '#FF9500'
                  e.target.style.boxShadow = '0 0 0 3px rgba(255, 149, 0, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#D1D5DB'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
            <div className="mt-2">
              <p className="text-sm font-medium text-gray-700">
                {formatDateDisplay(selectedSpotDate)}
              </p>
            </div>
          </div>

          {/* Estado de carga */}
          {loadingSpotBlocks && (
            <div className="text-center py-4">
              <p className="text-gray-600">Cargando bloqueos...</p>
            </div>
          )}

          {/* Lista de plazas */}
          <div className="space-y-3">
            {spots.map((spot) => {
              const blocked = isSpotBlocked(spot.id)
              return (
                <div
                  key={spot.id}
                  className={`border-2 rounded-xl p-4 ${
                    blocked
                      ? 'bg-gray-100 border-gray-400'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Car className={`w-6 h-6 ${blocked ? 'text-gray-500' : 'text-green-600'}`} />
                      <div>
                        <p className="font-bold text-gray-900">{spot.label}</p>
                        {blocked && (
                          <p className="text-xs text-red-600 font-medium">Bloqueada para esta fecha</p>
                        )}
                        {!blocked && (
                          <p className="text-xs text-gray-500">Disponible</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleSpot(spot)}
                      disabled={processing}
                      className={`px-4 py-2 rounded-xl font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                        blocked
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {blocked ? (
                        <>
                          <Unlock className="w-4 h-4" />
                          Desbloquear
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          Bloquear
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {/* Selector de fecha */}
          <div 
            className="rounded-[20px] p-4 border border-gray-200 bg-gray-50"
          >
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Filtrar por fecha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="date"
                value={selectedDate || ''}
                onChange={(e) => setSelectedDate(e.target.value || null)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-[14px] focus:outline-none transition-colors text-gray-900 bg-white"
                onFocus={(e) => {
                  e.target.style.borderColor = '#FF9500'
                  e.target.style.boxShadow = '0 0 0 3px rgba(255, 149, 0, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#D1D5DB'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">
                {formatDateDisplay(selectedDate)}
              </p>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-[#FF9500] font-semibold hover:text-[#FF9500]/80 underline"
                >
                  Ver todas
                </button>
              )}
            </div>
          </div>

          {/* Toggle para mostrar/ocultar confirmadas */}
          <div 
            className="rounded-[20px] p-4 border border-gray-200 bg-gray-50 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                Mostrar reservas confirmadas
              </span>
            </div>
            <button
              onClick={() => setShowConfirmedBookings(!showConfirmedBookings)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                showConfirmedBookings 
                  ? 'bg-[#FF9500] focus:ring-[#FF9500]' 
                  : 'bg-gray-300 focus:ring-gray-400'
              }`}
              role="switch"
              aria-checked={showConfirmedBookings}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  showConfirmedBookings ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Estado de carga */}
          {loadingBookings ? (
            <div className="text-center py-8">
              <p className="text-gray-600">Cargando reservas...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 rounded-[20px] border border-gray-200 bg-gray-50">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">
                {selectedDate ? 'No hay reservas para esta fecha' : 'No hay reservas activas'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings
                .filter(booking => showConfirmedBookings || booking.status === 'pending')
                .map((booking) => (
                <div
                  key={booking.id}
                  className={`bg-white border rounded-[20px] p-4 transition-all duration-200 ${
                    booking.status === 'pending' 
                      ? 'border-orange-200' 
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Car className="w-5 h-5" style={{ color: '#FF9500' }} strokeWidth={2.5} />
                        <span className="font-bold text-gray-900">
                          {booking.spot?.label || `Plaza ${booking.spot_id}`}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" strokeWidth={2} />
                        {formatDate(booking.date)}
                      </p>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-600" strokeWidth={2} />
                        {booking.user ? (
                          <button
                            onClick={() => navigate(`/profile/${booking.user.id}`)}
                            className="text-sm text-gray-600 hover:text-orange-600 transition-colors underline decoration-dotted underline-offset-2"
                            title="Ver perfil del usuario"
                          >
                            {booking.user.full_name || booking.user.email || 'Usuario desconocido'}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-600">Usuario desconocido</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1.5 text-xs font-semibold rounded-[10px] ${
                        booking.status === 'confirmed'
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-orange-50 text-orange-700 border border-orange-200'
                      }`}
                    >
                      {booking.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                    </span>
                  </div>
                  {booking.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmBooking(booking)}
                        className="flex-1 px-4 py-2 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: '#34C759',
                          boxShadow: '0 2px 8px rgba(52, 199, 89, 0.3)'
                        }}
                      >
                        <CheckCircle className="w-4 h-4" strokeWidth={2.5} />
                        Confirmar
                      </button>
                      <button
                        onClick={() => handleRejectBooking(booking)}
                        className="flex-1 px-4 py-2 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
                        style={{
                          backgroundColor: '#FF3B30',
                          boxShadow: '0 2px 8px rgba(255, 59, 48, 0.3)'
                        }}
                      >
                        <X className="w-4 h-4" strokeWidth={2.5} />
                        Rechazar
                      </button>
                    </div>
                  )}
                  {booking.status === 'confirmed' && (
                    <button
                      onClick={() => handleConfirmBooking(booking)}
                      className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-[14px] font-semibold hover:bg-gray-50 transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Clock className="w-4 h-4" strokeWidth={2.5} />
                      Marcar como Pendiente
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de verificación */}

      {/* Modal de bloqueo/desbloqueo */}
      <ConfirmModal
        isOpen={showBlockModal}
        onClose={() => {
          setShowBlockModal(false)
          setSpotToToggle(null)
        }}
        onConfirm={confirmToggleSpot}
        title={spotToToggle && isSpotBlocked(spotToToggle.id) ? 'Desbloquear Plaza' : 'Bloquear Plaza'}
        message={
          spotToToggle && selectedSpotDate
            ? `¿Estás seguro de que deseas ${isSpotBlocked(spotToToggle.id) ? 'desbloquear' : 'bloquear'} ${spotToToggle.label} para el ${formatDateDisplay(selectedSpotDate)}?`
            : ''
        }
        confirmText={spotToToggle && isSpotBlocked(spotToToggle.id) ? 'Sí, desbloquear' : 'Sí, bloquear'}
        loading={processing}
        confirmButtonClass={
          spotToToggle && isSpotBlocked(spotToToggle.id)
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-red-600 hover:bg-red-700'
        }
      />

      {/* Modal de confirmación de reserva */}
      <ConfirmModal
        isOpen={showConfirmBookingModal}
        onClose={() => {
          setShowConfirmBookingModal(false)
          setBookingToConfirm(null)
        }}
        onConfirm={confirmBookingStatus}
        title={bookingToConfirm?.status === 'pending' ? 'Confirmar Reserva' : 'Marcar como Pendiente'}
        message={
          bookingToConfirm
            ? `¿Estás seguro de que deseas ${bookingToConfirm.status === 'pending' ? 'confirmar' : 'marcar como pendiente'} la reserva de ${bookingToConfirm.spot?.label || `Plaza ${bookingToConfirm.spot_id}`} para el ${formatDateDisplay(bookingToConfirm.date)}?`
            : ''
        }
        confirmText={bookingToConfirm?.status === 'pending' ? 'Sí, confirmar' : 'Sí, marcar como pendiente'}
        loading={processing}
      />

      {/* Modal de rechazo de reserva */}
      <ConfirmModal
        isOpen={showRejectBookingModal}
        onClose={() => {
          setShowRejectBookingModal(false)
          setBookingToReject(null)
        }}
        onConfirm={confirmRejectBooking}
        title="Rechazar Reserva"
        message={
          bookingToReject
            ? `¿Estás seguro de que deseas rechazar la reserva de ${bookingToReject.spot?.label || `Plaza ${bookingToReject.spot_id}`} para el ${formatDateDisplay(bookingToReject.date)}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Sí, rechazar"
        cancelText="Cancelar"
        loading={processing}
      />
    </div>
  )
}
