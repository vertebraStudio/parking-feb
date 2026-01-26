# Migrar a Firebase Cloud Messaging V1 API

## ✅ Cambios Realizados

La Edge Function `notify-booking-confirmed` ha sido migrada a la **API V1 de FCM**, que es más segura y es la recomendada por Google.

### Ventajas de la API V1:
- ✅ Más segura (usa OAuth 2.0 con tokens de corta duración)
- ✅ Mejor rendimiento
- ✅ Mejor soporte para diferentes plataformas
- ✅ No deprecada (la API heredada se eliminará en junio 2024)

## 📋 Configuración Requerida

### Paso 1: Crear Service Account en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto: **parking-feb**
3. Ve a **Project Settings** (⚙️) → **Service accounts**
4. Haz clic en **Generate new private key**
5. Se descargará un archivo JSON con las credenciales del service account
6. **Guarda este archivo de forma segura** (contiene información sensible)

### Paso 2: Configurar Secrets en Supabase

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Edge Functions** → **Secrets** (o **Settings** → **Edge Functions** → **Secrets**)

#### Secret 1: FIREBASE_SERVICE_ACCOUNT_JSON

1. Abre el archivo JSON descargado en el Paso 1
2. Copia **todo el contenido** del JSON (debe empezar con `{` y terminar con `}`)
3. En Supabase, haz clic en **Add new secret**
4. Configura:
   - **Name:** `FIREBASE_SERVICE_ACCOUNT_JSON`
   - **Value:** Pega el contenido completo del JSON
5. Haz clic en **Save**

**⚠️ IMPORTANTE:** El valor debe ser el JSON completo, no solo una parte. Debe incluir campos como:
- `type`
- `project_id`
- `private_key_id`
- `private_key`
- `client_email`
- etc.

#### Secret 2: FIREBASE_PROJECT_ID (Opcional)

1. Si el JSON del service account incluye `project_id`, este secret es opcional
2. Si prefieres especificarlo explícitamente:
   - **Name:** `FIREBASE_PROJECT_ID`
   - **Value:** `parking-feb` (o el ID de tu proyecto)

### Paso 3: Verificar Configuración

Después de configurar los secrets:

1. Acepta una reserva desde el panel de admin
2. Revisa los logs de la Edge Function en Supabase
3. Deberías ver:
   - `🔑 Checking FIREBASE_SERVICE_ACCOUNT_JSON: SET`
   - `✅ Service account parsed, project ID: parking-feb`
   - `🔐 Getting OAuth2 access token...`
   - `✅ Access token obtained`
   - `📤 Sending FCM v1 notifications to X token(s)`
   - `📊 FCM v1 Results: { total: X, success: X, failure: 0 }`
   - `✅ ===== Edge Function notify-booking-confirmed COMPLETED =====`

## 🔄 Cambios en los Secrets

### Secrets Anteriores (API Heredada):
- ❌ `FCM_SERVER_KEY` (ya no se necesita)

### Secrets Nuevos (API V1):
- ✅ `FIREBASE_SERVICE_ACCOUNT_JSON` (requerido)
- ✅ `FIREBASE_PROJECT_ID` (opcional, se extrae del JSON si no se proporciona)

## 🐛 Troubleshooting

### Error: "FIREBASE_SERVICE_ACCOUNT_JSON not set"
- Verifica que hayas añadido el secret en Supabase
- Asegúrate de que el nombre sea exactamente `FIREBASE_SERVICE_ACCOUNT_JSON`

### Error: "Invalid FIREBASE_SERVICE_ACCOUNT_JSON format"
- Verifica que el JSON esté completo y bien formateado
- Asegúrate de copiar todo el contenido del archivo JSON, incluyendo las llaves `{` y `}`

### Error: "Failed to get OAuth2 access token"
- Verifica que el service account tenga los permisos necesarios
- Verifica que el JSON del service account sea válido
- Revisa los logs de la Edge Function para más detalles

### Error: "Token X failed"
- Puede ser que el token FCM del usuario haya expirado
- El usuario debería reactivar las notificaciones push en la app

## 📚 Referencias

- [FCM HTTP v1 API Documentation](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
- [Migrating from Legacy FCM APIs](https://firebase.google.com/docs/cloud-messaging/migrate-v1)
- [Service Account Authentication](https://firebase.google.com/docs/cloud-messaging/auth-server)
