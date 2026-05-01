-- Section A — multi-kind comment tags.
--
-- Pre-existing schema (verified via web/src/types/database.ts):
--   comment_context_tags (id, comment_id, user_id, tag_type text, created_at)
--   FK fk_comment_context_tags_comment_id, fk_comment_context_tags_user_id.
--   RPC public.toggle_context_tag(p_user_id, p_comment_id) → jsonb.
--   Counter: comments.context_tag_count + auto-pin on threshold.
--
-- This migration:
--   1. Renames `tag_type` → `tag_kind` (uniform with the new enum-set).
--   2. Backfills/locks the column NOT NULL DEFAULT 'context'.
--   3. Replaces any existing CHECK with the 6-kind enum check.
--   4. Replaces (comment_id,user_id) uniqueness with
--      (comment_id,user_id,tag_kind) so a user can apply multiple
--      *different* kinds to the same comment but still cannot
--      double-cast the same kind.
--   5. Adds comments.helpful_count maintained by trigger.
--   6. Replaces the RPC body to accept p_tag_kind (default 'context'
--      preserves backward compat for any caller that didn't ship the
--      arg yet) and to maintain context-pinning only when kind='context'.
--   7. Tightens RLS so a row-level SELECT only returns the caller's
--      own tags, regardless of comment authorship — defensive in case
--      a permissive policy was inherited from the original migration
--      (Investigator could not MCP-verify policies in this session).
--
-- All changes idempotent so a partial prior run doesn't block re-apply.

BEGIN;

-- 1. Column rename: tag_type → tag_kind (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='comment_context_tags' AND column_name='tag_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='comment_context_tags' AND column_name='tag_kind'
  ) THEN
    ALTER TABLE public.comment_context_tags RENAME COLUMN tag_type TO tag_kind;
  END IF;
END$$;

-- 2. Backfill + lock NOT NULL + default.
UPDATE public.comment_context_tags SET tag_kind = 'context' WHERE tag_kind IS NULL;
ALTER TABLE public.comment_context_tags
  ALTER COLUMN tag_kind SET DEFAULT 'context',
  ALTER COLUMN tag_kind SET NOT NULL;

-- 3. Drop any CHECK constraint on tag_kind, install the canonical one.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'comment_context_tags'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.comment_context_tags DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE public.comment_context_tags
  ADD CONSTRAINT comment_context_tags_tag_kind_check
  CHECK (tag_kind IN ('context','helpful','insightful','sarcastic','cite_needed','off_topic'));

-- 4. Drop any old (comment_id, user_id) uniqueness; install the
--    triple-column uniqueness so different kinds can co-exist per (user,
--    comment) pair while still single-casting per kind.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'comment_context_tags'
      AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.comment_context_tags DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

-- Drop any matching unique INDEX (uniqueness sometimes lives as a bare
-- unique index rather than a constraint; both forms must go).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT i.relname
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'comment_context_tags'
      AND ix.indisunique
      AND NOT ix.indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.relname);
  END LOOP;
END$$;

ALTER TABLE public.comment_context_tags
  ADD CONSTRAINT comment_context_tags_unique_per_kind
  UNIQUE (comment_id, user_id, tag_kind);

-- 5. comments.helpful_count + trigger.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._comment_helpful_count_trg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tag_kind = 'helpful' THEN
    UPDATE public.comments
       SET helpful_count = helpful_count + 1
     WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' AND OLD.tag_kind = 'helpful' THEN
    UPDATE public.comments
       SET helpful_count = GREATEST(0, helpful_count - 1)
     WHERE id = OLD.comment_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END$$;

DROP TRIGGER IF EXISTS comment_context_tags_helpful_count ON public.comment_context_tags;
CREATE TRIGGER comment_context_tags_helpful_count
AFTER INSERT OR DELETE ON public.comment_context_tags
FOR EACH ROW EXECUTE FUNCTION public._comment_helpful_count_trg();

-- Backfill helpful_count once so existing rows reconcile to truth.
UPDATE public.comments c
   SET helpful_count = sub.cnt
  FROM (
    SELECT comment_id, COUNT(*)::int AS cnt
    FROM public.comment_context_tags
    WHERE tag_kind = 'helpful'
    GROUP BY comment_id
  ) sub
 WHERE sub.comment_id = c.id
   AND c.helpful_count IS DISTINCT FROM sub.cnt;

