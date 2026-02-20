// Supabase Edge Function: notify-booking-waitlisted
// Creates an in-app notification and sends an FCM push using FCM HTTP v1 API.
//
// Required secrets:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
// - FIREBASE_SERVICE_ACCOUNT_JSON
// - FIREBASE_PROJECT_ID
//
// Request body: { bookingId: number, reason?: string }

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

// Simple date formatter function for ES context
function formatDateEs(dateStr: string) {
    try {
        const date = new Date(dateStr)
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
        return date.toLocaleDateString('es-ES', options)
    } catch (e) {
        return dateStr
    }
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
                    tag: `booking-${data.bookingId}`, // Tag único para evitar duplicados
                },
                fcm_options: {
                    link: 'https://vertebrastudio.github.io/parking-feb/notifications',
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
        // Log INMEDIATO
        console.log('🚀 ===== Edge Function notify-booking-waitlisted STARTED =====')

        // IMPORTANTE: Responder inmediatamente a OPTIONS para CORS
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

        let payload: { bookingId?: number, reason?: string } = {}
        try {
            payload = (await req.json()) as any
        } catch (err) {
            return jsonResponse(400, { error: 'Invalid JSON body' })
        }

        const bookingId = payload.bookingId
        const reason = payload.reason

        if (!bookingId || typeof bookingId !== 'number') {
            return jsonResponse(400, { error: 'bookingId is required' })
        }

        const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        const { data: booking, error: bookingErr } = await serviceClient
            .from('bookings')
            .select('id, user_id, date, status')
            .eq('id', bookingId)
            .single()

        if (bookingErr || !booking) {
            console.error('❌ Booking not found or error:', bookingErr)
            return jsonResponse(404, { error: 'Booking not found' })
        }

        if (booking.status !== 'waitlist') {
            // Si la reserva no está en waitlist, algo anda mal (o se movió de nuevo)
            // Pero permitimos la notificación si es 'cancelled'->'waitlist' transición.
            // Solo verificamos que exista.
            console.warn('⚠️ Booking status is not waitlist:', booking.status)
            // return jsonResponse(409, { error: 'Booking is not in waitlist' }) 
            // Permitimos continuar por flexibilidad, o restringimos
        }

        console.log('✅ Booking found:', booking.id)

        const title = 'Reserva en lista de espera'
        const formattedDate = formatDateEs(booking.date)
        const body = reason
            ? `Tu reserva del ${formattedDate} ha sido devuelta a la lista de espera.\n**Motivo:** ${reason}`
            : `Tu reserva del ${formattedDate} ha sido devuelta a la lista de espera.`

        // 1) Insert in-app notification
        console.log('📝 Inserting in-app notification for user:', booking.user_id)
        const { error: notifErr } = await serviceClient.from('notifications').insert({
            user_id: booking.user_id,
            type: 'booking_waitlisted',
            title,
            body,
            data: { bookingId: booking.id, date: booking.date, reason },
        })

        if (notifErr) {
            console.error('❌ Failed to insert notification:', notifErr)
            return jsonResponse(500, { error: 'Failed to insert notification' })
        }

        // 2) Send push via FCM HTTP v1 API
        if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
            console.log('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON not set, skipping push notifications')
            return jsonResponse(200, { ok: true, pushed: 0, note: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' })
        }

        let serviceAccount: any
        let projectId: string
        try {
            serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
            projectId = FIREBASE_PROJECT_ID || serviceAccount.project_id
        } catch (err) {
            console.error('❌ Error parsing service account JSON:', err)
            return jsonResponse(500, { error: 'Invalid FIREBASE_SERVICE_ACCOUNT_JSON format' })
        }

        console.log('🔍 Fetching push tokens for user:', booking.user_id)
        const { data: tokens, error: tokensErr } = await serviceClient
            .from('push_tokens')
            .select('token')
            .eq('user_id', booking.user_id)

        if (tokensErr) {
            console.error('Error fetching tokens:', tokensErr)
            return jsonResponse(200, { ok: true, pushed: 0, error: tokensErr.message })
        }

        const tokenList = (tokens || []).map((t: any) => t.token).filter(Boolean)
        if (tokenList.length === 0) {
            return jsonResponse(200, { ok: true, pushed: 0, note: 'No tokens found' })
        }

        const accessToken = await getAccessToken(serviceAccount)

        const data = {
            bookingId: String(booking.id),
            date: String(booking.date),
            type: 'booking_waitlisted',
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

        console.log('✅ ===== Edge Function notify-booking-waitlisted COMPLETED =====')

        return jsonResponse(200, {
            ok: true,
            pushed: successCount,
            total: results.length,
        })
    } catch (error: any) {
        console.error('❌ ===== ERROR =====', error)
        return jsonResponse(500, { error: error?.message || 'Internal server error' })
    }
})
