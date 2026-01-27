#!/bin/bash

# Script para desplegar notify-booking-requested
# Uso: ./deploy-notify-requested.sh TU_ACCESS_TOKEN

if [ -z "$1" ]; then
  echo "❌ Error: Necesitas proporcionar tu Supabase Access Token"
  echo ""
  echo "Uso: ./deploy-notify-requested.sh TU_ACCESS_TOKEN"
  echo ""
  echo "Para obtener tu token:"
  echo "1. Ve a https://supabase.com/dashboard/account/tokens"
  echo "2. Crea un nuevo Access Token"
  echo "3. Cópialo y ejecuta: ./deploy-notify-requested.sh TU_TOKEN"
  exit 1
fi

export SUPABASE_ACCESS_TOKEN="$1"

echo "🔗 Vinculando proyecto..."
./bin/supabase link --project-ref uybqwapddzoificmrpem

if [ $? -ne 0 ]; then
  echo "❌ Error al vincular proyecto"
  exit 1
fi

echo ""
echo "🚀 Desplegando notify-booking-requested..."
./bin/supabase functions deploy notify-booking-requested

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ ¡Función desplegada exitosamente!"
  echo ""
  echo "Próximos pasos:"
  echo "1. Ve a Supabase Dashboard → Edge Functions"
  echo "2. Verifica que 'notify-booking-requested' aparece en la lista"
  echo "3. Haz una nueva solicitud de reserva desde la app"
  echo "4. Revisa los logs de la función para confirmar que funciona"
else
  echo ""
  echo "❌ Error al desplegar la función"
  exit 1
fi
