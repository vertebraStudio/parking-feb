-- Script para corregir las políticas RLS que causan errores 500
-- Ejecuta este script en el SQL Editor de Supabase

-- 1. Eliminar políticas problemáticas que usan subconsultas
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can create all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can delete all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Verified users can create own bookings" ON public.bookings;

-- 2. Crear función helper para verificar si el usuario es admin (más eficiente)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear función helper para verificar si el usuario está verificado
CREATE OR REPLACE FUNCTION public.is_verified()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_verified = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recrear políticas de profiles sin subconsultas problemáticas
-- Los usuarios pueden ver su propio perfil (ya existe, pero la recreamos por si acaso)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Los admins pueden ver todos los perfiles (usando la función helper)
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_admin());

-- Los usuarios pueden editar su propio perfil (ya existe)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Los admins pueden editar todos los perfiles
CREATE POLICY "Admins can update all profiles"
    ON public.profiles FOR UPDATE
    USING (public.is_admin());

-- 5. Recrear políticas de bookings
-- Usuarios autenticados pueden ver todas las reservas
DROP POLICY IF EXISTS "Users can view all bookings" ON public.bookings;
CREATE POLICY "Users can view all bookings"
    ON public.bookings FOR SELECT
    USING (auth.role() = 'authenticated');

-- Usuarios verificados pueden crear sus propias reservas
CREATE POLICY "Verified users can create own bookings"
    ON public.bookings FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        public.is_verified()
    );

-- Usuarios pueden editar sus propias reservas
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
    ON public.bookings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Usuarios pueden borrar sus propias reservas
DROP POLICY IF EXISTS "Users can delete own bookings" ON public.bookings;
CREATE POLICY "Users can delete own bookings"
    ON public.bookings FOR DELETE
    USING (auth.uid() = user_id);

-- Admins pueden ver todas las reservas
CREATE POLICY "Admins can view all bookings"
    ON public.bookings FOR SELECT
    USING (public.is_admin());

-- Admins pueden crear reservas
CREATE POLICY "Admins can create all bookings"
    ON public.bookings FOR INSERT
    WITH CHECK (public.is_admin());

-- Admins pueden actualizar todas las reservas
CREATE POLICY "Admins can update all bookings"
    ON public.bookings FOR UPDATE
    USING (public.is_admin());

-- Admins pueden borrar todas las reservas
CREATE POLICY "Admins can delete all bookings"
    ON public.bookings FOR DELETE
    USING (public.is_admin());
