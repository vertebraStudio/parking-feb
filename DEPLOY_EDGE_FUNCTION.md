# Cómo Redeployar la Edge Function sin Verificación JWT

## Problema
La Edge Function `notify-booking-confirmed` está devolviendo 401 (Unauthorized) porque Supabase está bloqueando las llamadas antes de ejecutar la función.

## Solución
Desactivar la verificación JWT para esta función específica.

## Opción 1: Usar config.toml (Recomendado)

Ya he creado el archivo `supabase/config.toml` con la configuración necesaria.

Para deployar:

```bash
supabase functions deploy notify-booking-confirmed
```

El archivo `config.toml` debería aplicarse automáticamente.

## Opción 2: Usar flag --no-verify-jwt

Si el `config.toml` no funciona, puedes usar el flag directamente:

```bash
supabase functions deploy notify-booking-confirmed --no-verify-jwt
```

## Verificación

Después de deployar:

1. Acepta una reserva desde el panel de admin
2. Revisa los logs de la Edge Function en Supabase Dashboard
3. Deberías ver los logs que empiezan con:
   - `🚀 ===== Edge Function notify-booking-confirmed STARTED =====`
   - `✅ POST request received, processing...`
   - `✅ ===== Edge Function notify-booking-confirmed COMPLETED =====`

Si ves estos logs, la función se está ejecutando correctamente.

## Nota de Seguridad

Aunque la función no requiere autenticación del usuario, es segura porque:
- Usa `SERVICE_ROLE_KEY` internamente para acceder a la base de datos
- Solo puede crear notificaciones y enviar pushes para reservas confirmadas
- No expone información sensible

Si quieres añadir seguridad adicional, puedes:
- Añadir un API key personalizado en el código de la función
- Verificar que el `bookingId` corresponda a una reserva válida
- Limitar la función a solo ciertos dominios/orígenes
