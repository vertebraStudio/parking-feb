import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getMessaging, type Messaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.messagingSenderId &&
  !!firebaseConfig.appId

let appSingleton: FirebaseApp | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null
  if (!appSingleton) appSingleton = initializeApp(firebaseConfig)
  return appSingleton
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!isFirebaseConfigured) return null
  const supported = await isSupported()
  if (!supported) return null
  const app = getFirebaseApp()
  if (!app) return null
  return getMessaging(app)
}

