-- access_requests consumption tracking
--
-- Adds three columns + supporting constraints, indexes, and an immutability
-- trigger so the admin queue can distinguish "approved-but-waiting" from
-- "approved-and-signed-up." Plus a one-time backfill for existing matches.
--
-- See Outstanding.md item 3 for the full design rationale.

-- Columns
ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS consumed_by_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS consumption_source VARCHAR(16) NULL;

-- FK on the user link. SET NULL preserves the audit row when a user is
-- deleted (timestamp + source stay; only the user pointer drops).
ALTER TABLE public.access_requests
  DROP CONSTRAINT IF EXISTS fk_access_requests_consumed_by_user_id;
ALTER TABLE public.access_requests
  ADD CONSTRAINT fk_access_requests_consumed_by_user_id
  FOREIGN KEY (consumed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Status enum-like CHECK. Current rows verified to be in this set.
ALTER TABLE public.access_requests
  DROP CONSTRAINT IF EXISTS ck_access_requests_status;
ALTER TABLE public.access_requests
  ADD CONSTRAINT ck_access_requests_status
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Source enum-like CHECK. Matches the values send-magic-link writes into
-- user_metadata.signup_source ('web' | 'ios' | 'kids').
ALTER TABLE public.access_requests
  DROP CONSTRAINT IF EXISTS ck_access_requests_consumption_source;
ALTER TABLE public.access_requests
  ADD CONSTRAINT ck_access_requests_consumption_source
  CHECK (consumption_source IS NULL OR consumption_source IN ('web', 'ios', 'kids'));

-- Partial indexes — fast path for "outstanding queue" + reverse lookups.
CREATE INDEX IF NOT EXISTS idx_access_requests_outstanding
  ON public.access_requests (status, consumed_at)
  WHERE status = 'approved' AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_access_requests_consumed_by_user_id
  ON public.access_requests (consumed_by_user_id)
  WHERE consumed_by_user_id IS NOT NULL;

-- Immutability trigger. Once consumed_at is stamped, consumed_at and
-- consumption_source can never change. consumed_by_user_id may only be
-- cleared (the ON DELETE SET NULL cascade path) — never reassigned to a
-- different non-null user. Stops admin tampering with the audit trail.
CREATE OR REPLACE FUNCTION public.tf_access_requests_consumed_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.consumed_at IS NOT NULL THEN
    IF NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
      RAISE EXCEPTION 'access_requests.consumed_at is immutable once set';
    END IF;
    IF NEW.consumption_source IS DISTINCT FROM OLD.consumption_source THEN
      RAISE EXCEPTION 'access_requests.consumption_source is immutable once set';
    END IF;
    IF NEW.consumed_by_user_id IS DISTINCT FROM OLD.consumed_by_user_id
       AND NEW.consumed_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'access_requests.consumed_by_user_id may only be cleared (cascade), not reassigned';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_access_requests_consumed_immutable ON public.access_requests;
CREATE TRIGGER trg_access_requests_consumed_immutable
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tf_access_requests_consumed_immutable();

-- Backfill existing matches. consumed_at = GREATEST(user.created_at,
-- approved_at) so historical anomalies (admin self-approving after they
-- already had an account) don't produce a consume-before-approve record.
-- consumption_source defaults to 'web' for legacy rows that pre-date the
-- user_metadata.signup_source stamping; all 3 current matched users
-- have NULL signup_source and are web-era anyway.
UPDATE public.access_requests ar
SET
  consumed_at = GREATEST(u.created_at, ar.approved_at),
  consumed_by_user_id = u.id,
  consumption_source = COALESCE(
    NULLIF(au.raw_user_meta_data->>'signup_source', ''),
    'web'
  )
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE LOWER(ar.email) = LOWER(u.email)
  AND ar.status = 'approved'
  AND ar.consumed_at IS NULL;
