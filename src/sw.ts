/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: any
}

// Precache built assets
precacheAndRoute(self.__WB_MANIFEST)

// Cache Supabase calls (similar to previous config)
registerRoute(
  ({ url }) => url.hostname.includes('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-cache',
    networkTimeoutSeconds: 10,
  })
)

// Keep service worker alive - log activation
self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('[SW] Service worker activated')
  event.waitUntil(self.clients.claim())
})

// Install event - ensure SW is ready
self.addEventListener('install', (event: ExtendableEvent) => {
  console.log('[SW] Service worker installing')
  // Force activation of new service worker
  event.waitUntil(self.skipWaiting())
})

// Firebase (FCM) config via Vite env at build time
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Only initialize if configured
const isFirebaseConfigured =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.messagingSenderId &&
  !!firebaseConfig.appId

// Helper function to show notification
function showNotification(title: string, body: string, data: any = {}) {
  // Asegurar que tenemos permisos de notificación
  if (!self.registration) {
    console.error('[SW] Service worker registration not available')
    return Promise.reject(new Error('Service worker not registered'))
  }

  // Extraer tag de data si existe, o generar uno único
  const tag = data.tag || `booking-${data.bookingId || Date.now()}`
  const notificationData = { ...data }
  delete notificationData.tag // No incluir tag en los datos de la notificación

  const notificationOptions: NotificationOptions = {
    body,
    data: {
      ...notificationData,
      // Asegurar que la URL esté en los datos
      url: notificationData.url || 'https://vertebrastudio.github.io/parking-feb/notifications',
    },
    icon: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
    badge: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
    tag, // Tag único para evitar duplicados
    requireInteraction: false,
    // Añadir más opciones para mejor visibilidad
    dir: 'ltr',
    lang: 'es',
  }

  console.log('[SW] Attempting to show notification:', { title, body, options: notificationOptions })

  return self.registration.showNotification(title, notificationOptions)
    .then(() => {
      console.log('[SW] ✅ Notification shown successfully:', title)
    })
    .catch((err) => {
      console.error('[SW] ❌ Error showing notification:', err)
      throw err
    })
}

// Initialize Firebase FCM if configured
// NOTA: FCM puede no funcionar en iOS, por lo que el listener 'push' estándar es crítico
if (isFirebaseConfigured) {
  try {
    const app = initializeApp(firebaseConfig)
    const messaging = getMessaging(app)
    console.log('[SW] ✅ Firebase FCM initialized')

    // FCM background message handler
    // IMPORTANTE: Este handler se llama cuando el dispositivo está en background o bloqueado
    // Con FCM V1 API, si el mensaje tiene "notification", FCM lo muestra automáticamente
    // Solo debemos mostrar manualmente si NO tiene "notification" o si estamos en background
    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] 🔔 FCM background message received (onBackgroundMessage):', payload)
      
      // Con FCM V1 API y webpush.notification, el mensaje llega aquí cuando está en background
      // Necesitamos extraer la información de webpush.notification o de data
      let title = 'FEB parking'
      let body = 'Tienes una nueva notificación'
      let data: any = {}
      let tag = 'default'

      // Prioridad 1: Usar notification del payload si existe (para compatibilidad)
      if (payload.notification) {
        title = payload.notification.title || title
        body = payload.notification.body || body
        tag = payload.notification.tag || tag
        console.log('[SW] Using notification from payload.notification')
      }

      // Prioridad 2: Usar data del payload (FCM V1 con webpush)
      if (payload.data) {
        title = payload.data.title || title
        body = payload.data.body || body
        tag = payload.data.bookingId ? `booking-${payload.data.bookingId}` : tag
        data = { ...payload.data }
        delete data.title
        delete data.body
        console.log('[SW] Using notification from payload.data')
      }

      console.log('[SW] 📤 Showing notification via onBackgroundMessage:', { title, body, tag, data })
      
      // Usar el tag para evitar duplicados
      showNotification(title, body, { ...data, tag })
        .catch((err) => {
          console.error('[SW] ❌ Failed to show notification in onBackgroundMessage:', err)
        })
    })
  } catch (err) {
    console.error('[SW] Error initializing Firebase:', err)
  }
}

// Standard Web Push event listener (fallback for when FCM doesn't work)
// IMPORTANTE: Este es el listener principal para iOS, ya que FCM puede no funcionar en iOS
self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] 🔔 Push event received (Web Push standard):', event)
  console.log('[SW] Event has data:', !!event.data)
  console.log('[SW] Event type:', event.type)

  let title = 'FEB parking'
  let body = 'Tienes una nueva notificación'
  let data: any = {}

  if (event.data) {
    try {
      const payload = event.data.json()
      console.log('[SW] 📦 Push payload (JSON):', payload)
      
      // Intentar extraer de diferentes estructuras
      if (payload.notification) {
        title = payload.notification.title || title
        body = payload.notification.body || body
      }
      
      if (payload.data) {
        // Si hay un campo notification serializado en data, parsearlo
        if (payload.data.notification) {
          try {
            const notifData = JSON.parse(payload.data.notification as string)
            title = notifData.title || payload.data.title || title
            body = notifData.body || payload.data.body || body
          } catch {
            title = payload.data.title || title
            body = payload.data.body || body
          }
        } else {
          title = payload.data.title || title
          body = payload.data.body || body
        }
        data = { ...payload.data }
        delete data.notification
      } else if (payload.title || payload.body) {
        title = payload.title || title
        body = payload.body || body
        data = payload
      }
    } catch (err) {
      console.log('[SW] ⚠️ JSON parse failed, trying text:', err)
      // If JSON parsing fails, try text
      try {
        const text = event.data.text()
        console.log('[SW] 📝 Push data as text:', text)
        const payload = JSON.parse(text)
        title = payload.notification?.title || payload.data?.title || payload.title || title
        body = payload.notification?.body || payload.data?.body || payload.body || body
        data = payload.data || payload
      } catch {
        // If all fails, use default
        const text = event.data.text()
        body = text || body
        console.log('[SW] ⚠️ All parsing failed, using text as body')
      }
    }
  } else {
    console.log('[SW] ⚠️ Push event has no data')
  }

  console.log('[SW] 📤 About to show notification:', { title, body, data })
  event.waitUntil(showNotification(title, body, data))
})

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('[SW] Notification clicked:', event)
  
  event.notification.close()

  const data = event.notification.data || {}
  const urlToOpen = data.url || '/parking-feb/notifications'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      // If not, open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen)
      }
    })
  )
})

