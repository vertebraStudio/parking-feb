import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Bell, Car, Calendar, Settings, User } from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { Profile } from '../types'

// Función para actualizar el badge del icono de la aplicación
const updateAppBadge = async (count: number) => {
  try {
    // Verificar si la Badging API está disponible
    if ('setAppBadge' in navigator && typeof (navigator as any).setAppBadge === 'function') {
      if (count > 0) {
        await (navigator as any).setAppBadge(count)
        console.log('✅ App badge actualizado:', count)
      } else {
        await (navigator as any).clearAppBadge()
        console.log('✅ App badge limpiado')
      }
    } else {
      console.log('⚠️ Badging API no disponible en este navegador')
    }
  } catch (error) {
    console.error('Error actualizando app badge:', error)
  }
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [userProfile, setUserProfile] = useState<Profile | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)

  useEffect(() => {
    loadUserProfile()
    
    // También cargar conteo inicial si hay sesión
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        loadUnreadCount()
      }
    }
    checkSession()
  }, [])

  useEffect(() => {
    if (userProfile) {
      loadUnreadCount()
      const unsubscribe = subscribeToNotifications()
      
      return () => {
        if (unsubscribe) unsubscribe()
      }
      } else {
        // Si no hay perfil, resetear el conteo y limpiar el badge
        setUnreadCount(0)
        updateAppBadge(0)
      }
  }, [userProfile])

  // Escuchar cambios de autenticación
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUnreadCount()
        loadUserProfile()
      } else {
        setUnreadCount(0)
        setUserProfile(null)
        updateAppBadge(0)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Recargar conteo cuando la página vuelve a estar visible (usuario vuelve a la pestaña)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && userProfile) {
        console.log('👁️ Page visible, reloading unread count')
        loadUnreadCount()
      }
    }

    const handleFocus = () => {
      if (userProfile) {
        console.log('🎯 Window focused, reloading unread count')
        loadUnreadCount()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [userProfile])

  // Recargar conteo cuando el usuario navega a/desde la página de notificaciones
  useEffect(() => {
    if (userProfile) {
      // Recargar cuando entras o sales de la página de notificaciones
      loadUnreadCount()
    }
  }, [location.pathname, userProfile])

  // Recargar conteo periódicamente para asegurar sincronización (cada 15 segundos)
  useEffect(() => {
    if (!userProfile) return

    const interval = setInterval(() => {
      loadUnreadCount()
    }, 15000) // 15 segundos

    return () => clearInterval(interval)
  }, [userProfile])

  const loadUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        return
      }

      setUserProfile(profile)
    } catch (error) {
      console.error('Error loading user profile:', error)
    }
  }

  const loadUnreadCount = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        setUnreadCount(0)
        await updateAppBadge(0)
        return
      }

      // Obtener todas las notificaciones sin leer para contar manualmente
      // Esto es más confiable que usar count con head: true
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', session.user.id)
        .is('read_at', null)

      if (error) {
        console.error('Error loading unread count:', error)
        setUnreadCount(0)
        await updateAppBadge(0)
        return
      }

      const newCount = data?.length || 0
      console.log('🔔 Unread notifications count:', newCount, 'notifications:', data?.map(n => n.id))
      setUnreadCount(newCount)
      
      // Actualizar el badge del icono de la aplicación
      await updateAppBadge(newCount)
    } catch (error) {
      console.error('Error loading unread count:', error)
      setUnreadCount(0)
      await updateAppBadge(0)
    }
  }

  const subscribeToNotifications = () => {
    if (!userProfile?.id) return () => {}

    const channel = supabase
      .channel(`layout-notifications-${userProfile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          // Solo procesar si es para el usuario actual
          const newRecord = payload.new as any
          const oldRecord = payload.old as any
          
          // Verificar si el cambio afecta al usuario actual
          const affectsCurrentUser = 
            (newRecord && newRecord.user_id === userProfile.id) ||
            (oldRecord && oldRecord.user_id === userProfile.id)
          
          if (affectsCurrentUser || payload.eventType === 'DELETE') {
            // Para DELETE, siempre recargar porque puede que hayamos borrado todas
            console.log('🔔 Notification change detected:', payload.eventType)
            // Recargar el conteo cuando hay cambios (con un pequeño delay para asegurar que la BD se actualizó)
            setTimeout(() => {
              loadUnreadCount()
            }, 300)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to notification changes')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to notifications')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const allNavItems = [
    { path: '/', icon: Car, label: 'Parking' },
    { path: '/bookings', icon: Calendar, label: 'Mis Reservas' },
    { path: '/notifications', icon: Bell, label: 'Notificaciones' },
    { path: '/admin', icon: Settings, label: 'Admin' },
    { path: '/profile', icon: User, label: 'Mi Perfil' },
  ]

  // Filtrar navItems: solo mostrar Admin si el usuario es admin
  const navItems = allNavItems.filter(item => {
    if (item.path === '/admin') {
      return userProfile?.role === 'admin'
    }
    return true
  })

  return (
    <div className="max-w-md mx-auto min-h-screen">
      <main className="flex-1 pb-20">
        <Outlet />
      </main>
      
      {/* Bottom Navigation - iOS Style with Blur */}
      <nav 
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto border-t border-white/10"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: '0 -2px 20px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            const showBadge = item.path === '/notifications' && unreadCount > 0
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 relative',
                  'active:scale-95'
                )}
                style={{
                  color: isActive ? '#FF9500' : 'rgba(0, 0, 0, 0.6)',
                }}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  {showBadge && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: '#FF9500',
                        boxShadow: '0 2px 4px rgba(255, 149, 0, 0.4)',
                      }}
                    />
                  )}
                </div>
                <span 
                  className="text-[10px] mt-0.5 font-medium"
                  style={{
                    color: isActive ? '#FF9500' : 'rgba(0, 0, 0, 0.6)',
                    letterSpacing: '0.2px'
                  }}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div 
                    className="absolute top-0 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ backgroundColor: '#FF9500' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
