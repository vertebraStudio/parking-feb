# Desplegar Función de Notificación de Cancelación

Ya he instalado la CLI de Supabase localmente en tu proyecto para agilizar el trabajo. Ahora puedes ejecutar el comando de despliegue de forma rápida y segura.

## Pasos para desplegar

1. Abre tu terminal en la raíz del proyecto.
2. Ejecuta el siguiente comando (ahora usará la versión instalada en el proyecto):

```bash
npx supabase functions deploy notify-booking-cancelled
```

El archivo `supabase/config.toml` ya incluye la configuración necesaria (`verify_jwt = false`), por lo que no necesitas añadir flags adicionales.

## Cómo verificar

Una vez desplegada:

1. Inicia sesión en la app como un **Usuario**.
2. Cancela una reserva **confirmada**.
3. Inicia sesión como **Admin**.
4. Deberías ver la notificación en la campana y, al pulsarla, ir al Admin Dashboard.
