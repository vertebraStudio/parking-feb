# Configurar FCM_SERVER_KEY en Supabase

## Problema
Los logs muestran:
- `⚠️ FCM_SERVER_KEY not set, skipping push notifications`
- `⚠️ Checking FCM_SERVER_KEY: NOT SET`

Esto significa que la Edge Function no puede enviar push notifications porque falta la clave de servidor de Firebase.

## Solución

### Paso 1: Obtener la Server Key de Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: **parking-feb**
3. Ve a **Project Settings** (⚙️) → **Cloud Messaging**
4. En la sección **Cloud Messaging API (Legacy)**, busca **Server key**
5. Copia la clave (debería ser una cadena larga que empiece con algo como `AAAA...`)

**Nota:** Si no ves la "Server key", puede que necesites habilitar la Cloud Messaging API (Legacy):
- Ve a [Google Cloud Console](https://console.cloud.google.com/)
- Selecciona el proyecto `parking-feb`
- Ve a **APIs & Services** → **Library**
- Busca "Firebase Cloud Messaging API"
- Asegúrate de que esté habilitada

### Paso 2: Configurar el Secret en Supabase

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto: **parking-feb**
3. Ve a **Edge Functions** → **Secrets** (o **Settings** → **Edge Functions** → **Secrets`)
4. Haz clic en **Add new secret**
5. Configura:
   - **Name:** `FCM_SERVER_KEY`
   - **Value:** Pega la Server key que copiaste de Firebase
6. Haz clic en **Save**

### Paso 3: Verificar

Después de configurar el secret:

1. Acepta una reserva desde el panel de admin
2. Revisa los logs de la Edge Function en Supabase
3. Deberías ver:
   - `🔑 Checking FCM_SERVER_KEY: SET` (en lugar de `NOT SET`)
   - `🔍 Fetching push tokens for user: ...`
   - `📤 Sending FCM payload to X token(s)`
   - `FCM Response: { status: 200, ... }`
   - `✅ FCM delivery success: { total: 1, ... }`

## Nota Importante

El `FCM_SERVER_KEY` es diferente del `VITE_FIREBASE_VAPID_KEY`:
- **FCM_SERVER_KEY**: Se usa en el servidor (Edge Function) para enviar push notifications
- **VITE_FIREBASE_VAPID_KEY**: Se usa en el cliente (navegador) para obtener tokens FCM

Ambos son necesarios para que las push notifications funcionen completamente.
