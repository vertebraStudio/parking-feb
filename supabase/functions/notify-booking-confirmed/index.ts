// Supabase Edge Function: notify-booking-confirmed
// Creates an in-app notification and sends an FCM push using FCM HTTP v1 API.
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
// - FIREBASE_SERVICE_ACCOUNT_JSON (JSON completo del service account de Firebase)
// - FIREBASE_PROJECT_ID (opcional, se puede extraer del JSON)
//
// Request body: { bookingId: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts'

type Json = Record<string, unknown>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}

// Obtener access token OAuth 2.0 desde service account JSON
async function getAccessToken(serviceAccountJson: any): Promise<string> {
  // Importar clave privada desde PEM
  const privateKeyPem = serviceAccountJson.private_key
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = privateKeyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')
  
  const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  // Crear JWT con djwt
  const now = getNumericDate(new Date())
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: serviceAccountJson.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // 1 hora
      iat: now,
    },
    cryptoKey
  )

  // Intercambiar JWT por access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Failed to get access token: ${tokenResponse.status} ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// Enviar notificación usando FCM HTTP v1 API
async function sendFCMV1Notification(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data: any
): Promise<any> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
  
  const message = {
    message: {
      token: token,
      notification: {
        title,
        body,
      },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      },
      webpush: {
        notification: {
          title,
          body,
          icon: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
          badge: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
        },
        fcm_options: {
          link: 'https://vertebrastudio.github.io/parking-feb/notifications',
        },
      },
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(message),
  })

  const responseData = await response.json().catch(() => ({}))
  
  return {
    status: response.status,
    ok: response.ok,
    data: responseData,
  }
}

