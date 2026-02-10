-- ============================================
-- Permitir borrar perfiles (profiles) con RLS
-- ============================================
-- Ejecuta este script en el SQL Editor de Supabase.
-- Deja RLS activado pero añade las políticas necesarias
-- para poder borrar usuarios desde la app (tanto el propio
-- usuario como un admin).

-- 1. Eliminar políticas anteriores de DELETE si existen
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete all profiles" ON public.profiles;

-- 2. Permitir que cada usuario pueda borrar su propio perfil
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);

-- 3. Permitir que los admins puedan borrar cualquier perfil
--    (necesario para poder borrar solicitudes desde el panel
--    de administración y desde la ficha de perfil)
CREATE POLICY "Admins can delete all profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- Nota:
-- - Este script asume que ya existe la función public.is_admin()
--   creada por el script fix_rls_policies.sql o supabase_setup.sql.
-- - Después de ejecutar este script, las operaciones de borrado de
--   perfiles hechas desde la app deberían dejar de fallar por RLS.

