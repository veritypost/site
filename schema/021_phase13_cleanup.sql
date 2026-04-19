-- ============================================================
-- Phase 13 — Deprecated table drops
-- D29 (no reactions anywhere) + D15 (organic context pinning
-- replaces community notes). Drop the three legacy tables now
-- that no code path queries them.
-- ============================================================

DROP TABLE IF EXISTS community_note_votes CASCADE;
DROP TABLE IF EXISTS community_notes CASCADE;
DROP TABLE IF EXISTS reactions CASCADE;
