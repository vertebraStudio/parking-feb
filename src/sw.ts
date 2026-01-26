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

  const notificationOptions: NotificationOptions = {
    body,
    data: {
      ...data,
      // Asegurar que la URL esté en los datos
      url: data.url || 'https://vertebrastudio.github.io/parking-feb/notifications',
    },
    icon: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
    badge: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
    tag: `booking-${data.bookingId || Date.now()}`,
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
if (isFirebaseConfigured) {
  try {
    const app = initializeApp(firebaseConfig)
    const messaging = getMessaging(app)

    // FCM background message handler
    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] FCM background message received:', payload)
      
      // Para mensajes data-only, extraer título y cuerpo de data
      let title = 'FEB parking'
      let body = 'Tienes una nueva notificación'
      let data: any = {}

      // Si hay notification en el payload (raro en data-only, pero por si acaso)
      if (payload.notification) {
        title = payload.notification.title || title
        body = payload.notification.body || body
      }

      // Extraer de data (para mensajes data-only)
      if (payload.data) {
        // Si hay un campo notification serializado en data, parsearlo
        if (payload.data.notification) {
          try {
            const notifData = JSON.parse(payload.data.notification as string)
            title = notifData.title || payload.data.title || title
            body = notifData.body || payload.data.body || body
          } catch {
            // Si falla el parse, usar directamente
            title = payload.data.title || title
            body = payload.data.body || body
          }
        } else {
          title = payload.data.title || title
          body = payload.data.body || body
        }
        
        // Copiar todos los datos excepto notification (ya procesado)
        data = { ...payload.data }
        delete data.notification
      }

      console.log('[SW] Showing notification:', { title, body, data })
      showNotification(title, body, data)
    })
  } catch (err) {
    console.error('[SW] Error initializing Firebase:', err)
  }
}

// Standard Web Push event listener (fallback for when FCM doesn't work)
self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] Push event received:', event)

  let title = 'FEB parking'
  let body = 'Tienes una nueva notificación'
  let data: any = {}

  if (event.data) {
    try {
      const payload = event.data.json()
      console.log('[SW] Push payload:', payload)
      
      title = payload.notification?.title || payload.data?.title || payload.title || title
      body = payload.notification?.body || payload.data?.body || payload.body || body
      data = payload.data || payload
    } catch (err) {
      // If JSON parsing fails, try text
      const text = event.data.text()
      console.log('[SW] Push data as text:', text)
      try {
        const payload = JSON.parse(text)
        title = payload.notification?.title || payload.data?.title || payload.title || title
        body = payload.notification?.body || payload.data?.body || payload.body || body
        data = payload.data || payload
      } catch {
        // If all fails, use default
        body = text || body
      }
    }
  }

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

