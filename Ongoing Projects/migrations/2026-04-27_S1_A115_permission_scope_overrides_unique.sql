-- S1-A115 — permission_scope_overrides: add UNIQUE (permission_key, scope_type, scope_id)
--
-- The table has PK(id) + FK(permission_key) + FK(created_by) + 2 CHECK constraints
-- but no uniqueness constraint on the business key. Without it, duplicate
-- overrides for the same permission+scope can accumulate and the resolver
-- picks an arbitrary row. The natural business key is (permission_key, scope_type,
-- scope_id) — one active override per permission per scope instance.
--
-- Verified state (2026-04-27): no UNIQUE constraint found in pg_constraint.
-- Zero rows in the table, so no pre-dedup needed.
--
-- Named uq_pso_key_scope for brevity and grep-ability.
--
-- Acceptance: pg_constraint contains uq_pso_key_scope for this table.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='permission_scope_overrides'
  ) THEN
    RAISE EXCEPTION 'S1-A115 abort: permission_scope_overrides table missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.permission_scope_overrides'::regclass
       AND contype='u'
  ) THEN
    RAISE NOTICE 'S1-A115 no-op: UNIQUE constraint already present';
  END IF;
END $$;

-- Deduplicate before adding the constraint (idempotent even when table is empty).
DELETE FROM public.permission_scope_overrides pso
 WHERE id NOT IN (
   SELECT DISTINCT ON (permission_key, scope_type, scope_id) id
     FROM public.permission_scope_overrides
    ORDER BY permission_key, scope_type, scope_id, created_at DESC
 );

ALTER TABLE public.permission_scope_overrides
  ADD CONSTRAINT uq_pso_key_scope
  UNIQUE (permission_key, scope_type, scope_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.permission_scope_overrides'::regclass
       AND conname='uq_pso_key_scope'
  ) THEN
    RAISE EXCEPTION 'S1-A115 post-check failed: uq_pso_key_scope not found';
  END IF;
  RAISE NOTICE 'S1-A115 applied: uq_pso_key_scope UNIQUE constraint added';
END $$;

COMMIT;
