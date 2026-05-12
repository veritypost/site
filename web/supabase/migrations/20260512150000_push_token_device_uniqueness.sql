-- user_push_tokens: switch uniqueness from (user_id, push_token) to (push_token).
--
-- Audit finding: APNs device tokens are per-device, not per-(user, device).
-- When a user signs out of account A and into account B on the same device,
-- the iOS app re-registers the same push_token under user_id B. The old
-- composite key let both rows coexist, so the next push fan-out delivered
-- to the device twice: once for A (stale) and once for B. Worse, the
-- "send to user A" path would still find the stale row and push to a
-- device that has signed out — a privacy leak.
--
-- This migration:
--   1) Dedupes existing rows so the new unique constraint can be added.
--   2) Drops the composite unique constraint.
--   3) Adds a unique constraint on push_token alone.
--   4) Rewrites upsert_user_push_token to ON CONFLICT (push_token) so
--      account switches transfer ownership atomically.
--
-- Steps 2-4 must ship in the SAME migration. If the constraint flips but
-- the RPC still says ON CONFLICT (user_id, push_token), every account
-- switch fails immediately afterward.
--
-- Note: user_push_tokens has no updated_at column. last_registered_at is
-- the equivalent recency signal (set to now() on every upsert) and is
-- what we partition by during dedupe.

BEGIN;

-- 1) Idempotent dedupe: when the same push_token appears under multiple
--    user_ids, keep the most recently registered row.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY push_token
      ORDER BY last_registered_at DESC NULLS LAST,
               created_at DESC NULLS LAST
    ) AS rn
    FROM public.user_push_tokens
)
DELETE FROM public.user_push_tokens t
 USING ranked r
 WHERE t.id = r.id
   AND r.rn > 1;

-- 2) Drop old composite unique constraint (verified name via pg_constraint).
ALTER TABLE public.user_push_tokens
  DROP CONSTRAINT user_push_tokens_user_id_push_token_key;

-- 3) Add new unique constraint on push_token alone.
ALTER TABLE public.user_push_tokens
  ADD CONSTRAINT user_push_tokens_token_key UNIQUE (push_token);

-- 4) Rewrite upsert_user_push_token to use the new conflict target.
--    Signature preserved exactly (pulled via pg_get_functiondef).
--    On conflict the row's user_id is reassigned to the new caller and
--    every metadata column is overwritten from the call (no COALESCE — a
--    re-registration is authoritative about the device's current state).
CREATE OR REPLACE FUNCTION public.upsert_user_push_token(
  p_provider text,
  p_token text,
  p_environment text DEFAULT NULL::text,
  p_device_name text DEFAULT NULL::text,
  p_platform text DEFAULT NULL::text,
  p_os_version text DEFAULT NULL::text,
  p_app_version text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_id uuid;
BEGIN
  IF public.is_kid_delegated() THEN
    RAISE EXCEPTION 'forbidden: kid token cannot invoke upsert_user_push_token' USING ERRCODE = '42501';
  END IF;
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
  ON CONFLICT (push_token) DO UPDATE SET
    user_id            = EXCLUDED.user_id,
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
$function$;

COMMIT;
