-- =============================================================================
-- Ad Placements Decay Cleanup
-- =============================================================================
-- Cleans up stale / unused ad placements left over from earlier home-page
-- iterations and from test rows. Classification was determined by FK-safety
-- audit against ad_units and ad_impressions:
--
-- HARD DELETE (3 rows, FK-clean — no ad_units, no ad_impressions):
--   - 'dfdfdf'       (test row)
--   - 'sfsdsds'      (test row)
--   - 'browse_top'   (unused placement, never wired up)
--
-- SOFT RETIRE — set is_active=false (4 rows, have historical impressions
-- and/or attached ad_units; cannot be hard-deleted without losing data):
--   - 'home_top'
--   - 'home_below_fold'
--   - 'home_in_feed_1'
--   - 'home_in_feed_2'
--
-- For each soft-retired placement we also flip its attached ad_units to
-- is_active=false so the unit state is consistent with the placement state
-- (units shouldn't be "active" hanging off an inactive placement).
--
-- All operations run in a single transaction. Re-running is safe:
--   - DELETE … WHERE name IN (…) is idempotent (no-op once rows are gone).
--   - UPDATE … SET is_active=false is idempotent (already-false rows stay false).
-- =============================================================================

BEGIN;

-- 1) Hard delete FK-clean stale/test placements.
DELETE FROM ad_placements
WHERE name IN ('dfdfdf', 'sfsdsds', 'browse_top');

-- 2) Soft-retire placements that have historical impressions / attached units.
UPDATE ad_placements
SET is_active = false
WHERE name IN ('home_top', 'home_below_fold', 'home_in_feed_1', 'home_in_feed_2');

-- 3) Flip attached ad_units off so unit state matches placement state.
UPDATE ad_units
SET is_active = false
WHERE placement_id IN (
  SELECT id FROM ad_placements
  WHERE name IN ('home_top', 'home_below_fold', 'home_in_feed_1', 'home_in_feed_2')
);

-- 4) After-state: surviving active placement set (logged on apply).
SELECT name, page, position, is_active
FROM ad_placements
WHERE is_active = true
ORDER BY page, position, name;

COMMIT;
