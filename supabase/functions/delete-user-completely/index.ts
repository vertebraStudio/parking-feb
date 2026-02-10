// Supabase Edge Function: delete-user-completely
// Elimina completamente a un usuario:
// - Borra datos relacionados (bookings, notifications, push_tokens, parking_spots.assigned_to, booking_carpool_users)
// - Borra su perfil en public.profiles
// - Borra el usuario en auth.users mediante auth.admin.deleteUser
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Request body: { userId: string }

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
  try {
    console.log('🚀 ===== Edge Function delete-user-completely STARTED =====')
    console.log('Request method:', req.method)
    console.log('Request URL:', req.url)

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing Supabase env vars')
      return jsonResponse(500, { error: 'Missing Supabase env vars' })
    }

    let payload: { userId?: string } = {}
    try {
      payload = (await req.json()) as any
      console.log('📦 Parsed payload:', payload)
    } catch (err) {
      console.error('❌ Error parsing JSON:', err)
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const userId = payload.userId
    if (!userId || typeof userId !== 'string') {
      console.error('❌ Invalid userId:', userId)
      return jsonResponse(400, { error: 'userId is required' })
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    console.log('✅ Supabase service client created')

    // 1) Borrar datos relacionados en tablas públicas (RLS no aplica con service role)
    // Borrar reservas del usuario
    const { error: bookingsError } = await serviceClient
      .from('bookings')
      .delete()
      .eq('user_id', userId)
    if (bookingsError) {
      console.error('❌ Error deleting bookings for user:', bookingsError)
    }

    // Borrar relaciones de carpooling donde aparezca como acompañante
    const { error: carpoolError } = await serviceClient
      .from('booking_carpool_users')
      .delete()
      .eq('user_id', userId)
    if (carpoolError) {
      console.error('❌ Error deleting booking_carpool_users for user:', carpoolError)
    }

    // Borrar notificaciones
    const { error: notificationsError } = await serviceClient
      .from('notifications')
      .delete()
      .eq('user_id', userId)
    if (notificationsError) {
      console.error('❌ Error deleting notifications for user:', notificationsError)
    }

    // Borrar tokens push
    const { error: pushTokensError } = await serviceClient
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
    if (pushTokensError) {
      console.error('❌ Error deleting push_tokens for user:', pushTokensError)
    }

    // Liberar plazas ejecutivas asignadas
    const { error: spotsError } = await serviceClient
      .from('parking_spots')
      .update({ assigned_to: null, is_released: false })
      .eq('assigned_to', userId)
    if (spotsError) {
      console.error('❌ Error clearing executive spots for user:', spotsError)
    }

    // 2) Borrar perfil en public.profiles
    const { error: profileError } = await serviceClient
      .from('profiles')
      .delete()
      .eq('id', userId)
    if (profileError) {
      console.error('❌ Error deleting profile for user:', profileError)
    }

    // 3) Borrar usuario en auth.users usando auth.admin.deleteUser
    //    (solo disponible con service_role)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { error: adminError } = await adminClient.auth.admin.deleteUser(userId)
    if (adminError) {
      console.error('❌ Error deleting auth user:', adminError)
      // No devolvemos 500 si solo falla esta parte, para no romper el flujo en la app.
      return jsonResponse(200, {
        ok: false,
        warning: 'User data deleted from public tables, but failed to delete from auth.users',
        adminError,
      })
    }

    console.log('✅ User fully deleted (public tables + auth.users)')
    return jsonResponse(200, { ok: true })
  } catch (err: any) {
    console.error('❌ Unexpected error in delete-user-completely:', err)
    return jsonResponse(500, { error: err.message || 'Unexpected error' })
  }
})

