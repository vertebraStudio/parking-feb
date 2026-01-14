import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import MapPage from './pages/MapPage'
import BookingsPage from './pages/BookingsPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import { supabase, isSupabaseConfigured } from './lib/supabase'

function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Si Supabase no está configurado, no intentar conectarse
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    // Verificar sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    }).catch((error) => {
      console.error('Error getting session:', error)
      setLoading(false)
    })

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [isSupabaseConfigured])

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuración Requerida</h1>
          <p className="text-gray-600 mb-4">
            Las variables de entorno de Supabase no están configuradas correctamente. Por favor, verifica los secrets en GitHub:
          </p>
          <ul className="text-left text-sm text-gray-600 mb-4 space-y-2">
            <li>• <strong>VITE_SUPABASE_URL</strong>: Debe empezar con https://</li>
            <li>• <strong>VITE_SUPABASE_ANON_KEY</strong>: Debe ser una clave válida de Supabase</li>
          </ul>
          <p className="text-xs text-gray-500 mb-4">
            Ve a Settings → Secrets and variables → Actions en tu repositorio de GitHub.
          </p>
          <div className="text-xs text-gray-400 mt-4 p-3 bg-gray-50 rounded">
            <p className="font-semibold mb-2">Debug info:</p>
            <p>URL configurada: {import.meta.env.VITE_SUPABASE_URL ? 'Sí' : 'No'}</p>
            <p>Key configurada: {import.meta.env.VITE_SUPABASE_ANON_KEY ? `Sí (${import.meta.env.VITE_SUPABASE_ANON_KEY.length} chars)` : 'No'}</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Cargando...</div>
      </div>
    )
  }

  return (
    <BrowserRouter basename="/parking-feb">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {session ? (
          <Route path="/" element={<Layout />}>
            <Route index element={<MapPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/:userId" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App
