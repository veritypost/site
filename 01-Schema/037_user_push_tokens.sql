-- 037_user_push_tokens.sql
-- Dedicated push-token registry. The schema's original design routed tokens
-- through public.sessions via register_push_token(), but nothing populates
-- public.sessions from app code. This table is the source of truth for push
-- delivery. Existing public.sessions + register_push_token are left alone.
--
-- Providers: 'apns' (iOS), 'fcm' (Android/Web), 'web_push' (VAPID), 'expo'.
-- For 'apns', environment='production' hits api.push.apple.com and
-- environment='sandbox' hits api.sandbox.push.apple.com.

BEGIN;

CREATE TABLE IF NOT EXISTS "user_push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL,
  "push_token" text NOT NULL,
  "environment" varchar(20),
  "device_name" varchar(200),
  "platform" varchar(20),
  "os_version" varchar(50),
  "app_version" varchar(30),
  "last_registered_at" timestamptz NOT NULL DEFAULT now(),
  "invalidated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "push_token")
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_active_user
  ON "user_push_tokens" ("user_id", "provider")
  WHERE invalidated_at IS NULL;

ALTER TABLE "user_push_tokens" ENABLE ROW LEVEL SECURITY;

-- Users can read their own token rows (for "see my registered devices" UIs);
-- writes go through SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS "user_push_tokens_select_own" ON "user_push_tokens";
CREATE POLICY "user_push_tokens_select_own" ON "user_push_tokens"
  FOR SELECT USING (auth.uid() = user_id);


-- ------------------------------------------------------------
-- upsert_user_push_token
-- Call from the authenticated client. Uses auth.uid() as the owner.
-- Idempotent on (user_id, push_token) — updates metadata + re-activates
-- a row previously invalidated.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_user_push_token(
  p_provider      text,
  p_token         text,
  p_environment   text DEFAULT NULL,
  p_device_name   text DEFAULT NULL,
  p_platform      text DEFAULT NULL,
  p_os_version    text DEFAULT NULL,
  p_app_version   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_provider NOT IN ('apns','fcm','web_push','expo') THEN
    RAISE EXCEPTION 'invalid provider: %', p_provider;
  END IF;
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RAISE EXCEPTION 'token required';
  END IF;

  INSERT INTO user_push_tokens
    (user_id, provider, push_token, environment,
     device_name, platform, os_version, app_version,
     last_registered_at, invalidated_at)
  VALUES
    (v_user_id, p_provider, p_token, p_environment,
     p_device_name, p_platform, p_os_version, p_app_version,
     now(), NULL)
  ON CONFLICT (user_id, push_token) DO UPDATE SET
    provider           = EXCLUDED.provider,
    environment        = COALESCE(EXCLUDED.environment, user_push_tokens.environment),
    device_name        = COALESCE(EXCLUDED.device_name, user_push_tokens.device_name),
    platform           = COALESCE(EXCLUDED.platform, user_push_tokens.platform),
    os_version         = COALESCE(EXCLUDED.os_version, user_push_tokens.os_version),
    app_version        = COALESCE(EXCLUDED.app_version, user_push_tokens.app_version),
    last_registered_at = now(),
    invalidated_at     = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_push_token(text, text, text, text, text, text, text)
  TO authenticated;


-- ------------------------------------------------------------
-- invalidate_user_push_token
-- Called by the iOS app on sign-out, or by server-side push delivery when
-- APNs returns 410 / BadDeviceToken / Unregistered. Idempotent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invalidate_user_push_token(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NOT NULL THEN
    -- Authenticated caller: only their own tokens.
    UPDATE user_push_tokens
       SET invalidated_at = now()
     WHERE push_token = p_token
       AND user_id = v_user_id
       AND invalidated_at IS NULL;
    RETURN FOUND;
  END IF;
  -- Service-role caller (auth.uid() IS NULL): any token, no user filter.
  UPDATE user_push_tokens
     SET invalidated_at = now()
   WHERE push_token = p_token
     AND invalidated_at IS NULL;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invalidate_user_push_token(text)
  TO authenticated, service_role;

COMMIT;

-- Verify (manual):
-- SELECT pg_get_functiondef('public.upsert_user_push_token(text,text,text,text,text,text,text)'::regprocedure);
-- SELECT pg_get_functiondef('public.invalidate_user_push_token(text)'::regprocedure);
