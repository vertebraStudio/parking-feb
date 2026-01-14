import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

// Verificar si las variables de entorno están configuradas
const hasValidConfig = supabaseUrl && supabaseAnonKey && 
  supabaseUrl !== 'https://placeholder.supabase.co' && 
  supabaseAnonKey !== 'placeholder-key' &&
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 20 // Las claves de Supabase suelen ser largas

// Para desarrollo local, lanzar error si faltan las variables
if (import.meta.env.DEV && !hasValidConfig) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file')
}

// Crear cliente con valores por defecto si no están disponibles (para que el build no falle)
// En producción, si no hay configuración válida, mostrar un mensaje de error en la UI
export const supabase = hasValidConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-key')

// Exportar flag para verificar si la configuración es válida
export const isSupabaseConfigured = hasValidConfig

// Exportar las URLs para debugging (solo en desarrollo)
if (import.meta.env.DEV) {
  console.log('Supabase Config:', {
    url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'NOT SET',
    keyLength: supabaseAnonKey.length,
    hasValidConfig
  })
}
