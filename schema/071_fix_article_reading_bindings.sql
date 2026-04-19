-- 071_fix_article_reading_bindings.sql
-- Migration: 20260418230010 fix_article_reading_bindings
--
-- Fix two broken permission-set bindings for article reading flows.
--
-- 1) article.read.log: currently only in admin/owner sets, breaking view_count,
--    scoring, achievements for all non-staff signed-in users. Add to the `free`
--    permission set so every signed-in user (any role carries the `free` set,
--    and every plan carries the `free` set) can log reads. Truly anonymous
--    visitors have no user_id so compute_effective_perms returns nothing for
--    them regardless.
--
-- 2) article.view.ad_free: currently on the `anon` set, which the `user` role
--    (and every other role) carries -- so every signed-in user, including free
--    tier, reads ad-free. Must be plan-gated. Remove from `anon`, keep on
--    `pro`, add to `family` (family plans) and `expert` (expert role). admin
--    and owner sets keep it for staff.
--
-- Idempotent: explicit deletes before inserts with ON CONFLICT DO NOTHING.

WITH
  p_read_log AS (
    SELECT id FROM public.permissions WHERE key = 'article.read.log'
  ),
  p_ad_free AS (
    SELECT id FROM public.permissions WHERE key = 'article.view.ad_free'
  ),
  s_free    AS (SELECT id FROM public.permission_sets WHERE key = 'free'),
  s_anon    AS (SELECT id FROM public.permission_sets WHERE key = 'anon'),
  s_pro     AS (SELECT id FROM public.permission_sets WHERE key = 'pro'),
  s_family  AS (SELECT id FROM public.permission_sets WHERE key = 'family'),
  s_expert  AS (SELECT id FROM public.permission_sets WHERE key = 'expert'),
  s_admin   AS (SELECT id FROM public.permission_sets WHERE key = 'admin'),
  s_owner   AS (SELECT id FROM public.permission_sets WHERE key = 'owner'),

  -- 1. Grant article.read.log to every signed-in user via `free` set.
  ins_read_log_free AS (
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
    SELECT (SELECT id FROM s_free), (SELECT id FROM p_read_log)
    ON CONFLICT (permission_set_id, permission_id) DO NOTHING
    RETURNING 1
  ),

  -- 2a. Remove article.view.ad_free from `anon` set (stops leak to everyone).
  del_ad_free_anon AS (
    DELETE FROM public.permission_set_perms
    WHERE permission_set_id = (SELECT id FROM s_anon)
      AND permission_id     = (SELECT id FROM p_ad_free)
    RETURNING 1
  ),

  -- 2b. Ensure article.view.ad_free on pro/family/expert/admin/owner sets.
  ins_ad_free_pro AS (
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
    SELECT (SELECT id FROM s_pro), (SELECT id FROM p_ad_free)
    ON CONFLICT (permission_set_id, permission_id) DO NOTHING
    RETURNING 1
  ),
  ins_ad_free_family AS (
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
    SELECT (SELECT id FROM s_family), (SELECT id FROM p_ad_free)
    ON CONFLICT (permission_set_id, permission_id) DO NOTHING
    RETURNING 1
  ),
  ins_ad_free_expert AS (
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
    SELECT (SELECT id FROM s_expert), (SELECT id FROM p_ad_free)
    ON CONFLICT (permission_set_id, permission_id) DO NOTHING
    RETURNING 1
  ),
  ins_ad_free_admin AS (
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
    SELECT (SELECT id FROM s_admin), (SELECT id FROM p_ad_free)
    ON CONFLICT (permission_set_id, permission_id) DO NOTHING
    RETURNING 1
  ),
  ins_ad_free_owner AS (
    INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
    SELECT (SELECT id FROM s_owner), (SELECT id FROM p_ad_free)
    ON CONFLICT (permission_set_id, permission_id) DO NOTHING
    RETURNING 1
  )
SELECT
  (SELECT count(*) FROM ins_read_log_free)    AS ins_read_log_free,
  (SELECT count(*) FROM del_ad_free_anon)     AS del_ad_free_anon,
  (SELECT count(*) FROM ins_ad_free_pro)      AS ins_ad_free_pro,
  (SELECT count(*) FROM ins_ad_free_family)   AS ins_ad_free_family,
  (SELECT count(*) FROM ins_ad_free_expert)   AS ins_ad_free_expert,
  (SELECT count(*) FROM ins_ad_free_admin)    AS ins_ad_free_admin,
  (SELECT count(*) FROM ins_ad_free_owner)    AS ins_ad_free_owner;

-- Bump the global perms version so all clients refetch.
UPDATE public.perms_global_version SET version = version + 1, bumped_at = now();
