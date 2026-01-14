-- Script para verificar y corregir políticas RLS
-- Ejecuta este script en el SQL Editor de Supabase si tienes errores 500

-- 1. Verificar que RLS está habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'parking_spots', 'bookings');

-- 2. Verificar políticas existentes para profiles
SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- 3. Verificar políticas existentes para bookings
SELECT * FROM pg_policies WHERE tablename = 'bookings';

-- 4. Si las políticas no existen o hay problemas, ejecuta el script supabase_setup.sql completo
-- O ejecuta estas políticas específicas:

-- Asegurar que los usuarios pueden ver su propio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Asegurar que los usuarios autenticados pueden ver todas las reservas
DROP POLICY IF EXISTS "Users can view all bookings" ON public.bookings;
CREATE POLICY "Users can view all bookings"
    ON public.bookings FOR SELECT
    USING (auth.role() = 'authenticated');

-- Verificar que el usuario actual puede ver su perfil
-- Reemplaza 'TU_USER_ID' con tu UUID de usuario
SELECT id, email, role, is_verified 
FROM public.profiles 
WHERE id = auth.uid();
