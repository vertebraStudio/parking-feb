-- Script para hacer admin a un usuario específico
-- Ejecuta este script en el SQL Editor de Supabase

-- Actualizar el rol del usuario dortiz@feb.es a admin y verificarlo
UPDATE public.profiles
SET 
    role = 'admin',
    is_verified = true
WHERE email = 'dortiz@feb.es';

-- Verificar que se actualizó correctamente
SELECT id, email, full_name, role, is_verified, created_at
FROM public.profiles
WHERE email = 'dortiz@feb.es';

-- Si el usuario no existe, mostrar mensaje
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'dortiz@feb.es') THEN
        RAISE NOTICE 'Usuario dortiz@feb.es no encontrado. Asegúrate de que el usuario se haya registrado primero.';
    ELSE
        RAISE NOTICE 'Usuario dortiz@feb.es actualizado a admin correctamente.';
    END IF;
END $$;
