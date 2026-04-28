-- S1-A115 — permission_scope_overrides: add UNIQUE (permission_key, scope_type, scope_id)
--
-- Idempotent. Skips ALTER if uq_pso_key_scope already exists.

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
       AND conname='uq_pso_key_scope'
  ) THEN
    RAISE NOTICE 'S1-A115 no-op: uq_pso_key_scope already present';
    RETURN;
  END IF;

  -- Deduplicate before adding the constraint (idempotent even when empty).
  DELETE FROM public.permission_scope_overrides pso
   WHERE id NOT IN (
     SELECT DISTINCT ON (permission_key, scope_type, scope_id) id
       FROM public.permission_scope_overrides
      ORDER BY permission_key, scope_type, scope_id, created_at DESC
   );

  ALTER TABLE public.permission_scope_overrides
    ADD CONSTRAINT uq_pso_key_scope
    UNIQUE (permission_key, scope_type, scope_id);

  RAISE NOTICE 'S1-A115 applied: uq_pso_key_scope UNIQUE constraint added';
END $$;

COMMIT;
