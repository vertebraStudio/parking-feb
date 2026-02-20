import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Lock, Unlock, CheckCircle, Calendar, Car, Shield, User, ChevronLeft, ChevronRight, UserPlus, BarChart3, Eye, EyeOff, Trash2, Search, Download, GripVertical } from 'lucide-react'
import ExcelJS from 'exceljs'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, startOfWeek, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { Profile, ParkingSpot, Booking, SpotBlock } from '../types'
import ConfirmModal from '../components/ui/ConfirmModal'

interface BookingWithSpot extends Booking {
  spot?: ParkingSpot
  user?: Profile
  // Compañeros de coche (pueden ser varios)
  carpoolUsers?: Profile[]
}

// Helpers para avatares tipo "FaceHash"
function getFaceHashColor(key: string) {
  const colors = ['#FF9500', '#34C759', '#0A84FF', '#AF52DE', '#FF2D55', '#FF9F0A', '#5AC8FA', '#FFCC00']
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

function getProfileInitials(profile: Profile) {
  const base = (profile.full_name && profile.full_name.trim()) || profile.email || ''
  if (!base) return '?'
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

interface SortableBookingItemProps {
  id: number
  booking: BookingWithSpot
  isDraggable: boolean
  children: (renderProps: {
    attributes: any
    listeners: any
    isDraggable: boolean
  }) => React.ReactNode
}

function SortableBookingItem({ id, booking, isDraggable, children }: SortableBookingItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id, disabled: !isDraggable, data: { booking } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.7 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={`${isDragging ? 'shadow-lg relative' : 'h-full'}`}>
      {children({ attributes, listeners, isDraggable })}
    </div>
  )
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
  // Estado para gestionar acciones sobre usuarios (aceptar / borrar) en la pestaña de usuarios
  const [userToVerify, setUserToVerify] = useState<Profile | null>(null)
  const [userToDelete, setUserToDelete] = useState<Profile | null>(null)
  const [showVerifyUserModal, setShowVerifyUserModal] = useState(false)
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false)
  const [verifyingUser, setVerifyingUser] = useState(false)
  const [deletingUser, setDeletingUser] = useState(false)
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
  const [userSearch, setUserSearch] = useState('') // Buscador de usuarios en pestaña de usuarios
  const [bookingSearch, setBookingSearch] = useState('') // Buscador de reservas por nombre

  // Estados para modales
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showConfirmBookingModal, setShowConfirmBookingModal] = useState(false)
  const [showRejectBookingModal, setShowRejectBookingModal] = useState(false)
  const [showWaitlistModal, setShowWaitlistModal] = useState(false)
  const [bookingToConfirm, setBookingToConfirm] = useState<BookingWithSpot | null>(null)
  const [bookingToReject, setBookingToReject] = useState<BookingWithSpot | null>(null)
  const [bookingToWaitlist, setBookingToWaitlist] = useState<BookingWithSpot | null>(null)
  const [waitlistReason, setWaitlistReason] = useState('')
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent, dayBookings: BookingWithSpot[]) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = dayBookings.findIndex(b => b.id === active.id)
    let newIndex = dayBookings.findIndex(b => b.id === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      let targetBooking = dayBookings[newIndex]

      // Prevent moving relative to non-waitlist items
      if (targetBooking.status !== 'waitlist') {
        const waitlistBookings = dayBookings.filter(b => b.status === 'waitlist')
        if (waitlistBookings.length > 0) {
          if (oldIndex > newIndex) {
            // Dragged above the waitlist -> move to top of waitlist
            targetBooking = waitlistBookings[0]
            newIndex = dayBookings.findIndex(b => b.id === targetBooking.id)
          } else {
            // Dragged below waitlist -> move to bottom of waitlist
            targetBooking = waitlistBookings[waitlistBookings.length - 1]
            newIndex = dayBookings.findIndex(b => b.id === targetBooking.id)
          }
          if (active.id === targetBooking.id) return
        } else {
          return
        }
      }

      // Calculate a new created_at to persist the order
      // The dayBookings are sorted by created_at ascending (older first)
      // So if dragging moving to index matching targetBooking, we interpolate
      let newCreatedAt: number

      // If moving before targetBooking
      if (oldIndex > newIndex) {
        const prevBooking = newIndex > 0 ? dayBookings[newIndex - 1] : null
        if (prevBooking && prevBooking.status === 'waitlist') {
          newCreatedAt = (new Date(prevBooking.created_at).getTime() + new Date(targetBooking.created_at).getTime()) / 2
        } else {
          // It's the first waitlist item
          newCreatedAt = new Date(targetBooking.created_at).getTime() - 1000
        }
      } else {
        // If moving after targetBooking
        const nextBooking = newIndex < dayBookings.length - 1 ? dayBookings[newIndex + 1] : null
        if (nextBooking && nextBooking.status === 'waitlist') {
          newCreatedAt = (new Date(targetBooking.created_at).getTime() + new Date(nextBooking.created_at).getTime()) / 2
        } else {
          // It's the last waitlist item
          newCreatedAt = new Date(targetBooking.created_at).getTime() + 1000
        }
      }

      const newDateString = new Date(newCreatedAt).toISOString()

      // Optimistically update local state
      setBookings(current =>
        current.map(b => b.id === active.id ? { ...b, created_at: newDateString } : b)
      )

      // Update Supabase
      try {
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ created_at: newDateString })
          .eq('id', active.id)

        if (updateError) throw updateError
      } catch (err: any) {
        console.error('Error updating drag order:', err)
        setError('Error al guardar el nuevo orden de la lista de espera')
        // En caso de error, la suscripción lo revertirá.
      }
    }
  }

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
        .lte('date', fridayString)
        // .neq('status', 'cancelled') // Permitir canceladas para el resumen
        .order('date', { ascending: true })

      if (bookingsError) {
        console.error('Error loading bookings for summary:', bookingsError)
        setError(`Error al cargar reservas: ${bookingsError.message}`)
        return
      }

      // Cargar información de usuarios (incluyendo compañeros de coche múltiples)
      if (bookingsData && bookingsData.length > 0) {
        const userIds = [...new Set(bookingsData.map(b => b.user_id))]

        const bookingIds = bookingsData.map(b => b.id)
        const { data: carpoolLinks, error: carpoolLinksError } = await supabase
          .from('booking_carpool_users')
          .select('*')
          .in('booking_id', bookingIds)

        if (carpoolLinksError) {
          console.error('Error loading booking_carpool_users (summary):', carpoolLinksError)
        }

        const legacyCarpoolIds = bookingsData
          .map(b => b.carpool_with_user_id)
          .filter((id): id is string => id !== null)
        const linksUserIds = (carpoolLinks || []).map(link => link.user_id as string)
        const allCarpoolUserIds = Array.from(new Set([...legacyCarpoolIds, ...linksUserIds]))

        const allUserIds = [...new Set([...userIds, ...allCarpoolUserIds])]

        const { data: usersData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', allUserIds)

        const profilesMap = new Map<string, Profile>()
        usersData?.forEach(p => profilesMap.set(p.id, p))

        const bookingsWithDetails: BookingWithSpot[] = bookingsData.map(booking => {
          const userProfile = profilesMap.get(booking.user_id)

          const linksForBooking = (carpoolLinks || []).filter(link => link.booking_id === booking.id)
          const usersFromLinks = linksForBooking
            .map(link => profilesMap.get(link.user_id))
            .filter((u): u is Profile => !!u)

          const carpoolUsersMap = new Map<string, Profile>()
          usersFromLinks.forEach(u => carpoolUsersMap.set(u.id, u))

          if (booking.carpool_with_user_id) {
            const legacyProfile = profilesMap.get(booking.carpool_with_user_id)
            if (legacyProfile) {
              carpoolUsersMap.delete(legacyProfile.id)
              carpoolUsersMap.set(legacyProfile.id, legacyProfile)
            }
          }

          const carpoolUsers = Array.from(carpoolUsersMap.values())

          return {
            ...booking,
            spot: undefined,
            user: userProfile,
            carpoolUsers,
          }
        })

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

  const handleOpenVerifyUser = (profile: Profile) => {
    setUserToVerify(profile)
    setShowVerifyUserModal(true)
  }

  const handleOpenDeleteUser = (profile: Profile) => {
    setUserToDelete(profile)
    setShowDeleteUserModal(true)
  }

  const applyProfileUpdateLocally = (updated: Partial<Profile> & { id: string }) => {
    setProfiles(prev =>
      prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p))
    )
  }

  const removeProfileLocally = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id))
  }

  const confirmVerifyUser = async () => {
    if (!userToVerify) return

    setVerifyingUser(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', userToVerify.id)

      if (error) throw error

      applyProfileUpdateLocally({ id: userToVerify.id, is_verified: true })
      setShowVerifyUserModal(false)
      setUserToVerify(null)
    } catch (err: any) {
      console.error('Error verifying user (AdminPage):', err)
      alert(`Error al aceptar el usuario: ${err.message || 'Error desconocido'}`)
    } finally {
      setVerifyingUser(false)
    }
  }

  const confirmDeleteUser = async () => {
    if (!userToDelete) return

    setDeletingUser(true)
    try {
      const targetId = userToDelete.id

      // 1) Intentar borrar completamente usando la Edge Function (auth.users + datos públicos).
      //    Si falla por CORS / red, continuaremos con un borrado local de tablas públicas.
      try {
        const result = await supabase.functions.invoke('delete-user-completely', {
          body: { userId: targetId },
        })
        console.log('delete-user-completely via invoke result:', { data: result.data, error: result.error })
      } catch (invokeErr: any) {
        console.warn('⚠️ Error llamando a delete-user-completely, se continuará con borrado local:', invokeErr)
      }

      // 2) Borrado local en tablas públicas como respaldo (no depende de la Edge Function)
      try {
        const { error: bookingsError } = await supabase
          .from('bookings')
          .delete()
          .eq('user_id', targetId)
        if (bookingsError) {
          console.error('Error deleting user bookings (AdminPage, fallback):', bookingsError)
        }

        const { error: carpoolError } = await supabase
          .from('booking_carpool_users')
          .delete()
          .eq('user_id', targetId)
        if (carpoolError) {
          console.error('Error deleting booking_carpool_users (AdminPage, fallback):', carpoolError)
        }

        const { error: notificationsError } = await supabase
          .from('notifications')
          .delete()
          .eq('user_id', targetId)
        if (notificationsError) {
          console.error('Error deleting user notifications (AdminPage, fallback):', notificationsError)
        }

        const { error: pushTokensError } = await supabase
          .from('push_tokens')
          .delete()
          .eq('user_id', targetId)
        if (pushTokensError) {
          console.error('Error deleting user push tokens (AdminPage, fallback):', pushTokensError)
        }

        const { error: spotsError } = await supabase
          .from('parking_spots')
          .update({ assigned_to: null, is_released: false })
          .eq('assigned_to', targetId)
        if (spotsError) {
          console.error('Error clearing executive spots for user (AdminPage, fallback):', spotsError)
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', targetId)

        if (profileError) {
          console.error('Error deleting user profile (AdminPage, fallback):', profileError)
          alert('No se ha podido eliminar el usuario. Revisa la consola para más detalles.')
          return
        }
      } catch (fallbackErr: any) {
        console.error('❌ Error en el borrado local de datos del usuario (AdminPage):', fallbackErr)
        alert('No se ha podido eliminar el usuario. Revisa la consola para más detalles.')
        return
      }

      // 3) Actualizar estado local
      removeProfileLocally(targetId)
      setShowDeleteUserModal(false)
      setUserToDelete(null)
    } catch (err: any) {
      console.error('Error deleting user (AdminPage):', err)
      alert(`Error al eliminar el usuario: ${err.message || 'Error desconocido'}`)
    } finally {
      setDeletingUser(false)
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

      // Normalizar estado legacy 'pending' → 'waitlist'
      const pendingIds = (bookingsData || []).filter((b: any) => b.status === 'pending').map((b: any) => b.id)
      if (pendingIds.length > 0) {
        console.warn('⚠️ Migrando reservas legacy pending → waitlist (AdminPage):', pendingIds.length)
        supabase
          .from('bookings')
          .update({ status: 'waitlist', spot_id: null })
          .in('id', pendingIds)
          .then(({ error }) => {
            if (error) console.error('Error migrating pending → waitlist (AdminPage):', error)
          })
      }

      const normalizedBookingsData = (bookingsData || []).map((b: any) =>
        b.status === 'pending' ? { ...b, status: 'waitlist', spot_id: null } : b
      )

      // Cargar información de plazas y usuarios
      if (normalizedBookingsData && normalizedBookingsData.length > 0) {
        const spotIds = [...new Set(normalizedBookingsData.map((b: any) => b.spot_id).filter((id: any) => id !== null))]
        const userIds = [...new Set(normalizedBookingsData.map((b: any) => b.user_id))]

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

        // Cargar relaciones de carpool múltiple para las reservas
        const bookingIds = normalizedBookingsData.map((b: any) => b.id)
        const { data: carpoolLinks, error: carpoolLinksError } = await supabase
          .from('booking_carpool_users')
          .select('*')
          .in('booking_id', bookingIds)

        if (carpoolLinksError) {
          console.error('Error loading booking_carpool_users (bookings tab):', carpoolLinksError)
        }

        const legacyCarpoolIds = normalizedBookingsData
          .map(b => b.carpool_with_user_id)
          .filter((id): id is string => id !== null)

        const linksUserIds = (carpoolLinks || []).map(link => link.user_id as string)
        const allCarpoolUserIds = Array.from(new Set([...legacyCarpoolIds, ...linksUserIds]))

        let carpoolProfilesMap = new Map<string, Profile>()
        if (allCarpoolUserIds.length > 0) {
          const { data: carpoolProfilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', allCarpoolUserIds)

          if (carpoolProfilesData) {
            carpoolProfilesData.forEach(profile => {
              carpoolProfilesMap.set(profile.id, profile)
            })
          }
        }

        const bookingsWithDetails: BookingWithSpot[] = normalizedBookingsData.map((booking: any) => {
          const spot = spotsResult.data?.find(s => s.id === booking.spot_id)
          const userProfile = usersResult.data?.find(u => u.id === booking.user_id)

          const linksForBooking = (carpoolLinks || []).filter(link => link.booking_id === booking.id)
          const usersFromLinks = linksForBooking
            .map(link => carpoolProfilesMap.get(link.user_id))
            .filter((u): u is Profile => !!u)

          const carpoolUsersMap = new Map<string, Profile>()
          usersFromLinks.forEach(u => carpoolUsersMap.set(u.id, u))

          if (booking.carpool_with_user_id) {
            const legacyProfile = carpoolProfilesMap.get(booking.carpool_with_user_id)
            if (legacyProfile) {
              carpoolUsersMap.delete(legacyProfile.id)
              carpoolUsersMap.set(legacyProfile.id, legacyProfile)
            }
          }

          const carpoolUsers = Array.from(carpoolUsersMap.values())

          return {
            ...booking,
            spot,
            user: userProfile,
            carpoolUsers,
          }
        })

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

      // Invocamos la Edge Function manualmente para asegurar el envío de notificaciones
      // (Bypass del Webhook que puede estar fallando)
      const { error: notifyError } = await supabase.functions.invoke('notify-booking-confirmed', {
        body: { bookingId }
      })

      if (notifyError) {
        console.error('Error invoking notify-booking-confirmed:', notifyError)
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

      // Ya no existe el estado 'pending' ni la promoción automática desde waitlist

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
    setWaitlistReason('')
    setShowWaitlistModal(true)
  }

  const confirmWaitlistBooking = async () => {
    if (!bookingToWaitlist) return

    setProcessing(true)
    setError(null)
    try {
      // Devolver desde confirmed a waitlist
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'waitlist', spot_id: null, created_at: new Date().toISOString() })
        .eq('id', bookingToWaitlist.id)

      if (error) throw error

      // Enviar notificación (Push + In-App) via Edge Function
      const reason = waitlistReason.trim()
      const { error: notifyError } = await supabase.functions.invoke('notify-booking-waitlisted', {
        body: { bookingId: bookingToWaitlist.id, reason }
      })

      if (notifyError) {
        console.error('Error invoking notify-booking-waitlisted:', notifyError)
      }

      // Cerrar el modal
      setShowWaitlistModal(false)
      setBookingToWaitlist(null)
      setWaitlistReason('')

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

  // Ya no existe el estado 'pending' ni la promoción automática desde waitlist
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


  const exportSummaryToExcel = async () => {
    console.log('📊 Exportando Excel con ExcelJS...', { bookings: bookings.length, profiles: profiles.length, summaryWeekMonday })
    try {
      if (!bookings || !profiles) {
        alert('No hay datos para exportar')
        return
      }

      // 1. Preparar datos
      const weekDaysExport: Date[] = []
      for (let i = 0; i < 5; i++) weekDaysExport.push(addDays(summaryWeekMonday, i))

      const dayData = weekDaysExport.map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')

        const confirmed = bookings
          .filter(b => b.date === dateStr && b.status === 'confirmed')
          .map(b => {
            const profile = profiles.find(p => p.id === b.user_id)
            return profile ? (profile.full_name || profile.email?.split('@')[0] || 'Usuario') : 'Usuario desconocido'
          })

        const confirmedSlots = [...confirmed]
        while (confirmedSlots.length < 8) {
          confirmedSlots.push('LIBRE')
        }

        const waitlist = bookings
          .filter(b => b.date === dateStr && b.status === 'waitlist')
          .map(b => {
            const profile = profiles.find(p => p.id === b.user_id)
            return profile ? (profile.full_name || profile.email?.split('@')[0] || 'Usuario') : 'Usuario desconocido'
          })

        return {
          header: format(day, 'd'),
          confirmedSlots,
          waitlist
        }
      })

      // 2. Crear Workbook y Worksheet
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Parking')

      // Definir columnas (5 columnas, ancho 20)
      worksheet.columns = [
        { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }
      ]

      // Estilos base
      const borderStyle: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }

      const centerAlign: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center' }

      // 3. Escribir cabecera (Fila 1)
      const headerRow = worksheet.getRow(1)
      dayData.forEach((d, i) => {
        const cell = headerRow.getCell(i + 1)
        cell.value = d.header
        cell.font = { name: 'Calibri', size: 14, bold: true }
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFBDD7EE' } // Light Blue
        }
        cell.alignment = centerAlign
        cell.border = borderStyle
      })

      // 4. Escribir datos
      let maxRows = 0
      dayData.forEach(d => {
        const totalRows = d.confirmedSlots.length + d.waitlist.length
        if (totalRows > maxRows) maxRows = totalRows
      })

      // Filas de datos empiezan en la fila 2
      for (let r = 0; r < maxRows; r++) {
        const currentRow = worksheet.getRow(r + 2)

        dayData.forEach((colData, colIndex) => {
          const cell = currentRow.getCell(colIndex + 1)
          const isConfirmedZone = r < colData.confirmedSlots.length
          const isWaitlistZone = !isConfirmedZone && (r < colData.confirmedSlots.length + colData.waitlist.length)

          if (isConfirmedZone) {
            const text = colData.confirmedSlots[r]
            cell.value = text
            cell.alignment = centerAlign
            cell.border = borderStyle
            cell.font = { name: 'Calibri', size: 11 }

            if (text === 'LIBRE') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA9D08E' } } // Darker Green
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } } // Light Green
            }
          } else if (isWaitlistZone) {
            const waitlistIndex = r - colData.confirmedSlots.length
            cell.value = colData.waitlist[waitlistIndex]
            cell.alignment = centerAlign
            cell.border = borderStyle
            cell.font = { name: 'Calibri', size: 11 }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } } // Red
          } else {
            // Zona vacía debajo de waitlist (relleno gris si estamos en la zona de waitlist visualmente, >8)
            // La imagen muestra gris para celdas vacías en la fila de waitlist y siguientes
            if (r >= 8) {
              cell.value = ''
              cell.border = borderStyle
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } } // Grey
            }
          }
        })
      }

      // 5. Descargar
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `planificacion-parking-${format(summaryWeekMonday, 'dd-MM-yyyy')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log('✅ Excel exportado correctamente con ExcelJS')
    } catch (err: any) {
      console.error('❌ Error exportando Excel:', err)
      alert(`Error al exportar: ${err.message}`)
    }
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

  const searchTerm = userSearch.trim().toLowerCase()
  const filteredUnverifiedUsers = searchTerm
    ? unverifiedUsers.filter((p) => {
      const name = (p.full_name || '').toLowerCase()
      const email = (p.email || '').toLowerCase()
      return name.includes(searchTerm) || email.includes(searchTerm)
    })
    : unverifiedUsers

  const filteredVerifiedUsers = searchTerm
    ? verifiedUsers.filter((p) => {
      const name = (p.full_name || '').toLowerCase()
      const email = (p.email || '').toLowerCase()
      return name.includes(searchTerm) || email.includes(searchTerm)
    })
    : verifiedUsers

  return (
    <div
      className="p-4 lg:p-6 pb-24 lg:pb-8 min-h-screen bg-white"
    >
      {/* Header con título y estadísticas rápidas en desktop */}
      <div className="lg:flex lg:items-end lg:justify-between mb-6">
        <h1
          className="text-3xl lg:text-4xl font-semibold text-gray-900 tracking-tight"
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
            letterSpacing: '-0.5px'
          }}
        >
          Panel de Administración
        </h1>
        {/* Contadores rápidos - solo desktop */}
        <div className="hidden lg:flex items-center gap-4 mt-3 lg:mt-0">
          {filteredUnverifiedUsers.length > 0 && (
            <button
              onClick={() => { setActiveTab('users'); setError(null) }}
              className="flex items-center gap-2 px-4 py-2 rounded-[14px] border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors"
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#FF9500' }}>
                {unverifiedUsers.length}
              </span>
              <span className="text-sm font-medium text-orange-800">
                {unverifiedUsers.length === 1 ? 'usuario pendiente' : 'usuarios pendientes'}
              </span>
            </button>
          )}
          <div className="flex items-center gap-2 px-4 py-2 rounded-[14px] border border-gray-200 bg-gray-50">
            <Users className="w-4 h-4 text-gray-500" strokeWidth={2} />
            <span className="text-sm font-medium text-gray-700">{verifiedUsers.length} verificados</span>
          </div>
        </div>
      </div>

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

      {/* Tabs - iOS Style (mobile) / Larger tabs (desktop) */}
      <div
        className="flex gap-1.5 mb-6 rounded-[20px] p-1.5 border border-gray-200 bg-gray-50 overflow-x-auto lg:gap-2 lg:p-2"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <button
          onClick={() => {
            setActiveTab('bookings')
            setError(null)
          }}
          className={`px-3 py-2 lg:px-5 lg:py-2.5 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 lg:flex-1 ${activeTab === 'bookings'
            ? 'text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-white'
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
          className={`px-3 py-2 lg:px-5 lg:py-2.5 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 lg:flex-1 ${activeTab === 'spots'
            ? 'text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-white'
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
          className={`px-3 py-2 lg:px-5 lg:py-2.5 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 lg:flex-1 ${activeTab === 'users'
            ? 'text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-white'
            }`}
          style={activeTab === 'users' ? {
            backgroundColor: '#FF9500',
            boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
          } : {}}
        >
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5" strokeWidth={activeTab === 'users' ? 2.5 : 2} />
          <span className="whitespace-nowrap">Usuarios</span>
          {unverifiedUsers.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: activeTab === 'users' ? 'rgba(255,255,255,0.3)' : '#FF9500' }}>
              {unverifiedUsers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('summary')
            setError(null)
          }}
          className={`px-3 py-2 lg:px-5 lg:py-2.5 font-semibold text-xs sm:text-sm rounded-[12px] transition-all duration-200 active:scale-95 flex-shrink-0 lg:flex-1 ${activeTab === 'summary'
            ? 'text-white'
            : 'text-gray-700 hover:text-gray-900 hover:bg-white'
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
          {/* Buscador de usuarios (solo barra) */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
              className="w-full rounded-[14px] border border-gray-300 bg-white py-2.5 pl-9 pr-9 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF9500] focus:border-[#FF9500] transition-colors"
            />
            {userSearch && (
              <button
                type="button"
                onClick={() => setUserSearch('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                <span className="text-xs font-semibold">Limpiar</span>
              </button>
            )}
          </div>
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
                Usuarios Pendientes de Verificación ({filteredUnverifiedUsers.length})
              </h2>
              <div className="space-y-3 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 lg:space-y-0">
                {filteredUnverifiedUsers.map((profile) => {
                  const initials = getProfileInitials(profile)
                  const color = getFaceHashColor(profile.id || profile.email || initials)
                  return (
                    <div
                      key={profile.id}
                      className="rounded-[20px] p-5 transition-all duration-200 bg-white border border-orange-200 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar FaceHash */}
                        <div
                          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-sm"
                          style={{
                            background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 45%), ${color}`,
                          }}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 mb-0.5 truncate">{profile.full_name || 'Sin nombre'}</p>
                          <p className="text-sm text-gray-500 truncate">{profile.email}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Registrado: {new Date(profile.created_at).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-orange-100 flex gap-2">
                        <button
                          onClick={() => handleOpenVerifyUser(profile)}
                          className="flex-1 px-3 py-2 text-xs sm:text-sm border border-green-200 text-green-700 rounded-[14px] font-semibold hover:bg-green-50 transition-colors active:scale-95 flex items-center justify-center gap-1.5"
                          title="Aceptar usuario"
                        >
                          <CheckCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
                          Aceptar
                        </button>
                        <button
                          onClick={() => handleOpenDeleteUser(profile)}
                          className="flex-1 px-3 py-2 text-xs sm:text-sm border border-red-200 text-red-600 rounded-[14px] font-semibold hover:bg-red-50 transition-colors active:scale-95 flex items-center justify-center gap-1.5"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                          Borrar
                        </button>
                      </div>
                    </div>
                  )
                })}
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
              Usuarios Verificados ({filteredVerifiedUsers.length})
            </h2>
            <div className="space-y-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 lg:space-y-0">
              {filteredVerifiedUsers.map((profile) => {
                const isAdmin = profile.role === 'admin'
                const initials = getProfileInitials(profile)
                const color = getFaceHashColor(profile.id || profile.email || initials)
                return (
                  <div
                    key={profile.id}
                    onClick={() => navigate(`/profile/${profile.id}`)}
                    className="rounded-[20px] p-4 transition-all duration-200 bg-white border border-gray-200 hover:shadow-md hover:border-gray-300 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar FaceHash */}
                      <div
                        className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-xs font-semibold text-white shadow-sm"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 45%), ${color}`,
                        }}
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{profile.full_name || 'Sin nombre'}</p>
                          {isAdmin && (
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold text-white rounded-[6px] flex-shrink-0"
                              style={{ backgroundColor: '#FF9500' }}
                            >
                              ADMIN
                            </span>
                          )}
                          {profile.is_verified && profile.role === 'user' && (
                            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#34C759' }} strokeWidth={2.5} />
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{profile.email}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0 group-hover:text-gray-500 transition-colors" strokeWidth={2} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modales para aceptar / borrar usuarios (pestaña de usuarios) */}
      <ConfirmModal
        isOpen={showVerifyUserModal}
        onClose={() => {
          setShowVerifyUserModal(false)
          setUserToVerify(null)
        }}
        onConfirm={confirmVerifyUser}
        title="Aceptar usuario"
        message={
          userToVerify
            ? `¿Estás seguro de que deseas aceptar y verificar a ${userToVerify.full_name || userToVerify.email}?`
            : ''
        }
        confirmText="Sí, aceptar"
        cancelText="Cancelar"
        loading={verifyingUser}
        confirmButtonClass="bg-green-600 hover:bg-green-700"
      />

      <ConfirmModal
        isOpen={showDeleteUserModal}
        onClose={() => {
          setShowDeleteUserModal(false)
          setUserToDelete(null)
        }}
        onConfirm={confirmDeleteUser}
        title="Eliminar usuario"
        message={
          userToDelete
            ? `¿Estás seguro de que deseas eliminar permanentemente a ${userToDelete.full_name || userToDelete.email}? Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        loading={deletingUser}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      {activeTab === 'spots' && (
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
          {/* Selector de fecha y número de plazas */}
          <div
            className="rounded-[20px] p-4 border border-gray-200 bg-gray-50 overflow-hidden lg:h-fit"
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

          {/* Estado de bloqueos - columna derecha en desktop */}
          <div className="space-y-4">
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
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="space-y-4">
          {/* Controles: selector de semana + filtro por día en la misma fila en desktop */}
          <div className="space-y-4">
            {/* Selector de semana */}
            <div
              className="p-4 bg-gray-50 rounded-[20px] border border-gray-200"
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

            {/* Switch para mostrar/ocultar reservas confirmadas - solo móvil */}
            <div
              className="rounded-[20px] p-4 border border-gray-200 bg-white lg:hidden"
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
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${showConfirmedBookings ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showConfirmedBookings ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Botones de días de la semana */}
              <div
                className="rounded-[20px] p-4 border border-gray-200 bg-gray-50"
              >
                <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider lg:hidden">
                  Ver reservas por día
                </p>
                <div className="flex gap-1.5 overflow-x-auto lg:flex-wrap">
                  <button
                    onClick={() => setSelectedDayForList(null)}
                    className={`flex-shrink-0 lg:flex-1 px-3 py-1.5 rounded-[10px] border transition-all duration-200 active:scale-95 text-xs font-semibold whitespace-nowrap ${selectedDayForList === null
                      ? 'bg-gray-800 border-gray-800 text-white'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    Todas
                  </button>
                  {getDayLetters().map((letter, index) => {
                    const isSelected = selectedDayForList === index
                    const fullDayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']

                    return (
                      <button
                        key={index}
                        onClick={() => setSelectedDayForList(isSelected ? null : index)}
                        className={`flex-shrink-0 lg:flex-1 px-3 py-1.5 rounded-[10px] border transition-all duration-200 active:scale-95 text-xs font-semibold whitespace-nowrap ${isSelected
                          ? 'bg-gray-800 border-gray-800 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                      >
                        <span className="lg:hidden">{letter}</span>
                        <span className="hidden lg:inline">{fullDayNames[index]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Buscador de reservas */}
              <div className="p-4 bg-gray-50 rounded-[20px] border border-gray-200">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar reserva por nombre..."
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-[12px] leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm transition duration-150 ease-in-out"
                  />
                </div>
              </div>
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

                    // Filtro de búsqueda
                    if (bookingSearch.trim()) {
                      const searchLower = bookingSearch.toLowerCase().trim()
                      const userName = (b.user?.full_name || '').toLowerCase()
                      const userEmail = (b.user?.email || '').toLowerCase()
                      return userName.includes(searchLower) || userEmail.includes(searchLower)
                    }

                    return true
                  })
                  .sort((a, b) => {
                    // 1. Determinar prioridad por estado
                    const order = showConfirmedBookings
                      ? { confirmed: 0, waitlist: 1 }
                      : { waitlist: 0, confirmed: 1 }

                    const scoreA = order[a.status as keyof typeof order] ?? 2
                    const scoreB = order[b.status as keyof typeof order] ?? 2

                    if (scoreA !== scoreB) {
                      return scoreA - scoreB
                    }

                    // 2. Si ambos son 'confirmed', ordenar por fecha de confirmación (updated_at)
                    if (a.status === 'confirmed' && b.status === 'confirmed') {
                      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
                    }

                    // 3. Fallback: Mantener orden original (created_at ascendente)
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  })

                return (
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">
                        {dayName.charAt(0).toUpperCase() + dayName.slice(1)}
                      </h3>
                      <div className="flex items-center gap-3">
                        {/* Switch confirmadas - inline en desktop */}
                        <label className="hidden lg:flex items-center gap-2 cursor-pointer">
                          <span className="text-xs font-medium text-gray-500">Confirmadas</span>
                          <button
                            onClick={() => setShowConfirmedBookings(!showConfirmedBookings)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${showConfirmedBookings ? 'bg-orange-500' : 'bg-gray-300'
                              }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${showConfirmedBookings ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                }`}
                            />
                          </button>
                        </label>

                      </div>
                    </div>

                    {dayBookings.length === 0 ? (
                      <div className="text-center py-12 rounded-[20px] border border-gray-200 bg-gray-50">
                        <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-700 font-medium">No hay reservas para este día</p>
                      </div>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleDragEnd(e, dayBookings)}
                      >
                        <SortableContext items={dayBookings.map(b => b.id)} strategy={rectSortingStrategy}>
                          <div className="space-y-3">
                            {dayBookings.map((booking) => {
                              const userName = booking.user?.full_name || booking.user?.email?.split('@')[0] || 'Usuario desconocido'
                              const isDraggable = booking.status === 'waitlist'

                              return (
                                <SortableBookingItem key={booking.id} id={booking.id} booking={booking} isDraggable={isDraggable}>
                                  {({ attributes, listeners, isDraggable }) => (
                                    <div
                                      className={`p-3 rounded-[14px] border transition-all h-full ${booking.status === 'waitlist'
                                        ? 'border-purple-200 bg-white shadow-sm'
                                        : 'border-green-200 bg-white shadow-sm'
                                        }`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0 flex items-start gap-2">
                                          {isDraggable && (
                                            <div
                                              {...attributes}
                                              {...listeners}
                                              className="mt-0.5 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                                              title="Arrastrar para ordenar"
                                              style={{ touchAction: 'none' }}
                                            >
                                              <GripVertical className="w-4 h-4" />
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 mb-1">
                                              {userName}
                                            </p>
                                            {booking.carpoolUsers && booking.carpoolUsers.length > 0 && (
                                              <div className="flex items-center gap-1.5 mb-1.5 text-orange-600">
                                                <Users className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                                <span className="text-xs font-medium">
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
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                          <div className="flex items-center gap-1.5">
                                            {booking.status === 'waitlist' && getWaitlistPosition(booking) && (
                                              <span className="px-2 py-0.5 text-xs font-bold rounded-[6px] bg-purple-600 text-white">
                                                #{getWaitlistPosition(booking)}
                                              </span>
                                            )}
                                            <span
                                              className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-[6px] ${booking.status === 'confirmed'
                                                ? 'bg-green-100 text-green-700'
                                                : booking.status === 'waitlist'
                                                  ? 'bg-purple-100 text-purple-700'
                                                  : 'bg-purple-100 text-purple-700'
                                                }`}
                                            >
                                              {booking.status === 'confirmed'
                                                ? 'Confirmada'
                                                : 'Lista de espera'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="mt-3 pt-3 border-t border-gray-100">
                                        {booking.status === 'waitlist' ? (
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
                                  )}
                                </SortableBookingItem>
                              )
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
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
                {/* Switch confirmadas - inline en desktop */}
                <label className="hidden lg:flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-medium text-gray-500">Confirmadas</span>
                  <button
                    onClick={() => setShowConfirmedBookings(!showConfirmedBookings)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${showConfirmedBookings ? 'bg-orange-500' : 'bg-gray-300'
                      }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${showConfirmedBookings ? 'translate-x-[18px]' : 'translate-x-[3px]'
                        }`}
                    />
                  </button>
                </label>
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

                      // Filtro de búsqueda
                      if (bookingSearch.trim()) {
                        const searchLower = bookingSearch.toLowerCase().trim()
                        const userName = (b.user?.full_name || '').toLowerCase()
                        const userEmail = (b.user?.email || '').toLowerCase()
                        return userName.includes(searchLower) || userEmail.includes(searchLower)
                      }

                      return true
                    })
                    .sort((a, b) => {
                      // Ordenar por fecha, luego por estado
                      const dateCompare = a.date.localeCompare(b.date)
                      if (dateCompare !== 0) return dateCompare
                      const order = { waitlist: 0, confirmed: 1 }
                      return (order[a.status as keyof typeof order] ?? 2) - (order[b.status as keyof typeof order] ?? 2)
                    })
                    .map((booking) => {
                      const userName = booking.user?.full_name || booking.user?.email?.split('@')[0] || 'Usuario desconocido'
                      const bookingDate = format(new Date(booking.date), 'EEEE, d \'de\' MMMM', { locale: es })

                      return (
                        <div
                          key={booking.id}
                          className={`p-3 rounded-[14px] border transition-all ${booking.status === 'waitlist'
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
                              {booking.carpoolUsers && booking.carpoolUsers.length > 0 && (
                                <div className="flex items-center gap-1.5 text-orange-600">
                                  <Users className="w-3 h-3 flex-shrink-0" strokeWidth={2} />
                                  <span className="text-xs font-medium">
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
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <span
                                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-[6px] ${booking.status === 'confirmed'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-purple-100 text-purple-700'
                                  }`}
                              >
                                {booking.status === 'confirmed'
                                  ? 'Confirmada'
                                  : 'Lista de espera'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t border-gray-100">
                            {booking.status === 'waitlist' ? (
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
            // Filtrar y procesar reservas confirmadas Y canceladas
            const visibleBookings = bookings.filter(b => {
              if (b.status !== 'confirmed' && b.status !== 'cancelled') return false
              if (!b.user || b.user.role !== 'user') return false

              const bookingDate = new Date(b.date)
              bookingDate.setHours(0, 0, 0, 0)
              const monday = new Date(summaryWeekMonday)
              monday.setHours(0, 0, 0, 0)
              const friday = addDays(monday, 4)
              friday.setHours(23, 59, 59, 999)

              return bookingDate >= monday && bookingDate <= friday
            })

            console.log('Reservas visibles para el resumen:', visibleBookings.length, visibleBookings)

            visibleBookings.forEach(booking => {
              const userId = booking.user_id
              const dateStr = booking.date

              if (!bookingsMap.has(userId)) {
                bookingsMap.set(userId, new Map())
              }
              // Si ya existe una reserva para este usuario y día, mantener la más reciente
              // Ojo: si hay una confirmada y una cancelada, idealmente mostrar la confirmada si es válida?
              // Pero normalmente una cancelada es la última acción.
              // Si hay duplicados, nos quedamos con la última por fecha de creación (updated_at/created_at)
              const existingBooking = bookingsMap.get(userId)!.get(dateStr)

              const isNewer = !existingBooking || new Date(booking.created_at) > new Date(existingBooking.created_at)

              if (isNewer) {
                bookingsMap.get(userId)!.set(dateStr, booking)
              }

              // Añadir usuario a la lista si tiene alguna reserva (confirmada o cancelada)
              usersWithBookings.add(userId)

              // Incrementar total del día SOLO si está confirmada
              // Y solo si esta reserva es la que "gana" (la que se muestra)
              // Esto es complejo porque primero procesamos y luego contamos. 
              // Mejor contar al final iterando el mapa.
            })

            // Recalcular totales iterando el mapa final para evitar dobles conteos o contar sobreescritos
            bookingsMap.forEach((userBookings) => {
              userBookings.forEach((booking) => {
                if (booking.status === 'confirmed') {
                  const dateStr = booking.date
                  const currentTotal = dayTotals.get(dateStr) || 0
                  dayTotals.set(dateStr, currentTotal + 1)
                }
              })
            })

            // Obtener usuarios normales (no directivos, no admins) que tienen reservas O todos los usuarios verificados
            const normalUsers = profiles.filter(p => p.role === 'user' && p.is_verified)

            // Incluir también usuarios que tienen reservas pero pueden no estar en profiles aún
            const allUserIds = new Set([...normalUsers.map(u => u.id), ...Array.from(usersWithBookings)])
            const usersToShow = Array.from(allUserIds).map(userId => {
              const profile = profiles.find(p => p.id === userId)
              if (profile) return profile
              // Si no está en profiles, crear un perfil temporal con la info de la reserva
              const booking = visibleBookings.find(b => b.user_id === userId)
              if (booking && booking.user) {
                return booking.user
              }
              return null
            }).filter((u): u is Profile => u !== null)

            // Calcular totales por usuario (SOLO confirmadas)
            const userTotals = new Map<string, number>()
            bookingsMap.forEach((userBookings, userId) => {
              let count = 0
              userBookings.forEach(b => {
                if (b.status === 'confirmed') count++
              })
              userTotals.set(userId, count)
            })

            // Ordenar usuarios alfabéticamente por nombre completo o email
            const sortedUsers = [...usersToShow].sort((a, b) => {
              const nameA = (a.full_name || a.email || '').toLowerCase().trim()
              const nameB = (b.full_name || b.email || '').toLowerCase().trim()
              return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' })
            })

            // Calcular total general
            const grandTotal = Array.from(userTotals.values()).reduce((sum, total) => sum + total, 0)

            return (
              <>
                {/* Resumen estadístico rápido - solo desktop */}
                <div className="hidden lg:grid lg:grid-cols-3 gap-4 mb-4">
                  <div className="rounded-[16px] p-4 border border-gray-200 bg-white">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Total reservas</p>
                    <p className="text-3xl font-bold text-gray-900">{grandTotal}</p>
                  </div>
                  <div className="rounded-[16px] p-4 border border-gray-200 bg-white">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Usuarios</p>
                    <p className="text-3xl font-bold text-gray-900">{sortedUsers.length}</p>
                  </div>
                  <div className="rounded-[16px] p-4 border border-gray-200 bg-white">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Media diaria</p>
                    <p className="text-3xl font-bold text-gray-900">{weekDays.length > 0 ? (grandTotal / weekDays.length).toFixed(1) : '0'}</p>
                  </div>
                </div>

                <div className="rounded-[20px] border border-gray-200 bg-white overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 lg:py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-50 lg:min-w-[200px]">
                            Usuario
                          </th>
                          {weekDays.map((day, index) => (
                            <th
                              key={index}
                              className="px-3 py-3 lg:py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider min-w-[60px] lg:min-w-[80px]"
                            >
                              {dayLabels[index]}
                              <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                                {format(day, 'd/M')}
                              </div>
                            </th>
                          ))}
                          <th className="px-4 py-3 lg:py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider bg-gray-100">
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
                              className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${userIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                }`}
                            >
                              <td
                                className="px-4 py-3 lg:py-4 text-sm font-medium text-gray-900 sticky left-0 bg-inherit cursor-pointer hover:text-orange-600 transition-colors group"
                                onClick={() => navigate(`/profile/${user.id}`)}
                                title="Ver perfil del usuario"
                              >
                                <span className="lg:flex lg:items-center lg:gap-2">
                                  <span
                                    className="hidden lg:inline-flex w-7 h-7 rounded-full items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 shadow-sm"
                                    style={{
                                      background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 45%), ${getFaceHashColor(user.id || user.email || userName)}`,
                                    }}
                                  >
                                    {getProfileInitials(user)}
                                  </span>
                                  <span className="group-hover:underline">{userName}</span>
                                </span>
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
                                      <>
                                        {userBookings.get(dayStr)?.status === 'cancelled' ? (
                                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-red-100 text-red-500 text-xs font-bold" title="Cancelada">
                                            ✕
                                          </div>
                                        ) : (
                                          <div className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-green-500 text-white text-xs font-bold">
                                            ✓
                                          </div>
                                        )}
                                      </>
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
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 sticky left-0 bg-gray-100">
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
                {/* Botón exportar Excel */}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={exportSummaryToExcel}
                    className="flex items-center gap-2 px-4 py-2 rounded-[12px] bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors active:scale-95"
                    title="Descargar Excel"
                  >
                    <Download className="w-4 h-4" />
                    Exportar Excel
                  </button>
                </div>
              </>
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
          setWaitlistReason('')
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
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Motivo <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <textarea
            rows={3}
            value={waitlistReason}
            onChange={(e) => setWaitlistReason(e.target.value)}
            placeholder="Ej: No hay plazas disponibles para ese día..."
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none transition-colors"
          />
          <p className="mt-1 text-xs text-gray-500">El usuario recibirá una notificación con este motivo.</p>
        </div>
      </ConfirmModal>
    </div>
  )
}
