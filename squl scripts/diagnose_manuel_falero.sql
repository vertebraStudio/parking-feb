-- ============================================
-- Script de diagnóstico para Manuel Falero
-- ============================================

-- 1. Buscar todos los usuarios que contengan "manuel" o "falero"
SELECT 
    id,
    email,
    full_name,
    role,
    is_verified,
    created_at
FROM public.profiles
WHERE LOWER(full_name) LIKE '%manuel%'
   OR LOWER(full_name) LIKE '%falero%'
   OR LOWER(email) LIKE '%manuel%'
   OR LOWER(email) LIKE '%falero%'
ORDER BY full_name, email;

-- 2. Buscar todas las reservas para febrero 2025 y febrero 2026
SELECT 
    b.id,
    b.date,
    b.status,
    b.spot_id,
    p.full_name,
    p.email,
    b.created_at,
    b.updated_at
FROM public.bookings b
JOIN public.profiles p ON b.user_id = p.id
WHERE (LOWER(p.full_name) LIKE '%manuel%'
   OR LOWER(p.full_name) LIKE '%falero%'
   OR LOWER(p.email) LIKE '%manuel%'
   OR LOWER(p.email) LIKE '%falero%')
  AND (
    (b.date >= '2025-02-01' AND b.date <= '2025-02-28')
    OR (b.date >= '2026-02-01' AND b.date <= '2026-02-28')
  )
ORDER BY b.date DESC;

-- 3. Buscar específicamente reservas para el 16 de febrero (cualquier año)
SELECT 
    b.id,
    b.date,
    b.status,
    b.spot_id,
    p.full_name,
    p.email,
    p.id as user_id,
    b.created_at
FROM public.bookings b
JOIN public.profiles p ON b.user_id = p.id
WHERE (LOWER(p.full_name) LIKE '%manuel%'
   OR LOWER(p.full_name) LIKE '%falero%'
   OR LOWER(p.email) LIKE '%manuel%'
   OR LOWER(p.email) LIKE '%falero%')
  AND EXTRACT(DAY FROM b.date) = 16
  AND EXTRACT(MONTH FROM b.date) = 2
ORDER BY b.date DESC;
