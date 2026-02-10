import '@testing-library/jest-dom'

// Mock de import.meta.env para tests
Object.defineProperty(import.meta, 'env', {
  value: {
    BASE_URL: '/parking-feb/',
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    VITE_FIREBASE_API_KEY: 'test-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'test-project',
    VITE_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123456',
    VITE_FIREBASE_APP_ID: '1:123456:web:abc',
    VITE_FIREBASE_VAPID_KEY: 'test-vapid',
    MODE: 'test',
    DEV: true,
    PROD: false,
    SSR: false,
  },
})
