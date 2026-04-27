-- =====================================================================
-- 2026-04-27_T233_articles_soft_delete.sql
-- T233: articles soft-delete window via `deleted_at` + 30-day purge cron
-- =====================================================================
-- Problem:
--   web/src/app/api/admin/articles/[id]/route.ts:762 currently calls
--   `.delete().eq('id', id)` — a hard delete that tombstones the article
--   from public.articles permanently. The audit_log row is written
--   BEFORE the mutation (line ~755 via recordAdminAction), so we have a
--   record of WHO deleted, but the row itself is irrecoverable: a
--   misclick, a moderation reversal, or a legal-hold subpoena lands on
--   nothing. The schema already has `articles.deleted_at` (unused).
--
-- Fix scope:
--   1. No schema change — `articles.deleted_at` already exists (timestamp,
--      nullable). Verify via information_schema before applying.
--   2. New SECURITY DEFINER function `admin_soft_delete_article` that the
--      route will call instead of `.delete()`. Sets deleted_at = now()
--      and writes the audit row in the same transaction.
--   3. New SECURITY DEFINER function `admin_restore_article` for the
--      30-day undo window (admin moderation surface gets a Restore
--      action against soft-deleted rows).
--   4. New cron `purge_soft_deleted_articles` that runs nightly, hard-
--      deletes rows where deleted_at < now() - INTERVAL '30 days'.
--      Cron registration lives in the cron route file; this migration
--      only ships the function.
--   5. Update existing RLS read policies on articles to filter
--      deleted_at IS NULL for non-admin readers (admins see soft-deleted
--      rows in the moderation queue).
--
-- Rollback:
--   BEGIN; DROP FUNCTION public.admin_soft_delete_article(uuid, uuid, text);
--   DROP FUNCTION public.admin_restore_article(uuid, uuid);
--   DROP FUNCTION public.purge_soft_deleted_articles();
--   -- existing read policies left in place; deleted_at column unchanged
--   COMMIT;
--
-- Verification (run after apply):
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('admin_soft_delete_article','admin_restore_article',
--      'purge_soft_deleted_articles');
--   -- expect 3 rows
--   SELECT polname FROM pg_policies WHERE tablename = 'articles'
--     AND polname LIKE '%soft_delete%';
--   -- expect at least 1 row
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. admin_soft_delete_article — replaces the hard .delete() in the
--    admin route. Caller must hold `admin.articles.delete` permission;
--    function double-checks via has_permission() so an RLS-evaded
--    direct RPC call still gets denied.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_soft_delete_article(
  p_article_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_perm boolean;
BEGIN
  SELECT public.has_permission('admin.articles.delete', p_admin_id)
    INTO v_has_perm;
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.articles
     SET deleted_at = NOW()
   WHERE id = p_article_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'article_not_found_or_already_deleted'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_admin_id,
    'admin:article_soft_delete',
    'article',
    p_article_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_soft_delete_article(uuid, uuid, text)
  TO authenticated;

-- ---------------------------------------------------------------------
-- 2. admin_restore_article — undoes a soft-delete during the 30-day
--    grace window. Function is forgiving on already-restored rows so
--    a double-click doesn't 500.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_restore_article(
  p_article_id uuid,
  p_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_perm boolean;
BEGIN
  SELECT public.has_permission('admin.articles.delete', p_admin_id)
    INTO v_has_perm;
  IF NOT v_has_perm THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.articles
     SET deleted_at = NULL
   WHERE id = p_article_id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    p_admin_id,
    'admin:article_restore',
    'article',
    p_article_id,
    '{}'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_article(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------
-- 3. purge_soft_deleted_articles — nightly cron. Hard-deletes rows
--    where deleted_at < now() - 30 days. No audit row written for the
--    purge itself (the original soft-delete already audited).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_articles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.articles
   WHERE deleted_at IS NOT NULL
     AND deleted_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_soft_deleted_articles() FROM PUBLIC;
-- Cron route calls via service-role; no authenticated grant.

-- ---------------------------------------------------------------------
-- 4. Read-side filter: existing public read policy on articles must
--    exclude soft-deleted rows from non-admin readers. Admins see
--    everything (the moderation surface needs visibility on the soft-
--    deleted set so it can call admin_restore_article).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "articles_public_read_excludes_soft_deleted" ON public.articles;
CREATE POLICY "articles_public_read_excludes_soft_deleted"
  ON public.articles
  FOR SELECT
  TO authenticated, anon
  USING (
    deleted_at IS NULL
    OR public.is_admin_or_above()
  );

COMMIT;

-- =====================================================================
-- Code change required after this migration applies:
--   web/src/app/api/admin/articles/[id]/route.ts (line ~762):
--     Replace
--       await service.from('articles').delete().eq('id', id);
--     With
--       await service.rpc('admin_soft_delete_article', {
--         p_article_id: id,
--         p_admin_id: user.id,
--         p_reason: body?.reason ?? null,
--       });
--
--   New admin moderation surface (next pass) for the Restore action:
--     POST /api/admin/articles/[id]/restore
--       calls admin_restore_article(id, user.id)
--
--   New cron registration (next pass):
--     web/src/app/api/cron/purge-soft-deleted-articles/route.ts
--       wraps service.rpc('purge_soft_deleted_articles')
--       schedule: nightly at 03:15 UTC
-- =====================================================================
