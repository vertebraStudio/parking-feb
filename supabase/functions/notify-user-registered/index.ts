// Supabase Edge Function: notify-user-registered
// Crea una notificación in-app para administradores y envía push cuando
// un nuevo usuario se registra y queda pendiente de validación.
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - FIREBASE_SERVICE_ACCOUNT_JSON (JSON completo del service account de Firebase)
// - FIREBASE_PROJECT_ID (opcional, se puede extraer del JSON)
//
// Request body: { userId: string }

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

// Obtener access token OAuth 2.0 desde service account JSON (igual que en notify-booking-requested)
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
          tag: `user-registered-${data.userId}`, // Tag para evitar duplicados
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
    console.log('🚀 ===== Edge Function notify-user-registered STARTED =====')
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
    const FIREBASE_SERVICE_ACCOUNT_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''
    const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') || ''

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
    console.log('✅ Supabase client created')

    // Obtener el perfil del nuevo usuario
    const { data: profile, error: profileErr } = await serviceClient
      .from('profiles')
      .select('id, email, full_name, is_verified, role')
      .eq('id', userId)
      .single()

    console.log('📋 Profile query result:', { profile, error: profileErr })

    if (profileErr || !profile) {
      console.error('❌ Profile not found or error:', profileErr)
      return jsonResponse(404, { error: 'Profile not found' })
    }

    // Solo notificar si el usuario NO está verificado y es un usuario normal
    if (profile.is_verified || profile.role !== 'user') {
      console.log('ℹ️ User is already verified or not a normal user, skipping notification')
      return jsonResponse(200, { ok: true, skipped: true })
    }

    const displayName = profile.full_name || profile.email || 'Usuario'

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

    const title = 'Nuevo usuario pendiente de validar'
    const body = `${displayName} se ha registrado y está pendiente de validación.`

    // 1) Insertar notificaciones in-app para cada admin
    const notificationsPayload = admins.map((admin: any) => ({
      user_id: admin.id,
      type: 'user_registered',
      title,
      body,
      data: {
        userId: profile.id,
        email: profile.email,
        full_name: profile.full_name,
      },
    }))

    console.log('📝 Inserting admin notifications (user_registered), count:', notificationsPayload.length)

    const { error: notifErr } = await serviceClient
      .from('notifications')
      .insert(notificationsPayload)

    if (notifErr) {
      console.error('❌ Failed to insert admin notifications (user_registered):', notifErr)
      // Continuar igualmente, que al menos pueda intentar push
    } else {
      console.log('✅ Admin notifications (user_registered) inserted successfully')
    }

    // 2) Push via FCM V1 para todos los admins (si hay service account)
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

    console.log('Tokens found for admins (user_registered):', {
      adminCount: admins.length,
      tokenCount: tokens?.length || 0,
      tokensSummary: tokens?.map((t: any) => ({ user_id: t.user_id, platform: t.platform, created_at: t.created_at })),
      error: tokensErr,
    })

    if (tokensErr) {
      console.error('Error fetching admin tokens (user_registered):', tokensErr)
      return jsonResponse(200, { ok: true, pushed: 0, note: 'Error fetching admin tokens', error: tokensErr.message })
    }

    const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean)
    if (tokenList.length === 0) {
      console.log('No admin tokens found (user_registered)')
      return jsonResponse(200, { ok: true, pushed: 0, totalAdmins: admins.length, note: 'No admin tokens found' })
    }

    console.log('🔐 Getting OAuth2 access token for admin push (user_registered)...')
    let accessToken: string
    try {
      accessToken = await getAccessToken(serviceAccount)
      console.log('✅ Access token obtained for admin push (user_registered)')
    } catch (err: any) {
      console.error('❌ Error getting access token for admin push (user_registered):', err)
      return jsonResponse(500, { error: 'Failed to get OAuth2 access token', details: err.message })
    }

    console.log('📤 Sending FCM v1 notifications to admin tokens (user_registered):', tokenList.length)

    const dataPayload = {
      userId: String(profile.id),
      email: String(profile.email || ''),
      type: 'user_registered',
      title,
      body,
      url: 'https://vertebrastudio.github.io/parking-feb/admin',
    }

    const results = await Promise.allSettled(
      tokenList.map((token) => sendFCMV1Notification(accessToken, projectId, token, title, body, dataPayload)),
    )

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length
    const failureCount = results.length - successCount

    console.log('📊 FCM v1 Results (user_registered):', {
      total: results.length,
      success: successCount,
      failure: failureCount,
    })

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Admin token ${index} error (user_registered):`, result.reason)
      } else if (!result.value.ok) {
        console.error(`Admin token ${index} failed (user_registered):`, result.value.data)
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

    console.log('✅ ===== Edge Function notify-user-registered COMPLETED =====')
    console.log('Response:', {
      ok: true,
      pushed: successCount,
      totalTokens: results.length,
      totalAdmins: admins.length,
    })

    return response
  } catch (error: any) {
    console.error('❌ ===== Edge Function notify-user-registered ERROR =====')
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

