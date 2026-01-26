-- ============================================
-- Corregir políticas RLS para push_tokens
-- Asegurar que funcionen correctamente con upsert
-- ============================================

-- Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "Users can select own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_tokens;

-- Recrear políticas con verificaciones más explícitas
-- SELECT: usuarios pueden ver sus propios tokens
CREATE POLICY "Users can select own push tokens"
  ON public.push_tokens FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    auth.uid() = user_id
  );

-- INSERT: usuarios pueden insertar sus propios tokens
CREATE POLICY "Users can insert own push tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    auth.uid() = user_id
  );

-- UPDATE: usuarios pueden actualizar sus propios tokens
-- IMPORTANTE: Para upsert, necesitamos verificar tanto USING como WITH CHECK
CREATE POLICY "Users can update own push tokens"
  ON public.push_tokens FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND
    auth.uid() = user_id
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    auth.uid() = user_id
  );

-- DELETE: usuarios pueden borrar sus propios tokens
CREATE POLICY "Users can delete own push tokens"
  ON public.push_tokens FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND
    auth.uid() = user_id
  );

COMMENT ON TABLE public.push_tokens IS 'Tokens de push (FCM) por usuario para PWA.';
