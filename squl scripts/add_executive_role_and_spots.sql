-- ============================================================
-- Script para agregar rol Directivo y plazas de directivos
-- ============================================================
-- Este script:
-- 1. Agrega el rol 'directivo' a la tabla profiles
-- 2. Agrega campos a parking_spots para plazas de directivos
-- 3. Crea 8 nuevas plazas para directivos (D1-D8)
-- ============================================================

-- Paso 1: Actualizar la tabla profiles para permitir el rol 'directivo'
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'user', 'directivo'));

-- Paso 2: Agregar campos a parking_spots para plazas de directivos
ALTER TABLE public.parking_spots
ADD COLUMN IF NOT EXISTS is_executive BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.parking_spots
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.parking_spots
ADD COLUMN IF NOT EXISTS is_released BOOLEAN NOT NULL DEFAULT false;

-- Paso 3: Crear 8 nuevas plazas para directivos (D1 a D8)
-- Estas plazas tendrán IDs del 9 al 16
INSERT INTO public.parking_spots (id, label, is_blocked, is_executive, assigned_to, is_released) VALUES
    (9, 'Plaza D1', false, true, NULL, false),
    (10, 'Plaza D2', false, true, NULL, false),
    (11, 'Plaza D3', false, true, NULL, false),
    (12, 'Plaza D4', false, true, NULL, false),
    (13, 'Plaza D5', false, true, NULL, false),
    (14, 'Plaza D6', false, true, NULL, false),
    (15, 'Plaza D7', false, true, NULL, false),
    (16, 'Plaza D8', false, true, NULL, false)
ON CONFLICT (id) DO UPDATE SET
    is_executive = EXCLUDED.is_executive,
    label = EXCLUDED.label;

-- Paso 4: Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_parking_spots_is_executive ON public.parking_spots(is_executive);
CREATE INDEX IF NOT EXISTS idx_parking_spots_assigned_to ON public.parking_spots(assigned_to);
CREATE INDEX IF NOT EXISTS idx_parking_spots_is_released ON public.parking_spots(is_released);

-- Paso 5: Comentarios para documentación
COMMENT ON COLUMN public.parking_spots.is_executive IS 'Indica si es una plaza asignada a directivos';
COMMENT ON COLUMN public.parking_spots.assigned_to IS 'ID del directivo asignado a esta plaza (NULL si no está asignada)';
COMMENT ON COLUMN public.parking_spots.is_released IS 'Indica si la plaza de directivo está liberada y disponible para reservas temporales';

-- ============================================================
-- NOTAS:
-- ============================================================
-- - Las plazas de directivos (D1-D8) tienen is_executive = true
-- - assigned_to indica qué directivo tiene la plaza asignada
-- - is_released indica si el directivo ha liberado su plaza
-- - Cuando is_released = true, otros usuarios pueden reservar la plaza temporalmente
-- - Los directivos pueden liberar/ocupar su plaza desde la interfaz
-- ============================================================