-- 6. Replace the RPC. Keeps the old (p_user_id, p_comment_id) signature
--    working via a default p_tag_kind, so a slow-rolling client deploy
--    won't break. Self-tag rejection is the API rule the boundary route
--    asserts; replicate it here so RPC callers (and the iOS client)
--    can't bypass.
CREATE OR REPLACE FUNCTION public.toggle_context_tag(
  p_user_id    uuid,
  p_comment_id uuid,
  p_tag_kind   text DEFAULT 'context'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_comment      comments%ROWTYPE;
  v_existing_id  uuid;
  v_now          timestamptz := now();
  v_threshold    int;
  v_tagged       boolean;
  v_count        int;
  v_helpful      int;
  v_is_pinned    boolean;
BEGIN
  IF p_tag_kind IS NULL OR p_tag_kind NOT IN
       ('context','helpful','insightful','sarcastic','cite_needed','off_topic') THEN
    RAISE EXCEPTION 'invalid_tag_kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_comment FROM public.comments WHERE id = p_comment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_comment.user_id = p_user_id THEN
    RAISE EXCEPTION 'cannot_tag_own_comment' USING ERRCODE = '42501';
  END IF;

  -- Toggle: insert if absent, delete if present.
  SELECT id INTO v_existing_id
    FROM public.comment_context_tags
   WHERE comment_id = p_comment_id
     AND user_id = p_user_id
     AND tag_kind = p_tag_kind;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.comment_context_tags (comment_id, user_id, tag_kind, created_at)
    VALUES (p_comment_id, p_user_id, p_tag_kind, v_now);
    v_tagged := TRUE;
  ELSE
    DELETE FROM public.comment_context_tags WHERE id = v_existing_id;
    v_tagged := FALSE;
  END IF;

  -- Maintain context_tag_count + auto-pin only for the 'context' kind.
  IF p_tag_kind = 'context' THEN
    SELECT COUNT(*)::int INTO v_count
      FROM public.comment_context_tags
     WHERE comment_id = p_comment_id AND tag_kind = 'context';

    -- Threshold pulled from settings (fallback 5 mirrors prior default).
    v_threshold := COALESCE(_setting_int('context_tag_pin_threshold', 5), 5);

    IF v_count >= v_threshold AND NOT COALESCE(v_comment.is_context_pinned, FALSE) THEN
      UPDATE public.comments
         SET context_tag_count   = v_count,
             is_context_pinned   = TRUE,
             context_pinned_at   = v_now
       WHERE id = p_comment_id;
      v_is_pinned := TRUE;
    ELSE
      UPDATE public.comments
         SET context_tag_count = v_count
       WHERE id = p_comment_id;
      v_is_pinned := COALESCE(v_comment.is_context_pinned, FALSE);
    END IF;
  ELSE
    v_count     := COALESCE(v_comment.context_tag_count, 0);
    v_is_pinned := COALESCE(v_comment.is_context_pinned, FALSE);
  END IF;

  -- helpful_count is maintained by trigger; just read it back.
  SELECT helpful_count INTO v_helpful FROM public.comments WHERE id = p_comment_id;

  RETURN jsonb_build_object(
    'tagged',        v_tagged,
    'count',         v_count,
    'tag_kind',      p_tag_kind,
    'helpful_count', COALESCE(v_helpful, 0),
    'is_pinned',     v_is_pinned
  );
END$$;

REVOKE ALL ON FUNCTION public.toggle_context_tag(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_context_tag(uuid, uuid, text) TO authenticated, service_role;

-- The 2-arg signature continues to exist as the implicit default-arg form
-- of the 3-arg function, so old PostgREST calls without `p_tag_kind`
-- still resolve. We do NOT keep a separate 2-arg overload — that would
-- create function-resolution ambiguity at PostgREST.

-- 7. RLS tightening on comment_context_tags. Unconditionally drop and
--    recreate the relevant policies so the row-level read is restricted
--    to the caller's own user_id. Public aggregate counts come from
--    `comments.context_tag_count` / `comments.helpful_count`, not from
--    direct table SELECTs, so this does not break any UI surface.
ALTER TABLE public.comment_context_tags ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='comment_context_tags'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.comment_context_tags', r.policyname);
  END LOOP;
END$$;

CREATE POLICY comment_context_tags_select_own
  ON public.comment_context_tags
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts/deletes are funneled through the RPC (SECURITY DEFINER), so
-- direct authenticated mutations are not part of any client path. We
-- still allow self-row insert/delete as a defense-in-depth fallback in
-- case a future surface bypasses the RPC for the toggle.
CREATE POLICY comment_context_tags_insert_own
  ON public.comment_context_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY comment_context_tags_delete_own
  ON public.comment_context_tags
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;
