-- ============================================
-- Agregar funcionalidad de carpooling (ir juntos en coche)
-- ============================================

-- Agregar campo para referenciar con quién vas en coche
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS carpool_with_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_bookings_carpool_with_user_id ON public.bookings(carpool_with_user_id);

-- Comentario
COMMENT ON COLUMN public.bookings.carpool_with_user_id IS 'ID del usuario con el que va en coche (carpooling). NULL si no va con nadie.';
