-- Seed the two settings rows that govern the registration wall across web + iOS adult.
-- registration_wall: master on/off. When false, no wall on either platform.
-- free_article_limit: how many articles an anon user can read before the wall fires.
-- iOS already reads these keys via SettingsService; web reads them in
-- /web/src/app/[slug]/page.tsx via the auth-aware client (force-dynamic page, no cache).
-- Both rows are is_public=true so anon clients (especially anon iOS) can read them
-- under the settings_select RLS policy.
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES
  (
    'registration_wall',
    'false',
    'boolean',
    'general',
    'Registration wall enabled',
    'Master switch for the post-N-reads sign-up nudge. When true, anon users see the wall after reading free_article_limit articles (web hides Timeline + Sources behind a tease; iOS pops a sign-up prompt). Off at launch.',
    true,
    false
  ),
  (
    'free_article_limit',
    '2',
    'number',
    'general',
    'Free articles before wall',
    'How many full articles an anon user reads before registration_wall fires. No effect when registration_wall is false.',
    true,
    false
  )
ON CONFLICT (key) DO NOTHING;
