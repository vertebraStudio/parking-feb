#!/usr/bin/env node

/**
 * Script para eliminar la reserva de Manuel Falero para el lunes 16 de febrero
 * 
 * Uso: node scripts/delete-booking.js
 * 
 * Requiere variables de entorno:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY (o SUPABASE_SERVICE_ROLE_KEY para operaciones admin)
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Faltan variables de entorno SUPABASE_URL o SUPABASE_KEY')
  console.error('   Asegúrate de tener un archivo .env con estas variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function deleteBooking() {
  const dateToDelete = '2025-02-16' // Lunes 16 de febrero de 2025
  
  console.log('🔍 Buscando usuario Manuel Falero...')
  
  // Buscar el usuario
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .or(`full_name.ilike.%manuel%falero%,full_name.ilike.%falero%manuel%,email.ilike.%manuel%falero%,email.ilike.%falero%manuel%`)
    .limit(1)

  if (profileError) {
    console.error('❌ Error buscando usuario:', profileError)
    process.exit(1)
  }

  if (!profiles || profiles.length === 0) {
    console.error('❌ No se encontró el usuario Manuel Falero')
    process.exit(1)
  }

  const user = profiles[0]
  console.log(`✅ Usuario encontrado: ${user.full_name || user.email} (${user.id})`)

  // Buscar la reserva
  console.log(`🔍 Buscando reserva para el ${dateToDelete}...`)
  
  const { data: bookings, error: bookingError } = await supabase
    .from('bookings')
    .select('id, date, status, spot_id')
    .eq('user_id', user.id)
    .eq('date', dateToDelete)
    .neq('status', 'cancelled')

  if (bookingError) {
    console.error('❌ Error buscando reserva:', bookingError)
    process.exit(1)
  }

  if (!bookings || bookings.length === 0) {
    console.error(`❌ No se encontró una reserva activa para el ${dateToDelete}`)
    process.exit(1)
  }

  const booking = bookings[0]
  console.log(`✅ Reserva encontrada: ID ${booking.id}, Estado: ${booking.status}`)

  // Eliminar relaciones de carpooling primero
  console.log('🗑️  Eliminando relaciones de carpooling...')
  const { error: carpoolError } = await supabase
    .from('booking_carpool_users')
    .delete()
    .eq('booking_id', booking.id)

  if (carpoolError) {
    console.warn('⚠️  Advertencia al eliminar relaciones de carpooling:', carpoolError.message)
  } else {
    console.log('✅ Relaciones de carpooling eliminadas')
  }

  // Eliminar la reserva
  console.log('🗑️  Eliminando reserva...')
  const { error: deleteError } = await supabase
    .from('bookings')
    .delete()
    .eq('id', booking.id)

  if (deleteError) {
    console.error('❌ Error eliminando reserva:', deleteError)
    process.exit(1)
  }

  console.log(`✅ Reserva eliminada exitosamente: ID ${booking.id}`)
  console.log(`   Usuario: ${user.full_name || user.email}`)
  console.log(`   Fecha: ${dateToDelete}`)
}

deleteBooking()
  .then(() => {
    console.log('✅ Proceso completado')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error inesperado:', error)
    process.exit(1)
  })
