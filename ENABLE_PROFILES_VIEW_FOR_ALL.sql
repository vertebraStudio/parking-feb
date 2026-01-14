-- ============================================================
-- SCRIPT CRÍTICO: Permitir que todos los usuarios vean perfiles
-- ============================================================
-- Este script es NECESARIO para que los usuarios normales puedan ver
-- los nombres de otros usuarios en el mapa de plazas.
--
-- INSTRUCCIONES:
-- 1. Abre el SQL Editor en Supabase
-- 2. Copia y pega TODO este script
-- 3. Ejecuta el script
-- 4. Verifica que no haya errores
-- 5. Recarga la aplicación
-- ============================================================

-- Paso 1: Crear o reemplazar la función is_admin si no existe
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Paso 2: Eliminar TODAS las políticas SELECT existentes de profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles for map" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- Paso 3: Crear la política que permite a TODOS los usuarios autenticados ver TODOS los perfiles
-- Esta es la política más permisiva y es necesaria para mostrar nombres en el mapa
CREATE POLICY "All authenticated users can view all profiles"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- Paso 4: Verificar que la política se creó correctamente
-- (La verificación se hace en el paso 5 con la consulta SELECT)

-- Paso 5: Ver todas las políticas SELECT de profiles (para verificación)
SELECT 
  policyname as "Nombre de Política",
  cmd as "Comando",
  qual as "Condición"
FROM pg_policies 
WHERE tablename = 'profiles' 
  AND cmd = 'SELECT'
ORDER BY policyname;

-- ============================================================
-- NOTA IMPORTANTE:
-- ============================================================
-- Esta política permite que CUALQUIER usuario autenticado vea
-- TODOS los perfiles. Esto es necesario para mostrar los nombres
-- de los usuarios que han reservado plazas en el mapa.
--
-- Si necesitas más seguridad, podrías crear una vista o función
-- que solo exponga los campos necesarios (full_name, email) en
-- lugar de todos los campos del perfil.
-- ============================================================
