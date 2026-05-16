-- Reading preferences on public.users
-- Adds three persistent reading-experience prefs that today live only in
-- localStorage / @AppStorage. Backing the prefs in the DB lets us sync across
-- devices and surface them in the redesigned settings rail.
--
-- Columns:
--   reading_default_mode  text  default 'standard'  (CHECK: standard | reader)
--   reading_text_size     text  default 'md'        (CHECK: sm | md | lg)
--   reading_theme         text  default 'system'    (CHECK: system | light | dark)
--
-- Theme values match the existing iOS `vp_theme` @AppStorage and web localStorage
-- key (system | light | dark). Text size and default mode are greenfield; values
-- chosen to be short and stable.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reading_default_mode text NOT NULL DEFAULT 'standard';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reading_text_size text NOT NULL DEFAULT 'md';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reading_theme text NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_reading_default_mode_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_reading_default_mode_chk
      CHECK (reading_default_mode IN ('standard', 'reader'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_reading_text_size_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_reading_text_size_chk
      CHECK (reading_text_size IN ('sm', 'md', 'lg'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_reading_theme_chk'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_reading_theme_chk
      CHECK (reading_theme IN ('system', 'light', 'dark'));
  END IF;
END $$;

COMMENT ON COLUMN public.users.reading_default_mode IS
  'Default article reading mode. standard = full layout with rail/figures; reader = minimal large-text reader view.';
COMMENT ON COLUMN public.users.reading_text_size IS
  'Reading text size preference. sm | md | lg. Drives article body type scale on web + iOS.';
COMMENT ON COLUMN public.users.reading_theme IS
  'Color theme preference. system follows OS; light/dark override. Mirrors iOS @AppStorage(vp_theme) and web localStorage vp_theme.';
