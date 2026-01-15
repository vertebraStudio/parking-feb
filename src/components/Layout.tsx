import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Car, Calendar, Settings, User } from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { Profile } from '../types'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [userProfile, setUserProfile] = useState<Profile | null>(null)

  useEffect(() => {
    loadUserProfile()
  }, [])

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

  const allNavItems = [
    { path: '/', icon: Car, label: 'Parking' },
    { path: '/bookings', icon: Calendar, label: 'Mis Reservas' },
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
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
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
