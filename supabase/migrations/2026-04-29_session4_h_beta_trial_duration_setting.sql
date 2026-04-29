-- Session 4 Migration H — Settings row for beta trial duration.
-- The admin settings page renders rows by category dynamically;
-- this row appears in the "beta" category alongside beta_active.
INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES (
  'beta_trial_duration', '30', 'number', 'beta',
  'Beta Trial Duration (Days)',
  'Default trial duration (in days) granted to new beta signups. Per-user overrides available on the user dossier.',
  false, false
)
ON CONFLICT (key) DO NOTHING;
