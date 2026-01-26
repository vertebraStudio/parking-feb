# Notificaciones Push en iOS - Guía de Troubleshooting

## Limitaciones Conocidas de iOS

iOS tiene limitaciones específicas con las notificaciones push en PWAs:

1. **iOS 16.4+ requerido**: Las notificaciones push solo funcionan en iOS 16.4 o superior
2. **PWA instalada**: La PWA debe estar **instalada** (añadida a pantalla de inicio), no solo abierta en Safari
3. **FCM Web puede no funcionar**: iOS Safari puede no soportar completamente FCM Web
4. **Notificaciones bloqueadas**: iOS puede bloquear notificaciones cuando el dispositivo está bloqueado por razones de privacidad/batería

## Checklist de Verificación

### 1. Verificar que la PWA esté instalada
- Abre la app en Safari
- Toca el botón "Compartir" (cuadrado con flecha)
- Selecciona "Añadir a pantalla de inicio"
- Abre la app desde el icono en la pantalla de inicio (NO desde Safari)

### 2. Verificar permisos de notificación
- Ve a: Ajustes → [Nombre de tu PWA] → Notificaciones
- Asegúrate de que "Permitir notificaciones" esté activado
- Verifica que "Pantalla bloqueada" esté activado

### 3. Verificar que el token se guarde
- Abre la app instalada (desde pantalla de inicio)
- Ve a la sección de Notificaciones
- Activa las notificaciones push
- Verifica en Supabase (tabla `push_tokens`) que se haya guardado un token para tu usuario

### 4. Verificar logs del Service Worker
- Conecta el iPhone a una Mac
- Abre Safari en la Mac
- Ve a: Desarrollo → [Tu iPhone] → [Tu PWA]
- Abre la consola y busca logs que empiecen con `[SW]`

### 5. Verificar logs de la Edge Function
- Ve al dashboard de Supabase
- Edge Functions → `notify-booking-confirmed` → Logs
- Busca errores o respuestas de FCM

## Posibles Soluciones

### Si el token no se genera:
- Verifica que Firebase esté configurado correctamente
- Verifica que `VITE_FIREBASE_VAPID_KEY` esté configurado
- Asegúrate de estar usando la versión instalada de la PWA, no Safari

### Si el token se genera pero no llegan notificaciones:
- Verifica los logs de la Edge Function para ver si FCM está respondiendo
- Verifica que `FCM_SERVER_KEY` esté configurado en Supabase Secrets
- Verifica los logs del Service Worker para ver si recibe los mensajes

### Si las notificaciones llegan pero no se muestran:
- Verifica permisos de notificación en iOS
- Verifica que no estés en modo "No molestar"
- Verifica que la batería no esté en modo ahorro

## Nota Importante

**iOS puede tener limitaciones fundamentales con FCM Web**. Si después de verificar todo lo anterior sigue sin funcionar, puede ser necesario:

1. Usar Web Push estándar en lugar de FCM (requiere cambios significativos)
2. Considerar una app nativa para iOS (usando Capacitor/Expo)
3. Aceptar que las notificaciones push pueden no funcionar completamente en iOS con la arquitectura actual
