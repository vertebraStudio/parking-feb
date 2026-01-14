import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Mostrar mensaje de éxito si viene del registro
    if (location.state?.message) {
      setSuccessMessage(location.state.message)
    }
  }, [location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      if (data.session) {
        navigate('/')
      }
    } catch (err: any) {
      // Manejar errores específicos
      if (err.message?.includes('Email not confirmed') || err.message?.includes('email_not_confirmed')) {
        setError('Por favor, confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada.')
      } else {
        setError(err.message || 'Error al iniciar sesión')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-white"
    >
      <div className="w-full max-w-md">
        <div 
          className="rounded-[20px] shadow-lg p-8 border border-gray-200 bg-white"
        >
          <h1 
            className="text-3xl font-semibold text-gray-900 mb-2 text-center tracking-tight"
            style={{ 
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
              letterSpacing: '-0.5px'
            }}
          >
            Parking App
          </h1>
          <p className="text-gray-600 text-center mb-8">
            Inicia sesión para continuar
          </p>

          {successMessage && (
            <div 
              className="mb-4 p-3 rounded-[14px] border border-green-300 bg-green-50"
            >
              <p className="text-green-800 text-sm font-medium">{successMessage}</p>
            </div>
          )}

          {error && (
            <div 
              className="mb-4 p-3 rounded-[14px] border border-red-300 bg-red-50"
            >
              <p className="text-red-800 text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                className="w-full px-4 py-3 rounded-[14px] focus:outline-none transition-all duration-200 text-gray-900 placeholder-gray-400 bg-white border border-gray-300"
                onFocus={(e) => {
                  e.target.style.borderColor = '#FF9500'
                  e.target.style.boxShadow = '0 0 0 3px rgba(255, 149, 0, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#D1D5DB'
                  e.target.style.boxShadow = 'none'
                }}
                required
                disabled={loading}
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className="w-full px-4 py-3 rounded-[14px] focus:outline-none transition-all duration-200 text-gray-900 placeholder-gray-400 bg-white border border-gray-300"
                onFocus={(e) => {
                  e.target.style.borderColor = '#FF9500'
                  e.target.style.boxShadow = '0 0 0 3px rgba(255, 149, 0, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#D1D5DB'
                  e.target.style.boxShadow = 'none'
                }}
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full text-white py-3 rounded-[14px] font-semibold transition-all duration-200 active:scale-95 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: '#FF9500',
                boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3)'
              }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/register"
              className="text-sm text-gray-600 hover:text-[#FF9500] transition-colors"
            >
              ¿No tienes cuenta? Regístrate
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
