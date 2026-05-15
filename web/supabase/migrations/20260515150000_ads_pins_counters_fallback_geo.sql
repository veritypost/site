-- Wave 1 — schema deltas for /admin/home redesign (§8).
-- Additive only. Re-runnable.
--
-- Tier mapping note: spec text says `verity_sub` (plans.id label) but the
-- actual value in `plans.tier` is `verity`. `_user_tier_or_anon` returns
-- the tier label. RLS + placement defaults use tier labels.

------------------------------------------------------------
-- 1. ad_placements: fallback ladder columns
------------------------------------------------------------
ALTER TABLE public.ad_placements
  ADD COLUMN IF NOT EXISTS fallback_network text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS fallback_network_unit_id text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_placements_fallback_network_check'
  ) THEN
    ALTER TABLE public.ad_placements
      ADD CONSTRAINT ad_placements_fallback_network_check
      CHECK (fallback_network IN ('none','adsense','admob','house'));
  END IF;
END$$;

COMMENT ON COLUMN public.ad_placements.fallback_network IS
  'Network to mount client-side when serve_ad returns no programmatic fill. ''none'' = collapse slot.';
COMMENT ON COLUMN public.ad_placements.fallback_network_unit_id IS
  'Network-specific unit id (AdSense slot id, AdMob unit id, or house creative key).';

------------------------------------------------------------
-- 2. ad_pins — one pin per placement (placement_id PK per §8 spec)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_pins (
  placement_id     uuid PRIMARY KEY REFERENCES public.ad_placements(id) ON DELETE CASCADE,
  ad_unit_id       uuid NOT NULL REFERENCES public.ad_units(id) ON DELETE CASCADE,
  pinned_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  pinned_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  reason           text,
  force_all_tiers  boolean NOT NULL DEFAULT false,
  bypass_freq_cap  boolean NOT NULL DEFAULT false,
  CONSTRAINT ad_pins_expires_after_pinned
    CHECK (expires_at IS NULL OR expires_at > pinned_at)
);

COMMENT ON TABLE public.ad_pins IS
  'Direct-sold pins. One row per placement (PK). Service-role writes only via admin route layer. Staging a future pin = expire current + insert next (no SQL-level staging). PK index covers lookup; no partial index because now() is STABLE not IMMUTABLE.';
COMMENT ON COLUMN public.ad_pins.force_all_tiers IS
  'When true, pin bypasses placement.hidden_for_tiers (override no-ads-for-verity default).';
COMMENT ON COLUMN public.ad_pins.bypass_freq_cap IS
  'When true, pin skips user/session/daily freq-counter checks.';

ALTER TABLE public.ad_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_pins_select ON public.ad_pins;
CREATE POLICY ad_pins_select ON public.ad_pins
  FOR SELECT USING (public.has_permission('admin.ads.pins.view'));

------------------------------------------------------------
-- 3. ad_freq_counters — pre-aggregated freq caps
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_freq_counters (
  ad_unit_id  uuid NOT NULL REFERENCES public.ad_units(id) ON DELETE CASCADE,
  scope       text NOT NULL CHECK (scope IN ('user','session','daily')),
  scope_key   text NOT NULL,
  count       int  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_unit_id, scope, scope_key)
);

COMMENT ON TABLE public.ad_freq_counters IS
  'Pre-aggregated frequency counters. Service-role writes only (impression trigger). scope=''daily'' uses date string YYYY-MM-DD as scope_key.';

ALTER TABLE public.ad_freq_counters ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------
-- 4. ad_target_geo — admin-write-only this wave
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_target_geo (
  ad_unit_id   uuid NOT NULL REFERENCES public.ad_units(id) ON DELETE CASCADE,
  mode         text NOT NULL CHECK (mode IN ('include','exclude')),
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  PRIMARY KEY (ad_unit_id, mode, country_code)
);

COMMENT ON TABLE public.ad_target_geo IS
  'Per-creative geo allow/deny list (ISO 3166-1 alpha-2). Resolver integration deferred to wave where /api/ads/serve gains country_code param. Wave 1 ships table only for admin UI write target.';

ALTER TABLE public.ad_target_geo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_target_geo_select ON public.ad_target_geo;
CREATE POLICY ad_target_geo_select ON public.ad_target_geo
  FOR SELECT USING (public.has_permission('admin.ads.view'));

------------------------------------------------------------
-- 5. Permission rows for pin management (match sibling convention)
------------------------------------------------------------
INSERT INTO public.permissions (key, display_name, description, category, sort_order) VALUES
  ('admin.ads.pins.create', 'Ad pins: create', 'Create direct-sold ad pins',   'ui', 0),
  ('admin.ads.pins.edit',   'Ad pins: edit',   'Edit direct-sold ad pins',     'ui', 0),
  ('admin.ads.pins.delete', 'Ad pins: delete', 'Remove direct-sold ad pins',   'ui', 0),
  ('admin.ads.pins.view',   'Ad pins: view',   'View direct-sold ad pins',     'ui', 0)
ON CONFLICT (key) DO NOTHING;

------------------------------------------------------------
-- 6. Backfill ad_freq_counters from existing ad_impressions
------------------------------------------------------------
INSERT INTO public.ad_freq_counters (ad_unit_id, scope, scope_key, count, updated_at)
SELECT ad_unit_id, 'user', user_id::text, count(*), now()
FROM public.ad_impressions
WHERE user_id IS NOT NULL
GROUP BY ad_unit_id, user_id
ON CONFLICT (ad_unit_id, scope, scope_key) DO UPDATE SET count = EXCLUDED.count;

INSERT INTO public.ad_freq_counters (ad_unit_id, scope, scope_key, count, updated_at)
SELECT ad_unit_id, 'session', session_id::text, count(*), now()
FROM public.ad_impressions
WHERE session_id IS NOT NULL
GROUP BY ad_unit_id, session_id
ON CONFLICT (ad_unit_id, scope, scope_key) DO UPDATE SET count = EXCLUDED.count;

INSERT INTO public.ad_freq_counters (ad_unit_id, scope, scope_key, count, updated_at)
SELECT ad_unit_id, 'daily', to_char(created_at, 'YYYY-MM-DD'), count(*), now()
FROM public.ad_impressions
GROUP BY ad_unit_id, to_char(created_at, 'YYYY-MM-DD')
ON CONFLICT (ad_unit_id, scope, scope_key) DO UPDATE SET count = EXCLUDED.count;
