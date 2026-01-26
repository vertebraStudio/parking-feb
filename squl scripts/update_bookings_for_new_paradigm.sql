-- ============================================================
-- Script para actualizar bookings para el nuevo paradigma
-- ============================================================
-- Este script permite que bookings no tengan spot_id asignado
-- (spot_id puede ser NULL) ya que ahora los usuarios solicitan
-- plaza para un día, no para una plaza específica.
-- ============================================================

-- Paso 1: Eliminar la restricción UNIQUE que requiere spot_id
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_spot_id_date_key;

-- Paso 2: Hacer spot_id nullable
ALTER TABLE public.bookings
ALTER COLUMN spot_id DROP NOT NULL;

-- Paso 3: Crear una nueva restricción UNIQUE que solo se aplique cuando spot_id no es NULL
-- Esto permite múltiples bookings sin spot_id para la misma fecha
-- pero mantiene la unicidad cuando spot_id está presente
CREATE UNIQUE INDEX IF NOT EXISTS bookings_spot_id_date_unique 
ON public.bookings(spot_id, date) 
WHERE spot_id IS NOT NULL;

-- Paso 4: Crear una restricción para evitar que un usuario tenga múltiples reservas
-- para la misma fecha (independientemente de si tiene spot_id o no)
CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_id_date_unique 
ON public.bookings(user_id, date) 
WHERE status != 'cancelled';

-- Paso 5: Comentarios para documentación
COMMENT ON COLUMN public.bookings.spot_id IS 'ID de la plaza asignada (NULL si no se asigna plaza específica en el nuevo paradigma)';

-- ============================================================
-- NOTAS:
-- ============================================================
-- - En el nuevo paradigma, los usuarios solicitan plaza para un día
--   sin asignar una plaza específica
-- - Cada día tiene un máximo de 8 plazas disponibles
-- - spot_id puede ser NULL para reservas del nuevo paradigma
-- - Un usuario solo puede tener una reserva activa por fecha
-- ============================================================
