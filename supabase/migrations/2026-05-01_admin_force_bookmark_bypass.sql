-- admin_force_bookmark: SECURITY DEFINER insert that bypasses the
-- enforce_bookmark_cap trigger via session_replication_role = 'replica'.
-- Called exclusively from the bookmarks API route when the requesting
-- user has admin.god_mode (verified app-side before this RPC is invoked).
-- Only callable by service_role.
CREATE OR REPLACE FUNCTION public.admin_force_bookmark(
  p_user_id     uuid,
  p_article_id  uuid,
  p_collection_id uuid DEFAULT NULL,
  p_notes       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Disable per-row triggers for this transaction so enforce_bookmark_cap
  -- does not fire. SECURITY DEFINER owned by postgres (superuser) allows
  -- the session_replication_role change; SET LOCAL scopes it to this call.
  SET LOCAL session_replication_role = 'replica';
  INSERT INTO public.bookmarks (user_id, article_id, collection_id, notes)
  VALUES (p_user_id, p_article_id, p_collection_id, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_force_bookmark(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_force_bookmark(uuid, uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_force_bookmark(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_force_bookmark(uuid, uuid, uuid, text) TO service_role;
