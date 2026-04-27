-- =====================================================================
-- 2026-04-26_beta_cohort_referrals.sql
-- Beta cohort + referral system: schema, RLS lockdown, functions, sweeper
-- =====================================================================
-- Schema deltas already applied in prior sessions (verified via MCP probe):
--   users.cohort, users.cohort_joined_at, users.comped_until        (exist)
--   access_codes.owner_user_id, access_codes.slot, access_codes.disabled_at (exist)
--   access_codes_type_check includes 'referral'                      (exists)
--   access_codes_referral_shape (referral => owner+slot non-null)    (exists)
--   access_codes_slot_check (slot in {1,2})                          (exists)
--   uq_access_codes_referral_owner_slot partial UNIQUE               (exists)
--   settings rows: signup_cohort=beta, beta_active=true,
--                  beta_grace_days=14, beta_cap=0                    (seeded)
--
-- This migration adds:
--   A. users.verify_locked_at + indexes
--   B. access_codes.tier ('owner' | 'user') with shape constraint update
--   C. access_code_uses table (provenance ledger)
--   D. compute_effective_perms patched for verify_locked_at lockout
--   E. users protect-columns trigger (closes F-013-class self-escalation)
--   F. Functions: apply_signup_cohort, mint_referral_codes,
--      mint_owner_referral_link, redeem_referral, grant_pro_to_cohort,
--      sweep_beta_expirations, complete_email_verification,
--      generate_referral_slug
--   G. Privilege lockdown (REVOKE EXECUTE on privileged fns)
-- =====================================================================

BEGIN;

-- =====================================================================
-- A. users.verify_locked_at + indexes
-- =====================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verify_locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_verify_locked_at
  ON public.users(verify_locked_at)
  WHERE verify_locked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_comped_until
  ON public.users(comped_until)
  WHERE comped_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_cohort
  ON public.users(cohort)
  WHERE cohort IS NOT NULL;

-- =====================================================================
-- B. access_codes.tier + shape constraint update
-- =====================================================================
ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS tier text;

UPDATE public.access_codes
   SET tier = 'user'
 WHERE type = 'referral' AND tier IS NULL;

ALTER TABLE public.access_codes
  DROP CONSTRAINT IF EXISTS access_codes_referral_shape;
ALTER TABLE public.access_codes
  DROP CONSTRAINT IF EXISTS access_codes_slot_check;
ALTER TABLE public.access_codes
  DROP CONSTRAINT IF EXISTS access_codes_tier_check;

ALTER TABLE public.access_codes
  ADD CONSTRAINT access_codes_tier_check CHECK (
    tier IS NULL OR tier IN ('owner', 'user')
  );

ALTER TABLE public.access_codes
  ADD CONSTRAINT access_codes_referral_shape CHECK (
    (type <> 'referral'
       AND owner_user_id IS NULL
       AND slot IS NULL
       AND tier IS NULL)
    OR
    (type = 'referral'
       AND owner_user_id IS NOT NULL
       AND tier IS NOT NULL
       AND (
         (tier = 'user'  AND slot IN (1, 2))
         OR
         (tier = 'owner' AND slot IS NULL)
       ))
  );

-- =====================================================================
-- C. access_code_uses table (provenance ledger)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.access_code_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id uuid NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  used_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referrer_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  code_tier text,
  code_slot smallint,
  landing_url text,
  http_referer text,
  user_agent text,
  ip_address inet,
  country_code char(2),
  device_type text,
  signup_session_id uuid,
  reward_kind text,
  reward_value int,
  reward_granted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_code_uses_one_per_user UNIQUE (used_by_user_id)
);

CREATE INDEX IF NOT EXISTS idx_acu_access_code
  ON public.access_code_uses(access_code_id);
CREATE INDEX IF NOT EXISTS idx_acu_referrer
  ON public.access_code_uses(referrer_user_id)
  WHERE referrer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acu_created
  ON public.access_code_uses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acu_country
  ON public.access_code_uses(country_code)
  WHERE country_code IS NOT NULL;

ALTER TABLE public.access_code_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_code_uses_select_referrer ON public.access_code_uses;
CREATE POLICY access_code_uses_select_referrer
  ON public.access_code_uses FOR SELECT
  USING (referrer_user_id = auth.uid());

DROP POLICY IF EXISTS access_code_uses_select_self ON public.access_code_uses;
CREATE POLICY access_code_uses_select_self
  ON public.access_code_uses FOR SELECT
  USING (used_by_user_id = auth.uid());

DROP POLICY IF EXISTS access_code_uses_select_admin ON public.access_code_uses;
CREATE POLICY access_code_uses_select_admin
  ON public.access_code_uses FOR SELECT
  USING (public.is_admin_or_above());

