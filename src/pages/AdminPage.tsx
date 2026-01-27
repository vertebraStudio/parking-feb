import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Lock, Unlock, CheckCircle, Calendar, Car, Shield, User, ChevronLeft, ChevronRight, UserPlus, BarChart3, Eye, EyeOff } from 'lucide-react'
import { format, startOfWeek, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { Profile, ParkingSpot, Booking, SpotBlock } from '../types'
import ConfirmModal from '../components/ui/ConfirmModal'

interface BookingWithSpot extends Booking {
  spot?: ParkingSpot
  user?: Profile
  carpoolUser?: Profile
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
  const [activeTab, setActiveTab] = useState<'users' | 'spots' | 'bookings' | 'summary'>('bookings')
  const [summaryWeekMonday, setSummaryWeekMonday] = useState<Date>(() => {
    const today = new Date()
    return startOfWeek(today, { weekStartsOn: 1 })
  })
  const [selectedWeekMonday, setSelectedWeekMonday] = useState<Date>(() => {
    const today = new Date()
    return startOfWeek(today, { weekStartsOn: 1 })
  }) // Lunes de la semana seleccionada para bookings
  const [selectedSpotDate, setSelectedSpotDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  ) // Fecha seleccionada para bloquear plazas
  const [spotBlocks, setSpotBlocks] = useState<SpotBlock[]>([]) // Bloqueos para la fecha seleccionada
  const [loadingSpotBlocks, setLoadingSpotBlocks] = useState(false)
  const [selectedDayForList, setSelectedDayForList] = useState<number | null>(null) // Día seleccionado para ver lista (0-4: L-V, null: todas)
  const [spotsToBlock, setSpotsToBlock] = useState<number>(0) // Número de plazas a bloquear
  const [showConfirmedBookings, setShowConfirmedBookings] = useState<boolean>(false) // Mostrar reservas confirmadas
  
  // Estados para modales
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showConfirmBookingModal, setShowConfirmBookingModal] = useState(false)
  const [showRejectBookingModal, setShowRejectBookingModal] = useState(false)
  const [showWaitlistModal, setShowWaitlistModal] = useState(false)
  const [bookingToConfirm, setBookingToConfirm] = useState<BookingWithSpot | null>(null)
  const [bookingToReject, setBookingToReject] = useState<BookingWithSpot | null>(null)
  const [bookingToWaitlist, setBookingToWaitlist] = useState<BookingWithSpot | null>(null)
  const [processing, setProcessing] = useState(false)
  const loadingBookingsRef = useRef(false)
  // const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set()) // Eliminado - no se usa

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    if (user && user.role === 'admin') {
      loadData()
    }
  }, [user])

  // Suscripción en tiempo real a cambios en bookings para actualizar el resumen
  useEffect(() => {
    if (!user || user.role !== 'admin') return

    const bookingsChannel = supabase
      .channel('admin-bookings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        () => {
          // Si estamos en la pestaña de resumen, recargar los datos
          if (activeTab === 'summary') {
            loadBookingsForWeek(summaryWeekMonday)
            loadProfiles()
          }
          // Si estamos en la pestaña de bookings, también recargar
          if (activeTab === 'bookings') {
            loadBookings()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(bookingsChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab, summaryWeekMonday])

  useEffect(() => {
    if (user && user.role === 'admin' && activeTab === 'bookings' && !loadingBookingsRef.current) {
      console.log('Loading bookings - activeTab:', activeTab, 'selectedWeekMonday:', selectedWeekMonday)
      loadBookings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekMonday, activeTab, user])

  // Resetear día seleccionado al cambiar de semana
  useEffect(() => {
    setSelectedDayForList(null)
  }, [selectedWeekMonday])

  useEffect(() => {
    if (user && user.role === 'admin' && activeTab === 'spots') {
      loadSpotBlocks()
    }
  }, [selectedSpotDate, activeTab, user, spots])

  // Función para cargar bookings de una semana específica (para el resumen)
  const loadBookingsForWeek = async (weekMonday: Date) => {
    setLoadingBookings(true)
    setError(null)
    try {
      const monday = new Date(weekMonday)
      const friday = addDays(monday, 4)
      const mondayString = format(monday, 'yyyy-MM-dd')
      const fridayString = format(friday, 'yyyy-MM-dd')

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .gte('date', mondayString)
        .lte('date', fridayString)
        .neq('status', 'cancelled') // Excluir canceladas
        .order('date', { ascending: true })

      if (bookingsError) {
        console.error('Error loading bookings for summary:', bookingsError)
        setError(`Error al cargar reservas: ${bookingsError.message}`)
        return
      }

      // Cargar información de usuarios
      if (bookingsData && bookingsData.length > 0) {
        const userIds = [...new Set(bookingsData.map(b => b.user_id))]
        const carpoolUserIds = bookingsData
          .map(b => b.carpool_with_user_id)
          .filter((id): id is string => id !== null)
        const allUserIds = [...new Set([...userIds, ...carpoolUserIds])]

        const { data: usersData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', allUserIds)

        let carpoolProfilesMap = new Map<string, Profile>()
        if (carpoolUserIds.length > 0 && usersData) {
          usersData.forEach(profile => {
            if (carpoolUserIds.includes(profile.id)) {
              carpoolProfilesMap.set(profile.id, profile)
            }
          })
        }

        const bookingsWithDetails: BookingWithSpot[] = bookingsData.map(booking => ({
          ...booking,
          spot: undefined,
          user: usersData?.find(u => u.id === booking.user_id),
          carpoolUser: booking.carpool_with_user_id ? carpoolProfilesMap.get(booking.carpool_with_user_id) : undefined
        }))

        // Filtrar reservas de directivos
        const bookingsWithoutDirectivos = bookingsWithDetails.filter(booking => {
          return booking.user?.role !== 'directivo'
        })

        setBookings(bookingsWithoutDirectivos)
      } else {
        setBookings([])
      }
    } catch (error) {
      console.error('Error loading bookings for summary:', error)
      setError('Error al cargar reservas para el resumen')
    } finally {
      setLoadingBookings(false)
    }
  }

  // Recargar datos cuando cambia la semana del resumen o se activa la pestaña
  useEffect(() => {
    if (user && user.role === 'admin' && activeTab === 'summary') {
      // Cargar bookings y profiles para la semana del resumen
      loadBookingsForWeek(summaryWeekMonday)
      loadProfiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryWeekMonday, activeTab, user])

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
      // Solo cargar las 8 plazas normales (excluir plazas de directivos)
      const { data, error } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_executive', false)
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
        // No filtrar canceladas para que se muestren en negro

      // Filtrar por la semana seleccionada (lunes a viernes)
      const monday = new Date(selectedWeekMonday)
      const friday = addDays(monday, 4)
      const mondayString = format(monday, 'yyyy-MM-dd')
      const fridayString = format(friday, 'yyyy-MM-dd')
      query = query.gte('date', mondayString).lte('date', fridayString)

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

        const bookingsWithDetails: BookingWithSpot[] = bookingsData.map(booking => ({
          ...booking,
          spot: spotsResult.data?.find(s => s.id === booking.spot_id),
          user: usersResult.data?.find(u => u.id === booking.user_id),
          carpoolUser: booking.carpool_with_user_id ? carpoolProfilesMap.get(booking.carpool_with_user_id) : undefined
        }))

        // Filtrar reservas de directivos (no deben aparecer en el panel de administración)
        const bookingsWithoutDirectivos = bookingsWithDetails.filter(booking => {
          // Excluir reservas de usuarios con rol 'directivo'
          return booking.user?.role !== 'directivo'
        })

        // Ordenar por fecha de solicitud (created_at) - más antiguas primero
        // Esto asegura que las solicitudes aparezcan en orden cronológico
        bookingsWithoutDirectivos.sort((a, b) => {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
      // Cargar bloqueos solo para plazas normales (no directivos)
      const { data: blocksData, error: blocksError } = await supabase
        .from('spot_blocks')
        .select('*')
        .eq('date', selectedSpotDate)

      if (blocksError) {
        // Si la tabla no existe, mostrar un mensaje pero no fallar
        if (blocksError.message?.includes('does not exist') || blocksError.message?.includes('schema cache')) {
          console.warn('Tabla spot_blocks no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          setError('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase para habilitar esta funcionalidad.')
          setSpotBlocks([])
          return
        }
        throw blocksError
      }

      // Obtener IDs de plazas normales para filtrar
      const normalSpotIds = spots.map(s => s.id)
      
      // Filtrar solo los bloqueos de plazas normales
      const normalSpotBlocks = (blocksData || []).filter(block => 
        normalSpotIds.includes(block.spot_id)
      )

      setSpotBlocks(normalSpotBlocks)
    } catch (err: any) {
      console.error('Error loading spot blocks:', err)
      setError(err.message || 'Error al cargar los bloqueos')
    } finally {
      setLoadingSpotBlocks(false)
    }
  }

  // Función eliminada - no se usa
  // const isSpotBlocked = (spotId: number): boolean => {
  //   return spotBlocks.some(block => block.spot_id === spotId)
  // }

  const handleBlockSpots = () => {
    if (!selectedSpotDate) {
      setError('Por favor, selecciona una fecha primero')
      return
    }
    if (spotsToBlock <= 0) {
      setError('Por favor, ingresa un número válido de plazas a bloquear')
      return
    }
    if (spotsToBlock > 8) {
      setError('No puedes bloquear más de 8 plazas')
      return
    }
    setShowBlockModal(true)
  }

  const confirmBlockSpots = async () => {
    if (!user || !selectedSpotDate || spotsToBlock <= 0) return

    setProcessing(true)
    try {
      // Obtener las plazas que ya están bloqueadas para esta fecha
      const blockedSpotIds = spotBlocks.map(b => b.spot_id)
      
      // Obtener las plazas disponibles (no bloqueadas)
      const availableSpots = spots.filter(spot => !blockedSpotIds.includes(spot.id))
      
      // Si ya hay bloqueos, primero eliminarlos todos para esta fecha
      if (spotBlocks.length > 0) {
        const { error: deleteError } = await supabase
          .from('spot_blocks')
          .delete()
          .eq('date', selectedSpotDate)

        if (deleteError) {
          if (deleteError.message?.includes('does not exist') || deleteError.message?.includes('schema cache')) {
            throw new Error('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          }
          throw deleteError
        }
      }

      // Bloquear el número de plazas solicitado (tomar las primeras disponibles)
      const spotsToBlockList = availableSpots.slice(0, spotsToBlock)
      
      if (spotsToBlockList.length > 0) {
        const blocksToInsert = spotsToBlockList.map(spot => ({
          spot_id: spot.id,
          date: selectedSpotDate,
          created_by: user.id
        }))

        const { error: insertError } = await supabase
          .from('spot_blocks')
          .insert(blocksToInsert)

        if (insertError) {
          if (insertError.message?.includes('does not exist') || insertError.message?.includes('schema cache')) {
            throw new Error('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase.')
          }
          throw insertError
        }
      }

      await loadSpotBlocks()
      setShowBlockModal(false)
      setSpotsToBlock(0)
      setError(null)
    } catch (err: any) {
      console.error('Error blocking spots:', err)
      setError(err.message || 'Error al bloquear las plazas')
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
      const bookingId = bookingToConfirm.id
      // Solo aceptar desde waitlist (mover a confirmed)
      // El botón "Aceptar" solo aparece para reservas en waitlist
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId)

      if (error) throw error

      // Obtener la reserva para crear la notificación
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select('id, user_id, date, status')
        .eq('id', bookingId)
        .single()

      if (!bookingError && booking) {
        // La Edge Function se encarga de crear la notificación in-app y enviar push
        // No necesitamos crear la notificación aquí para evitar duplicados
        // Intentar enviar push vía Edge Function (no bloquea si falla)
        try {
          console.log('Calling Edge Function notify-booking-confirmed with bookingId:', bookingId)
          
          // Verificar que hay sesión activa
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError) {
            console.error('Error getting session:', sessionError)
            throw new Error('No hay sesión activa')
          }
          
          if (!session) {
            console.error('No active session found')
            throw new Error('No hay sesión activa')
          }
          
          console.log('Session token available:', !!session.access_token)
          
          // Intentar primero con supabase.functions.invoke() (pasa token automáticamente)
          let pushResult: any = null
          let pushErr: any = null
          
          try {
            const result = await supabase.functions.invoke('notify-booking-confirmed', {
              body: { bookingId },
            })
            pushResult = result.data
            pushErr = result.error
            console.log('supabase.functions.invoke() result:', { data: pushResult, error: pushErr })
          } catch (invokeError: any) {
            // Si falla, intentar con fetch directo como fallback
            console.warn('⚠️ supabase.functions.invoke() failed, trying direct fetch:', invokeError)
            console.log('Error details:', {
              message: invokeError.message,
              name: invokeError.name,
              status: invokeError.status,
            })
            
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const functionUrl = `${supabaseUrl}/functions/v1/notify-booking-confirmed`
            
            console.log('Attempting direct fetch to:', functionUrl)
            console.log('Using token:', session.access_token ? `${session.access_token.substring(0, 20)}...` : 'NO TOKEN')
            
            try {
              const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                },
                body: JSON.stringify({ bookingId }),
              })
              
              console.log('Direct fetch response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
              })
              
              if (!response.ok) {
                const errorText = await response.text()
                console.error('Direct fetch error response:', errorText)
                throw new Error(`Edge Function returned ${response.status}: ${errorText}`)
              }
              
              pushResult = await response.json()
              console.log('Direct fetch success, result:', pushResult)
            } catch (fetchError: any) {
              console.error('❌ Direct fetch also failed:', fetchError)
              throw fetchError
            }
          }
          
          if (pushErr) {
            console.error('❌ Edge Function error:', pushErr)
          } else {
            console.log('✅ Edge Function response:', pushResult)
            if (pushResult?.pushed === 0) {
              console.warn('⚠️ No push tokens found for user or FCM_SERVER_KEY not set')
            } else if (pushResult?.fcm?.failure > 0) {
              console.error('❌ FCM delivery failures:', pushResult.fcm)
            } else if (pushResult?.pushed > 0) {
              console.log('✅ Push notification sent successfully to', pushResult.pushed, 'device(s)')
            }
          }
        } catch (pushErr: any) {
          console.error('❌ Push notification failed (non-blocking):', pushErr)
          console.error('Error details:', {
            message: pushErr.message,
            cause: pushErr.cause,
            stack: pushErr.stack,
          })
        }
      }

      // Cerrar el modal primero
      setShowConfirmBookingModal(false)
      setBookingToConfirm(null)
      
      // Esperar un momento antes de recargar para asegurar que la BD se actualizó
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Recargar las reservas según la pestaña activa
      if (activeTab === 'summary') {
        await loadBookingsForWeek(summaryWeekMonday)
        await loadProfiles()
      } else {
        await loadBookings()
      }
    } catch (err: any) {
      console.error('Error updating booking:', err)
      setError(err.message || 'Error al actualizar la reserva')
      setShowConfirmBookingModal(false)
      setBookingToConfirm(null)
    } finally {
      setProcessing(false)
    }
  }

  // Función eliminada - no se usa (ya no hay botón de rechazar)
  // const handleRejectBooking = (booking: BookingWithSpot) => {
  //   setBookingToReject(booking)
  //   setShowRejectBookingModal(true)
  // }

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

      // Si se cancela una reserva activa (confirmed o pending), promover desde waitlist
      if (bookingToReject.status === 'confirmed' || bookingToReject.status === 'pending') {
        await promoteFromWaitlist(bookingToReject.date)
      }

      // Cerrar el modal primero
      setShowRejectBookingModal(false)
      setBookingToReject(null)
      
      // Esperar un momento antes de recargar para asegurar que la BD se actualizó
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Recargar las reservas según la pestaña activa
      if (activeTab === 'summary') {
        await loadBookingsForWeek(summaryWeekMonday)
        await loadProfiles()
      } else {
        await loadBookings()
      }
    } catch (err: any) {
      console.error('Error rejecting booking:', err)
      setError(err.message || 'Error al rechazar la reserva')
      setShowRejectBookingModal(false)
      setBookingToReject(null)
    } finally {
      setProcessing(false)
    }
  }

  const handleWaitlistBooking = (booking: BookingWithSpot) => {
    setBookingToWaitlist(booking)
    setShowWaitlistModal(true)
  }

  const confirmWaitlistBooking = async () => {
    if (!bookingToWaitlist) return

    setProcessing(true)
    setError(null)
    try {
      // Devolver desde confirmed a waitlist
      // El botón "Devolver a la lista de espera" solo aparece para reservas confirmadas
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'waitlist' })
        .eq('id', bookingToWaitlist.id)

      if (error) throw error

      // Si se devuelve una reserva confirmada a waitlist, promover la siguiente de la lista
      if (bookingToWaitlist.status === 'confirmed') {
        await promoteFromWaitlist(bookingToWaitlist.date)
      }

      // Cerrar el modal primero
      setShowWaitlistModal(false)
      setBookingToWaitlist(null)
      
      // Esperar un momento antes de recargar para asegurar que la BD se actualizó
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Recargar las reservas según la pestaña activa
      if (activeTab === 'summary') {
        await loadBookingsForWeek(summaryWeekMonday)
        await loadProfiles()
      } else {
        await loadBookings()
      }
    } catch (err: any) {
      console.error('Error moving to waitlist:', err)
      setError(err.message || 'Error al mover a lista de espera')
      setShowWaitlistModal(false)
      setBookingToWaitlist(null)
    } finally {
      setProcessing(false)
    }
  }

  // Función para promover desde waitlist cuando se cancela una reserva activa
  const promoteFromWaitlist = async (date: string) => {
    try {
      // Verificar que realmente haya espacio disponible (menos de 8 plazas ocupadas, excluyendo directivos)
      const { data: activeBookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', date)
        .neq('status', 'cancelled')
        .in('status', ['confirmed', 'pending'])

      if (activeBookings && activeBookings.length > 0) {
        // Cargar perfiles para filtrar directivos
        const userIds = [...new Set(activeBookings.map(b => b.user_id))]
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, role')
          .in('id', userIds)

        // Crear un mapa de roles
        const roleMap = new Map<string, string>()
        profilesData?.forEach(p => roleMap.set(p.id, p.role))

        // Filtrar reservas de directivos del conteo
        const normalBookingsCount = activeBookings.filter(b => {
          const userRole = roleMap.get(b.user_id)
          return userRole !== 'directivo'
        }).length

        // Si ya hay 8 o más plazas ocupadas (sin contar directivos), no promover
        if (normalBookingsCount >= 8) {
          return
        }
      }

      // Buscar el primero en la lista de espera para esa fecha (ordenado por created_at, excluyendo directivos)
      const { data: waitlistEntries } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', date)
        .eq('status', 'waitlist')
        .order('created_at', { ascending: true })

      if (waitlistEntries && waitlistEntries.length > 0) {
        // Cargar perfiles para filtrar directivos
        const waitlistUserIds = [...new Set(waitlistEntries.map(b => b.user_id))]
        const { data: waitlistProfilesData } = await supabase
          .from('profiles')
          .select('id, role')
          .in('id', waitlistUserIds)

        // Crear un mapa de roles
        const waitlistRoleMap = new Map<string, string>()
        waitlistProfilesData?.forEach(p => waitlistRoleMap.set(p.id, p.role))

        // Filtrar directivos y obtener el primero
        const normalWaitlistEntries = waitlistEntries.filter(b => {
          const userRole = waitlistRoleMap.get(b.user_id)
          return userRole !== 'directivo'
        })

        if (normalWaitlistEntries.length > 0) {
          const firstWaitlist = normalWaitlistEntries[0]
          
          // Promover a pending
          const { error: promoteError } = await supabase
            .from('bookings')
            .update({ status: 'pending' })
            .eq('id', firstWaitlist.id)

          if (promoteError) {
            console.error('Error promoting from waitlist:', promoteError)
          }
        }
      }
    } catch (err) {
      console.error('Error in promoteFromWaitlist:', err)
    }
  }

  // Función eliminada - no se usa
  // const formatDate = (dateString: string) => {
  //   const date = new Date(dateString)
  //   const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  //   const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  //   return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`
  // }

  // Función eliminada - no se usa
  // const groupBookingsByUser = () => {
  //   const grouped = new Map<string, BookingWithSpot[]>()
  //   const filteredBookings = bookings.filter(booking => {
  //     if (booking.status === 'cancelled') {
  //       return false
  //     }
  //     return booking.status === 'pending' || booking.status === 'confirmed' || booking.status === 'waitlist'
  //   })
  //   filteredBookings.forEach(booking => {
  //     const userId = booking.user_id
  //     if (!grouped.has(userId)) {
  //       grouped.set(userId, [])
  //     }
  //     grouped.get(userId)!.push(booking)
  //   })
  //   return Array.from(grouped.entries()).map(([userId, userBookings]) => ({
  //     userId,
  //     user: userBookings[0].user,
  //     bookings: userBookings.sort((a, b) => a.date.localeCompare(b.date))
  //   }))
  // }

  // Función eliminada - no se usa
  // const getWeekDayIndex = (dateString: string): number | null => {
  //   const date = new Date(dateString)
  //   const day = getDay(date)
  //   if (day === 0) return null
  //   if (day >= 1 && day <= 5) return day - 1
  //   return null
  // }

  // Obtener las letras de los días (L, M, X, J, V)
  const getDayLetters = () => ['L', 'M', 'X', 'J', 'V']

  // Función eliminada - no se usa
  // const toggleUserExpansion = (userId: string) => {
  //   const newExpanded = new Set(expandedUsers)
  //   if (newExpanded.has(userId)) {
  //     newExpanded.delete(userId)
  //   } else {
  //     newExpanded.add(userId)
  //   }
  //   setExpandedUsers(newExpanded)
  // }

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

  // Calcular la posición en la lista de espera para una reserva
  const getWaitlistPosition = (booking: BookingWithSpot): number | null => {
    if (booking.status !== 'waitlist') return null
    
    // Obtener todas las reservas en waitlist para el mismo día, ordenadas por created_at
    const waitlistBookings = bookings
      .filter(b => 
        b.date === booking.date && 
        b.status === 'waitlist' &&
        b.user?.role !== 'directivo' // Excluir directivos
      )
      .sort((a, b) => {
        // Ordenar por created_at (más antiguo primero)
        const dateA = new Date(a.created_at).getTime()
        const dateB = new Date(b.created_at).getTime()
        return dateA - dateB
      })
    
    // Encontrar la posición de esta reserva
    const position = waitlistBookings.findIndex(b => b.id === booking.id)
    return position >= 0 ? position + 1 : null // +1 porque las posiciones empiezan en 1
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
        className="flex gap-1.5 mb-6 rounded-[20px] p-1.5 border border-gray-200 bg-gray-50 overflow-x-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <button
          onClick={() => {
            setActiveTab('bookings')
            setError(null)
          }}
          className={`px-3 py-2 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 ${
            activeTab === 'bookings'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'bookings' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5" strokeWidth={activeTab === 'bookings' ? 2.5 : 2} />
          <span className="whitespace-nowrap">Reservas</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('spots')
            setError(null)
          }}
          className={`px-3 py-2 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 ${
            activeTab === 'spots'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'spots' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5" strokeWidth={activeTab === 'spots' ? 2.5 : 2} />
          <span className="whitespace-nowrap">Plazas</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('users')
            setError(null)
          }}
          className={`px-3 py-2 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 ${
            activeTab === 'users'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'users' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5" strokeWidth={activeTab === 'users' ? 2.5 : 2} />
          <span className="whitespace-nowrap">Usuarios</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('summary')
            setError(null)
          }}
          className={`px-3 py-2 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 ${
            activeTab === 'summary'
              ? 'text-white'
              : 'text-gray-700 hover:text-gray-900'
          }`}
          style={activeTab === 'summary' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5" strokeWidth={activeTab === 'summary' ? 2.5 : 2} />
          <span className="whitespace-nowrap">Resumen</span>
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
          {/* Selector de fecha y número de plazas */}
          <div 
            className="rounded-[20px] p-4 border border-gray-200 bg-gray-50 overflow-hidden"
          >
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Bloquear plazas
            </label>
            
            {/* Selector de fecha */}
            <div className="mb-4 min-w-0">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Seleccionar día
              </label>
              <div className="relative min-w-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  value={selectedSpotDate}
                  onChange={(e) => setSelectedSpotDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full min-w-0 pl-9 sm:pl-10 pr-3 sm:pr-4 py-2.5 sm:py-3 border border-gray-300 rounded-[14px] focus:outline-none transition-colors text-gray-900 bg-white text-sm sm:text-base box-border"
                  onFocus={(e) => {
                    e.target.style.borderColor = '#FF9500'
                    e.target.style.boxShadow = '0 0 0 3px rgba(255, 149, 0, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#D1D5DB'
                    e.target.style.boxShadow = 'none'
                  }}
                  style={{ maxWidth: '100%' }}
                />
              </div>
              <div className="mt-2">
                <p className="text-xs sm:text-sm font-medium text-gray-700 break-words">
                  {formatDateDisplay(selectedSpotDate)}
                </p>
              </div>
            </div>

            {/* Input de número de plazas */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Número de plazas a bloquear
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max={8}
                  value={spotsToBlock || ''}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0
                    setSpotsToBlock(Math.max(0, Math.min(value, 8)))
                  }}
                  className="w-full pl-4 pr-4 py-3 border border-gray-300 rounded-[14px] focus:outline-none transition-colors text-gray-900 bg-white"
                  onFocus={(e) => {
                    e.target.style.borderColor = '#FF9500'
                    e.target.style.boxShadow = '0 0 0 3px rgba(255, 149, 0, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#D1D5DB'
                    e.target.style.boxShadow = 'none'
                  }}
                  placeholder="0"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Máximo: 8 plazas
              </p>
            </div>

            {/* Botón para bloquear */}
            <button
              onClick={handleBlockSpots}
              disabled={processing || !selectedSpotDate || spotsToBlock <= 0}
              className="w-full px-4 py-3 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-white"
              style={{
                backgroundColor: '#FF9500',
                boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
              }}
            >
              <Lock className="w-5 h-5" />
              Bloquear {spotsToBlock > 0 ? `${spotsToBlock} ${spotsToBlock === 1 ? 'plaza' : 'plazas'}` : 'plazas'}
            </button>
          </div>

          {/* Estado de carga */}
          {loadingSpotBlocks && (
            <div className="text-center py-4">
              <p className="text-gray-600">Cargando bloqueos...</p>
            </div>
          )}

          {/* Información de bloqueos actuales */}
          {!loadingSpotBlocks && selectedSpotDate && (
            <div className="rounded-[20px] p-4 border border-gray-200 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    Plazas bloqueadas para {formatDateDisplay(selectedSpotDate)}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {spotBlocks.length} / 8
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Car className={`w-8 h-8 ${spotBlocks.length > 0 ? 'text-red-500' : 'text-green-500'}`} />
                </div>
              </div>
              {spotBlocks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600">Plazas bloqueadas:</p>
                    <button
                      onClick={async () => {
                        if (!selectedSpotDate) return
                        setProcessing(true)
                        try {
                          const { error } = await supabase
                            .from('spot_blocks')
                            .delete()
                            .eq('date', selectedSpotDate)

                          if (error) {
                            if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
                              throw new Error('La tabla de bloqueos no existe. Ejecuta create_spot_blocks.sql en Supabase.')
                            }
                            throw error
                          }

                          await loadSpotBlocks()
                          setError(null)
                        } catch (err: any) {
                          console.error('Error deleting spot blocks:', err)
                          setError(err.message || 'Error al eliminar los bloqueos')
                        } finally {
                          setProcessing(false)
                        }
                      }}
                      disabled={processing}
                      className="px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all duration-200 active:scale-95 flex items-center gap-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Unlock className="w-3.5 h-3.5" strokeWidth={2} />
                      Eliminar bloqueos
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {spotBlocks.map((block) => {
                      const spot = spots.find(s => s.id === block.spot_id)
                      return (
                        <span
                          key={block.id}
                          className="px-2.5 py-1 rounded-[8px] text-xs font-semibold bg-red-100 text-red-700"
                        >
                          {spot?.label || `Plaza ${block.spot_id}`}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {/* Selector de semana */}
          <div 
            className="mb-4 p-4 bg-gray-50 rounded-[20px] border border-gray-200"
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


          {/* Switch para mostrar/ocultar reservas confirmadas */}
          <div 
            className="rounded-[20px] p-4 border border-gray-200 bg-white"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {showConfirmedBookings ? (
                  <Eye className="w-4 h-4 text-gray-600" strokeWidth={2} />
                ) : (
                  <EyeOff className="w-4 h-4 text-gray-400" strokeWidth={2} />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  Mostrar reservas confirmadas
                </span>
              </div>
              <button
                onClick={() => setShowConfirmedBookings(!showConfirmedBookings)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                  showConfirmedBookings ? 'bg-orange-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showConfirmedBookings ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Botones de días de la semana */}
          <div 
            className="rounded-[20px] p-4 border border-gray-200 bg-gray-50"
          >
            <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider">
              Ver reservas por día
            </p>
            <div className="flex gap-1.5 overflow-x-auto">
              <button
                onClick={() => setSelectedDayForList(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-[10px] border transition-all duration-200 active:scale-95 text-xs font-semibold whitespace-nowrap ${
                  selectedDayForList === null
                    ? 'bg-gray-800 border-gray-800 text-white'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Todas
              </button>
              {getDayLetters().map((letter, index) => {
                const isSelected = selectedDayForList === index
                
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDayForList(isSelected ? null : index)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-[10px] border transition-all duration-200 active:scale-95 text-xs font-semibold whitespace-nowrap ${
                      isSelected
                        ? 'bg-gray-800 border-gray-800 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Vista de lista por día o todas las reservas */}
          {selectedDayForList !== null ? (
            // Vista de lista de usuarios para el día seleccionado
            <div>
              {(() => {
                const dayDate = addDays(selectedWeekMonday, selectedDayForList)
                const dayDateString = format(dayDate, 'yyyy-MM-dd')
                const dayName = format(dayDate, 'EEEE, d \'de\' MMMM', { locale: es })
                const dayBookings = bookings
                  .filter(b => {
                    if (b.date !== dayDateString) return false
                    if (b.status === 'cancelled') return false
                    // Filtrar reservas confirmadas si el switch está desactivado
                    if (!showConfirmedBookings && b.status === 'confirmed') return false
                    return true
                  })
                  .sort((a, b) => {
                    // Ordenar: pending primero, luego waitlist, luego confirmed
                    const order = { pending: 0, waitlist: 1, confirmed: 2 }
                    return (order[a.status as keyof typeof order] || 3) - (order[b.status as keyof typeof order] || 3)
                  })
                
                return (
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">
                        {dayName.charAt(0).toUpperCase() + dayName.slice(1)}
                      </h3>
                      <button
                        onClick={() => setSelectedDayForList(null)}
                        className="px-3 py-1.5 rounded-[8px] text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Ver todas
                      </button>
                    </div>
                    
                    {dayBookings.length === 0 ? (
                      <div className="text-center py-12 rounded-[20px] border border-gray-200 bg-gray-50">
                        <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-700 font-medium">No hay reservas para este día</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dayBookings.map((booking) => {
                          const userName = booking.user?.full_name || booking.user?.email?.split('@')[0] || 'Usuario desconocido'
                          
                          return (
                            <div
                              key={booking.id}
                              className={`p-3 rounded-[14px] border transition-all ${
                                booking.status === 'pending'
                                  ? 'border-orange-200 bg-white shadow-sm'
                                  : booking.status === 'waitlist'
                                  ? 'border-purple-200 bg-white shadow-sm'
                                  : 'border-green-200 bg-white shadow-sm'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 mb-1">
                                    {userName}
                                  </p>
                                  {booking.carpoolUser && (
                                    <div className="flex items-center gap-1.5 mb-1.5 text-orange-600">
                                      <Users className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                      <span className="text-xs font-medium">
                                        Con {booking.carpoolUser.full_name || booking.carpoolUser.email?.split('@')[0] || 'otro usuario'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    {booking.status === 'waitlist' && getWaitlistPosition(booking) && (
                                      <span className="px-2 py-0.5 text-xs font-bold rounded-[6px] bg-purple-600 text-white">
                                        #{getWaitlistPosition(booking)}
                                      </span>
                                    )}
                                    <span
                                      className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-[6px] ${
                                        booking.status === 'confirmed'
                                          ? 'bg-green-100 text-green-700'
                                          : booking.status === 'waitlist'
                                          ? 'bg-purple-100 text-purple-700'
                                          : 'bg-orange-100 text-orange-700'
                                      }`}
                                    >
                                      {booking.status === 'confirmed' 
                                        ? 'Confirmada' 
                                        : booking.status === 'waitlist'
                                        ? 'Lista de espera'
                                        : 'Pendiente'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                {(booking.status === 'waitlist' || booking.status === 'pending') ? (
                                  <button
                                    onClick={() => handleConfirmBooking(booking)}
                                    className="w-full px-3 py-2 rounded-[10px] font-medium text-xs transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-white"
                                    style={{
                                      backgroundColor: '#34C759',
                                    }}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
                                    Aceptar
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleWaitlistBooking(booking)}
                                    className="w-full px-3 py-2 rounded-[10px] font-medium text-xs transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-white"
                                    style={{
                                      backgroundColor: '#AF52DE',
                                    }}
                                  >
                                    <UserPlus className="w-3.5 h-3.5" strokeWidth={2.5} />
                                    Devolver a la lista de espera
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          ) : (
            // Vista de todas las reservas en lista
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  Todas las reservas
                </h3>
              </div>
              
              {bookings.length === 0 ? (
                <div className="text-center py-12 rounded-[20px] border border-gray-200 bg-gray-50">
                  <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-700 font-medium">No hay reservas activas</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings
                    .filter(b => {
                      if (b.status === 'cancelled') return false
                      // Filtrar reservas confirmadas si el switch está desactivado
                      if (!showConfirmedBookings && b.status === 'confirmed') return false
                      return true
                    })
                    .sort((a, b) => {
                      // Ordenar por fecha, luego por estado
                      const dateCompare = a.date.localeCompare(b.date)
                      if (dateCompare !== 0) return dateCompare
                      const order = { pending: 0, waitlist: 1, confirmed: 2 }
                      return (order[a.status as keyof typeof order] || 3) - (order[b.status as keyof typeof order] || 3)
                    })
                    .map((booking) => {
                      const userName = booking.user?.full_name || booking.user?.email?.split('@')[0] || 'Usuario desconocido'
                      const bookingDate = format(new Date(booking.date), 'EEEE, d \'de\' MMMM', { locale: es })
                      
                      return (
                        <div
                          key={booking.id}
                          className={`p-3 rounded-[14px] border transition-all ${
                            booking.status === 'pending'
                              ? 'border-orange-200 bg-white shadow-sm'
                              : booking.status === 'waitlist'
                              ? 'border-purple-200 bg-white shadow-sm'
                              : 'border-green-200 bg-white shadow-sm'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 mb-1">
                                {userName}
                              </p>
                              <p className="text-xs text-gray-500 mb-1.5">
                                {bookingDate.charAt(0).toUpperCase() + bookingDate.slice(1)}
                              </p>
                              {booking.carpoolUser && (
                                <div className="flex items-center gap-1.5 text-orange-600">
                                  <Users className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                  <span className="text-xs font-medium">
                                    Con {booking.carpoolUser.full_name || booking.carpoolUser.email?.split('@')[0] || 'otro usuario'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <div className="flex items-center gap-1.5">
                                {booking.status === 'waitlist' && getWaitlistPosition(booking) && (
                                  <span className="px-2 py-0.5 text-xs font-bold rounded-[6px] bg-purple-600 text-white">
                                    #{getWaitlistPosition(booking)}
                                  </span>
                                )}
                                <span
                                  className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-[6px] ${
                                    booking.status === 'confirmed'
                                      ? 'bg-green-100 text-green-700'
                                      : booking.status === 'waitlist'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-orange-100 text-orange-700'
                                  }`}
                                >
                                  {booking.status === 'confirmed' 
                                    ? 'Confirmada' 
                                    : booking.status === 'waitlist'
                                    ? 'Lista de espera'
                                    : 'Pendiente'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            {(booking.status === 'waitlist' || booking.status === 'pending') ? (
                              <button
                                onClick={() => handleConfirmBooking(booking)}
                                className="w-full px-3 py-2 rounded-[10px] font-medium text-xs transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-white"
                                style={{
                                  backgroundColor: '#34C759',
                                }}
                              >
                                <CheckCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
                                Aceptar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleWaitlistBooking(booking)}
                                className="w-full px-3 py-2 rounded-[10px] font-medium text-xs transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-white"
                                style={{
                                  backgroundColor: '#AF52DE',
                                }}
                              >
                                <UserPlus className="w-3.5 h-3.5" strokeWidth={2.5} />
                                Devolver a la lista de espera
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* Estado de carga */}
          {loadingBookings && (
            <div className="text-center py-8">
              <p className="text-gray-600">Cargando reservas...</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Selector de semana */}
          <div 
            className="mb-4 p-4 bg-gray-50 rounded-[20px] border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  const previousWeek = subDays(summaryWeekMonday, 7)
                  setSummaryWeekMonday(previousWeek)
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
                    setSummaryWeekMonday(startOfWeek(today, { weekStartsOn: 1 }))
                  }}
                  className="w-full px-4 py-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    {format(summaryWeekMonday, 'd MMM', { locale: es })} - {format(addDays(summaryWeekMonday, 4), 'd MMM', { locale: es })}
                  </span>
                </button>
              </div>
              
              <button
                onClick={() => {
                  const nextWeek = addDays(summaryWeekMonday, 7)
                  setSummaryWeekMonday(nextWeek)
                }}
                className="flex-shrink-0 p-2 rounded-[12px] transition-all duration-200 active:scale-95 bg-white border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                title="Semana siguiente"
              >
                <ChevronRight className="h-5 w-5 text-gray-700" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* Tabla de repartición */}
          {(() => {
            // Calcular días de la semana (L-V)
            const weekDays: Date[] = []
            for (let i = 0; i < 5; i++) {
              weekDays.push(addDays(summaryWeekMonday, i))
            }
            const dayLabels = ['L', 'M', 'X', 'J', 'V']
            
            // Crear mapa de reservas por usuario y día
            const bookingsMap = new Map<string, Map<string, BookingWithSpot>>()
            const dayTotals = new Map<string, number>()
            const usersWithBookings = new Set<string>()
            
            // Inicializar totales por día
            weekDays.forEach(day => {
              const dayStr = format(day, 'yyyy-MM-dd')
              dayTotals.set(dayStr, 0)
            })
            
            // Procesar reservas confirmadas de la semana
            // Filtrar y procesar todas las reservas confirmadas
            const confirmedBookings = bookings.filter(b => {
              if (b.status !== 'confirmed') return false
              if (!b.user || b.user.role !== 'user') return false
              
              const bookingDate = new Date(b.date)
              bookingDate.setHours(0, 0, 0, 0)
              const monday = new Date(summaryWeekMonday)
              monday.setHours(0, 0, 0, 0)
              const friday = addDays(monday, 4)
              friday.setHours(23, 59, 59, 999)
              
              return bookingDate >= monday && bookingDate <= friday
            })
            
            console.log('Reservas confirmadas para el resumen:', confirmedBookings.length, confirmedBookings)
            
            confirmedBookings.forEach(booking => {
              const userId = booking.user_id
              const dateStr = booking.date
              
              if (!bookingsMap.has(userId)) {
                bookingsMap.set(userId, new Map())
              }
              // Si ya existe una reserva para este usuario y día, mantener la más reciente
              const existingBooking = bookingsMap.get(userId)!.get(dateStr)
              if (!existingBooking || new Date(booking.created_at) > new Date(existingBooking.created_at)) {
                bookingsMap.get(userId)!.set(dateStr, booking)
              }
              
              // Añadir usuario a la lista de usuarios con reservas
              usersWithBookings.add(userId)
              
              // Incrementar total del día
              const currentTotal = dayTotals.get(dateStr) || 0
              dayTotals.set(dateStr, currentTotal + 1)
            })
            
            // Obtener usuarios normales (no directivos, no admins) que tienen reservas O todos los usuarios verificados
            const normalUsers = profiles.filter(p => p.role === 'user' && p.is_verified)
            
            // Incluir también usuarios que tienen reservas pero pueden no estar en profiles aún
            const allUserIds = new Set([...normalUsers.map(u => u.id), ...Array.from(usersWithBookings)])
            const usersToShow = Array.from(allUserIds).map(userId => {
              const profile = profiles.find(p => p.id === userId)
              if (profile) return profile
              // Si no está en profiles, crear un perfil temporal con la info de la reserva
              const booking = confirmedBookings.find(b => b.user_id === userId)
              if (booking && booking.user) {
                return booking.user
              }
              return null
            }).filter((u): u is Profile => u !== null)
            
            // Calcular totales por usuario
            const userTotals = new Map<string, number>()
            bookingsMap.forEach((userBookings, userId) => {
              userTotals.set(userId, userBookings.size)
            })
            
            // Ordenar usuarios por total de plazas (descendente)
            const sortedUsers = [...usersToShow].sort((a, b) => {
              const totalA = userTotals.get(a.id) || 0
              const totalB = userTotals.get(b.id) || 0
              return totalB - totalA
            })
            
            // Calcular total general
            const grandTotal = Array.from(userTotals.values()).reduce((sum, total) => sum + total, 0)
            
            return (
              <div className="rounded-[20px] border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                          Usuario
                        </th>
                        {weekDays.map((day, index) => (
                          <th 
                            key={index}
                            className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[60px]"
                          >
                            {dayLabels[index]}
                            <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                              {format(day, 'd/M')}
                            </div>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-100">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((user, userIndex) => {
                        const userBookings = bookingsMap.get(user.id) || new Map()
                        const userTotal = userTotals.get(user.id) || 0
                        const userName = user.full_name || user.email?.split('@')[0] || 'Usuario'
                        
                        return (
                          <tr 
                            key={user.id}
                            className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                              userIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                            }`}
                          >
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-inherit z-10">
                              {userName}
                            </td>
                            {weekDays.map((day, dayIndex) => {
                              const dayStr = format(day, 'yyyy-MM-dd')
                              const hasBooking = userBookings.has(dayStr)
                              
                              return (
                                <td 
                                  key={dayIndex}
                                  className="px-3 py-3 text-center"
                                >
                                  {hasBooking ? (
                                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-green-500 text-white text-xs font-bold">
                                      ✓
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-gray-100 text-gray-400 text-xs">
                                      —
                                    </div>
                                  )}
                                </td>
                              )
                            })}
                            <td className="px-4 py-3 text-center bg-gray-100">
                              <span className="text-sm font-bold text-gray-900">
                                {userTotal}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {/* Fila de totales */}
                      <tr className="bg-gray-100 border-t-2 border-gray-300">
                        <td className="px-4 py-3 text-sm font-bold text-gray-900 sticky left-0 bg-gray-100 z-10">
                          Total
                        </td>
                        {weekDays.map((day, dayIndex) => {
                          const dayStr = format(day, 'yyyy-MM-dd')
                          const dayTotal = dayTotals.get(dayStr) || 0
                          
                          return (
                            <td 
                              key={dayIndex}
                              className="px-3 py-3 text-center"
                            >
                              <span className="text-sm font-bold text-gray-900">
                                {dayTotal}
                              </span>
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center bg-gray-200">
                          <span className="text-sm font-bold text-gray-900">
                            {grandTotal}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Modal de verificación */}

      {/* Modal de bloqueo de plazas */}
      <ConfirmModal
        isOpen={showBlockModal}
        onClose={() => {
          setShowBlockModal(false)
        }}
        onConfirm={confirmBlockSpots}
        title="Bloquear plazas"
        message={
          selectedSpotDate && spotsToBlock > 0
            ? `¿Estás seguro de que deseas bloquear ${spotsToBlock} ${spotsToBlock === 1 ? 'plaza' : 'plazas'} para el ${formatDateDisplay(selectedSpotDate)}?`
            : ''
        }
        confirmText="Sí, bloquear"
        loading={processing}
        confirmButtonClass="bg-orange-600 hover:bg-orange-700"
      />

      {/* Modal de confirmación de reserva */}
      <ConfirmModal
        isOpen={showConfirmBookingModal}
        onClose={() => {
          setShowConfirmBookingModal(false)
          setBookingToConfirm(null)
        }}
        onConfirm={confirmBookingStatus}
        title="Aceptar Reserva"
        message={
          bookingToConfirm
            ? `¿Estás seguro de que deseas aceptar la reserva para el ${formatDateDisplay(bookingToConfirm.date)}?`
            : ''
        }
        confirmText="Sí, aceptar"
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
            ? `¿Estás seguro de que deseas rechazar la reserva para el ${formatDateDisplay(bookingToReject.date)}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Sí, rechazar"
        cancelText="Cancelar"
        loading={processing}
      />

      {/* Modal de añadir a lista de espera */}
      <ConfirmModal
        isOpen={showWaitlistModal}
        onClose={() => {
          setShowWaitlistModal(false)
          setBookingToWaitlist(null)
        }}
        onConfirm={confirmWaitlistBooking}
        title="Devolver a la Lista de Espera"
        message={
          bookingToWaitlist
            ? `¿Estás seguro de que deseas devolver esta reserva para el ${formatDateDisplay(bookingToWaitlist.date)} a la lista de espera?`
            : ''
        }
        confirmText="Sí, devolver a lista de espera"
        cancelText="Cancelar"
        loading={processing}
        confirmButtonClass="bg-purple-600 hover:bg-purple-700"
      />
    </div>
  )
}
