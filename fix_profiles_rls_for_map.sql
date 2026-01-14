-- Script para corregir las políticas RLS de profiles y permitir que todos los usuarios autenticados
-- puedan ver los perfiles de otros usuarios (necesario para mostrar nombres en el mapa)
-- Ejecuta este script en el SQL Editor de Supabase

-- 1. Eliminar todas las políticas SELECT existentes de profiles para recrearlas correctamente
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles for map" ON public.profiles;

-- 2. Recrear las políticas SELECT en el orden correcto
-- IMPORTANTE: En Supabase, las políticas se evalúan con OR, así que si una es verdadera, se permite el acceso

-- Política 1: Los usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Política 2: Los admins pueden ver todos los perfiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

-- Política 3: Todos los usuarios autenticados pueden ver todos los perfiles
-- (necesario para mostrar nombres en el mapa de plazas)
CREATE POLICY "Authenticated users can view profiles for map"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- 3. Verificar que las políticas se crearon correctamente
-- Ejecuta esta consulta para verificar:
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'SELECT';

-- Nota: Con estas tres políticas, cualquier usuario autenticado podrá:
-- - Ver su propio perfil (política 1)
-- - Si es admin, ver todos los perfiles (política 2)
-- - Ver todos los perfiles para mostrar nombres en el mapa (política 3)
