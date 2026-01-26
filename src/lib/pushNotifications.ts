import { getToken } from 'firebase/messaging'
import { supabase } from './supabase'
import { getFirebaseMessaging, isFirebaseConfigured } from './firebase'

export async function registerPushTokenForCurrentUser(): Promise<{
  permission: NotificationPermission
  token?: string
}> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no está configurado (faltan variables VITE_FIREBASE_*)')
  }

  if (!('Notification' in window)) {
    throw new Error('Este navegador no soporta notificaciones.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { permission }

  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    throw new Error('FCM no está soportado en este navegador/dispositivo.')
  }

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) {
    throw new Error('Debes iniciar sesión para activar notificaciones.')
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
  if (!vapidKey) {
    throw new Error('Falta VITE_FIREBASE_VAPID_KEY para obtener el token FCM.')
  }

  const swReg = await navigator.serviceWorker.ready
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg })

  if (!token) {
    throw new Error('No se pudo obtener el token FCM.')
  }

  const now = new Date().toISOString()
  
  // Usar upsert con mejor manejo de errores
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: 'web',
        last_seen_at: now,
      },
      { 
        onConflict: 'token',
        ignoreDuplicates: false
      }
    )

  if (error) {
    console.error('Error upserting push token:', error)
    // Si es un error de RLS, dar un mensaje más claro
    if (error.message?.includes('row-level security')) {
      throw new Error('Error de permisos: verifica que estés autenticado correctamente.')
    }
    throw new Error(`Error al guardar token: ${error.message}`)
  }

  return { permission, token }
}

