-- ============================================
-- Notificaciones in-app + tokens push (FCM)
-- Parking Management App - Supabase
-- ============================================

-- UUID helper (gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Tabla de tokens FCM (PWA)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at timestamptz
);

-- Evitar duplicados del mismo token
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique ON public.push_tokens(token);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Policies: el usuario gestiona solo sus tokens
DROP POLICY IF EXISTS "Users can select own push tokens" ON public.push_tokens;
CREATE POLICY "Users can select own push tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_tokens;
CREATE POLICY "Users can insert own push tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_tokens;
CREATE POLICY "Users can update own push tokens"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_tokens;
CREATE POLICY "Users can delete own push tokens"
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.push_tokens IS 'Tokens de push (FCM) por usuario para PWA.';

-- 2) Tabla de notificaciones in-app
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies: el usuario ve y marca como leídas sus notificaciones
DROP POLICY IF EXISTS "Users can select own notifications" ON public.notifications;
CREATE POLICY "Users can select own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Inserts: intencionadamente sin policy (se harán con service_role / Edge Function)

COMMENT ON TABLE public.notifications IS 'Notificaciones in-app del usuario (fuente de verdad).';
COMMENT ON COLUMN public.notifications.type IS 'Tipo de notificación, e.g. booking_confirmed';

