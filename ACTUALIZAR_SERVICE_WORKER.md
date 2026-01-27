# Actualizar Service Worker para Corregir Notificaciones Duplicadas

## Problema
Estás recibiendo 3 notificaciones duplicadas cuando se acepta una reserva.

## Posibles Causas

1. **Service Worker en caché**: El navegador puede estar usando una versión antigua del service worker
2. **Múltiples tokens**: Puede haber múltiples tokens FCM registrados para el mismo usuario
3. **Listeners duplicados**: Tanto `onBackgroundMessage` como el listener `push` pueden estar procesando el mismo mensaje

## Solución Paso a Paso

### Opción 1: Forzar Actualización del Service Worker (Recomendado)

1. **Abre las DevTools del navegador** (F12 o Cmd+Option+I en Mac)
2. Ve a la pestaña **Application** (o **Aplicación**)
3. En el menú lateral, busca **Service Workers**
4. Encuentra el service worker de tu app (`/parking-feb/sw.js` o similar)
5. Haz clic en **Unregister** (o **Desregistrar**)
6. Cierra todas las pestañas de la app
7. Abre la app de nuevo
8. El service worker se registrará automáticamente con la versión más reciente

### Opción 2: Limpiar Caché y Datos del Sitio

1. **Abre las DevTools** (F12)
2. Ve a **Application** → **Storage** (o **Almacenamiento**)
3. Haz clic en **Clear site data** (o **Borrar datos del sitio**)
4. Marca todas las opciones:
   - Cookies
   - Cache storage
   - Local storage
   - Service workers
5. Haz clic en **Clear site data**
6. Recarga la página

### Opción 3: Verificar Tokens Duplicados

Si después de limpiar el caché sigues recibiendo múltiples notificaciones:

1. Ve a la tabla `push_tokens` en Supabase
2. Busca tu `user_id`
3. Si hay múltiples tokens para el mismo usuario, elimina los antiguos
4. Solo debería haber **un token activo por usuario**

### Opción 4: Hard Refresh del Navegador

- **Chrome/Edge**: `Ctrl+Shift+R` (Windows/Linux) o `Cmd+Shift+R` (Mac)
- **Firefox**: `Ctrl+F5` (Windows/Linux) o `Cmd+Shift+R` (Mac)
- **Safari**: `Cmd+Option+R` (Mac)

## Verificación

Después de actualizar el service worker:

1. Acepta una reserva desde el panel de admin
2. Deberías recibir **solo una notificación**
3. Revisa la consola del navegador (F12) para ver los logs del service worker
4. Deberías ver:
   - `[SW] 🔔 FCM background message received (onBackgroundMessage):`
   - `[SW] ⚠️ FCM message detected in push listener - ignoring` (si el listener push también se dispara)

## Si el Problema Persiste

Si después de seguir estos pasos sigues recibiendo múltiples notificaciones:

1. Revisa los logs de la Edge Function en Supabase
2. Verifica cuántos tokens se están enviando (`📤 Sending FCM v1 notifications to X token(s)`)
3. Si hay múltiples tokens, puede ser que el usuario tenga la app instalada en múltiples dispositivos o navegadores
