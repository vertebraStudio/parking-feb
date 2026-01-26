-- ============================================================
-- Script: Permitir que directivos liberen/ocupen su plaza
-- ============================================================
-- Este script permite que los directivos actualicen el campo
-- is_released de su propia plaza asignada.
--
-- INSTRUCCIONES:
-- 1. Abre el SQL Editor en Supabase
-- 2. Copia y pega TODO este script
-- 3. Ejecuta el script
-- 4. Verifica que no haya errores
-- 5. Recarga la aplicación
-- ============================================================

-- Paso 1: Asegurarse de que existe la política de admins (por si acaso)
DROP POLICY IF EXISTS "Admins can update parking spots" ON public.parking_spots;

CREATE POLICY "Admins can update parking spots"
    ON public.parking_spots FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Paso 2: Crear política para que directivos puedan actualizar su propia plaza
DROP POLICY IF EXISTS "Directivos can update own executive spot" ON public.parking_spots;

CREATE POLICY "Directivos can update own executive spot"
    ON public.parking_spots FOR UPDATE
    USING (
        is_executive = true
        AND assigned_to IS NOT NULL
        AND auth.uid() = assigned_to
    )
    WITH CHECK (
        is_executive = true
        AND assigned_to IS NOT NULL
        AND auth.uid() = assigned_to
    );

-- Paso 3: Verificar que las políticas se crearon correctamente
SELECT
    policyname as "Nombre de Política",
    cmd as "Comando",
    qual as "Condición USING",
    with_check as "Condición WITH CHECK"
FROM pg_policies
WHERE tablename = 'parking_spots'
    AND cmd = 'UPDATE'
ORDER BY policyname;

-- ============================================================
-- NOTA IMPORTANTE:
-- ============================================================
-- Esta política permite que un directivo actualice SOLO su
-- propia plaza asignada (donde assigned_to = su ID de usuario).
-- Solo puede actualizar plazas donde:
-- - is_executive = true
-- - assigned_to = auth.uid()
--
-- Esto permite que los directivos cambien is_released para
-- liberar/ocupar su plaza sin necesidad de ser admin.
-- ============================================================
