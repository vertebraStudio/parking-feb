-- ============================================
-- Tabla para bloqueos de plazas por fecha
-- ============================================

-- Crear tabla spot_blocks
CREATE TABLE IF NOT EXISTS public.spot_blocks (
    id SERIAL PRIMARY KEY,
    spot_id INTEGER NOT NULL REFERENCES public.parking_spots(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Evitar bloqueos duplicados para el mismo spot y fecha
    UNIQUE(spot_id, date)
);

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_spot_blocks_date ON public.spot_blocks(date);
CREATE INDEX IF NOT EXISTS idx_spot_blocks_spot_id ON public.spot_blocks(spot_id);
CREATE INDEX IF NOT EXISTS idx_spot_blocks_spot_date ON public.spot_blocks(spot_id, date);

-- Trigger para actualizar updated_at (aunque no tenemos updated_at, lo dejamos para consistencia)
-- No aplicable aquí ya que no hay updated_at

-- Políticas RLS para spot_blocks
ALTER TABLE public.spot_blocks ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Authenticated users can view spot blocks" ON public.spot_blocks;
DROP POLICY IF EXISTS "Admins can create spot blocks" ON public.spot_blocks;
DROP POLICY IF EXISTS "Admins can delete spot blocks" ON public.spot_blocks;

-- Todos los usuarios autenticados pueden ver los bloqueos
CREATE POLICY "Authenticated users can view spot blocks"
    ON public.spot_blocks FOR SELECT
    USING (auth.role() = 'authenticated');

-- Solo los admins pueden crear bloqueos
CREATE POLICY "Admins can create spot blocks"
    ON public.spot_blocks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Solo los admins pueden eliminar bloqueos
CREATE POLICY "Admins can delete spot blocks"
    ON public.spot_blocks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Comentarios
COMMENT ON TABLE public.spot_blocks IS 'Bloqueos de plazas por fecha para mantenimiento';
COMMENT ON COLUMN public.spot_blocks.spot_id IS 'ID de la plaza bloqueada';
COMMENT ON COLUMN public.spot_blocks.date IS 'Fecha para la cual la plaza está bloqueada';
COMMENT ON COLUMN public.spot_blocks.created_by IS 'ID del admin que creó el bloqueo';
