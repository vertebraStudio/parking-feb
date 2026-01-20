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

if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig)
  const messaging = getMessaging(app)

  onBackgroundMessage(messaging, (payload) => {
    console.log('[SW] Background message received:', payload)
    
    const title = payload.notification?.title || payload.data?.title || 'FEB parking'
    const body = payload.notification?.body || payload.data?.body || 'Tu reserva ha sido confirmada.'

    const data = payload.data || {}

    const notificationOptions: NotificationOptions = {
      body,
      data,
      icon: '/parking-feb/pwa-192x192.png',
      badge: '/parking-feb/pwa-192x192.png',
      tag: `booking-${data.bookingId || Date.now()}`,
      requireInteraction: false,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
    }

    self.registration.showNotification(title, notificationOptions)
      .then(() => {
        console.log('[SW] Notification shown successfully')
      })
      .catch((err) => {
        console.error('[SW] Error showing notification:', err)
      })
  })
}

