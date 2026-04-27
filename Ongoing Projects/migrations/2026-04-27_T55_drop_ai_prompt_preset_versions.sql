-- =====================================================================
-- 2026-04-27_T55_drop_ai_prompt_preset_versions.sql
-- T55: drop the orphan ai_prompt_preset_versions table (T242 covers replay)
-- =====================================================================
-- Background:
--   The table was designed to snapshot prompt-preset state for audit /
--   replay, but no route ever wrote to it. Verified empty 2026-04-27 via
--   information_schema column inspection.
--
--   T242 (pipeline-run prompt snapshot) already captures the live
--   ai_prompt_presets + ai_prompt_overrides state into
--   pipeline_runs.input_params.prompt_snapshot at every pipeline-run
--   start (see CHANGELOG 2026-04-23 cluster T235+T242+T241). That
--   covers the actual replay need: "what prompts were live when this
--   article was generated?" — answered by joining the article's
--   pipeline_run_id back to input_params.prompt_snapshot.
--
--   The orphan versions table provides nothing T242 doesn't already
--   give us, so it's pure schema noise. Owner-locked direction:
--   drop it.
--
-- Pre-flight verification (run before applying):
--   SELECT COUNT(*) FROM public.ai_prompt_preset_versions;
--   -- expect 0 (the table has never been written to)
--   SELECT proname FROM pg_proc
--    WHERE prosrc ILIKE '%ai_prompt_preset_versions%';
--   -- expect 0 (no functions reference it)
--
-- Rollback (if needed):
--   This is destructive — recreate from the original schema seed
--   (currentschema:258-273). No data loss because the table was empty.
--
-- Verification (after apply):
--   SELECT 1 FROM information_schema.tables
--    WHERE table_schema='public' AND table_name='ai_prompt_preset_versions';
--   -- expect 0 rows
-- =====================================================================

BEGIN;

-- Belt-and-braces: refuse to drop if any rows ever landed (would surface
-- a never-shipped writer the audit missed).
DO $$
DECLARE
  v_row_count integer;
BEGIN
  SELECT COUNT(*) INTO v_row_count FROM public.ai_prompt_preset_versions;
  IF v_row_count > 0 THEN
    RAISE EXCEPTION
      'T55: refusing to drop ai_prompt_preset_versions — % rows present. Investigate the writer first.',
      v_row_count
      USING ERRCODE = 'P0001';
  END IF;
END $$;

DROP TABLE public.ai_prompt_preset_versions;

COMMIT;
