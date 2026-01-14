import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Registrar usuario en Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (signUpError) throw signUpError

      if (data.user) {
        // El trigger automáticamente creará el perfil en la tabla profiles
        // Redirigir al login con mensaje de éxito
        navigate('/login', { 
          state: { 
            message: 'Cuenta creada exitosamente. Un administrador debe verificar tu cuenta antes de poder reservar.' 
          } 
        })
      }
    } catch (err: any) {
      setError(err.message || 'Error al crear la cuenta')
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
            Crear Cuenta
          </h1>
          <p className="text-gray-600 text-center mb-8">
            Regístrate para comenzar
          </p>

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
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nombre completo"
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
                minLength={6}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Mínimo 6 caracteres
              </p>
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
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-gray-600 hover:text-[#FF9500] transition-colors"
            >
              ¿Ya tienes cuenta? Inicia sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
