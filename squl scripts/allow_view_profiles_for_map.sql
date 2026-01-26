-- Script para permitir que todos los usuarios autenticados puedan ver los perfiles de otros usuarios
-- Esto es necesario para mostrar los nombres de los usuarios que han reservado plazas en el mapa
-- Ejecuta este script en el SQL Editor de Supabase

-- Primero, eliminar la política si ya existe (para poder recrearla)
DROP POLICY IF EXISTS "Authenticated users can view profiles for map" ON public.profiles;

-- Agregar política para que usuarios autenticados puedan ver perfiles de otros usuarios
-- (solo para mostrar nombres en el mapa de plazas)
-- Esta política se combina con las existentes usando OR, permitiendo que:
-- 1. Los usuarios vean su propio perfil (política existente)
-- 2. Los admins vean todos los perfiles (política existente)
-- 3. Todos los usuarios autenticados vean todos los perfiles (esta nueva política)
CREATE POLICY "Authenticated users can view profiles for map"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- Nota: Esta política permite a todos los usuarios autenticados ver todos los perfiles
-- Si quieres más seguridad, podrías limitar a solo ciertos campos usando una vista o función,
-- pero para mostrar nombres en el mapa esto es suficiente.

-- Verificar que la política se creó correctamente:
-- SELECT * FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Authenticated users can view profiles for map';
