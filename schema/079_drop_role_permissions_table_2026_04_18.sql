-- 079_drop_role_permissions_table_2026_04_18.sql
-- Migration: 20260419001955 drop_role_permissions_table_2026_04_18
--
-- Phase 5, Track N — drop legacy role_permissions table.
-- Pre-verified empty (row_count = 0). Idempotent via IF EXISTS.
-- CASCADE drops the 2 FKs, 2 indexes, 1 UNIQUE, 3 RLS policies.

DROP TABLE IF EXISTS public.role_permissions CASCADE;
