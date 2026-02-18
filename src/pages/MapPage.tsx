import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RefreshCw, Lock, Unlock } from 'lucide-react'
import { format, addDays, subDays, isBefore, startOfDay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import ParkingMap from '../components/ParkingMap'
import WeekDaysView from '../components/WeekDaysView'
import DayBookingsList from '../components/DayBookingsList'
import ConfirmModal from '../components/ui/ConfirmModal'
import { ParkingSpot, Booking, Profile, SpotBlock } from '../types'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'

export default function MapPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [spots, setSpots] = useState<ParkingSpot[]>([])
  // const [bookings, setBookings] = useState<Booking[]>([]) // Eliminado - no se usa, solo se usa bookingsWithUsers
  const [bookingsWithUsers, setBookingsWithUsers] = useState<(Booking & { user?: Profile; carpoolUsers?: Profile[] })[]>([])
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
  const [selectedDayForList, setSelectedDayForList] = useState<string | null>(null)
  const [requestedDate, setRequestedDate] = useState<string | null>(null)
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<Date>(() => {
    const today = new Date()
    return startOfWeek(today, { weekStartsOn: 1 })
  })
  const [unlockedWeeks, setUnlockedWeeks] = useState<Set<string>>(new Set()) // Set de fechas de lunes (YYYY-MM-DD) desbloqueadas
  const [togglingWeekLock, setTogglingWeekLock] = useState(false)
  const [showUnlockWeekModal, setShowUnlockWeekModal] = useState(false)

  useEffect(() => {
    loadUser()
    loadWeekBookings()
    loadUnlockedWeeks()

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
          loadWeekBookings()
          // loadUserBookings se llamará en otro useEffect cuando user cambie
        }
      )
      .subscribe()

    // Suscripción a cambios en tiempo real en la tabla week_unlocks
    const weekUnlocksChannel = supabase
      .channel('week-unlocks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'week_unlocks',
        },
        () => {
          // Recargar semanas desbloqueadas cuando hay cambios
          loadUnlockedWeeks()
        }
      )
      .subscribe()

    // Recargar cuando la página recupera el foco (por si se canceló una reserva en otra pestaña/página)
    const handleFocus = () => {
      loadWeekBookings()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      subscription.unsubscribe()
      supabase.removeChannel(bookingsChannel)
      supabase.removeChannel(weekUnlocksChannel)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadUserBookings()
    }
  }, [user])

  // Recargar semanas desbloqueadas cuando cambia la semana seleccionada
  useEffect(() => {
    loadUnlockedWeeks()
  }, [selectedWeekMonday])

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
    loadWeekBookings()
    if (user) {
      loadUserBookings()
    }
  }, [user, selectedWeekMonday])

  // Recargar reservas cuando el usuario vuelve a esta página
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadWeekBookings()
        if (user) {
          loadUserBookings()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [user])

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

  // Cargar todas las reservas de la semana seleccionada (lunes a viernes)
  const loadWeekBookings = async () => {
    try {
      setLoading(true)
      const monday = new Date(selectedWeekMonday)
      const friday = addDays(monday, 4)
      
      const mondayString = format(monday, 'yyyy-MM-dd')
      const fridayString = format(friday, 'yyyy-MM-dd')

      // Cargar bloqueos de plazas para toda la semana
      const { data: blocksData, error: blocksError } = await supabase
        .from('spot_blocks')
        .select('*')
        .gte('date', mondayString)
        .lte('date', fridayString)

      if (blocksError) {
        // Si la tabla no existe, simplemente no hay bloqueos
        if (blocksError.message?.includes('does not exist') || blocksError.message?.includes('schema cache')) {
          console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          setSpotBlocks([])
        } else {
          console.error('Error cargando bloqueos:', blocksError)
          setSpotBlocks([])
        }
      } else {
        // Filtrar solo bloqueos de plazas normales (no directivos, IDs 1-8)
        const normalBlocks = (blocksData || []).filter(block => block.spot_id >= 1 && block.spot_id <= 8)
        setSpotBlocks(normalBlocks)
      }

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .gte('date', mondayString)
        .lte('date', fridayString)
        .neq('status', 'cancelled')
        // Incluir waitlist también

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
        setBookingsWithUsers([])
      } else {
        
        // Cargar perfiles de usuarios que tienen reservas (incluyendo carpooling múltiple)
        const pendingIds = (bookingsData || []).filter((b: any) => b.status === 'pending').map((b: any) => b.id)
        if (pendingIds.length > 0) {
          console.warn('⚠️ Migrando reservas legacy pending → waitlist (MapPage):', pendingIds.length)
          supabase
            .from('bookings')
            .update({ status: 'waitlist', spot_id: null })
            .in('id', pendingIds)
            .then(({ error }) => {
              if (error) console.error('Error migrating pending → waitlist (MapPage):', error)
            })
        }

        const normalizedBookingsData = (bookingsData || []).map((b: any) =>
          b.status === 'pending' ? { ...b, status: 'waitlist', spot_id: null } : b
        )

        if (normalizedBookingsData && normalizedBookingsData.length > 0) {
          const userIds = [...new Set(normalizedBookingsData.map((b: any) => b.user_id))]

          // Leer tabla de relaciones de carpooling múltiple
          const bookingIds = normalizedBookingsData.map((b: any) => b.id)
          const { data: carpoolLinks, error: carpoolLinksError } = await supabase
            .from('booking_carpool_users')
            .select('*')
            .in('booking_id', bookingIds)

          if (carpoolLinksError) {
            console.error('Error loading booking_carpool_users (MapPage):', carpoolLinksError)
          }

          // IDs de compañeros de coche (legacy + nueva tabla)
          const legacyCarpoolIds = normalizedBookingsData
            .map(b => b.carpool_with_user_id)
            .filter((id): id is string => id !== null)
          const linksUserIds = (carpoolLinks || []).map(link => link.user_id as string)
          const allCarpoolUserIds = Array.from(new Set([...legacyCarpoolIds, ...linksUserIds]))

          const allUserIds = Array.from(new Set([...userIds, ...allCarpoolUserIds]))
          
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', allUserIds)

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
            setBookingsWithUsers(normalizedBookingsData.map((b: any) => ({ ...b, user: undefined })))
          } else {
            console.log('Perfiles cargados:', profilesData?.length || 0, 'de', userIds.length, 'usuarios')

            const profilesMap = new Map<string, Profile>()
            profilesData?.forEach(p => profilesMap.set(p.id, p))

            const bookingsWithUserInfo = normalizedBookingsData.map((booking: any) => {
              const userProfile = profilesMap.get(booking.user_id)

              // Construir lista de compañeros de coche
              const linksForBooking = (carpoolLinks || []).filter(link => link.booking_id === booking.id)
              const usersFromLinks = linksForBooking
                .map(link => profilesMap.get(link.user_id))
                .filter((u): u is Profile => !!u)

              const carpoolUsersMap = new Map<string, Profile>()
              usersFromLinks.forEach(u => carpoolUsersMap.set(u.id, u))

              // Incluir también legacy carpool_with_user_id como primer compañero
              if (booking.carpool_with_user_id) {
                const legacyProfile = profilesMap.get(booking.carpool_with_user_id)
                if (legacyProfile) {
                  carpoolUsersMap.delete(legacyProfile.id)
                  carpoolUsersMap.set(legacyProfile.id, legacyProfile)
                }
              }

              const carpoolUsers = Array.from(carpoolUsersMap.values())

              if (!userProfile) {
                console.warn(`No se encontró perfil para el usuario ${booking.user_id} en la reserva ${booking.id}`)
              }

              return {
                ...booking,
                user: userProfile,
                carpoolUsers,
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
      setBookingsWithUsers([])
    } finally {
      setLoading(false)
    }
  }

  // Función eliminada - no se usa
  // const loadSpotBlocks = async (date: string) => {
  //   try {
  //     const { data, error } = await supabase
  //       .from('spot_blocks')
  //       .select('*')
  //       .eq('date', date)
  //     if (error) {
  //       if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
  //         console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
  //         setSpotBlocks([])
  //         return
  //       }
  //       console.error('Error cargando bloqueos:', error)
  //       setSpotBlocks([])
  //     } else {
  //       setSpotBlocks(data || [])
  //     }
  //   } catch (error) {
  //     console.error('Error loading spot blocks:', error)
  //     setSpotBlocks([])
  //   }
  // }

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
        const pendingIds = (bookingsData || []).filter((b: any) => b.status === 'pending').map((b: any) => b.id)
        if (pendingIds.length > 0) {
          console.warn('⚠️ Migrando reservas legacy pending → waitlist (MapPage userBookings):', pendingIds.length)
          supabase
            .from('bookings')
            .update({ status: 'waitlist', spot_id: null })
            .in('id', pendingIds)
            .then(({ error }) => {
              if (error) console.error('Error migrating pending → waitlist (MapPage userBookings):', error)
            })
        }

        const normalized = (bookingsData || []).map((b: any) =>
          b.status === 'pending' ? { ...b, status: 'waitlist', spot_id: null } : b
        )
        setUserBookings(normalized)
      }
    } catch (error) {
      console.error('Error loading user bookings:', error)
      setUserBookings([])
    }
  }

  // Cargar semanas desbloqueadas
  const loadUnlockedWeeks = async () => {
    try {
      const { data, error } = await supabase
        .from('week_unlocks')
        .select('week_monday')

      if (error) {
        // Si la tabla no existe, simplemente no hay semanas desbloqueadas (excepto la actual)
        if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          console.warn('Tabla week_unlocks no existe. Ejecuta create_week_unlocks.sql en Supabase.')
          // La semana actual está desbloqueada por defecto
          const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
          setUnlockedWeeks(new Set([currentWeekMonday]))
        } else {
          console.error('Error cargando semanas desbloqueadas:', error)
          // La semana actual está desbloqueada por defecto
          const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
          setUnlockedWeeks(new Set([currentWeekMonday]))
        }
      } else {
        const weekMondays = new Set((data || []).map((w: { week_monday: string }) => w.week_monday))
        // Asegurar que la semana actual siempre esté desbloqueada
        const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
        weekMondays.add(currentWeekMonday)
        setUnlockedWeeks(weekMondays)
      }
    } catch (error) {
      console.error('Error loading unlocked weeks:', error)
      // La semana actual está desbloqueada por defecto
      const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      setUnlockedWeeks(new Set([currentWeekMonday]))
    }
  }

  // Verificar si una semana está desbloqueada
  const isWeekUnlocked = (weekMonday: Date): boolean => {
    const weekMondayString = format(weekMonday, 'yyyy-MM-dd')
    // La semana actual siempre está desbloqueada
    const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    if (weekMondayString === currentWeekMonday) {
      return true
    }
    return unlockedWeeks.has(weekMondayString)
  }

  // Bloquear/desbloquear semana (solo admin)
  const toggleWeekLock = () => {
    if (!user || user.role !== 'admin') return

    const weekMondayString = format(selectedWeekMonday, 'yyyy-MM-dd')
    const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

    // No permitir bloquear la semana actual
    if (weekMondayString === currentWeekMonday) {
      setError('No se puede bloquear la semana en curso')
      return
    }

    const isCurrentlyUnlocked = unlockedWeeks.has(weekMondayString)

    if (isCurrentlyUnlocked) {
      // Bloquear directamente sin modal
      handleLockWeek()
    } else {
      // Desbloquear: mostrar modal de confirmación
      setShowUnlockWeekModal(true)
    }
  }

  // Función para bloquear semana (sin modal)
  const handleLockWeek = async () => {
    if (!user || user.role !== 'admin') return

    const weekMondayString = format(selectedWeekMonday, 'yyyy-MM-dd')
    const currentWeekMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

    // No permitir bloquear la semana actual
    if (weekMondayString === currentWeekMonday) {
      setError('No se puede bloquear la semana en curso')
      return
    }

    setTogglingWeekLock(true)
    setError(null)

    try {
      // Bloquear: eliminar de week_unlocks
      const { error: deleteError } = await supabase
        .from('week_unlocks')
        .delete()
        .eq('week_monday', weekMondayString)

      if (deleteError) {
        throw deleteError
      }

      // Actualizar estado local
      const newUnlockedWeeks = new Set(unlockedWeeks)
      newUnlockedWeeks.delete(weekMondayString)
      setUnlockedWeeks(newUnlockedWeeks)
    } catch (err: any) {
      console.error('Error locking week:', err)
      setError(err.message || 'Error al bloquear la semana')
    } finally {
      setTogglingWeekLock(false)
    }
  }

  // Función para desbloquear semana (después de confirmación en modal)
  const handleUnlockWeek = async () => {
    if (!user || user.role !== 'admin') return

    const weekMondayString = format(selectedWeekMonday, 'yyyy-MM-dd')
    
    setTogglingWeekLock(true)
    setError(null)
    setShowUnlockWeekModal(false)

    try {
      // Desbloquear: insertar en week_unlocks
      const { error: insertError } = await supabase
        .from('week_unlocks')
        .insert({
          week_monday: weekMondayString,
          unlocked_by: user.id,
        })

      if (insertError) {
        throw insertError
      }

      // Actualizar estado local
      const newUnlockedWeeks = new Set(unlockedWeeks)
      newUnlockedWeeks.add(weekMondayString)
      setUnlockedWeeks(newUnlockedWeeks)

      // Enviar notificaciones push a todos los usuarios
      console.log('📤 Enviando notificaciones push para semana desbloqueada:', weekMondayString)
      try {
        const { data: notifyData, error: notifyError } = await supabase.functions.invoke('notify-week-unlocked', {
          body: { weekMonday: weekMondayString },
        })

        if (notifyError) {
          console.error('❌ Error enviando notificaciones push:', notifyError)
          console.error('Error details:', {
            message: notifyError.message,
            name: notifyError.name,
            context: notifyError.context,
          })
          // Mostrar error al usuario pero no bloquear el desbloqueo
          setError(`Semana desbloqueada, pero hubo un error al enviar notificaciones: ${notifyError.message}`)
        } else {
          console.log('✅ Respuesta de función recibida:', notifyData)
          if (notifyData) {
            console.log('Resultados de notificaciones:', {
              ok: notifyData.ok,
              pushed: notifyData.pushed,
              totalUsers: notifyData.totalUsers,
              totalTokens: notifyData.totalTokens,
              success: notifyData.success,
              failure: notifyData.failure,
              note: notifyData.note,
            })
            
            if (notifyData.pushed === 0 && notifyData.note) {
              console.warn('⚠️ Advertencia:', notifyData.note)
            }
          } else {
            console.warn('⚠️ La función no devolvió datos')
          }
        }
      } catch (notifyErr: any) {
        console.error('❌ Error invocando función de notificaciones:', notifyErr)
        console.error('Exception details:', {
          message: notifyErr.message,
          stack: notifyErr.stack,
        })
        // Mostrar error al usuario pero no bloquear el desbloqueo
        setError(`Semana desbloqueada, pero hubo un error al enviar notificaciones: ${notifyErr.message}`)
      }
    } catch (err: any) {
      console.error('Error unlocking week:', err)
      setError(err.message || 'Error al desbloquear la semana')
    } finally {
      setTogglingWeekLock(false)
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
        await loadWeekBookings()
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
          await loadWeekBookings()
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
          // 'pending' ya no se usa: si se reserva una plaza concreta es una confirmación directa
          status: 'confirmed',
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
          await loadWeekBookings()
          await loadUserBookings()
          return
        }
        throw bookingError
      }

      // Recargar reservas para actualizar la vista
      await loadWeekBookings()
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

  // Nueva función para solicitar plaza para un día (sin spot_id específico)
  const handleRequestBooking = (date: string) => {
    if (!user) {
      setError('Debes iniciar sesión para solicitar una plaza')
      return
    }

    if (!user.is_verified) {
      setError('Tu cuenta debe estar verificada para solicitar plazas')
      return
    }

    // Verificar si la semana está desbloqueada
    const dateObj = new Date(date)
    const weekMonday = startOfWeek(dateObj, { weekStartsOn: 1 })
    if (!isWeekUnlocked(weekMonday)) {
      setError('Esta semana aún no está disponible para reservas. El administrador debe desbloquearla primero.')
      return
    }

    // Verificar si ya tiene reserva para este día
    const dateString = format(new Date(date), 'yyyy-MM-dd')
    const hasBooking = userBookings.some(
      b => b.date === dateString && b.status !== 'cancelled'
    )

    if (hasBooking) {
      setError('Ya tienes una reserva para este día')
      return
    }

    // Todas las solicitudes van automáticamente a lista de espera
    // No bloqueamos la solicitud, el admin gestionará la lista de espera
    setRequestedDate(dateString)
    setShowConfirmModal(true)
  }

  // Nueva función para confirmar reserva sin spot_id
  const handleConfirmBookingForDay = async () => {
    if (!requestedDate || !user || reserving) return // Prevenir doble clic

    setReserving(true)
    setError(null)
    try {
      // Verificación final justo antes de insertar (doble verificación)
      const { data: finalCheck } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', requestedDate)
        .neq('status', 'cancelled')
        .maybeSingle()

      if (finalCheck) {
        setError('Ya tienes una reserva para esta fecha')
        setShowConfirmModal(false)
        setReserving(false)
        await loadWeekBookings()
        await loadUserBookings()
        return
      }

      // Todas las solicitudes van automáticamente a lista de espera
      // El admin gestionará la lista y decidirá si hay espacio disponible
      // Crear reserva sin spot_id (null) - automáticamente en lista de espera
      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          spot_id: null, // No se asigna plaza específica
          date: requestedDate,
          status: 'waitlist', // Todas las solicitudes van automáticamente a lista de espera
          carpool_with_user_id: null, // Se puede configurar después desde "Mis Reservas"
        })
        .select()
        .single()

      if (bookingError) {
        // Manejar error de duplicado (índice único)
        if (bookingError.code === '23505' || bookingError.message?.includes('duplicate') || bookingError.message?.includes('unique')) {
          setError('Ya existe una reserva para esta fecha. Recargando...')
          await loadWeekBookings()
          await loadUserBookings()
          setShowConfirmModal(false)
          setRequestedDate(null)
          setReserving(false)
          return
        }
        throw bookingError
      }

      console.log('✅ Booking created successfully:', newBooking)
      console.log('📋 Booking ID:', newBooking?.id, 'Type:', typeof newBooking?.id)

      // Lanzar notificación para administradores (in-app + push) de nueva solicitud
      if (newBooking?.id) {
        console.log('🚀 About to call Edge Function notify-booking-requested')
        console.log('📦 Payload:', { bookingId: newBooking.id })
        
        try {
          console.log('🚀 Calling Edge Function notify-booking-requested with bookingId:', newBooking.id)
          
          const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-booking-requested`
          console.log('🔗 Function URL:', functionUrl)
          
          // Asegurar que bookingId sea un número (la Edge Function lo espera como number)
          const bookingId = typeof newBooking.id === 'number' ? newBooking.id : parseInt(String(newBooking.id), 10)
          
          if (isNaN(bookingId)) {
            console.error('❌ Invalid bookingId:', newBooking.id, 'cannot be converted to number')
            return
          }
          
          console.log('📤 Invoking function with bookingId (number):', bookingId, 'Type:', typeof bookingId)
          
          const { data, error } = await supabase.functions.invoke('notify-booking-requested', {
            body: { bookingId },
          })
          
          console.log('📥 Function response received:', { data, error })
          
          if (error) {
            console.error('❌ notify-booking-requested error:', error)
            console.error('Error details:', {
              message: error.message,
              name: error.name,
              status: error.status,
            })
          } else {
            console.log('✅ notify-booking-requested response:', data)
            if (data?.pushed === 0) {
              console.warn('⚠️ No push tokens found for admins or FIREBASE_SERVICE_ACCOUNT_JSON not set')
            }
          }
        } catch (fnErr: any) {
          console.error('❌ notify-booking-requested failed (non-blocking):', fnErr)
          console.error('Exception details:', {
            message: fnErr.message,
            cause: fnErr.cause,
            stack: fnErr.stack,
          })
        }
      } else {
        console.error('⚠️ No booking ID returned after insert!')
        console.error('newBooking object:', newBooking)
        console.error('newBooking?.id:', newBooking?.id)
      }

      // Recargar reservas
      await loadWeekBookings()
      await loadUserBookings()
      setShowConfirmModal(false)
      setRequestedDate(null)
      setError(null)
    } catch (err: any) {
      console.error('Error creating booking:', err)
      setError(err.message || 'Error al crear la reserva')
      setShowConfirmModal(false)
    } finally {
      setReserving(false)
    }
  }

  // Función para unirse a la lista de espera
  const handleJoinWaitlist = async (date: string) => {
    if (!user) {
      setError('Debes iniciar sesión para unirte a la lista de espera')
      return
    }

    if (!user.is_verified) {
      setError('Tu cuenta debe estar verificada para unirte a la lista de espera')
      return
    }

    // Verificar si la semana está desbloqueada
    const dateObj = new Date(date)
    const weekMonday = startOfWeek(dateObj, { weekStartsOn: 1 })
    if (!isWeekUnlocked(weekMonday)) {
      setError('Esta semana aún no está disponible para reservas. El administrador debe desbloquearla primero.')
      return
    }

    const dateString = format(new Date(date), 'yyyy-MM-dd')

    // Verificar si ya tiene reserva o está en lista de espera para este día
    const hasBooking = userBookings.some(
      b => b.date === dateString && b.status !== 'cancelled'
    )

    if (hasBooking) {
      setError('Ya tienes una reserva o estás en la lista de espera para este día')
      return
    }

    // Verificar que realmente esté lleno (8 plazas ocupadas, excluyendo directivos)
    // Solo contamos las confirmadas, las waitlist no ocupan plaza
    const { data: dayBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('date', dateString)
      .neq('status', 'cancelled')
      .eq('status', 'confirmed')

    if (dayBookings && dayBookings.length > 0) {
      // Cargar perfiles para filtrar directivos
      const userIds = [...new Set(dayBookings.map(b => b.user_id))]
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, role')
        .in('id', userIds)

      // Crear un mapa de roles
      const roleMap = new Map<string, string>()
      profilesData?.forEach(p => roleMap.set(p.id, p.role))

      // Filtrar reservas de directivos del conteo
      const normalBookingsCount = dayBookings.filter(b => {
        const userRole = roleMap.get(b.user_id)
        return userRole !== 'directivo'
      }).length

      if (normalBookingsCount < 8) {
        setError('Aún hay plazas disponibles. Por favor, solicita una plaza en lugar de unirte a la lista de espera.')
        return
      }
    } else {
      // Si no hay reservas, no está lleno
      setError('Aún hay plazas disponibles. Por favor, solicita una plaza en lugar de unirte a la lista de espera.')
      return
    }

    setRequestedDate(dateString)
    setShowConfirmModal(true)
  }

  // Función eliminada - no se usa
  // const handleConfirmWaitlist = async () => {
  //   if (!requestedDate || !user || reserving) return
  //   setReserving(true)
  //   setError(null)
  //   try {
  //     const { data: finalCheck } = await supabase
  //       .from('bookings')
  //       .select('*')
  //       .eq('user_id', user.id)
  //       .eq('date', requestedDate)
  //       .neq('status', 'cancelled')
  //       .maybeSingle()
  //     if (finalCheck) {
  //       setError('Ya tienes una reserva para esta fecha')
  //       setShowConfirmModal(false)
  //       setReserving(false)
  //       await loadWeekBookings()
  //       await loadUserBookings()
  //       return
  //     }
  //     const { error: bookingError } = await supabase
  //       .from('bookings')
  //       .insert({
  //         user_id: user.id,
  //         spot_id: null,
  //         date: requestedDate,
  //         status: 'waitlist',
  //       })
  //       .select()
  //       .single()
  //     if (bookingError) {
  //       if (bookingError.code === '23505' || bookingError.message?.includes('duplicate') || bookingError.message?.includes('unique')) {
  //         setError('Ya estás en la lista de espera para esta fecha. Recargando...')
  //         await loadWeekBookings()
  //         await loadUserBookings()
  //         setShowConfirmModal(false)
  //         setRequestedDate(null)
  //         setReserving(false)
  //         return
  //       }
  //       throw bookingError
  //     }
  //     await loadWeekBookings()
  //     await loadUserBookings()
  //     setShowConfirmModal(false)
  //     setRequestedDate(null)
  //     setError(null)
  //   } catch (err: any) {
  //     console.error('Error joining waitlist:', err)
  //     setError(err.message || 'Error al unirse a la lista de espera')
  //     setShowConfirmModal(false)
  //   } finally {
  //     setReserving(false)
  //   }
  // }

  // Función para cancelar reserva del usuario
  const handleCancelBooking = async (bookingId: number) => {
    if (!user) return

    try {
      // Obtener estado previo para saber si estaba confirmada
      const { data: existing, error: fetchError } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('id', bookingId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (fetchError) throw fetchError

      const wasConfirmed = existing?.status === 'confirmed'

      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('user_id', user.id)

      if (error) throw error

      // Notificar a admins solo si era una reserva confirmada
      if (wasConfirmed) {
        try {
          console.log('📤 Notificando cancelación de reserva confirmada (MapPage) bookingId:', bookingId)
          const { data: notifyData, error: notifyError } = await supabase.functions.invoke('notify-booking-cancelled', {
            body: { bookingId },
          })

          if (notifyError) {
            console.error('❌ Error enviando notificación de cancelación (MapPage):', notifyError)
          } else {
            console.log('✅ Notificación de cancelación enviada (MapPage):', notifyData)
          }
        } catch (notifyErr: any) {
          console.error('❌ Error invocando notify-booking-cancelled (MapPage):', notifyErr)
        }
      }

      await loadWeekBookings()
      await loadUserBookings()
      setSelectedDayForList(null)
    } catch (err: any) {
      console.error('Error canceling booking:', err)
      setError(err.message || 'Error al cancelar la reserva')
    }
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

  // Funciones eliminadas - no se usan
  // const hasBookingOnDate = (dateString: string): boolean => {
  //   return userBookings.some(b => b.date === dateString)
  // }

  // const getBookingStatusOnDate = (dateString: string): 'confirmed' | 'pending' | null => {
  //   const booking = userBookings.find(b => b.date === dateString)
  //   if (!booking) return null
  //   return booking.status === 'confirmed' ? 'confirmed' : 'pending'
  // }

  // Función para refrescar los datos (pull-to-refresh)
  const handleRefresh = async () => {
    await Promise.all([
      loadWeekBookings(),
      loadUserBookings(),
      loadUnlockedWeeks(),
    ])
  }

  // Hook para pull-to-refresh
  const { containerRef, isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: !loading,
  })

  // const getFreeSpotsCount = (): number => {
  //   const date = selectedDate
  //   let freeCount = 0
  //   spots.forEach((spot) => {
  //     if (spot.is_blocked) return
  //     const isBlockedForDate = spotBlocks.some(block => block.spot_id === spot.id && block.date === date)
  //     if (isBlockedForDate) return
  //     const activeBooking = bookings.find(
  //       (b) => b.spot_id === spot.id && b.date === date && b.status !== 'cancelled'
  //     )
  //     if (!activeBooking) {
  //       freeCount++
  //     }
  //   })
  //   return freeCount
  // }

  // const handlePreviousDay = () => {
  //   const previousDay = format(subDays(new Date(selectedDate), 1), 'yyyy-MM-dd')
  //   setSelectedDate(previousDay)
  // }

  // const handleNextDay = () => {
  //   const nextDay = format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd')
  //   setSelectedDate(nextDay)
  // }

  if (loading) {
    return (
      <div 
        className="p-4 min-h-screen flex items-center justify-center bg-white"
      >
        <div className="text-center py-8">
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="p-4 lg:p-6 min-h-screen bg-white"
      style={{
        minHeight: '100vh'
      }}
    >
      {/* Indicador de pull-to-refresh */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-50 transition-transform duration-200 pointer-events-none"
          style={{
            transform: `translateY(${Math.max(0, pullDistance - 20)}px)`,
            opacity: Math.min(1, pullProgress),
          }}
        >
          <div className="bg-white rounded-full p-3 shadow-lg border border-gray-200">
            <RefreshCw
              className={`w-6 h-6 text-orange-500 ${isRefreshing ? 'animate-spin' : ''}`}
              strokeWidth={2.5}
            />
          </div>
        </div>
      )}
      {/* Título */}
      <div className="mb-4 lg:mb-6 flex items-center justify-between">
        <h1 
          className="text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight"
          style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
            letterSpacing: '-0.5px'
          }}
        >
          Parking
        </h1>
        {user?.role === 'admin' && (
          <button
            onClick={toggleWeekLock}
            disabled={togglingWeekLock}
            className={`flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 border flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
              isWeekUnlocked(selectedWeekMonday)
                ? 'bg-[#FF9500] border-[#FF9500] hover:bg-[#FF9500]/90 text-white'
                : 'bg-gray-200 border-gray-300 hover:bg-gray-300 text-gray-700'
            }`}
            title={isWeekUnlocked(selectedWeekMonday) ? 'Bloquear semana' : 'Desbloquear semana'}
          >
            {isWeekUnlocked(selectedWeekMonday) ? (
              <Unlock className="h-5 w-5" strokeWidth={2.5} />
            ) : (
              <Lock className="h-5 w-5" strokeWidth={2.5} />
            )}
          </button>
        )}
      </div>

      {/* Selector de semana */}
      <div 
        className="mb-4 lg:mb-6 p-4 bg-gray-50 rounded-[20px] border border-gray-200"
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const previousWeek = subDays(selectedWeekMonday, 7)
              setSelectedWeekMonday(previousWeek)
            }}
            className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
            title="Semana anterior"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
          </button>
          
          <div className="flex-1 text-center px-2">
            <button
              onClick={() => {
                const today = new Date()
                setSelectedWeekMonday(startOfWeek(today, { weekStartsOn: 1 }))
              }}
              className="w-full px-4 py-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
            >
              <span className="text-sm font-semibold text-gray-900">
                {format(selectedWeekMonday, 'd MMM', { locale: es })} - {format(addDays(selectedWeekMonday, 4), 'd MMM', { locale: es })}
              </span>
            </button>
          </div>
          
          <button
            onClick={() => {
              const nextWeek = addDays(selectedWeekMonday, 7)
              setSelectedWeekMonday(nextWeek)
            }}
            className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
            title="Semana siguiente"
          >
            <ChevronRight className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
          </button>
        </div>
      </div>
      
      {/* Vista de días de la semana */}
      <WeekDaysView
        bookings={bookingsWithUsers}
        userBookings={userBookings}
        userId={user?.id}
        weekMonday={selectedWeekMonday}
        onDayClick={(date) => setSelectedDayForList(date)}
        onRequestBooking={handleRequestBooking}
        onJoinWaitlist={handleJoinWaitlist}
        spotBlocks={spotBlocks}
        isWeekLocked={!isWeekUnlocked(selectedWeekMonday)}
      />

      {/* Lista de reservas del día seleccionado */}
      {selectedDayForList && (
        <DayBookingsList
          date={selectedDayForList}
          bookings={bookingsWithUsers}
          onClose={() => setSelectedDayForList(null)}
          onCancelBooking={handleCancelBooking}
          currentUserId={user?.id}
        />
      )}


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

      {/* ParkingMap oculto - ya no se usa en el nuevo paradigma */}
      {false && <ParkingMap
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
            await loadWeekBookings() // Recargar reservas para actualizar la vista
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
            await loadWeekBookings()
          } catch (err: any) {
            setError(err.message || 'Error al ocupar la plaza')
          } finally {
            setOccupyingSpot(null)
          }
        }}
        releasingSpot={releasingSpot}
        occupyingSpot={occupyingSpot}
      />}

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => {
          setShowConfirmModal(false)
          setSelectedSpotId(null)
          setRequestedDate(null)
        }}
        onConfirm={requestedDate 
          ? () => {
              // Todas las solicitudes van automáticamente a lista de espera
              handleConfirmBookingForDay()
            }
          : handleConfirmReservation
        }
        title={requestedDate ? "Solicitar Plaza" : "Confirmar Solicitud"}
        message={requestedDate 
          ? `¿Deseas solicitar una plaza para el ${formatDateDisplay(requestedDate)}? Tu solicitud se añadirá a la lista de espera y el administrador la revisará. Puedes añadir un compañero de coche desde "Mis Reservas" después.`
          : `¿Deseas reservar ${getSpotLabel(selectedSpotId || 0)} para el ${formatDateDisplay(selectedDate)}?`
        }
        confirmText={requestedDate ? "Solicitar" : "Confirmar"}
        cancelText="Cancelar"
        loading={reserving}
      />

      {/* Modal de confirmación para desbloquear semana */}
      <ConfirmModal
        isOpen={showUnlockWeekModal}
        onClose={() => setShowUnlockWeekModal(false)}
        onConfirm={handleUnlockWeek}
        title="Desbloquear Semana"
        message={`¿Deseas desbloquear la semana del ${format(selectedWeekMonday, 'd MMM', { locale: es })} al ${format(addDays(selectedWeekMonday, 4), 'd MMM', { locale: es })}? Los usuarios podrán realizar reservas para esta semana.`}
        confirmText="Desbloquear"
        cancelText="Cancelar"
        loading={togglingWeekLock}
        confirmButtonClass="bg-[#FF9500] hover:bg-[#FF9500]/90"
      />
    </div>
  )
}
