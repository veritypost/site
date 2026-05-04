-- Seed three Verity-Post house ads attached to the three article body
-- placements (header, in_body, end) so anon visitors see promo for the
-- paid plans on every article. Stored as ad_units rows — no React or
-- copy hardcoded into the codebase. Owner can edit copy / image / CTA
-- target via /admin/ad-units at any time without a code change.
--
-- Idempotent on (name) so re-running this migration won't duplicate
-- the seeded rows. Depends on 20260503000009 having seeded the
-- canonical placements (article_header / article_in_body / article_end).
INSERT INTO ad_units (
  name,
  placement_id,
  ad_format,
  ad_network,
  advertiser_name,
  alt_text,
  creative_url,
  click_url,
  cta_text,
  approval_status,
  is_active,
  weight
)
SELECT
  'house · Verity Pro promo (header)',
  p.id,
  'banner',
  'house',
  'Verity Post',
  'Upgrade to Verity Pro for an ad-free, deeper-context reading experience',
  'https://placehold.co/728x90/111111/ffffff/png?text=Verity+Pro+%E2%80%94+ad-free%2C+deeper+context',
  '/pricing',
  'Try Verity Pro',
  'approved',
  true,
  100
FROM ad_placements p
WHERE p.name = 'article_header'
  AND NOT EXISTS (
    SELECT 1 FROM ad_units WHERE name = 'house · Verity Pro promo (header)'
  );

INSERT INTO ad_units (
  name,
  placement_id,
  ad_format,
  ad_network,
  advertiser_name,
  alt_text,
  creative_url,
  click_url,
  cta_text,
  approval_status,
  is_active,
  weight
)
SELECT
  'house · Verity Family promo (in body)',
  p.id,
  'banner',
  'house',
  'Verity Post',
  'Verity Family — share verified news with up to 4 kids',
  'https://placehold.co/728x90/4d8fff/ffffff/png?text=Verity+Family+%E2%80%94+up+to+4+kids',
  '/pricing',
  'Set up Verity Family',
  'approved',
  true,
  100
FROM ad_placements p
WHERE p.name = 'article_in_body'
  AND NOT EXISTS (
    SELECT 1 FROM ad_units WHERE name = 'house · Verity Family promo (in body)'
  );

INSERT INTO ad_units (
  name,
  placement_id,
  ad_format,
  ad_network,
  advertiser_name,
  alt_text,
  creative_url,
  click_url,
  cta_text,
  approval_status,
  is_active,
  weight
)
SELECT
  'house · Upgrade — no ads (end of story)',
  p.id,
  'banner',
  'house',
  'Verity Post',
  'Upgrade to Verity to remove ads',
  'https://placehold.co/728x90/22c55e/ffffff/png?text=Upgrade+%E2%80%94+No+ads%2C+full+timeline%2C+sources',
  '/pricing',
  'Upgrade',
  'approved',
  true,
  100
FROM ad_placements p
WHERE p.name = 'article_end'
  AND NOT EXISTS (
    SELECT 1 FROM ad_units WHERE name = 'house · Upgrade — no ads (end of story)'
  );
