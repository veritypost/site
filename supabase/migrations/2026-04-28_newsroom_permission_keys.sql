-- Session A — newsroom permission catalog + alias bridge (additive).
--
-- Decision 15 + M1 (AI-today.md): introduce the 5-key clean set used by
-- Sessions B/C without breaking any route still checking the legacy keys.
-- The alias table maps old → new; the auto-grant copies grants down so a
-- permission_set holding any old key implicitly holds the new one too.
-- Session E flips routes to the new keys exclusively and deactivates the
-- old ones.

INSERT INTO public.permissions
  (key, display_name, description, category, is_active, ui_section, deny_mode)
VALUES
  ('newsroom.run_feed',
   'Run Feed (manual ingest)',
   'Click Run Feed in Newsroom',
   'ui', true, 'admin_newsroom', 'locked'),
  ('newsroom.generate',
   'Generate audience article',
   'Click Generate on a Story card',
   'ui', true, 'admin_newsroom', 'locked'),
  ('newsroom.skip',
   'Skip audience',
   'Skip a Story audience',
   'ui', true, 'admin_newsroom', 'locked'),
  ('articles.edit',
   'Edit article',
   'Inline edit headline/url/body',
   'ui', true, 'article', 'locked'),
  ('articles.publish',
   'Publish article',
   'Publish or unpublish article',
   'ui', true, 'article', 'locked')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.permission_key_aliases (
  old_key text NOT NULL,
  new_key text NOT NULL,
  PRIMARY KEY (old_key, new_key)
);

INSERT INTO public.permission_key_aliases(old_key, new_key) VALUES
  ('admin.pipeline.run_ingest',      'newsroom.run_feed'),
  ('admin.pipeline.run_generate',    'newsroom.generate'),
  ('admin.ai.generate',              'newsroom.generate'),
  ('admin.articles.edit.any',        'articles.edit'),
  ('admin.articles.publish',         'articles.publish'),
  ('admin.articles.unpublish',       'articles.publish'),
  ('admin.articles.create',          'articles.edit'),
  ('admin.articles.ai_regenerate',   'newsroom.generate'),
  ('admin.pipeline.clusters.manage', 'newsroom.skip')
ON CONFLICT DO NOTHING;

-- Auto-grant: any permission_set already holding an old_key also gets
-- the new_key. permission_set_perms columns confirmed:
-- (permission_set_id uuid, permission_id uuid).
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
  SELECT psp.permission_set_id, p_new.id
    FROM public.permission_set_perms psp
    JOIN public.permissions p_old   ON p_old.id = psp.permission_id
    JOIN public.permission_key_aliases a ON a.old_key = p_old.key
    JOIN public.permissions p_new   ON p_new.key = a.new_key
ON CONFLICT DO NOTHING;
