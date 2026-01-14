import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addDays, subDays, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import ParkingMap from '../components/ParkingMap'
import ConfirmModal from '../components/ui/ConfirmModal'
import { ParkingSpot, Booking, Profile, SpotBlock } from '../types'
import { supabase } from '../lib/supabase'

export default function MapPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [spots, setSpots] = useState<ParkingSpot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsWithUsers, setBookingsWithUsers] = useState<(Booking & { user?: Profile })[]>([])
  const [userBookings, setUserBookings] = useState<Booking[]>([]) // Todas las reservas del usuario
  const [spotBlocks, setSpotBlocks] = useState<SpotBlock[]>([]) // Bloqueos por fecha
  const [executiveProfiles, setExecutiveProfiles] = useState<Map<string, Profile>>(new Map()) // Perfiles de directivos asignados
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  // Inicializar selectedDate con la fecha del estado de navegación si existe
  const initialDate = (location.state as any)?.selectedDate || new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState<string>(initialDate)
  const selectedDateRef = useRef(selectedDate)
  const [user, setUser] = useState<Profile | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null)
  const [reserving, setReserving] = useState(false)
  const [releasingSpot, setReleasingSpot] = useState<number | null>(null)
  const [occupyingSpot, setOccupyingSpot] = useState<number | null>(null)

  useEffect(() => {
    loadSpots()
    loadUser()

    // Escuchar cambios en la autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadUser()
      } else {
        setUser(null)
        setUserBookings([])
      }
    })

    // Suscripción a cambios en tiempo real en la tabla bookings
    const bookingsChannel = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => {
          // Recargar reservas cuando hay cambios (insert, update, delete)
          // Usar el ref para obtener el valor actual sin causar re-suscripciones
          loadBookings(selectedDateRef.current)
          // loadUserBookings se llamará automáticamente si hay usuario
        }
      )
      .subscribe()

    // Suscripción a cambios en tiempo real en la tabla parking_spots
    // Esto es necesario para detectar cuando un directivo libera/ocupa su plaza
    const spotsChannel = supabase
      .channel('spots-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parking_spots',
        },
        () => {
          // Recargar plazas cuando hay cambios (especialmente is_released)
          loadSpots()
        }
      )
      .subscribe()

    // Recargar cuando la página recupera el foco (por si se canceló una reserva en otra pestaña/página)
    const handleFocus = () => {
      // Usar el ref para obtener el valor actual
      loadBookings(selectedDateRef.current)
      loadSpots() // También recargar plazas
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      subscription.unsubscribe()
      supabase.removeChannel(bookingsChannel)
      supabase.removeChannel(spotsChannel)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadUserBookings()
    }
  }, [user])

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  // Actualizar la fecha si viene del estado de navegación
  useEffect(() => {
    const dateFromState = (location.state as any)?.selectedDate
    if (dateFromState && dateFromState !== selectedDate) {
      setSelectedDate(dateFromState)
      // Limpiar el estado de navegación para evitar que se mantenga en navegaciones posteriores
      window.history.replaceState({}, '')
    }
  }, [location.state])

  useEffect(() => {
    loadBookings(selectedDate)
    loadSpotBlocks(selectedDate)
  }, [selectedDate])

  // Recargar reservas cuando el usuario vuelve a esta página
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadBookings(selectedDate)
        if (user) {
          loadUserBookings()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedDate, user])

  const loadUser = async () => {
    try {
      // Primero verificar la sesión
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('Error getting session:', sessionError)
        return
      }

      if (!session || !session.user) {
        console.log('No hay sesión activa')
        setUser(null)
        return
      }

      console.log('Usuario autenticado:', session.user.email)

      // Cargar el perfil
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        console.error('Error details:', {
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint,
        })
        
        // Si el perfil no existe, puede ser que el trigger no haya funcionado
        // Intentar crear el perfil básico
        if (profileError.code === 'PGRST116') {
          console.log('Perfil no encontrado, intentando crear...')
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: session.user.id,
              email: session.user.email || '',
              full_name: session.user.user_metadata?.full_name || null,
              role: 'user',
              is_verified: false,
            })
            .select()
            .single()

          if (createError) {
            console.error('Error creating profile:', createError)
            setError('No se pudo cargar tu perfil. Verifica las políticas RLS en Supabase.')
          } else {
            setUser(newProfile)
          }
        } else if (profileError.code === '42501' || profileError.message?.includes('permission')) {
          // Error de permisos RLS
          setError('Error de permisos: No tienes acceso a tu perfil. Verifica las políticas RLS.')
        } else {
          setError(`Error al cargar perfil: ${profileError.message}`)
        }
        return
      }

      console.log('Perfil cargado:', profile)
      setUser(profile)
    } catch (error) {
      console.error('Error loading user:', error)
    }
  }

  const loadSpots = async () => {
    try {
      setConnectionError(null)
      
      // Cargar plazas (solo una vez, no cambian)
      const { data: spotsData, error: spotsError } = await supabase
        .from('parking_spots')
        .select('*')
        .order('id')

      if (spotsError) {
        console.error('Error cargando plazas:', spotsError)
        setConnectionError(`Error al cargar plazas: ${spotsError.message}`)
        // Si hay error, usar datos mock para desarrollo
        const mockSpots: ParkingSpot[] = Array.from({ length: 8 }, (_, i) => ({
          id: i + 1,
          label: `Plaza ${i + 1}`,
          is_blocked: false,
          is_executive: false,
          assigned_to: null,
          is_released: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
        setSpots(mockSpots)
      } else {
        console.log('Plazas cargadas:', spotsData)
        // Asegurar que las plazas tengan los campos nuevos con valores por defecto
        const spotsWithDefaults = (spotsData || []).map(spot => ({
          ...spot,
          is_executive: spot.is_executive ?? false,
          assigned_to: spot.assigned_to ?? null,
          is_released: spot.is_released ?? false,
        }))
        setSpots(spotsWithDefaults)
        
        // Cargar perfiles de directivos asignados a las plazas
        const executiveUserIds = spotsWithDefaults
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
    } catch (error) {
      console.error('Error loading spots:', error)
      setConnectionError('Error al cargar los datos. Ver consola para más detalles.')
      // Usar datos mock en caso de error
      const mockSpots: ParkingSpot[] = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        label: `Plaza ${i + 1}`,
        is_blocked: false,
        is_executive: false,
        assigned_to: null,
        is_released: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      setSpots(mockSpots)
    } finally {
      setLoading(false)
    }
  }

  const loadBookings = async (date: string) => {
    try {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', date)
        .neq('status', 'cancelled')

      if (bookingsError) {
        console.error('Error cargando reservas:', bookingsError)
        console.error('Error details:', {
          message: bookingsError.message,
          code: bookingsError.code,
          details: bookingsError.details,
          hint: bookingsError.hint,
        })
        
        // Si es un error 500, probablemente es un problema de RLS
        if (bookingsError.code === '42501' || bookingsError.message?.includes('permission') || bookingsError.message?.includes('500')) {
          console.warn('Error de permisos al cargar reservas. Verifica las políticas RLS.')
          // Continuar sin reservas en lugar de mostrar error
        }
        setBookings([])
        setBookingsWithUsers([])
      } else {
        setBookings(bookingsData || [])
        
        // Cargar perfiles de usuarios que tienen reservas
        if (bookingsData && bookingsData.length > 0) {
          const userIds = [...new Set(bookingsData.map(b => b.user_id))]
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds)

          if (profilesError) {
            console.error('Error cargando perfiles:', profilesError)
            console.error('Error details:', {
              message: profilesError.message,
              code: profilesError.code,
              details: profilesError.details,
              hint: profilesError.hint,
            })
            // Si es un error de permisos, intentar cargar solo los campos básicos necesarios
            if (profilesError.code === '42501' || profilesError.message?.includes('permission')) {
              console.warn('Error de permisos al cargar perfiles. Verifica las políticas RLS en Supabase.')
              console.warn('Ejecuta el script fix_profiles_rls_for_map.sql en Supabase para permitir que los usuarios vean los perfiles de otros.')
              console.warn('Este script recreará las políticas RLS correctamente para que todos los usuarios autenticados puedan ver los perfiles.')
            }
            setBookingsWithUsers(bookingsData.map(b => ({ ...b, user: undefined })))
          } else {
            console.log('Perfiles cargados:', profilesData?.length || 0, 'de', userIds.length, 'usuarios')
            const bookingsWithUserInfo = bookingsData.map(booking => {
              const userProfile = profilesData?.find(p => p.id === booking.user_id)
              if (!userProfile) {
                console.warn(`No se encontró perfil para el usuario ${booking.user_id} en la reserva ${booking.id}`)
              }
              return {
                ...booking,
                user: userProfile
              }
            })
            
            // Log detallado para depuración
            const bookingsWithUsers = bookingsWithUserInfo.filter(b => b.user)
            const bookingsWithoutUsers = bookingsWithUserInfo.filter(b => !b.user)
            console.log('Reservas con información de usuario:', bookingsWithUsers.length)
            console.log('Reservas sin información de usuario:', bookingsWithoutUsers.length)
            
            if (bookingsWithoutUsers.length > 0) {
              console.warn('Algunas reservas no tienen información de usuario. Esto puede ser un problema de permisos RLS.')
              console.warn('Ejecuta el script fix_profiles_rls_for_map.sql en Supabase para solucionarlo.')
            }
            
            setBookingsWithUsers(bookingsWithUserInfo)
          }
        } else {
          setBookingsWithUsers([])
        }
      }
    } catch (error) {
      console.error('Error loading bookings:', error)
      setBookings([])
      setBookingsWithUsers([])
    }
  }

  const loadSpotBlocks = async (date: string) => {
    try {
      const { data, error } = await supabase
        .from('spot_blocks')
        .select('*')
        .eq('date', date)

      if (error) {
        // Si la tabla no existe, simplemente no hay bloqueos
        if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          setSpotBlocks([])
          return
        }
        console.error('Error cargando bloqueos:', error)
        setSpotBlocks([])
      } else {
        setSpotBlocks(data || [])
      }
    } catch (error) {
      console.error('Error loading spot blocks:', error)
      setSpotBlocks([])
    }
  }

  const loadUserBookings = async () => {
    if (!user) return

    try {
      const today = new Date()
      // Calcular el final de la semana (domingo)
      const endOfWeek = new Date(today)
      const dayOfWeek = today.getDay() // 0 = domingo, 6 = sábado
      const daysUntilSunday = 7 - dayOfWeek
      endOfWeek.setDate(today.getDate() + daysUntilSunday)

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', today.toISOString().split('T')[0])
        .lte('date', endOfWeek.toISOString().split('T')[0])
        .neq('status', 'cancelled')
        .order('date', { ascending: true })

      if (bookingsError) {
        console.error('Error cargando reservas del usuario:', bookingsError)
        setUserBookings([])
      } else {
        setUserBookings(bookingsData || [])
      }
    } catch (error) {
      console.error('Error loading user bookings:', error)
      setUserBookings([])
    }
  }

  const handleSpotSelect = async (spotId: number) => {
    if (!user) {
      setError('Debes iniciar sesión para reservar')
      return
    }

    // Obtener información de la plaza
    const spot = spots.find(s => s.id === spotId)
    if (!spot) {
      setError('Plaza no encontrada')
      return
    }

    // Si es plaza de directivo, verificar si está disponible
    if (spot.is_executive) {
      // Si no hay directivo asignado, la plaza está disponible
      if (!spot.assigned_to) {
        // Continuar con la reserva normal
      } else {
        // Si hay directivo asignado, verificar si tiene reserva activa para este día
        const { data: executiveBooking, error: executiveBookingError } = await supabase
          .from('bookings')
          .select('*')
          .eq('spot_id', spotId)
          .eq('date', selectedDate)
          .eq('user_id', spot.assigned_to)
          .neq('status', 'cancelled')
          .maybeSingle()
        
        if (executiveBookingError && executiveBookingError.code !== 'PGRST116') {
          console.error('Error verificando reserva del directivo:', executiveBookingError)
          // Continuar con la verificación normal si hay error
        } else if (executiveBooking) {
          // Si el directivo tiene reserva activa y la plaza no está liberada globalmente, no se puede reservar
          if (!spot.is_released) {
            setError('Esta plaza está asignada a un directivo y no está disponible')
            return
          }
          // Si está liberada globalmente, se puede reservar aunque el directivo tenga reserva
        }
        // Si el directivo no tiene reserva activa, se puede reservar (ya sea liberada globalmente o solo para este día)
      }
    }

    if (!user.is_verified) {
      setError('Tu cuenta debe ser verificada por un administrador antes de poder reservar')
      return
    }

    // Verificar si ya tiene una reserva para esta fecha (consultando la BD para estar seguros)
    const { data: userBookingForDate } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', selectedDate)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (userBookingForDate) {
      // No mostrar error, el indicador visual azul ya muestra que tiene reserva
      return
    }

    // Verificar si la plaza ya está ocupada (excluyendo reservas canceladas)
    // Primero obtener TODAS las reservas para esta plaza y fecha (incluyendo canceladas para debug)
    const { data: allBookingsForSpot } = await supabase
      .from('bookings')
      .select('*')
      .eq('spot_id', spotId)
      .eq('date', selectedDate)

    console.log('🔍 Debug: Todas las reservas para plaza', spotId, 'fecha', selectedDate, ':', allBookingsForSpot)

    // Ahora obtener solo las reservas no canceladas
    const { data: spotBookingForDate, error: spotBookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('spot_id', spotId)
      .eq('date', selectedDate)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (spotBookingError && spotBookingError.code !== 'PGRST116') {
      // PGRST116 es "no rows returned", que es esperado si no hay reserva
      console.error('Error verificando reserva de la plaza:', spotBookingError)
      setError('Error al verificar la disponibilidad de la plaza')
      return
    }

    if (spotBookingForDate) {
      // Verificar que la reserva no esté cancelada (doble verificación)
      if (spotBookingForDate.status === 'cancelled') {
        console.log('⚠️ Reserva encontrada pero está cancelada, continuando con la reserva')
        // Si está cancelada, continuar con la reserva
      } else {
        console.log('❌ Reserva activa encontrada que bloquea la reserva:', spotBookingForDate)
        setError('Esta plaza ya está reservada para esta fecha')
        // Recargar reservas para actualizar la vista
        await loadBookings(selectedDate)
        return
      }
    } else {
      console.log('✅ No hay reservas activas para plaza', spotId, 'fecha', selectedDate, '- continuando con la reserva')
    }

    // Verificar si la plaza está bloqueada para esta fecha
    const { data: spotBlock, error: spotBlockError } = await supabase
      .from('spot_blocks')
      .select('*')
      .eq('spot_id', spotId)
      .eq('date', selectedDate)
      .maybeSingle()

    // Si la tabla no existe, ignorar el error y continuar
    if (spotBlockError && spotBlockError.code !== 'PGRST116') {
      if (spotBlockError.message?.includes('does not exist') || spotBlockError.message?.includes('schema cache')) {
        console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
        // Continuar sin verificar bloqueos si la tabla no existe
      }
    }

    if (spotBlock) {
      setError('Esta plaza está bloqueada para esta fecha')
      return
    }

    setSelectedSpotId(spotId)
    setShowConfirmModal(true)
  }

  const handleConfirmReservation = async () => {
    if (!selectedSpotId || !user) return

    setReserving(true)
    setError(null)
    try {
      // Verificar si el usuario ya tiene una reserva para esta fecha (en cualquier plaza)
      const { data: userBookingForDate, error: userBookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', selectedDate)
        .neq('status', 'cancelled')
        .maybeSingle()

      if (userBookingError && userBookingError.code !== 'PGRST116') {
        // PGRST116 es "no rows returned", que es esperado si no hay reserva
        throw userBookingError
      }

      if (userBookingForDate) {
        setError('Ya tienes una reserva para esta fecha')
        setShowConfirmModal(false)
        setReserving(false)
        return
      }

      // Verificar si la plaza ya está ocupada para esta fecha (consultando directamente la BD)
      // Primero obtener TODAS las reservas para debug
      const { data: allBookingsForSpotConfirm } = await supabase
        .from('bookings')
        .select('*')
        .eq('spot_id', selectedSpotId)
        .eq('date', selectedDate)

      console.log('🔍 Debug (confirm): Todas las reservas para plaza', selectedSpotId, 'fecha', selectedDate, ':', allBookingsForSpotConfirm)

      const { data: spotBookingForDate, error: spotBookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('spot_id', selectedSpotId)
        .eq('date', selectedDate)
        .neq('status', 'cancelled')
        .maybeSingle()

      if (spotBookingError && spotBookingError.code !== 'PGRST116') {
        throw spotBookingError
      }

      if (spotBookingForDate) {
        // Verificar que la reserva no esté cancelada (doble verificación)
        if (spotBookingForDate.status === 'cancelled') {
          console.log('⚠️ Reserva encontrada pero está cancelada (confirm), continuando con la reserva')
          // Si está cancelada, continuar con la reserva
        } else {
          console.log('❌ Reserva activa encontrada que bloquea la reserva (confirm):', spotBookingForDate)
          setError('Esta plaza ya está reservada para esta fecha')
          setShowConfirmModal(false)
          setReserving(false)
          // Recargar reservas para actualizar la vista
          await loadBookings(selectedDate)
          return
        }
      } else {
        console.log('✅ No hay reservas activas para plaza', selectedSpotId, 'fecha', selectedDate, '- continuando con la reserva (confirm)')
      }

      // Verificar si la plaza está bloqueada para esta fecha
      const { data: spotBlock, error: spotBlockError } = await supabase
        .from('spot_blocks')
        .select('*')
        .eq('spot_id', selectedSpotId)
        .eq('date', selectedDate)
        .maybeSingle()

      // Si la tabla no existe, ignorar el error y continuar
      if (spotBlockError && spotBlockError.code !== 'PGRST116') {
        if (spotBlockError.message?.includes('does not exist') || spotBlockError.message?.includes('schema cache')) {
          console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          // Continuar sin verificar bloqueos si la tabla no existe
        } else {
          throw spotBlockError
        }
      }

      if (spotBlock) {
        setError('Esta plaza está bloqueada para esta fecha')
        setShowConfirmModal(false)
        setReserving(false)
        return
      }

      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          spot_id: selectedSpotId,
          date: selectedDate,
          status: 'pending',
        })
        .select()
        .single()

      if (bookingError) {
        // Manejar específicamente el error de clave duplicada
        if (bookingError.code === '23505' || bookingError.message?.includes('duplicate key')) {
          setError('Esta plaza ya está reservada para esta fecha. Por favor, recarga la página.')
          setShowConfirmModal(false)
          setReserving(false)
          // Recargar reservas para actualizar la vista
          await loadBookings(selectedDate)
          await loadUserBookings()
          return
        }
        throw bookingError
      }

      // Recargar reservas para actualizar la vista
      await loadBookings(selectedDate)
      await loadUserBookings() // Recargar también las reservas del usuario
      setShowConfirmModal(false)
      setSelectedSpotId(null)
      
      // Mostrar mensaje de éxito
      setError(null)
    } catch (err: any) {
      console.error('Error creating booking:', err)
      setError(err.message || 'Error al crear la reserva')
      setShowConfirmModal(false)
    } finally {
      setReserving(false)
    }
  }

  const getSpotLabel = (spotId: number) => {
    return spots.find(s => s.id === spotId)?.label || `Plaza ${spotId}`
  }

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString)
    const today = startOfDay(new Date())
    const tomorrow = startOfDay(addDays(new Date(), 1))

    if (isBefore(date, today)) {
      return format(date, 'EEEE, d MMMM yyyy', { locale: es }) + ' (Pasado)'
    } else if (dateString === format(today, 'yyyy-MM-dd')) {
      return 'Hoy, ' + format(date, 'd MMMM yyyy', { locale: es })
    } else if (dateString === format(tomorrow, 'yyyy-MM-dd')) {
      return 'Mañana, ' + format(date, 'd MMMM yyyy', { locale: es })
    } else {
      return format(date, 'EEEE, d MMMM yyyy', { locale: es })
    }
  }

  const hasBookingOnDate = (dateString: string): boolean => {
    return userBookings.some(b => b.date === dateString)
  }

  const getBookingStatusOnDate = (dateString: string): 'confirmed' | 'pending' | null => {
    const booking = userBookings.find(b => b.date === dateString)
    if (!booking) return null
    return booking.status === 'confirmed' ? 'confirmed' : 'pending'
  }

  // Contar plazas libres para la fecha seleccionada
  const getFreeSpotsCount = (): number => {
    const date = selectedDate
    let freeCount = 0

    spots.forEach((spot) => {
      // Verificar si está bloqueada permanentemente
      if (spot.is_blocked) return

      // Verificar si está bloqueada para esta fecha
      const isBlockedForDate = spotBlocks.some(block => block.spot_id === spot.id && block.date === date)
      if (isBlockedForDate) return

      // Verificar si está ocupada (tiene una reserva activa)
      const activeBooking = bookings.find(
        (b) => b.spot_id === spot.id && b.date === date && b.status !== 'cancelled'
      )

      // Si no tiene reserva activa, está libre
      if (!activeBooking) {
        freeCount++
      }
    })

    return freeCount
  }

  const handlePreviousDay = () => {
    const previousDay = format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd')
    setSelectedDate(previousDay)
  }

  const handleNextDay = () => {
    const nextDay = format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd')
    setSelectedDate(nextDay)
  }

  if (loading) {
    return (
      <div 
        className="p-4 min-h-screen flex items-center justify-center bg-white"
      >
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando plazas...</p>
        </div>
      </div>
    )
  }

  if (spots.length === 0) {
    return (
      <div 
        className="p-4 min-h-screen flex items-center justify-center bg-white"
      >
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">No hay plazas disponibles</p>
          <button
            onClick={loadSpots}
            className="px-6 py-3 text-white font-semibold rounded-[14px] transition-all duration-200 active:scale-95"
            style={{ 
              backgroundColor: '#FF9500',
              boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="p-4 min-h-screen bg-white"
      style={{
        minHeight: '100vh'
      }}
    >
      {/* Título con estilo iOS y contador de plazas libres */}
      <div className="flex items-center justify-between mb-6">
        <h1 
          className="text-3xl font-semibold text-gray-900 tracking-tight"
          style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
            letterSpacing: '-0.5px'
          }}
        >
          Mapa de Plazas
        </h1>
        <div 
          className="px-4 py-2 rounded-[14px] flex items-center gap-2"
          style={{
            backgroundColor: 'rgba(52, 199, 89, 0.1)',
            border: '1px solid rgba(52, 199, 89, 0.2)',
          }}
        >
          <span 
            className="text-sm font-semibold"
            style={{ color: '#34C759' }}
          >
            {getFreeSpotsCount()} libre{getFreeSpotsCount() !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      
      {/* Selector de fecha estilo iOS Segmented Control */}
      <div className="mb-6">
        {/* Contenedor para el selector */}
        <div 
          className="bg-gray-50 rounded-[20px] p-4 sm:p-5 border border-gray-200"
        >
          <div className="flex items-center gap-3 mb-4">
            {/* Botón día anterior */}
            <button
              onClick={handlePreviousDay}
              className="flex-shrink-0 p-3 rounded-[14px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50"
              title="Día anterior"
            >
              <ChevronLeft className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
            </button>

            {/* Input de fecha minimalista estilo iOS */}
            <div className="relative flex-1 min-w-0">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3.5 rounded-[14px] focus:outline-none transition-all duration-200 text-gray-900 font-medium bg-white border text-base"
                style={{
                  borderColor: hasBookingOnDate(selectedDate) 
                    ? (getBookingStatusOnDate(selectedDate) === 'pending' ? '#FFB800' : '#FF9500')
                    : '#E5E7EB',
                }}
                onFocus={(e) => {
                  const bookingStatus = getBookingStatusOnDate(selectedDate)
                  const borderColor = bookingStatus === 'pending' ? '#FFB800' : '#FF9500'
                  e.target.style.borderColor = borderColor
                  e.target.style.boxShadow = `0 0 0 3px ${bookingStatus === 'pending' ? 'rgba(255, 184, 0, 0.1)' : 'rgba(255, 149, 0, 0.1)'}`
                }}
                onBlur={(e) => {
                  if (hasBookingOnDate(selectedDate)) {
                    const bookingStatus = getBookingStatusOnDate(selectedDate)
                    e.target.style.borderColor = bookingStatus === 'pending' ? '#FFB800' : '#FF9500'
                    e.target.style.boxShadow = 'none'
                  } else {
                    e.target.style.borderColor = '#E5E7EB'
                    e.target.style.boxShadow = 'none'
                  }
                }}
              />
              {hasBookingOnDate(selectedDate) && (() => {
                const bookingStatus = getBookingStatusOnDate(selectedDate)
                const isPending = bookingStatus === 'pending'
                return (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <div 
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ 
                        backgroundColor: isPending ? '#FFB800' : '#FF9500',
                        boxShadow: isPending 
                          ? '0 0 8px rgba(255, 184, 0, 0.8)' 
                          : '0 0 8px rgba(255, 149, 0, 0.8)'
                      }}
                    ></div>
                  </div>
                )
              })()}
            </div>

            {/* Botón día siguiente */}
            <button
              onClick={handleNextDay}
              className="flex-shrink-0 p-2.5 rounded-[14px] transition-all duration-200 active:scale-95 bg-white border border-gray-300"
              title="Día siguiente"
            >
              <ChevronRight className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
            </button>
          </div>

          {/* Información de fecha y badge de reserva */}
          <div className="flex items-center justify-between">
            <p 
              className="text-sm font-medium text-gray-700"
              style={{ 
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
                letterSpacing: '0.2px'
              }}
            >
              {formatDateDisplay(selectedDate)}
            </p>
            {hasBookingOnDate(selectedDate) && (() => {
              const bookingStatus = getBookingStatusOnDate(selectedDate)
              const isPending = bookingStatus === 'pending'
              return (
                <span 
                  className="text-xs text-white font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-[10px]"
                  style={{ 
                    backgroundColor: isPending ? '#FFB800' : '#FF9500',
                    boxShadow: isPending 
                      ? '0 2px 8px rgba(255, 184, 0, 0.3)' 
                      : '0 2px 8px rgba(255, 149, 0, 0.3)'
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                  {isPending ? 'Pendiente' : 'Tienes reserva'}
                </span>
              )
            })()}
          </div>
        </div>

      </div>

      {connectionError && (
        <div 
          className="mb-4 p-4 rounded-[20px] border border-yellow-300 bg-yellow-50"
        >
          <p className="text-yellow-800 text-sm font-semibold">{connectionError}</p>
          <p className="text-yellow-700 text-xs mt-2 font-medium">
            Mostrando datos de ejemplo. Verifica tu conexión a Supabase.
          </p>
        </div>
      )}

      {error && !connectionError && (
        <div 
          className="mb-4 p-4 rounded-[20px] border border-red-300 bg-red-50"
        >
          <p className="text-red-800 text-sm font-semibold mb-2">{error}</p>
          {error.includes('iniciar sesión') && (
            <button
              onClick={() => navigate('/login')}
              className="text-red-600 text-sm font-bold hover:text-red-700 underline transition-colors"
            >
              Ir al inicio de sesión →
            </button>
          )}
        </div>
      )}

      <ParkingMap
        spots={spots}
        bookings={bookingsWithUsers}
        spotBlocks={spotBlocks}
        selectedDate={selectedDate}
        userId={user?.id}
        user={user}
        executiveProfiles={executiveProfiles}
        onSpotSelect={handleSpotSelect}
        onReleaseSpot={async (spotId: number) => {
          if (!user || user.role !== 'directivo') return
          setReleasingSpot(spotId)
          try {
            const { error } = await supabase
              .from('parking_spots')
              .update({ is_released: true })
              .eq('id', spotId)
              .eq('assigned_to', user.id)
            
            if (error) throw error
            await loadSpots()
            await loadBookings(selectedDate) // Recargar reservas para actualizar la vista
          } catch (err: any) {
            setError(err.message || 'Error al liberar la plaza')
          } finally {
            setReleasingSpot(null)
          }
        }}
        onOccupySpot={async (spotId: number) => {
          if (!user || user.role !== 'directivo') return
          setOccupyingSpot(spotId)
          try {
            // Cancelar cualquier reserva temporal que exista para esta plaza
            const { data: tempBookings } = await supabase
              .from('bookings')
              .select('*')
              .eq('spot_id', spotId)
              .gte('date', new Date().toISOString().split('T')[0])
              .neq('status', 'cancelled')
            
            if (tempBookings && tempBookings.length > 0) {
              // Cancelar todas las reservas temporales futuras
              await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .in('id', tempBookings.map(b => b.id))
            }
            
            const { error } = await supabase
              .from('parking_spots')
              .update({ is_released: false })
              .eq('id', spotId)
              .eq('assigned_to', user.id)
            
            if (error) throw error
            await loadSpots()
            await loadBookings(selectedDate)
          } catch (err: any) {
            setError(err.message || 'Error al ocupar la plaza')
          } finally {
            setOccupyingSpot(null)
          }
        }}
        releasingSpot={releasingSpot}
        occupyingSpot={occupyingSpot}
      />

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false)
          setSelectedSpotId(null)
        }}
        onConfirm={handleConfirmReservation}
        title="Confirmar Reserva"
        message={`¿Deseas reservar ${getSpotLabel(selectedSpotId || 0)} para el ${formatDateDisplay(selectedDate)}?`}
        confirmText="Reservar"
        loading={reserving}
      />
    </div>
  )
}