-- No general INSERT/UPDATE/DELETE policies. All writes via SECURITY DEFINER fns.

-- =====================================================================
-- D. compute_effective_perms — honor verify_locked_at lockout
-- =====================================================================
-- Verify-locked users get the same allowlist treatment as banned users:
-- only appeal/account/login/signup/settings permissions. This is the
-- end-of-beta enforcement: when beta_active flips off, unverified beta
-- users are stamped verify_locked_at=now() by the sweeper, and this
-- branch flips Pro caps off until they verify.

CREATE OR REPLACE FUNCTION public.compute_effective_perms(p_user_id uuid)
 RETURNS TABLE(permission_id uuid, permission_key text, permission_display_name text, surface text, granted boolean, granted_via text, source_detail jsonb, deny_mode text, requires_verified boolean, lock_message text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH
  u AS (
    SELECT
      id,
      plan_id,
      COALESCE(email_verified, false) AS email_verified,
      COALESCE(is_banned, false)      AS is_banned,
      verify_locked_at
    FROM public.users
    WHERE id = p_user_id
  ),
  perms AS (
    SELECT
      p.id,
      p.key,
      p.display_name,
      p.ui_section,
      p.is_public,
      p.deny_mode,
      p.requires_verified,
      p.lock_message
    FROM public.permissions p
    WHERE p.is_active = true
  ),
  ovr_user AS (
    SELECT DISTINCT ON (o.permission_key)
      o.permission_key,
      o.override_action,
      o.scope_type,
      o.scope_id,
      o.reason
    FROM public.permission_scope_overrides o
    WHERE o.scope_type = 'user'
      AND o.scope_id   = p_user_id
      AND (o.expires_at IS NULL OR o.expires_at > now())
    ORDER BY o.permission_key, o.created_at DESC
  ),
  user_set_perms AS (
    SELECT DISTINCT ON (psp.permission_id)
      psp.permission_id,
      ps.key AS set_key,
      ups.reason
    FROM public.user_permission_sets ups
    JOIN public.permission_sets ps
      ON ps.id = ups.permission_set_id AND ps.is_active = true
    JOIN public.permission_set_perms psp
      ON psp.permission_set_id = ps.id
    WHERE ups.user_id = p_user_id
      AND (ups.expires_at IS NULL OR ups.expires_at > now())
    ORDER BY psp.permission_id, ups.granted_at DESC NULLS LAST
  ),
  role_perms AS (
    SELECT DISTINCT ON (psp.permission_id)
      psp.permission_id,
      r.name  AS role_name,
      ps.key  AS set_key
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
    JOIN public.role_permission_sets rps
      ON rps.role_id = r.id
    JOIN public.permission_sets ps
      ON ps.id = rps.permission_set_id AND ps.is_active = true
    JOIN public.permission_set_perms psp
      ON psp.permission_set_id = ps.id
    WHERE ur.user_id = p_user_id
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ORDER BY psp.permission_id, r.hierarchy_level DESC NULLS LAST
  ),
  plan_perms AS (
    SELECT DISTINCT ON (psp.permission_id)
      psp.permission_id,
      pl.name AS plan_name,
      ps.key  AS set_key
    FROM u
    JOIN public.plans pl
      ON pl.id = u.plan_id
    JOIN public.plan_permission_sets pps
      ON pps.plan_id = pl.id
    JOIN public.permission_sets ps
      ON ps.id = pps.permission_set_id AND ps.is_active = true
    JOIN public.permission_set_perms psp
      ON psp.permission_set_id = ps.id
    ORDER BY psp.permission_id, pl.name
  ),
  resolved AS (
    SELECT
      perms.id                                           AS permission_id,
      perms.key::text                                    AS permission_key,
      perms.display_name::text                           AS permission_display_name,
      COALESCE(perms.ui_section, '')::text               AS surface,
      perms.deny_mode::text                              AS deny_mode,
      COALESCE(perms.requires_verified, false)           AS requires_verified,
      perms.lock_message::text                           AS lock_message,
      perms.is_public                                    AS is_public,
      ovr.override_action                                AS ovr_action,
      ovr.scope_type                                     AS ovr_scope_type,
      ovr.scope_id                                       AS ovr_scope_id,
      ovr.reason                                         AS ovr_reason,
      usp.set_key                                        AS user_set_key,
      usp.reason                                         AS user_set_reason,
      rp.role_name                                       AS role_name,
      rp.set_key                                         AS role_set_key,
      pp.plan_name                                       AS plan_name,
      pp.set_key                                         AS plan_set_key
    FROM perms
    LEFT JOIN ovr_user       ovr ON ovr.permission_key  = perms.key
    LEFT JOIN user_set_perms usp ON usp.permission_id   = perms.id
    LEFT JOIN role_perms     rp  ON rp.permission_id    = perms.id
    LEFT JOIN plan_perms     pp  ON pp.permission_id    = perms.id
  ),
  final AS (
    SELECT
      r.*,
      (SELECT is_banned        FROM u) AS u_is_banned,
      (SELECT email_verified   FROM u) AS u_email_verified,
      (SELECT verify_locked_at FROM u) AS u_verify_locked_at,
      (
        r.permission_key LIKE 'appeal.%'  OR
        r.permission_key LIKE 'account.%' OR
        r.permission_key LIKE 'login.%'   OR
        r.permission_key LIKE 'signup.%'  OR
        r.permission_key LIKE 'settings.%'
      ) AS on_lockout_allowlist
    FROM resolved r
  )
SELECT
  f.permission_id,
  f.permission_key,
  f.permission_display_name,
  f.surface,
  CASE
    WHEN f.u_is_banned AND NOT f.on_lockout_allowlist THEN false
    WHEN f.u_verify_locked_at IS NOT NULL AND NOT f.on_lockout_allowlist THEN false
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false THEN false
    WHEN f.ovr_action = 'allow' THEN true
    WHEN f.ovr_action IS NOT NULL THEN false
    WHEN f.user_set_key IS NOT NULL THEN true
    WHEN f.is_public THEN true
    WHEN f.role_name IS NOT NULL THEN true
    WHEN f.plan_name IS NOT NULL THEN true
    ELSE false
  END AS granted,
  CASE
    WHEN f.u_is_banned AND NOT f.on_lockout_allowlist THEN ''
    WHEN f.u_verify_locked_at IS NOT NULL AND NOT f.on_lockout_allowlist THEN ''
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false THEN ''
    WHEN f.ovr_action IS NOT NULL THEN 'scope_override'
    WHEN f.user_set_key IS NOT NULL THEN 'user_set'
    WHEN f.is_public THEN 'public'
    WHEN f.role_name IS NOT NULL THEN 'role'
    WHEN f.plan_name IS NOT NULL THEN 'plan'
    ELSE ''
  END AS granted_via,
  CASE
    WHEN f.u_is_banned AND NOT f.on_lockout_allowlist
      THEN jsonb_build_object('reason', 'banned')
    WHEN f.u_verify_locked_at IS NOT NULL AND NOT f.on_lockout_allowlist
      THEN jsonb_build_object('reason', 'verify_locked', 'locked_at', f.u_verify_locked_at)
    WHEN f.requires_verified
         AND COALESCE(f.u_email_verified, false) = false
      THEN jsonb_build_object('reason', 'email_not_verified')
    WHEN f.ovr_action IS NOT NULL
      THEN jsonb_strip_nulls(jsonb_build_object(
             'override_action', f.ovr_action,
             'override_scope',  f.ovr_scope_type,
             'scope_id',        f.ovr_scope_id,
             'reason',          f.ovr_reason
           ))
    WHEN f.user_set_key IS NOT NULL
      THEN jsonb_strip_nulls(jsonb_build_object(
             'set_key', f.user_set_key,
             'reason',  f.user_set_reason
           ))
    WHEN f.is_public
      THEN jsonb_build_object('is_public', true)
    WHEN f.role_name IS NOT NULL
      THEN jsonb_build_object(
             'role_name', f.role_name,
             'set_key',   f.role_set_key
           )
    WHEN f.plan_name IS NOT NULL
      THEN jsonb_build_object(
             'plan_name', f.plan_name,
             'set_key',   f.plan_set_key
           )
    ELSE '{}'::jsonb
  END AS source_detail,
  f.deny_mode,
  f.requires_verified,
  f.lock_message
FROM final f
ORDER BY f.surface, f.permission_key;
$function$;

-- =====================================================================
-- E. users protect-columns trigger (closes F-013-class self-escalation)
-- =====================================================================
-- Postgres has no native column-level UPDATE policy. Pattern: BEFORE UPDATE
-- trigger that rejects writes to protected columns from non-service,
-- non-admin actors. service_role + admins bypass; the trigger's only job
-- is preventing a logged-in user from PATCHing their own row to escalate.
--
-- Without this trigger, any authenticated user could supabase-js
-- UPDATE on their own row to set cohort='beta', plan_id=<pro-uuid>,
-- comped_until=<future>, perms_version+=1 — and self-grant Pro.

CREATE OR REPLACE FUNCTION public.users_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_is_admin boolean := false;
BEGIN
  -- service_role bypasses (server routes, RPCs, webhooks)
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins bypass (admin moderation, billing actions)
  BEGIN
    v_is_admin := public.is_admin_or_above();
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- From here: caller is a regular authenticated user updating their own row.
  -- Reject any change to protected columns.

  -- Beta cohort + comp
  IF NEW.cohort IS DISTINCT FROM OLD.cohort THEN
    RAISE EXCEPTION 'users.cohort is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.cohort_joined_at IS DISTINCT FROM OLD.cohort_joined_at THEN
    RAISE EXCEPTION 'users.cohort_joined_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.comped_until IS DISTINCT FROM OLD.comped_until THEN
    RAISE EXCEPTION 'users.comped_until is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.verify_locked_at IS DISTINCT FROM OLD.verify_locked_at THEN
    RAISE EXCEPTION 'users.verify_locked_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- Billing
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    RAISE EXCEPTION 'users.plan_id is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_status IS DISTINCT FROM OLD.plan_status THEN
    RAISE EXCEPTION 'users.plan_status is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_grace_period_ends_at IS DISTINCT FROM OLD.plan_grace_period_ends_at THEN
    RAISE EXCEPTION 'users.plan_grace_period_ends_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'users.stripe_customer_id is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_at IS DISTINCT FROM OLD.frozen_at THEN
    RAISE EXCEPTION 'users.frozen_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.frozen_verity_score IS DISTINCT FROM OLD.frozen_verity_score THEN
    RAISE EXCEPTION 'users.frozen_verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- Permission cache
  IF NEW.perms_version IS DISTINCT FROM OLD.perms_version THEN
    RAISE EXCEPTION 'users.perms_version is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.perms_version_bumped_at IS DISTINCT FROM OLD.perms_version_bumped_at THEN
    RAISE EXCEPTION 'users.perms_version_bumped_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- Referral state (legacy + new)
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'users.referred_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'users.referral_code is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- Moderation
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'users.is_banned is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_shadow_banned IS DISTINCT FROM OLD.is_shadow_banned THEN
    RAISE EXCEPTION 'users.is_shadow_banned is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.ban_reason IS DISTINCT FROM OLD.ban_reason THEN
    RAISE EXCEPTION 'users.ban_reason is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.banned_at IS DISTINCT FROM OLD.banned_at THEN
    RAISE EXCEPTION 'users.banned_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.banned_by IS DISTINCT FROM OLD.banned_by THEN
    RAISE EXCEPTION 'users.banned_by is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- Verification + identity badges
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'users.email_verified is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
    RAISE EXCEPTION 'users.email_verified_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
    RAISE EXCEPTION 'users.phone_verified is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    RAISE EXCEPTION 'users.phone_verified_at is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_expert IS DISTINCT FROM OLD.is_expert THEN
    RAISE EXCEPTION 'users.is_expert is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_verified_public_figure IS DISTINCT FROM OLD.is_verified_public_figure THEN
    RAISE EXCEPTION 'users.is_verified_public_figure is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.expert_title IS DISTINCT FROM OLD.expert_title THEN
    RAISE EXCEPTION 'users.expert_title is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.expert_organization IS DISTINCT FROM OLD.expert_organization THEN
    RAISE EXCEPTION 'users.expert_organization is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  -- Score (gamification — written by triggers / service)
  IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
    RAISE EXCEPTION 'users.verity_score is read-only for self-update' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_protect_columns_trigger ON public.users;
CREATE TRIGGER users_protect_columns_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_protect_columns();

-- =====================================================================
-- F1. generate_referral_slug — internal helper
-- =====================================================================
-- Returns a 10-char [a-z0-9] slug. ~60 bits of entropy.
-- Caller wraps in retry loop on UNIQUE collision.

CREATE OR REPLACE FUNCTION public.generate_referral_slug()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw bytea;
  v_slug text;
BEGIN
  v_raw := gen_random_bytes(8);
  v_slug := lower(translate(encode(v_raw, 'base64'), '+/=', ''));
  RETURN substring(v_slug FROM 1 FOR 10);
END;
$$;

-- =====================================================================
-- F2. mint_referral_codes — auto-mint 2 user-tier slugs (idempotent)
-- =====================================================================
-- Called from email-verify callback for verified beta users. Returns the
-- two access_codes rows. Safe to call repeatedly: ON CONFLICT DO NOTHING.

CREATE OR REPLACE FUNCTION public.mint_referral_codes(p_user_id uuid)
RETURNS TABLE (id uuid, code text, slot smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_slot smallint;
  v_slug text;
  v_attempt int;
  v_existing record;
BEGIN
  -- Caller must be the user themselves OR service_role OR admin.
  IF v_role <> 'service_role'
     AND auth.uid() <> p_user_id
     AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'mint_referral_codes: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'mint_referral_codes: p_user_id required';
  END IF;

  FOR v_slot IN 1..2 LOOP
    -- Skip if already minted for this slot
    SELECT ac.id, ac.code, ac.slot
      INTO v_existing
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
       AND ac.slot = v_slot
     LIMIT 1;
    IF FOUND THEN
      CONTINUE;
    END IF;

    -- Mint with up to 5 retries on slug collision
    FOR v_attempt IN 1..5 LOOP
      v_slug := public.generate_referral_slug();
      BEGIN
        INSERT INTO public.access_codes
          (code, type, tier, owner_user_id, slot, is_active, created_by, description)
        VALUES
          (v_slug, 'referral', 'user', p_user_id, v_slot, true, p_user_id,
           'Auto-minted user referral, slot ' || v_slot::text);
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF v_attempt = 5 THEN
            RAISE EXCEPTION 'mint_referral_codes: slug retries exhausted for user %', p_user_id;
          END IF;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT ac.id, ac.code::text, ac.slot
      FROM public.access_codes ac
     WHERE ac.type = 'referral'
       AND ac.tier = 'user'
       AND ac.owner_user_id = p_user_id
     ORDER BY ac.slot;
END;
$$;

-- =====================================================================
-- F3. mint_owner_referral_link — admin generates a tier='owner' link
-- =====================================================================
-- Owner (you) calls this from admin UI to mint a no-verify-required link
-- for seed users. Returns the slug to embed in the URL.

CREATE OR REPLACE FUNCTION public.mint_owner_referral_link(
  p_description text DEFAULT NULL,
  p_max_uses int DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_actor uuid := auth.uid();
  v_slug text;
  v_attempt int;
  v_id uuid;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'mint_owner_referral_link: admin role required' USING ERRCODE = '42501';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'mint_owner_referral_link: no authenticated actor';
  END IF;

  FOR v_attempt IN 1..5 LOOP
    v_slug := public.generate_referral_slug();
    BEGIN
      INSERT INTO public.access_codes
        (code, type, tier, owner_user_id, slot, is_active, created_by,
         description, max_uses, expires_at)
      VALUES
        (v_slug, 'referral', 'owner', v_actor, NULL, true, v_actor,
         COALESCE(p_description, 'Owner-minted seed referral'),
         p_max_uses, p_expires_at)
      RETURNING access_codes.id INTO v_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempt = 5 THEN
          RAISE EXCEPTION 'mint_owner_referral_link: slug retries exhausted';
        END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_id, v_slug;
END;
$$;

-- =====================================================================
-- F4. apply_signup_cohort — assign cohort + Pro on signup or email verify
-- =====================================================================
-- p_via_owner_link: true if the user signed up through a tier='owner' link.
--   When true, Pro is granted immediately regardless of email_verified.
--   When false (direct signup or tier='user' referral), Pro is granted
--   only once email_verified=true. Idempotent: returns the cohort actually
--   assigned (or NULL if none / cap reached / not eligible).

CREATE OR REPLACE FUNCTION public.apply_signup_cohort(
  p_user_id uuid,
  p_via_owner_link boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_signup_cohort text;
  v_beta_active boolean;
  v_beta_cap int;
  v_current_count int;
  v_user record;
  v_pro_plan_id uuid;
  v_now timestamptz := now();
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'apply_signup_cohort: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT id, email_verified, cohort, is_kids_mode_enabled, plan_id
    INTO v_user
    FROM public.users
   WHERE id = p_user_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Tag immutability — never overwrite an existing cohort tag
  IF v_user.cohort IS NOT NULL THEN
    -- Already tagged. If they verified email AFTER initial tag and the
    -- prior write skipped Pro grant (because !verified and !owner_link),
    -- we should now grant Pro. Branch:
    IF v_user.cohort = 'beta'
       AND v_user.plan_id IS NULL
       AND COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id = v_pro_plan_id,
               plan_status = 'active'
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    END IF;
    RETURN v_user.cohort;
  END IF;

  -- Read settings
  SELECT value INTO v_signup_cohort FROM public.settings WHERE key = 'signup_cohort';
  IF v_signup_cohort IS NULL OR v_signup_cohort = '' THEN
    RETURN NULL;
  END IF;

  SELECT (value)::boolean INTO v_beta_active FROM public.settings WHERE key = 'beta_active';
  IF v_signup_cohort = 'beta' AND COALESCE(v_beta_active, false) = false THEN
    -- Beta is off; tag but no Pro grant
    UPDATE public.users
       SET cohort = v_signup_cohort,
           cohort_joined_at = v_now
     WHERE id = p_user_id;
    RETURN v_signup_cohort;
  END IF;

  -- Beta cap check
  SELECT (value)::int INTO v_beta_cap FROM public.settings WHERE key = 'beta_cap';
  IF v_signup_cohort = 'beta' AND COALESCE(v_beta_cap, 0) > 0 THEN
    SELECT count(*)::int INTO v_current_count
      FROM public.users
     WHERE cohort = 'beta';
    IF v_current_count >= v_beta_cap THEN
      -- Cap reached — leave cohort null, free tier
      RETURN NULL;
    END IF;
  END IF;

  -- Tag the cohort
  UPDATE public.users
     SET cohort = v_signup_cohort,
         cohort_joined_at = v_now
   WHERE id = p_user_id;

  -- Pro grant: only for beta cohort, and only if either via owner link
  -- OR email is already verified. Kids-mode users are tagged but not granted.
  IF v_signup_cohort = 'beta' AND COALESCE(v_user.is_kids_mode_enabled, false) = false THEN
    IF p_via_owner_link OR COALESCE(v_user.email_verified, false) = true THEN
      SELECT id INTO v_pro_plan_id FROM public.plans
        WHERE name = 'verity_pro_monthly' LIMIT 1;
      IF v_pro_plan_id IS NOT NULL THEN
        UPDATE public.users
           SET plan_id = v_pro_plan_id,
               plan_status = 'active'
         WHERE id = p_user_id;
        PERFORM public.bump_user_perms_version(p_user_id);
      END IF;
    END IF;
  END IF;

  RETURN v_signup_cohort;
END;
$$;

-- =====================================================================
-- F5. complete_email_verification — called when user verifies email
-- =====================================================================
-- Clears verify_locked_at if set, then re-runs apply_signup_cohort to
-- promote a tier='user'/direct beta signup into Pro.

CREATE OR REPLACE FUNCTION public.complete_email_verification(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_was_locked boolean;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'complete_email_verification: not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users
     SET email_verified = true,
         email_verified_at = COALESCE(email_verified_at, now()),
         verify_locked_at = NULL
   WHERE id = p_user_id
   RETURNING (verify_locked_at IS NOT NULL) INTO v_was_locked;

  -- Re-trigger cohort grant in case Pro was deferred for non-owner-link signup
  PERFORM public.apply_signup_cohort(p_user_id, false);
  PERFORM public.bump_user_perms_version(p_user_id);

  -- Mint referral slugs now that email is verified
  PERFORM public.mint_referral_codes(p_user_id);
END;
$$;

-- =====================================================================
-- F6. redeem_referral — record an access_code use with full provenance
-- =====================================================================
-- Called from signup callback once user is created. Re-checks code state
-- under FOR UPDATE to close TOCTOU. Handles self-referral via owner_user_id
-- match (email-normalization done at the route layer; here we trust the
-- caller passed a clean p_used_by_user_id).

CREATE OR REPLACE FUNCTION public.redeem_referral(
  p_code_id uuid,
  p_used_by_user_id uuid,
  p_provenance jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  redemption_id uuid,
  code_tier text,
  referrer_user_id uuid,
  was_recorded boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_code record;
  v_redemption uuid;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'redeem_referral: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_code_id IS NULL OR p_used_by_user_id IS NULL THEN
    RAISE EXCEPTION 'redeem_referral: code_id and used_by_user_id required';
  END IF;

  -- Re-check code under FOR UPDATE (TOCTOU on disabled / expired / max_uses)
  SELECT id, code, type, tier, owner_user_id, slot, is_active, disabled_at,
         expires_at, max_uses, current_uses
    INTO v_code
    FROM public.access_codes
   WHERE id = p_code_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF v_code.type <> 'referral' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::uuid, false;
    RETURN;
  END IF;
  IF COALESCE(v_code.is_active, true) = false OR v_code.disabled_at IS NOT NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_code.tier, v_code.owner_user_id, false;
    RETURN;
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN QUERY SELECT NULL::uuid, v_code.tier, v_code.owner_user_id, false;
    RETURN;
  END IF;
  IF v_code.max_uses IS NOT NULL AND v_code.current_uses >= v_code.max_uses THEN
    RETURN QUERY SELECT NULL::uuid, v_code.tier, v_code.owner_user_id, false;
    RETURN;
  END IF;

  -- Self-referral guard (id-based; email-based guard happens at route layer)
  IF v_code.owner_user_id = p_used_by_user_id THEN
    RETURN QUERY SELECT NULL::uuid, v_code.tier, v_code.owner_user_id, false;
    RETURN;
  END IF;

  -- Record redemption (idempotent on used_by_user_id)
  INSERT INTO public.access_code_uses
    (access_code_id, used_by_user_id, referrer_user_id, code_tier, code_slot,
     landing_url, http_referer, user_agent, ip_address, country_code,
     device_type, signup_session_id, metadata)
  VALUES
    (v_code.id, p_used_by_user_id, v_code.owner_user_id, v_code.tier, v_code.slot,
     p_provenance->>'landing_url',
     p_provenance->>'http_referer',
     p_provenance->>'user_agent',
     NULLIF(p_provenance->>'ip_address', '')::inet,
     p_provenance->>'country_code',
     p_provenance->>'device_type',
     NULLIF(p_provenance->>'signup_session_id', '')::uuid,
     COALESCE(p_provenance, '{}'::jsonb))
  ON CONFLICT (used_by_user_id) DO NOTHING
  RETURNING id INTO v_redemption;

  IF v_redemption IS NULL THEN
    -- Already redeemed once — silent no-op
    RETURN QUERY SELECT NULL::uuid, v_code.tier, v_code.owner_user_id, false;
    RETURN;
  END IF;

  -- Increment counter
  UPDATE public.access_codes
     SET current_uses = current_uses + 1,
         updated_at = now()
   WHERE id = v_code.id;

  -- Stamp legacy users.referred_by for back-compat with any existing reads
  UPDATE public.users
     SET referred_by = v_code.owner_user_id
   WHERE id = p_used_by_user_id
     AND referred_by IS NULL;

  RETURN QUERY SELECT v_redemption, v_code.tier, v_code.owner_user_id, true;
END;
$$;

-- =====================================================================
-- F7. grant_pro_to_cohort — bulk push comped_until for a cohort
-- =====================================================================
-- Used (a) at end-of-beta to extend a cohort's comp window if needed,
-- and (b) for ad-hoc rewards.

CREATE OR REPLACE FUNCTION public.grant_pro_to_cohort(
  p_cohort text,
  p_months int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_actor uuid := auth.uid();
  v_pro_plan_id uuid;
  v_count int;
  v_now timestamptz := now();
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_cohort IS NULL OR p_cohort = '' THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: cohort required';
  END IF;
  IF p_months IS NULL OR p_months < 1 OR p_months > 24 THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: months must be 1..24';
  END IF;

  SELECT id INTO v_pro_plan_id FROM public.plans WHERE name = 'verity_pro_monthly' LIMIT 1;
  IF v_pro_plan_id IS NULL THEN
    RAISE EXCEPTION 'grant_pro_to_cohort: verity_pro_monthly plan not found';
  END IF;

  WITH bumped AS (
    UPDATE public.users
       SET plan_id = v_pro_plan_id,
           plan_status = 'active',
           comped_until = GREATEST(COALESCE(comped_until, v_now), v_now)
                          + (p_months || ' months')::interval,
           perms_version = perms_version + 1,
           perms_version_bumped_at = v_now
     WHERE cohort = p_cohort
       AND COALESCE(is_kids_mode_enabled, false) = false
       AND id <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid)
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM bumped;

  INSERT INTO public.audit_log (actor_id, actor_type, action, target_type, metadata)
  VALUES (v_actor, 'admin', 'cohort.grant_pro', 'cohort',
          jsonb_build_object('cohort', p_cohort, 'months', p_months, 'count', v_count));

  RETURN v_count;
END;
$$;

-- =====================================================================
-- F8. sweep_beta_expirations — nightly cron body
-- =====================================================================
-- Run this from a Vercel cron via /api/cron/sweep-beta. Behavior:
--   1. If beta_active=true and any beta user has comped_until set,
--      clear comped_until (admin re-enabled beta).
--   2. If beta_active=false:
--      a. For verified beta users with comped_until=NULL: stamp
--         comped_until=now()+beta_grace_days days. (Soft warning window.)
--      b. For unverified beta users: stamp verify_locked_at=now()
--         (instant lockout until they verify).
--      c. For any beta user where comped_until < now(): downgrade
--         (plan_id=NULL, plan_status='free').
--      All bump perms_version.
--   Returns counts as jsonb for the cron route to log.

CREATE OR REPLACE FUNCTION public.sweep_beta_expirations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_beta_active boolean;
  v_grace_days int;
  v_now timestamptz := now();
  v_stamped_grace int := 0;
  v_locked int := 0;
  v_downgraded int := 0;
  v_re_enabled int := 0;
BEGIN
  IF v_role <> 'service_role' AND NOT public.is_admin_or_above() THEN
    RAISE EXCEPTION 'sweep_beta_expirations: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT (value)::boolean INTO v_beta_active FROM public.settings WHERE key = 'beta_active';
  SELECT (value)::int     INTO v_grace_days  FROM public.settings WHERE key = 'beta_grace_days';
  v_grace_days := COALESCE(v_grace_days, 14);

  IF COALESCE(v_beta_active, false) = true THEN
    -- Re-enable case: clear stamped grace + lock for beta users
    WITH cleared AS (
      UPDATE public.users
         SET comped_until = NULL,
             verify_locked_at = NULL,
             perms_version = perms_version + 1,
             perms_version_bumped_at = v_now
       WHERE cohort = 'beta'
         AND (comped_until IS NOT NULL OR verify_locked_at IS NOT NULL)
      RETURNING id
    )
    SELECT count(*)::int INTO v_re_enabled FROM cleared;
  ELSE
    -- Beta off: stamp grace on verified, lock unverified
    WITH stamped AS (
      UPDATE public.users
         SET comped_until = v_now + (v_grace_days || ' days')::interval,
             perms_version = perms_version + 1,
             perms_version_bumped_at = v_now
       WHERE cohort = 'beta'
         AND email_verified = true
         AND comped_until IS NULL
         AND COALESCE(is_banned, false) = false
      RETURNING id
    )
    SELECT count(*)::int INTO v_stamped_grace FROM stamped;

    WITH locked AS (
      UPDATE public.users
         SET verify_locked_at = v_now,
             perms_version = perms_version + 1,
             perms_version_bumped_at = v_now
       WHERE cohort = 'beta'
         AND email_verified = false
         AND verify_locked_at IS NULL
      RETURNING id
    )
    SELECT count(*)::int INTO v_locked FROM locked;

    -- Downgrade users whose grace already lapsed
    WITH downgraded AS (
      UPDATE public.users
         SET plan_id = NULL,
             plan_status = 'free',
             perms_version = perms_version + 1,
             perms_version_bumped_at = v_now
       WHERE cohort = 'beta'
         AND comped_until IS NOT NULL
         AND comped_until < v_now
         AND plan_id IS NOT NULL
      RETURNING id
    )
    SELECT count(*)::int INTO v_downgraded FROM downgraded;
  END IF;

  INSERT INTO public.audit_log (actor_type, action, target_type, metadata)
  VALUES ('system', 'beta.sweep', 'cohort',
          jsonb_build_object(
            'beta_active', v_beta_active,
            'grace_days', v_grace_days,
            'stamped_grace', v_stamped_grace,
            'locked', v_locked,
            'downgraded', v_downgraded,
            're_enabled', v_re_enabled
          ));

  RETURN jsonb_build_object(
    'beta_active', v_beta_active,
    'stamped_grace', v_stamped_grace,
    'locked', v_locked,
    'downgraded', v_downgraded,
    're_enabled', v_re_enabled,
    'grace_days', v_grace_days,
    'ran_at', v_now
  );
END;
$$;

-- =====================================================================
-- G. Privilege lockdown — REVOKE EXECUTE on privileged fns
-- =====================================================================
-- Functions that grant Pro / write protected columns must NOT be
-- callable by anon/authenticated roles via PostgREST. Service-role only.

REVOKE EXECUTE ON FUNCTION public.apply_signup_cohort(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_signup_cohort(uuid, boolean) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_email_verification(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.complete_email_verification(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.redeem_referral(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.redeem_referral(uuid, uuid, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.grant_pro_to_cohort(text, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.grant_pro_to_cohort(text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.sweep_beta_expirations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sweep_beta_expirations() TO service_role;

REVOKE EXECUTE ON FUNCTION public.mint_owner_referral_link(text, int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mint_owner_referral_link(text, int, timestamptz) TO service_role;

-- mint_referral_codes is callable by authenticated users for their own id
-- (the function checks auth.uid() = p_user_id). Keep PUBLIC EXECUTE off,
-- grant to authenticated so a user can self-heal their slugs from the
-- /api/referrals/me endpoint without a service-client roundtrip.
REVOKE EXECUTE ON FUNCTION public.mint_referral_codes(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mint_referral_codes(uuid) TO authenticated, service_role;

-- generate_referral_slug is internal — no role needs direct execute
REVOKE EXECUTE ON FUNCTION public.generate_referral_slug() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_referral_slug() TO service_role;

COMMIT;
