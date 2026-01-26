# Troubleshooting: Notificaciones Push No Funcionan

## Checklist de Diagnóstico

### 1. Verificar que el token se guarde correctamente

**En la app:**
- Ve a la sección de Notificaciones
- Activa las notificaciones push
- Verifica que no aparezca ningún error

**En Supabase:**
- Ve a la tabla `push_tokens`
- Verifica que haya una fila con tu `user_id` y un `token` válido
- El token debería ser una cadena larga que empiece con algo como `c...` o `e...`

**Si no hay token:**
- Verifica que Firebase esté configurado (variables `VITE_FIREBASE_*`)
- Verifica que `VITE_FIREBASE_VAPID_KEY` esté configurado
- Verifica que la PWA esté instalada (no solo abierta en el navegador)
- Verifica los permisos de notificación en el dispositivo

### 2. Verificar que la Edge Function se ejecute

**Cuando aceptas una reserva:**
- Abre la consola del navegador (F12)
- Busca logs que empiecen con "Calling Edge Function" o "Edge Function response"
- Deberías ver:
  - `✅ Edge Function response: { ok: true, pushed: 1, ... }`
  - O un error si algo falla

**En Supabase Dashboard:**
- Ve a Edge Functions → `notify-booking-confirmed` → Logs
- Busca logs recientes cuando aceptas una reserva
- Verifica:
  - `Tokens found for user: { count: 1, ... }`
  - `Sending push to tokens: 1`
  - `FCM Response: { status: 200, ... }`

### 3. Verificar respuesta de FCM

**En los logs de la Edge Function, busca:**
```json
{
  "status": 200,
  "response": {
    "success": 1,
    "failure": 0,
    "results": [...]
  }
}
```

**Si `failure > 0`:**
- Revisa `results` para ver qué error tiene cada token
- Errores comunes:
  - `InvalidRegistration`: El token no es válido (regenerar token)
  - `NotRegistered`: El token ya no es válido (el usuario desinstaló la app)
  - `MismatchSenderId`: El `FCM_SERVER_KEY` no coincide con el proyecto

**Si `success === 0`:**
- Verifica que `FCM_SERVER_KEY` esté configurado en Supabase Secrets
- Verifica que el token sea válido

### 4. Verificar que el Service Worker reciba los mensajes

**En Android (Chrome DevTools):**
- Conecta el dispositivo a una computadora
- Abre Chrome → `chrome://inspect`
- Selecciona tu dispositivo y la PWA
- Ve a la pestaña "Console"
- Busca logs que empiecen con `[SW]`

**Logs esperados cuando llega una notificación:**
```
[SW] 🔔 FCM background message received (onBackgroundMessage): {...}
[SW] 📤 About to show notification via onBackgroundMessage: {...}
[SW] ✅ Notification shown successfully: ✅ Reserva confirmada
```

**Si no ves estos logs:**
- El service worker puede no estar activo
- El mensaje puede no estar llegando al service worker
- Verifica que el service worker esté registrado: Application → Service Workers

### 5. Verificar permisos de notificación

**Android:**
- Ajustes → Apps → [Tu PWA] → Notificaciones
- Asegúrate de que estén activadas
- Verifica que "Mostrar en pantalla bloqueada" esté activado

**iOS:**
- Ajustes → [Nombre de tu PWA] → Notificaciones
- Asegúrate de que "Permitir notificaciones" esté activado
- Verifica que "Pantalla bloqueada" esté activado

### 6. Verificar que la PWA esté instalada

**Android:**
- La app debe estar instalada (añadida a pantalla de inicio)
- NO solo abierta en Chrome

**iOS:**
- La app debe estar instalada (añadida a pantalla de inicio desde Safari)
- NO solo abierta en Safari
- Requiere iOS 16.4+

## Problemas Comunes y Soluciones

### Problema: "No tokens found"
**Causa:** El usuario no ha activado las notificaciones push
**Solución:** 
- Ve a la sección de Notificaciones en la app
- Activa las notificaciones push
- Verifica que se guarde un token en `push_tokens`

### Problema: "FCM_SERVER_KEY not set"
**Causa:** La clave de servidor de FCM no está configurada
**Solución:**
- Ve a Firebase Console → Project Settings → Cloud Messaging
- Copia la "Server key"
- Ve a Supabase Dashboard → Settings → Edge Functions → Secrets
- Añade `FCM_SERVER_KEY` con el valor de la Server key

### Problema: "InvalidRegistration" o "NotRegistered"
**Causa:** El token FCM no es válido
**Solución:**
- El usuario debe desactivar y reactivar las notificaciones push
- Esto generará un nuevo token válido

### Problema: Las notificaciones aparecen en la app pero no como push
**Causa:** Las notificaciones in-app funcionan, pero las push no
**Solución:**
- Verifica los logs del service worker
- Verifica que FCM esté respondiendo con éxito
- Verifica permisos de notificación en el dispositivo

### Problema: Funciona en Android pero no en iOS
**Causa:** Limitaciones conocidas de iOS con FCM Web
**Solución:**
- Verifica que la PWA esté instalada (no solo en Safari)
- Verifica iOS 16.4+
- Verifica permisos de notificación
- Considera usar Web Push estándar en lugar de FCM (requiere cambios significativos)

## Próximos Pasos

1. **Redeploya la Edge Function:**
   ```bash
   supabase functions deploy notify-booking-confirmed
   ```

2. **Prueba de nuevo:**
   - Acepta una reserva desde el panel de admin
   - Revisa los logs en la consola del navegador
   - Revisa los logs de la Edge Function en Supabase
   - Revisa los logs del service worker

3. **Si sigue sin funcionar:**
   - Comparte los logs de la Edge Function
   - Comparte los logs del service worker
   - Verifica que todos los pasos del checklist se cumplan