Deno.serve(async (req) => {
  try {
    // Log INMEDIATO al inicio para verificar que la función se ejecuta
    console.log('🚀 ===== Edge Function notify-booking-confirmed STARTED =====')
    console.log('Request method:', req.method)
    console.log('Request URL:', req.url)
    console.log('Request headers:', Object.fromEntries(req.headers.entries()))
    
    const authHeader = req.headers.get('authorization')
    console.log('Authorization header present:', !!authHeader)
    
    // IMPORTANTE: Responder inmediatamente a OPTIONS para CORS
    if (req.method === 'OPTIONS') {
      console.log('OPTIONS request - returning CORS headers')
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method)
      return jsonResponse(405, { error: 'Method not allowed' })
    }
    
    console.log('✅ POST request received, processing...')

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''
    const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') || ''

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { error: 'Missing Supabase env vars' })
    }

    let payload: { bookingId?: number } = {}
    try {
      payload = (await req.json()) as any
      console.log('📦 Parsed payload:', payload)
    } catch (err) {
      console.error('❌ Error parsing JSON:', err)
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const bookingId = payload.bookingId
    console.log('🔍 Looking for bookingId:', bookingId, 'Type:', typeof bookingId)
    if (!bookingId || typeof bookingId !== 'number') {
      console.error('❌ Invalid bookingId:', bookingId)
      return jsonResponse(400, { error: 'bookingId is required' })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    console.log('✅ Supabase client created')

    const { data: booking, error: bookingErr } = await serviceClient
      .from('bookings')
      .select('id, user_id, date, status')
      .eq('id', bookingId)
      .single()

    console.log('📋 Booking query result:', { booking, error: bookingErr })

    if (bookingErr || !booking) {
      console.error('❌ Booking not found or error:', bookingErr)
      return jsonResponse(404, { error: 'Booking not found' })
    }
    if (booking.status !== 'confirmed') {
      console.error('❌ Booking status is not confirmed:', booking.status)
      return jsonResponse(409, { error: 'Booking is not confirmed' })
    }

    console.log('✅ Booking found and confirmed:', booking.id)

    const title = '✅ Reserva confirmada'
    const body = `Tu reserva para el día ${booking.date} ha sido confirmada.`

    // 1) Insert in-app notification
    console.log('📝 Inserting in-app notification for user:', booking.user_id)
    const { error: notifErr } = await serviceClient.from('notifications').insert({
      user_id: booking.user_id,
      type: 'booking_confirmed',
      title,
      body,
      data: { bookingId: booking.id, date: booking.date },
    })

    if (notifErr) {
      console.error('❌ Failed to insert notification:', notifErr)
      return jsonResponse(500, { error: 'Failed to insert notification' })
    }
    console.log('✅ In-app notification inserted successfully')

    // 2) Send push via FCM HTTP v1 API
    console.log('🔑 Checking FIREBASE_SERVICE_ACCOUNT_JSON:', FIREBASE_SERVICE_ACCOUNT_JSON ? 'SET' : 'NOT SET')
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.log('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON not set, skipping push notifications')
      return jsonResponse(200, { ok: true, pushed: 0, note: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' })
    }

    let serviceAccount: any
    let projectId: string
    try {
      serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
      projectId = FIREBASE_PROJECT_ID || serviceAccount.project_id
      console.log('✅ Service account parsed, project ID:', projectId)
    } catch (err) {
      console.error('❌ Error parsing service account JSON:', err)
      return jsonResponse(500, { error: 'Invalid FIREBASE_SERVICE_ACCOUNT_JSON format' })
    }

    console.log('🔍 Fetching push tokens for user:', booking.user_id)
    const { data: tokens, error: tokensErr } = await serviceClient
      .from('push_tokens')
      .select('token, platform, created_at')
      .eq('user_id', booking.user_id)

    console.log('Tokens found for user:', {
      userId: booking.user_id,
      count: tokens?.length || 0,
      tokens: tokens?.map((t: any) => ({ platform: t.platform, created: t.created_at })),
      error: tokensErr,
    })

    if (tokensErr) {
      console.error('Error fetching tokens:', tokensErr)
      return jsonResponse(200, { ok: true, pushed: 0, note: 'Error fetching tokens', error: tokensErr.message })
    }

    const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean)
    if (tokenList.length === 0) {
      console.log('No tokens found for user:', booking.user_id)
      return jsonResponse(200, { ok: true, pushed: 0, note: 'No tokens found' })
    }

    console.log('🔐 Getting OAuth2 access token...')
    let accessToken: string
    try {
      accessToken = await getAccessToken(serviceAccount)
      console.log('✅ Access token obtained')
    } catch (err: any) {
      console.error('❌ Error getting access token:', err)
      return jsonResponse(500, { error: 'Failed to get OAuth2 access token', details: err.message })
    }

    console.log('📤 Sending FCM v1 notifications to', tokenList.length, 'token(s)')

    const data = {
      bookingId: String(booking.id),
      date: String(booking.date),
      type: 'booking_confirmed',
      title,
      body,
      url: 'https://vertebrastudio.github.io/parking-feb/notifications',
    }

    // Enviar a cada token
    const results = await Promise.allSettled(
      tokenList.map(token =>
        sendFCMV1Notification(accessToken, projectId, token, title, body, data)
      )
    )

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
    const failureCount = results.length - successCount

    console.log('📊 FCM v1 Results:', {
      total: results.length,
      success: successCount,
      failure: failureCount,
    })

    // Log errores individuales
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Token ${index} error:`, result.reason)
      } else if (!result.value.ok) {
        console.error(`Token ${index} failed:`, result.value.data)
      }
    })

    const response = jsonResponse(200, {
      ok: true,
      pushed: successCount,
      total: results.length,
      success: successCount,
      failure: failureCount,
    })
    
    console.log('✅ ===== Edge Function notify-booking-confirmed COMPLETED =====')
    console.log('Response:', {
      ok: true,
      pushed: successCount,
      total: results.length,
    })
    
    return response
  } catch (error: any) {
    console.error('❌ ===== Edge Function notify-booking-confirmed ERROR =====')
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error?.message)
    console.error('Error stack:', error?.stack)
    console.error('Full error:', error)
    
    return jsonResponse(500, {
      error: 'Internal server error',
      message: error?.message || 'Unknown error',
    })
  }
})
