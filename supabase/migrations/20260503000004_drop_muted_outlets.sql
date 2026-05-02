-- Story cleanup #31 — rip out the mute-outlet feature.
--
-- Owner-locked decision (2026-05-02): the per-outlet mute UI is dead weight;
-- selection (the source-row checkbox) controls article-source attachment, not
-- whether the cluster item participates in generation. With the mute UI and
-- API removed in the same PR, the muted_outlets table + its two RPCs are
-- unreferenced. Pre-apply checks confirmed: 0 rows in muted_outlets, no
-- foreign keys IN, no views referencing it, 0 audit_log rows with
-- action LIKE 'outlet.%'. Safe drop.

DROP FUNCTION IF EXISTS public.upsert_muted_outlet(text, integer, uuid, text);
DROP FUNCTION IF EXISTS public.delete_muted_outlet(text);

DROP TABLE IF EXISTS public.muted_outlets CASCADE;
