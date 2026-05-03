-- Session 3 — mint admin.newsroom.view + admin.breaking.view and grant to
-- admin + owner permission sets. admin.access_codes.* keys already exist.

INSERT INTO public.permissions (key, display_name, description, category, is_active, deny_mode)
VALUES
  ('admin.newsroom.view', 'View Newsroom', 'Access the Newsroom admin page', 'admin', true, 'locked'),
  ('admin.breaking.view', 'View Breaking News', 'Access the Breaking News admin page', 'admin', true, 'locked')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
  SELECT ps.id, p.id
    FROM public.permission_sets ps
    CROSS JOIN public.permissions p
   WHERE ps.key IN ('admin', 'owner')
     AND p.key IN ('admin.newsroom.view', 'admin.breaking.view')
ON CONFLICT DO NOTHING;
