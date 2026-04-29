-- Session 4 Migration J — Per-user trial override columns.
-- trial_extension_until: admin sets to extend/shorten a user's trial beyond comped_until.
--   null = no override; cron uses coalesce(trial_extension_until, comped_until).
--   null comped_until + null trial_extension_until = no expiry (lifetime).
-- trial_extended_seen_at: set when user dismisses the one-time "trial extended" banner.
--   null = banner not yet dismissed.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_extension_until timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_extended_seen_at timestamptz;

COMMENT ON COLUMN public.users.trial_extension_until IS 'Admin override: extends/shortens trial expiry beyond comped_until. null = no override. Cron uses coalesce(trial_extension_until, comped_until).';
COMMENT ON COLUMN public.users.trial_extended_seen_at IS 'Timestamp when user dismissed the one-time "your trial was extended" banner. null = not yet dismissed.';
