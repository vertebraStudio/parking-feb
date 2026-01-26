// Supabase Edge Function: notify-booking-confirmed
// Creates an in-app notification and sends an FCM push (legacy endpoint).
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
// - FCM_SERVER_KEY
//
// Request body: { bookingId: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || ''

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase env vars' })
  }

  let payload: { bookingId?: number } = {}
  try {
    payload = (await req.json()) as any
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const bookingId = payload.bookingId
  if (!bookingId || typeof bookingId !== 'number') {
    return jsonResponse(400, { error: 'bookingId is required' })
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: booking, error: bookingErr } = await serviceClient
    .from('bookings')
    .select('id, user_id, date, status')
    .eq('id', bookingId)
    .single()

  if (bookingErr || !booking) return jsonResponse(404, { error: 'Booking not found' })
  if (booking.status !== 'confirmed') {
    return jsonResponse(409, { error: 'Booking is not confirmed' })
  }

  const title = '✅ Reserva confirmada'
  const body = `Tu reserva para el día ${booking.date} ha sido confirmada.`

  // 1) Insert in-app notification
  const { error: notifErr } = await serviceClient.from('notifications').insert({
    user_id: booking.user_id,
    type: 'booking_confirmed',
    title,
    body,
    data: { bookingId: booking.id, date: booking.date },
  })

  if (notifErr) return jsonResponse(500, { error: 'Failed to insert notification' })

  // 2) Send push via FCM legacy endpoint (optional if no key/tokens)
  if (!FCM_SERVER_KEY) {
    return jsonResponse(200, { ok: true, pushed: 0, note: 'FCM_SERVER_KEY not set' })
  }

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

  console.log('Sending push to tokens:', tokenList.length)

  // Send push notifications to all tokens
  // ESTRATEGIA: Usar tanto "notification" como "data"
  // - "notification": FCM muestra la notificación automáticamente (funciona cuando dispositivo activo)
  // - "data": El service worker también recibe el mensaje vía onBackgroundMessage (funciona cuando bloqueado)
  const fcmPayload = {
    registration_ids: tokenList,
    notification: {
      title,
      body,
      icon: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
      badge: 'https://vertebrastudio.github.io/parking-feb/pwa-192x192.png',
      sound: 'default',
      click_action: 'https://vertebrastudio.github.io/parking-feb/notifications',
    },
    data: { 
      bookingId: String(booking.id), 
      date: String(booking.date), 
      type: 'booking_confirmed',
      title,
      body,
      url: 'https://vertebrastudio.github.io/parking-feb/notifications',
    },
    priority: 'high',
    time_to_live: 86400, // 24 hours
    content_available: true, // Critical for background delivery
  }
  
  console.log('📤 Sending FCM payload to', tokenList.length, 'token(s)')

  const fcmResp = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
    body: JSON.stringify(fcmPayload),
  })

  const fcmJson = await fcmResp.json().catch(() => ({}))
  
  // Log para depuración
  console.log('FCM Response:', {
    status: fcmResp.status,
    statusText: fcmResp.statusText,
    response: fcmJson,
    tokensSent: tokenList.length,
  })

  // Verificar si hubo errores en la respuesta de FCM
  if (fcmJson.failure && fcmJson.failure > 0) {
    console.error('❌ FCM delivery failures:', {
      total: fcmJson.failure,
      success: fcmJson.success,
      results: fcmJson.results,
    })
    
    // Log cada error individual
    if (fcmJson.results && Array.isArray(fcmJson.results)) {
      fcmJson.results.forEach((result: any, index: number) => {
        if (result.error) {
          console.error(`Token ${index} error:`, result.error, 'Token:', tokenList[index]?.substring(0, 20) + '...')
        }
      })
    }
  } else if (fcmJson.success && fcmJson.success > 0) {
    console.log('✅ FCM delivery success:', {
      total: fcmJson.success,
      failure: fcmJson.failure || 0,
    })
  }

  return jsonResponse(200, {
    ok: true,
    pushed: tokenList.length,
    fcm: fcmJson,
    fcmStatus: fcmResp.status,
  })
})

