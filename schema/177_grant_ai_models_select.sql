-- Bug-Hunt 2026-04-25 — admin "Generate" button in /admin/newsroom did
-- nothing on click because the PipelineRunPicker couldn't load any
-- models. The supabase-js read against `public.ai_models` failed with
-- 401 "permission denied" before RLS evaluated.
--
-- Root cause: schema/114_f7_foundation.sql created the F7 tables,
-- enabled RLS, and added admin-only SELECT policies — but never
-- GRANTed SELECT on the underlying tables to `authenticated` or
-- `service_role`. PostgREST checks grants BEFORE RLS, so every read
-- was rejected at the grant layer. Probe confirmed the same gap on
-- 4 tables: ai_models, ai_prompt_overrides, kid_articles, kid_sources.
--
-- Fix: grant SELECT to `authenticated` (so RLS policies can evaluate)
-- and to `service_role` (so admin server routes can read directly).
-- Existing RLS policies still gate which authenticated users actually
-- see rows.

GRANT SELECT ON public.ai_models             TO authenticated, service_role;
GRANT SELECT ON public.ai_prompt_overrides   TO authenticated, service_role;
GRANT SELECT ON public.kid_articles          TO authenticated, service_role;
GRANT SELECT ON public.kid_sources           TO authenticated, service_role;
