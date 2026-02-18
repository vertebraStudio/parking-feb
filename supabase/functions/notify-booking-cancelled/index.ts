// Supabase Edge Function: notify-booking-cancelled
// Notifica a los administradores (in-app + push) cuando un usuario cancela
// una reserva confirmada.
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - FIREBASE_SERVICE_ACCOUNT_JSON
// - FIREBASE_PROJECT_ID (opcional)

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
  const privateKeyPem = serviceAccountJson.private_key
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = privateKeyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')

  const keyData = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )

  const now = getNumericDate(new Date())
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: serviceAccountJson.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
    cryptoKey,
  )

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
  data: any,
): Promise<any> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  const message = {
    message: {
      token,
      data: {
        ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      },
      webpush: {
        notification: {
          title,
          body,
          icon: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
          badge: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
          tag: `booking-cancelled-${data.bookingId}`,
        },
        fcm_options: {
          link: 'https://vertebrastudio.github.io/parking-feb/admin',
        },
      },
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          sound: 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
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
    console.log('🚀 ===== Edge Function notify-booking-cancelled STARTED =====')
    console.log('Request method:', req.method)
    console.log('Request URL:', req.url)

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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''
    const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') || ''

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

    // Obtener la reserva (ya cancelada) para saber usuario y fecha
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

    // Aunque desde el frontend solo llamaremos para confirmadas,
    // aquí no forzamos status por si ya se ha actualizado a 'cancelled'.

    // Obtener perfil del usuario que cancela
    const { data: userProfile, error: userErr } = await serviceClient
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', booking.user_id)
      .single()

    if (userErr) {
      console.error('❌ Error fetching user profile:', userErr)
    }

    const displayName =
      userProfile?.full_name ||
      userProfile?.email ||
      'Usuario'

    // Obtener todos los administradores
    const { data: admins, error: adminsErr } = await serviceClient
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', ['admin'])

    if (adminsErr) {
      console.error('❌ Error fetching admins:', adminsErr)
      return jsonResponse(500, { error: 'Failed to fetch admins' })
    }

    if (!admins || admins.length === 0) {
      console.log('⚠️ No admins found, skipping admin notifications')
      return jsonResponse(200, { ok: true, pushed: 0, totalAdmins: 0 })
    }

    const title = 'Reserva cancelada por usuario ❌'
    const body = `${displayName} ha cancelado su reserva para el día ${booking.date}.`

    // 1) Insertar notificaciones in-app para cada admin
    const notificationsPayload = admins.map((admin: any) => ({
      user_id: admin.id,
      type: 'booking_cancelled_by_user',
      title,
      body,
      data: {
        bookingId: booking.id,
        date: booking.date,
        user_id: booking.user_id,
        user_name: displayName,
      },
    }))

    console.log('📝 Inserting admin notifications (cancelled), count:', notificationsPayload.length)

    const { error: notifErr } = await serviceClient
      .from('notifications')
      .insert(notificationsPayload)

    if (notifErr) {
      console.error('❌ Failed to insert admin notifications (cancelled):', notifErr)
      // Continuar igualmente, que al menos pueda intentar push
    } else {
      console.log('✅ Admin notifications (cancelled) inserted successfully')
    }

    // 2) Push via FCM V1 para todos los admins (si hay service account)
    console.log('🔑 Checking FIREBASE_SERVICE_ACCOUNT_JSON:', FIREBASE_SERVICE_ACCOUNT_JSON ? 'SET' : 'NOT SET')
    if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
      console.log('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON not set, skipping push notifications')
      return jsonResponse(200, { ok: true, pushed: 0, totalAdmins: admins.length, note: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' })
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

    // Obtener todos los tokens de push de los admins
    const adminIds = admins.map((a: any) => a.id)

    const { data: tokens, error: tokensErr } = await serviceClient
      .from('push_tokens')
      .select('user_id, token, platform, created_at')
      .in('user_id', adminIds)

    console.log('Tokens found for admins (cancelled):', {
      adminCount: admins.length,
      tokenCount: tokens?.length || 0,
      tokensSummary: tokens?.map((t: any) => ({ user_id: t.user_id, platform: t.platform, created_at: t.created_at })),
      error: tokensErr,
    })

    if (tokensErr) {
      console.error('Error fetching admin tokens (cancelled):', tokensErr)
      return jsonResponse(200, { ok: true, pushed: 0, note: 'Error fetching admin tokens', error: tokensErr.message })
    }

    const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean)
    if (tokenList.length === 0) {
      console.log('No admin tokens found (cancelled)')
      return jsonResponse(200, { ok: true, pushed: 0, totalAdmins: admins.length, note: 'No admin tokens found' })
    }

    console.log('🔐 Getting OAuth2 access token for admin push (cancelled)...')
    let accessToken: string
    try {
      accessToken = await getAccessToken(serviceAccount)
      console.log('✅ Access token obtained for admin push (cancelled)')
    } catch (err: any) {
      console.error('❌ Error getting access token for admin push (cancelled):', err)
      return jsonResponse(500, { error: 'Failed to get OAuth2 access token', details: err.message })
    }

    console.log('📤 Sending FCM v1 notifications to admin tokens (cancelled):', tokenList.length)

    const dataPayload = {
      bookingId: String(booking.id),
      date: String(booking.date),
      type: 'booking_cancelled_by_user',
      title,
      body,
      url: 'https://vertebrastudio.github.io/parking-feb/admin',
    }

    const results = await Promise.allSettled(
      tokenList.map((token) => sendFCMV1Notification(accessToken, projectId, token, title, body, dataPayload)),
    )

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    const failureCount = results.length - successCount

    console.log('📊 FCM v1 Results (admins cancelled):', {
      total: results.length,
      success: successCount,
      failure: failureCount,
    })

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Admin token ${index} error:`, result.reason)
      } else if (!result.value.ok) {
        console.error(`Admin token ${index} failed:`, result.value.data)
      }
    })

    const response = jsonResponse(200, {
      ok: true,
      pushed: successCount,
      totalTokens: results.length,
      totalAdmins: admins.length,
      success: successCount,
      failure: failureCount,
    })

    console.log('✅ ===== Edge Function notify-booking-cancelled COMPLETED =====')
    console.log('Response:', {
      ok: true,
      pushed: successCount,
      totalTokens: results.length,
      totalAdmins: admins.length,
    })

    return response
  } catch (error: any) {
    console.error('❌ ===== Edge Function notify-booking-cancelled ERROR =====')
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

