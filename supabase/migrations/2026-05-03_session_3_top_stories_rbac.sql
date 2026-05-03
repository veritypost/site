-- Session 3 — top_stories RBAC hardening.
--
-- Closes P0 #1: any authenticated user could rewrite the front-page hero pin
-- because top_stories_write_authenticated used auth.role()='authenticated' for
-- ALL ops. Fix:
--   1. Drop the open write policy.
--   2. Add a service_role-only write policy (reads via the existing select
--      policy remain public; all admin writes now go through the server route
--      which uses the service client).
--   3. Mint admin.top_stories.manage permission and grant it to admin + owner
--      permission sets.

-- 1. Drop the open write policy.
DROP POLICY IF EXISTS top_stories_write_authenticated ON public.top_stories;

-- 2. Service-role-only write policy (INSERT / UPDATE / DELETE).
--    SELECT is unchanged (top_stories_select_public covers readers).
CREATE POLICY top_stories_service_role_all
  ON public.top_stories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Mint permission catalog row.
INSERT INTO public.permissions (key, display_name, description, category, sort_order)
VALUES (
  'admin.top_stories.manage',
  'Manage top stories',
  'Pin and unpin articles on the front-page hero pinboard',
  'admin',
  0
)
ON CONFLICT (key) DO NOTHING;

-- 4. Grant to admin + owner permission sets.
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE ps.key IN ('admin', 'owner')
  AND p.key = 'admin.top_stories.manage'
ON CONFLICT DO NOTHING;
