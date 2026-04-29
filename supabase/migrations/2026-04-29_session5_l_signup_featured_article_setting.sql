-- Migration L: Featured article setting for /signup landing page.
-- Admin can pin a specific article id or slug here; blank = auto-pick.
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES (
  'signup_featured_article_id',
  '',
  'string',
  'general',
  'Featured article on /signup',
  'Story id or slug to render in the /signup sample. Leave blank to auto-pick the most recent verified piece.',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;
