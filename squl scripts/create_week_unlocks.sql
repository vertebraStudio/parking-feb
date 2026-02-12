-- ============================================
-- Tabla para desbloqueo de semanas de reservas
-- ============================================

-- Crear tabla week_unlocks
CREATE TABLE IF NOT EXISTS public.week_unlocks (
    id SERIAL PRIMARY KEY,
    week_monday DATE NOT NULL, -- Lunes de la semana desbloqueada (YYYY-MM-DD)
    unlocked_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Evitar semanas duplicadas
    UNIQUE(week_monday)
);

-- Crear índice para búsquedas rápidas por fecha
CREATE INDEX IF NOT EXISTS idx_week_unlocks_week_monday ON public.week_unlocks(week_monday);

-- Políticas RLS para week_unlocks
ALTER TABLE public.week_unlocks ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Authenticated users can view week unlocks" ON public.week_unlocks;
DROP POLICY IF EXISTS "Admins can create week unlocks" ON public.week_unlocks;
DROP POLICY IF EXISTS "Admins can delete week unlocks" ON public.week_unlocks;

-- Todos los usuarios autenticados pueden ver qué semanas están desbloqueadas
CREATE POLICY "Authenticated users can view week unlocks"
    ON public.week_unlocks FOR SELECT
    USING (auth.role() = 'authenticated');

-- Solo los admins pueden desbloquear semanas
CREATE POLICY "Admins can create week unlocks"
    ON public.week_unlocks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Solo los admins pueden bloquear semanas (eliminar desbloqueo)
CREATE POLICY "Admins can delete week unlocks"
    ON public.week_unlocks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Comentarios
COMMENT ON TABLE public.week_unlocks IS 'Semanas desbloqueadas para permitir reservas';
COMMENT ON COLUMN public.week_unlocks.week_monday IS 'Lunes de la semana desbloqueada (YYYY-MM-DD)';
COMMENT ON COLUMN public.week_unlocks.unlocked_by IS 'ID del admin que desbloqueó la semana';

-- Insertar la semana actual como desbloqueada por defecto
-- Nota: Esto se ejecutará solo si no existe ya una entrada para esta semana
INSERT INTO public.week_unlocks (week_monday, unlocked_by)
SELECT 
    DATE_TRUNC('week', CURRENT_DATE)::DATE + INTERVAL '1 day' AS week_monday, -- Lunes de esta semana
    (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1) AS unlocked_by
WHERE NOT EXISTS (
    SELECT 1 FROM public.week_unlocks 
    WHERE week_monday = DATE_TRUNC('week', CURRENT_DATE)::DATE + INTERVAL '1 day'
);
