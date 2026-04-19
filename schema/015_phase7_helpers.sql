-- ============================================================
-- Phase 7 — Bookmarks, Search, Social
-- Decisions: D13 (bookmarks 10-cap free / unlimited Verity+ with
-- collections + notes + export), D26 (basic search free / advanced
-- paid), D28 (follows paid-only), D32 (privacy free, customization
-- paid).
-- ============================================================

-- ------------------------------------------------------------
-- _user_is_paid(user_id) -> bool
-- Convenience gate used by triggers + RPCs.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._user_is_paid(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
     JOIN plans p ON p.id = u.plan_id
    WHERE u.id = p_user_id
      AND p.tier IN ('verity', 'verity_pro', 'verity_family', 'verity_family_xl')
  );
$$;


-- ------------------------------------------------------------
-- Bookmark cap enforcement (D13).
-- Free users cap at 10; paid users unlimited. Trigger fires
-- BEFORE INSERT on bookmarks — a hard server-side guard that
-- matches the UI counter on /bookmarks.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_bookmark_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF _user_is_paid(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO v_count FROM bookmarks WHERE user_id = NEW.user_id;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Free accounts are capped at 10 bookmarks. Upgrade to Verity for unlimited.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookmark_cap_trg ON bookmarks;
CREATE TRIGGER bookmark_cap_trg
  BEFORE INSERT ON bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_bookmark_cap();


-- ------------------------------------------------------------
-- Maintain bookmark_collections.bookmark_count as bookmarks
-- move in and out of collections.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bookmark_collection_count_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.collection_id IS NOT NULL THEN
    UPDATE bookmark_collections SET bookmark_count = bookmark_count + 1, updated_at = now()
     WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' AND OLD.collection_id IS NOT NULL THEN
    UPDATE bookmark_collections SET bookmark_count = GREATEST(bookmark_count - 1, 0), updated_at = now()
     WHERE id = OLD.collection_id;
  ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.collection_id::text, '') <> COALESCE(NEW.collection_id::text, '') THEN
    IF OLD.collection_id IS NOT NULL THEN
      UPDATE bookmark_collections SET bookmark_count = GREATEST(bookmark_count - 1, 0), updated_at = now()
       WHERE id = OLD.collection_id;
    END IF;
    IF NEW.collection_id IS NOT NULL THEN
      UPDATE bookmark_collections SET bookmark_count = bookmark_count + 1, updated_at = now()
       WHERE id = NEW.collection_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bookmark_collection_count_trg ON bookmarks;
CREATE TRIGGER bookmark_collection_count_trg
  AFTER INSERT OR UPDATE OR DELETE ON bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION bookmark_collection_count_sync();


-- ------------------------------------------------------------
-- create_bookmark_collection — paid-only (D13 collections are
-- a Verity+ perk).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_bookmark_collection(
  p_user_id uuid,
  p_name text,
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT _user_is_paid(p_user_id) THEN
    RAISE EXCEPTION 'collections require Verity or higher (D13)';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'collection name required';
  END IF;
  INSERT INTO bookmark_collections (user_id, name, description)
  VALUES (p_user_id, btrim(p_name), p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bookmark_collection(uuid, text, text) TO service_role;


-- ------------------------------------------------------------
-- rename_bookmark_collection — owner-only.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_bookmark_collection(
  p_user_id uuid,
  p_collection_id uuid,
  p_name text,
  p_description text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;
  UPDATE bookmark_collections
     SET name = btrim(p_name),
         description = p_description,
         updated_at = now()
   WHERE id = p_collection_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'collection not found'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_bookmark_collection(uuid, uuid, text, text) TO service_role;


-- ------------------------------------------------------------
-- delete_bookmark_collection — owner-only. Bookmarks become
-- uncategorised (collection_id -> NULL).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_bookmark_collection(
  p_user_id uuid,
  p_collection_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bookmarks SET collection_id = NULL
   WHERE collection_id = p_collection_id AND user_id = p_user_id;
  DELETE FROM bookmark_collections
   WHERE id = p_collection_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bookmark_collection(uuid, uuid) TO service_role;


-- ------------------------------------------------------------
-- Follows (D28) — paid-only. Toggle semantics.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_follow(
  p_follower_id uuid,
  p_target_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_now_following boolean;
BEGIN
  IF p_follower_id = p_target_id THEN
    RAISE EXCEPTION 'cannot follow yourself';
  END IF;
  IF NOT _user_is_paid(p_follower_id) THEN
    RAISE EXCEPTION 'following requires Verity or higher (D28)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  SELECT id INTO v_existing FROM follows
   WHERE follower_id = p_follower_id AND following_id = p_target_id;

  IF v_existing IS NOT NULL THEN
    DELETE FROM follows WHERE id = v_existing;
    v_now_following := false;
    UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = p_follower_id;
    UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = p_target_id;
  ELSE
    INSERT INTO follows (follower_id, following_id) VALUES (p_follower_id, p_target_id);
    v_now_following := true;
    UPDATE users SET following_count = following_count + 1 WHERE id = p_follower_id;
    UPDATE users SET followers_count = followers_count + 1 WHERE id = p_target_id;
  END IF;

  RETURN jsonb_build_object(
    'following', v_now_following,
    'target_id', p_target_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_follow(uuid, uuid) TO service_role;
