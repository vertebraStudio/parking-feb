-- ============================================
-- Script ROBUSTO para eliminar la reserva de Manuel Falero
-- para el lunes 16 de febrero (cualquier año)
-- ============================================

-- Este script elimina TODAS las reservas de Manuel Falero para el 16 de febrero
-- sin importar el año o el estado

DO $$
DECLARE
    v_user_id UUID;
    v_booking_ids INTEGER[];
    v_deleted_count INTEGER := 0;
BEGIN
    -- Buscar el usuario por nombre (case insensitive, más flexible)
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE (
        LOWER(COALESCE(full_name, '')) LIKE '%manuel%falero%'
        OR LOWER(COALESCE(full_name, '')) LIKE '%falero%manuel%'
        OR LOWER(COALESCE(full_name, '')) LIKE '%manuel%' AND LOWER(COALESCE(full_name, '')) LIKE '%falero%'
        OR LOWER(email) LIKE '%manuel%falero%'
        OR LOWER(email) LIKE '%falero%manuel%'
    )
    ORDER BY 
        CASE 
            WHEN LOWER(COALESCE(full_name, '')) LIKE '%manuel%falero%' THEN 1
            WHEN LOWER(COALESCE(full_name, '')) LIKE '%falero%manuel%' THEN 2
            ELSE 3
        END
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE '❌ No se encontró el usuario Manuel Falero';
        RAISE NOTICE 'Ejecuta el script diagnose_manuel_falero.sql para ver todos los usuarios disponibles';
        RETURN;
    END IF;

    RAISE NOTICE '✅ Usuario encontrado: %', v_user_id;

    -- Buscar TODAS las reservas para el 16 de febrero (cualquier año, cualquier estado)
    SELECT ARRAY_AGG(id) INTO v_booking_ids
    FROM public.bookings
    WHERE user_id = v_user_id
      AND EXTRACT(DAY FROM date) = 16
      AND EXTRACT(MONTH FROM date) = 2;

    IF v_booking_ids IS NULL OR array_length(v_booking_ids, 1) IS NULL THEN
        RAISE NOTICE '❌ No se encontraron reservas para el 16 de febrero';
        RETURN;
    END IF;

    RAISE NOTICE '✅ Reservas encontradas: %', array_to_string(v_booking_ids, ', ');

    -- Eliminar relaciones de carpooling primero
    DELETE FROM public.booking_carpool_users
    WHERE booking_id = ANY(v_booking_ids);

    RAISE NOTICE '✅ Relaciones de carpooling eliminadas';

    -- Eliminar TODAS las reservas encontradas (sin importar el estado)
    DELETE FROM public.bookings
    WHERE id = ANY(v_booking_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE '✅ % reserva(s) eliminada(s) exitosamente', v_deleted_count;
    RAISE NOTICE '   IDs eliminados: %', array_to_string(v_booking_ids, ', ');

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error al eliminar la reserva: %', SQLERRM;
        RAISE NOTICE '   Código de error: %', SQLSTATE;
END $$;

-- Verificación final: mostrar todas las reservas restantes de Manuel Falero
SELECT 
    b.id,
    b.date,
    b.status,
    p.full_name,
    p.email,
    b.created_at
FROM public.bookings b
JOIN public.profiles p ON b.user_id = p.id
WHERE (LOWER(COALESCE(p.full_name, '')) LIKE '%manuel%'
   OR LOWER(COALESCE(p.full_name, '')) LIKE '%falero%'
   OR LOWER(p.email) LIKE '%manuel%'
   OR LOWER(p.email) LIKE '%falero%')
ORDER BY b.date DESC
LIMIT 20;
