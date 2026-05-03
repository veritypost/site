-- Session 3 follow-up — mint admin.webhooks.view for the canonical page gate.
INSERT INTO public.permissions (key, display_name, description, category, is_active, deny_mode)
VALUES
  ('admin.webhooks.view', 'View Webhooks', 'Access the Webhooks admin page', 'admin', true, 'locked')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
  FROM public.permission_sets ps
  CROSS JOIN public.permissions p
 WHERE ps.key IN ('admin', 'owner')
   AND p.key = 'admin.webhooks.view'
ON CONFLICT DO NOTHING;
