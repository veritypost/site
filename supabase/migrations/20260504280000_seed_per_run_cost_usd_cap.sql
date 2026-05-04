-- Slice 4 / Finding #9 — bump per_run_cost_usd_cap default from $0.50 to $1.00.
-- Row already exists (seeded in a prior session); DO UPDATE sets the new value.
INSERT INTO settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES (
  'pipeline.per_run_cost_usd_cap',
  '1.0',
  'number',
  'pipeline',
  'Per-run cost cap (USD)',
  'Max cost per single cluster generation',
  false,
  false
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value;
