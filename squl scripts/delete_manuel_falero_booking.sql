-- ============================================
-- Script para eliminar la reserva de Manuel Falero
-- para el lunes 16 de febrero
-- ============================================

-- Primero, buscar el usuario Manuel Falero
-- (puede estar en full_name o email)
DO $$
DECLARE
    v_user_id UUID;
    v_booking_id INTEGER;
    v_date_to_delete DATE := '2025-02-16'; -- Lunes 16 de febrero de 2025
BEGIN
    -- Buscar el usuario por nombre (case insensitive)
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE LOWER(full_name) LIKE '%manuel%falero%'
       OR LOWER(full_name) LIKE '%falero%manuel%'
       OR LOWER(email) LIKE '%manuel%falero%'
       OR LOWER(email) LIKE '%falero%manuel%'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'No se encontró el usuario Manuel Falero';
        RETURN;
    END IF;

    RAISE NOTICE 'Usuario encontrado: %', v_user_id;

    -- Buscar la reserva para el 16 de febrero
    SELECT id INTO v_booking_id
    FROM public.bookings
    WHERE user_id = v_user_id
      AND date = v_date_to_delete
      AND status != 'cancelled'
    LIMIT 1;

    IF v_booking_id IS NULL THEN
        RAISE NOTICE 'No se encontró una reserva activa para Manuel Falero el %', v_date_to_delete;
        RETURN;
    END IF;

    RAISE NOTICE 'Reserva encontrada: %', v_booking_id;

    -- Eliminar relaciones de carpooling primero
    DELETE FROM public.booking_carpool_users
    WHERE booking_id = v_booking_id;

    RAISE NOTICE 'Relaciones de carpooling eliminadas';

    -- Eliminar la reserva
    DELETE FROM public.bookings
    WHERE id = v_booking_id;

    RAISE NOTICE 'Reserva eliminada exitosamente: %', v_booking_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error al eliminar la reserva: %', SQLERRM;
END $$;

-- Verificación: mostrar todas las reservas de Manuel Falero para febrero 2025
SELECT 
    b.id,
    b.date,
    b.status,
    p.full_name,
    p.email,
    b.created_at
FROM public.bookings b
JOIN public.profiles p ON b.user_id = p.id
WHERE (LOWER(p.full_name) LIKE '%manuel%falero%'
   OR LOWER(p.full_name) LIKE '%falero%manuel%'
   OR LOWER(p.email) LIKE '%manuel%falero%'
   OR LOWER(p.email) LIKE '%falero%manuel%')
  AND b.date >= '2025-02-01'
  AND b.date <= '2025-02-28'
ORDER BY b.date;
