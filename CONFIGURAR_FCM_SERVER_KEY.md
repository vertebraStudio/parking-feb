# Configurar FCM_SERVER_KEY en Supabase

## Problema
Los logs muestran:
- `⚠️ FCM_SERVER_KEY not set, skipping push notifications`
- `⚠️ Checking FCM_SERVER_KEY: NOT SET`

Esto significa que la Edge Function no puede enviar push notifications porque falta la clave de servidor de Firebase.

## Solución

### Paso 1: Habilitar la API Heredada de Firebase (Temporal)

**⚠️ IMPORTANTE:** La API heredada está deprecada y será eliminada en junio 2024. Esta es una solución temporal. Se recomienda migrar a la API V1 en el futuro.

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona el proyecto: **parking-feb**
3. Ve a **APIs & Services** → **Library** (o **APIs y servicios** → **Biblioteca**)
4. Busca "**Firebase Cloud Messaging API**" o "**Cloud Messaging API (Legacy)**"
5. Haz clic en el resultado y luego en **HABILITAR** (o **ENABLE**)

### Paso 2: Obtener la Server Key de Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: **parking-feb**
3. Ve a **Project Settings** (⚙️) → **Cloud Messaging**
4. En la sección **Cloud Messaging API (Legacy)** (API de Cloud Messaging heredada), deberías ver ahora la opción para ver la **Server key**
5. Si no aparece directamente, ve a [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
6. Busca "**Server key**" en la lista de claves de API
7. Copia la clave (debería ser una cadena larga que empiece con algo como `AAAA...`)

**Nota:** Si después de habilitar la API heredada aún no ves la Server key, puede que necesites crear una nueva clave de API en Google Cloud Console.

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

## ⚠️ Advertencia sobre la API Heredada

La API heredada de FCM está **deprecada** y será eliminada en **junio 2024**. Esta es una solución temporal para que las push notifications funcionen ahora.

**En el futuro, se recomienda migrar a la API V1 de FCM**, que:
- Es más segura (usa OAuth 2.0 con tokens de corta duración)
- Es más eficiente
- Tiene mejor soporte para diferentes plataformas

La migración a V1 requerirá cambios en la Edge Function, pero por ahora, habilitar la API heredada es la solución más rápida.
