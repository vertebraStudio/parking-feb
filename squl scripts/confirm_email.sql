-- Script para confirmar el email de un usuario manualmente
-- Ejecuta este script en el SQL Editor de Supabase

-- Confirmar el email del usuario dortiz@feb.es
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'dortiz@feb.es';

-- Verificar que se confirmó correctamente
SELECT 
    id, 
    email, 
    email_confirmed_at,
    created_at
FROM auth.users
WHERE email = 'dortiz@feb.es';
