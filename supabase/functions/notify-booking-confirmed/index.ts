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

function jsonResponse(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') || ''

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'Missing Supabase env vars' })
  }

  // Use caller auth to verify admin
  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return jsonResponse(401, { error: 'Unauthorized' })

  const callerId = userData.user.id
  const { data: callerProfile, error: callerProfileErr } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .single()

  if (callerProfileErr) return jsonResponse(403, { error: 'Forbidden' })
  if (callerProfile?.role !== 'admin') return jsonResponse(403, { error: 'Admins only' })

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

  const title = 'Reserva confirmada'
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
    .select('token')
    .eq('user_id', booking.user_id)

  if (tokensErr) return jsonResponse(200, { ok: true, pushed: 0, note: 'No tokens' })

  const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean)
  if (tokenList.length === 0) return jsonResponse(200, { ok: true, pushed: 0 })

  const fcmResp = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
    body: JSON.stringify({
      registration_ids: tokenList,
      notification: { title, body },
      data: { bookingId: String(booking.id), date: String(booking.date), type: 'booking_confirmed' },
    }),
  })

  const fcmJson = await fcmResp.json().catch(() => ({}))

  return jsonResponse(200, {
    ok: true,
    pushed: tokenList.length,
    fcm: fcmJson,
  })
})

