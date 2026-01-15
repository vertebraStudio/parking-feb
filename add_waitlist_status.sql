-- ============================================
-- Agregar estado 'waitlist' al enum booking_status
-- ============================================

-- Agregar 'waitlist' al enum booking_status
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'waitlist';

-- Comentario actualizado
COMMENT ON COLUMN public.bookings.status IS 'Estado de la reserva: confirmed, pending, cancelled, o waitlist';
