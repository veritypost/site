-- Migration 095 — kid_pair_codes + generate RPC
-- Scope: parent-generated short codes that a kid device redeems (via
-- POST /api/kids/pair) to receive a scoped kid JWT. The JWT minting
-- itself happens in the API route (needs access to SUPABASE_JWT_SECRET);
-- this migration owns the table + RLS + generator RPC.
--
-- Per docs/planning/FUTURE_DEDICATED_KIDS_APP.md "Auth flow rework" and
-- docs/planning/product-roadmap.md §7.5 (P3a).
--
-- Idempotent (CREATE ... IF NOT EXISTS, CREATE OR REPLACE).

-- ============================================================
-- Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kid_pair_codes (
    code             TEXT PRIMARY KEY,
    parent_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kid_profile_id   UUID NOT NULL REFERENCES public.kid_profiles(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL,
    used_at          TIMESTAMPTZ,
    used_by_device   TEXT
);

CREATE INDEX IF NOT EXISTS kid_pair_codes_parent_idx
    ON public.kid_pair_codes(parent_user_id);

CREATE INDEX IF NOT EXISTS kid_pair_codes_live_idx
    ON public.kid_pair_codes(expires_at)
    WHERE used_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.kid_pair_codes ENABLE ROW LEVEL SECURITY;

-- Parent can see their own codes
DROP POLICY IF EXISTS kpc_select ON public.kid_pair_codes;
CREATE POLICY kpc_select ON public.kid_pair_codes
    FOR SELECT
    USING (parent_user_id = auth.uid());

-- Only service role inserts (via the RPC below) or explicit parent insert
DROP POLICY IF EXISTS kpc_insert ON public.kid_pair_codes;
CREATE POLICY kpc_insert ON public.kid_pair_codes
    FOR INSERT
    WITH CHECK (parent_user_id = auth.uid());

-- Updates (mark used_at) are service-role-only — no policy needed; RLS
-- default denies authenticated updates.

-- ============================================================
-- Generator RPC (parent calls from adult web/iOS)
-- ============================================================
--
-- Validates:
--   - caller owns the kid_profile
--   - kid_profile exists + isn't soft-deleted
-- Generates a random 8-char alphanumeric code (no ambiguous chars 0/O/1/I/L).
-- Inserts a row with 15-minute expiry.
-- Returns { code, expires_at }.

CREATE OR REPLACE FUNCTION public.generate_kid_pair_code(
    p_kid_profile_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_id  UUID := auth.uid();
    v_code       TEXT;
    v_expires    TIMESTAMPTZ := now() + interval '15 minutes';
    v_attempts   INT := 0;
    v_alphabet   TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I/L
    v_i          INT;
BEGIN
    IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated'
            USING ERRCODE = 'P0001';
    END IF;

    -- Ownership check
    IF NOT EXISTS (
        SELECT 1 FROM public.kid_profiles
        WHERE id = p_kid_profile_id
          AND parent_user_id = v_parent_id
    ) THEN
        RAISE EXCEPTION 'Kid profile not owned by caller'
            USING ERRCODE = 'P0001';
    END IF;

    -- Invalidate any outstanding live codes for this kid (one live code at a time)
    UPDATE public.kid_pair_codes
       SET used_at = now()
     WHERE kid_profile_id = p_kid_profile_id
       AND used_at IS NULL
       AND expires_at > now();

    -- Generate a unique 8-char code (retry on collision up to 6 times)
    LOOP
        v_code := '';
        FOR v_i IN 1..8 LOOP
            v_code := v_code || substr(v_alphabet,
                (1 + floor(random() * length(v_alphabet)))::int, 1);
        END LOOP;

        BEGIN
            INSERT INTO public.kid_pair_codes
                (code, parent_user_id, kid_profile_id, expires_at)
            VALUES
                (v_code, v_parent_id, p_kid_profile_id, v_expires);
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_attempts := v_attempts + 1;
            IF v_attempts >= 6 THEN
                RAISE EXCEPTION 'Could not generate unique code' USING ERRCODE = 'P0001';
            END IF;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'code', v_code,
        'expires_at', v_expires
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_kid_pair_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_kid_pair_code(UUID) TO authenticated, service_role;

-- ============================================================
-- Redeem RPC (service-role only — called from /api/kids/pair after JWT mint)
-- ============================================================
--
-- Validates + marks the code used. The API route owns the JWT mint.
-- Returns { kid_profile_id, kid_name, parent_user_id } so the route
-- can build the token payload without a second query.

CREATE OR REPLACE FUNCTION public.redeem_kid_pair_code(
    p_code TEXT,
    p_device TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row     RECORD;
    v_name    TEXT;
BEGIN
    SELECT *
      INTO v_row
      FROM public.kid_pair_codes
     WHERE code = p_code
     FOR UPDATE;

    IF v_row IS NULL THEN
        RAISE EXCEPTION 'Invalid code' USING ERRCODE = 'P0001';
    END IF;

    IF v_row.used_at IS NOT NULL THEN
        RAISE EXCEPTION 'Code already used' USING ERRCODE = 'P0001';
    END IF;

    IF v_row.expires_at <= now() THEN
        RAISE EXCEPTION 'Code expired' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.kid_pair_codes
       SET used_at = now(),
           used_by_device = p_device
     WHERE code = p_code;

    SELECT display_name
      INTO v_name
      FROM public.kid_profiles
     WHERE id = v_row.kid_profile_id;

    RETURN jsonb_build_object(
        'kid_profile_id', v_row.kid_profile_id,
        'parent_user_id', v_row.parent_user_id,
        'kid_name',       v_name
    );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_kid_pair_code(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_kid_pair_code(TEXT, TEXT) TO service_role;

-- ============================================================
-- Signal to clients: perms_global_version bump so any cached state invalidates
-- ============================================================
UPDATE public.perms_global_version
   SET version = version + 1,
       bumped_at = now()
 WHERE id = 1;
