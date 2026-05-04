-- Seed five Verity-Post house ads on the home-page placements (web +
-- iOS). Mirrors the article-page seed (20260503000010): copy lives in
-- ad_units rows so the owner can edit any of them via /admin/ad-units
-- without a code change.
--
-- Idempotent on (name) — re-running won't duplicate.
-- Depends on 20260503000009 (placements seed) including home_feed.

INSERT INTO ad_units (
  name, placement_id, ad_format, ad_network, advertiser_name,
  alt_text, creative_url, click_url, cta_text,
  approval_status, is_active, weight
)
SELECT
  'house · Home top — Try Verity',
  p.id, 'banner', 'house', 'Verity Post',
  'Try Verity for $7.99/mo — unlimited reading, ad-free',
  'https://placehold.co/728x90/111111/ffffff/png?text=Try+Verity+%E2%80%94+%247.99%2Fmo%2C+ad-free',
  '/pricing', 'Try Verity', 'approved', true, 100
FROM ad_placements p
WHERE p.name = 'home_top'
  AND NOT EXISTS (SELECT 1 FROM ad_units WHERE name = 'house · Home top — Try Verity');

INSERT INTO ad_units (
  name, placement_id, ad_format, ad_network, advertiser_name,
  alt_text, creative_url, click_url, cta_text,
  approval_status, is_active, weight
)
SELECT
  'house · Home below fold — Verity Family',
  p.id, 'banner', 'house', 'Verity Post',
  'Verity Family — share verified news with up to 4 kids',
  'https://placehold.co/728x90/4d8fff/ffffff/png?text=Verity+Family+%E2%80%94+up+to+4+kids',
  '/pricing', 'Set up Verity Family', 'approved', true, 100
FROM ad_placements p
WHERE p.name = 'home_below_fold'
  AND NOT EXISTS (SELECT 1 FROM ad_units WHERE name = 'house · Home below fold — Verity Family');

INSERT INTO ad_units (
  name, placement_id, ad_format, ad_network, advertiser_name,
  alt_text, creative_url, click_url, cta_text,
  approval_status, is_active, weight
)
SELECT
  'house · Home in-feed #1 — Upgrade no ads',
  p.id, 'in_feed', 'house', 'Verity Post',
  'Upgrade to Verity to remove ads, get sources + timeline',
  'https://placehold.co/728x90/22c55e/ffffff/png?text=Upgrade+%E2%80%94+No+ads%2C+full+timeline%2C+sources',
  '/pricing', 'Upgrade', 'approved', true, 100
FROM ad_placements p
WHERE p.name = 'home_in_feed_1'
  AND NOT EXISTS (SELECT 1 FROM ad_units WHERE name = 'house · Home in-feed #1 — Upgrade no ads');

INSERT INTO ad_units (
  name, placement_id, ad_format, ad_network, advertiser_name,
  alt_text, creative_url, click_url, cta_text,
  approval_status, is_active, weight
)
SELECT
  'house · Home in-feed #2 — Earn the discussion',
  p.id, 'in_feed', 'house', 'Verity Post',
  'Earn the discussion — comments unlocked when you pass the comprehension quiz',
  'https://placehold.co/728x90/0a0a0a/fafafa/png?text=Earn+the+discussion+%E2%80%94+pass+the+quiz',
  '/signup', 'Create account', 'approved', true, 100
FROM ad_placements p
WHERE p.name = 'home_in_feed_2'
  AND NOT EXISTS (SELECT 1 FROM ad_units WHERE name = 'house · Home in-feed #2 — Earn the discussion');

INSERT INTO ad_units (
  name, placement_id, ad_format, ad_network, advertiser_name,
  alt_text, creative_url, click_url, cta_text,
  approval_status, is_active, weight
)
SELECT
  'house · Home feed (iOS) — Try Verity',
  p.id, 'in_feed', 'house', 'Verity Post',
  'Try Verity — unlimited reading, ad-free',
  'https://placehold.co/728x90/111111/ffffff/png?text=Try+Verity+%E2%80%94+%247.99%2Fmo%2C+ad-free',
  '/pricing', 'Try Verity', 'approved', true, 100
FROM ad_placements p
WHERE p.name = 'home_feed'
  AND NOT EXISTS (SELECT 1 FROM ad_units WHERE name = 'house · Home feed (iOS) — Try Verity');
