-- Phase 1 Exit Verification — RLS Probes
-- 2026-04-22 — F7 Phase 1 Task 4 gate
--
-- Run this file in the Supabase SQL Editor (has elevated context for SET ROLE).
-- MCP exec_sql doesn't allow `SET ROLE authenticated` so these can't be run
-- automated from Claude Code — owner runs manually.
--
-- Expected outcomes at the bottom of each block. All 4 blocks should match.

-- ============================================================================
-- Block 1 — Kid JWT context: articles/sources/timelines/quizzes all BLOCKED
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims to
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001","is_kid_delegated":true,"kid_profile_id":"00000000-0000-0000-0000-000000000002"}';

  select 'articles'  as tbl, count(*) as visible from public.articles  union all
  select 'sources'   as tbl, count(*) as visible from public.sources   union all
  select 'timelines' as tbl, count(*) as visible from public.timelines union all
  select 'quizzes'   as tbl, count(*) as visible from public.quizzes;
  -- Expected: all four return 0 (RESTRICTIVE policies deny kid JWT)
rollback;

-- ============================================================================
-- Block 2 — Adult authed JWT context: articles allowed per permissive policies
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims to
    '{"role":"authenticated","sub":"<REPLACE-WITH-REAL-ADULT-USER-UUID>"}';

  select 'articles_published' as scope, count(*) from public.articles where status = 'published';
  -- Expected: > 0 (adult JWT sees published articles)
rollback;

-- ============================================================================
-- Block 3 — Kid JWT should SEE kid_articles (published only) if any seeded
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims to
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001","is_kid_delegated":true,"kid_profile_id":"00000000-0000-0000-0000-000000000002"}';

  select 'kid_articles' as tbl, count(*) from public.kid_articles where status = 'published';
  -- Expected: 0 today (no kid articles seeded yet — will be > 0 post-Phase-3)
rollback;

-- ============================================================================
-- Block 4 — Adult JWT should be BLOCKED from kid_articles
-- ============================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims to
    '{"role":"authenticated","sub":"<REPLACE-WITH-REAL-ADULT-USER-UUID>"}';

  select 'kid_articles_from_adult' as scope, count(*) from public.kid_articles;
  -- Expected: 0 (adult JWT blocked by RESTRICTIVE kid_*_block_adult_jwt policy
  --           unless also an editor/admin)
rollback;

-- ============================================================================
-- Block 5 — Service role (the MCP context) bypasses all RLS
-- ============================================================================
-- (Nothing to set — MCP runs as service-level role already.)
select 'service_role_articles' as scope, count(*) from public.articles;
-- Expected: full count (service role bypasses RLS)

-- ============================================================================
-- Block 6 — Verify the RPC permission grant (from cost-tracker.ts path)
-- ============================================================================
begin;
  set local role service_role;
  select 'pipeline_today_cost_usd' as rpc, public.pipeline_today_cost_usd() as today_cost;
  -- Expected: 0 (no pipeline_costs rows for today yet)
rollback;
