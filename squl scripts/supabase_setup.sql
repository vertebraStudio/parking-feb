-- ============================================
-- Script de configuración de base de datos
-- Parking Management App - Supabase
-- ============================================

-- 1. Crear tipo ENUM para el status de bookings (solo si no existe)
DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM ('confirmed', 'pending', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Crear tabla profiles vinculada a auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Crear tabla parking_spots
CREATE TABLE IF NOT EXISTS public.parking_spots (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Insertar los 8 registros predefinidos de parking_spots
INSERT INTO public.parking_spots (id, label, is_blocked) VALUES
    (1, 'Plaza 1', false),
    (2, 'Plaza 2', false),
    (3, 'Plaza 3', false),
    (4, 'Plaza 4', false),
    (5, 'Plaza 5', false),
    (6, 'Plaza 6', false),
    (7, 'Plaza 7', false),
    (8, 'Plaza 8', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Crear tabla bookings
CREATE TABLE IF NOT EXISTS public.bookings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    spot_id INTEGER NOT NULL REFERENCES public.parking_spots(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    status booking_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Evitar reservas duplicadas para el mismo spot y fecha
    UNIQUE(spot_id, date)
);

-- 6. Crear índices para búsquedas rápidas por fecha
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_spot_id ON public.bookings(spot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON public.bookings(date, status);

-- 7. Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Triggers para actualizar updated_at
DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parking_spots ON public.parking_spots;
CREATE TRIGGER set_updated_at_parking_spots
    BEFORE UPDATE ON public.parking_spots
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_bookings ON public.bookings;
CREATE TRIGGER set_updated_at_bookings
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 9. Función para crear perfil automáticamente cuando se crea un usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, is_verified)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
        false
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Trigger para crear perfil automáticamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 11. Habilitar Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- 12. Políticas RLS para profiles
-- Eliminar políticas existentes si existen (para permitir re-ejecutar el script)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Los usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Los usuarios pueden editar su propio perfil
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Los admins pueden ver todos los perfiles (para validarlos)
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Los admins pueden editar todos los perfiles (para validarlos)
CREATE POLICY "Admins can update all profiles"
    ON public.profiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 13. Políticas RLS para parking_spots
-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Authenticated users can view parking spots" ON public.parking_spots;
DROP POLICY IF EXISTS "Admins can update parking spots" ON public.parking_spots;

-- Todos los usuarios autenticados pueden ver las plazas
CREATE POLICY "Authenticated users can view parking spots"
    ON public.parking_spots FOR SELECT
    USING (auth.role() = 'authenticated');

-- Solo los admins pueden actualizar las plazas (bloquear/desbloquear)
CREATE POLICY "Admins can update parking spots"
    ON public.parking_spots FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 14. Políticas RLS para bookings
-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Users can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Verified users can create own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can delete own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can create all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can delete all bookings" ON public.bookings;

-- Usuarios: Pueden ver todas las reservas (para saber qué plaza está ocupada)
CREATE POLICY "Users can view all bookings"
    ON public.bookings FOR SELECT
    USING (auth.role() = 'authenticated');

-- Usuarios: Solo pueden crear reservas si su perfil está verificado
CREATE POLICY "Verified users can create own bookings"
    ON public.bookings FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_verified = true
        )
    );

-- Usuarios: Solo pueden editar sus propias reservas
CREATE POLICY "Users can update own bookings"
    ON public.bookings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Usuarios: Solo pueden borrar sus propias reservas
CREATE POLICY "Users can delete own bookings"
    ON public.bookings FOR DELETE
    USING (auth.uid() = user_id);

-- Admins: Control total - pueden ver todas las reservas
CREATE POLICY "Admins can view all bookings"
    ON public.bookings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins: Control total - pueden crear reservas
CREATE POLICY "Admins can create all bookings"
    ON public.bookings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins: Control total - pueden actualizar todas las reservas
CREATE POLICY "Admins can update all bookings"
    ON public.bookings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins: Control total - pueden borrar todas las reservas
CREATE POLICY "Admins can delete all bookings"
    ON public.bookings FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================
-- Comentarios para documentación
-- ============================================
COMMENT ON TABLE public.profiles IS 'Perfiles de usuario vinculados a auth.users';
COMMENT ON TABLE public.parking_spots IS 'Plazas de parking disponibles (8 plazas fijas)';
COMMENT ON TABLE public.bookings IS 'Reservas de parking de los usuarios';
COMMENT ON COLUMN public.profiles.role IS 'Rol del usuario: admin o user (default: user)';
COMMENT ON COLUMN public.profiles.is_verified IS 'Indica si el usuario ha sido verificado por un admin';
COMMENT ON COLUMN public.parking_spots.is_blocked IS 'Indica si la plaza está bloqueada por mantenimiento';
COMMENT ON COLUMN public.bookings.status IS 'Estado de la reserva: confirmed, pending, o cancelled';
