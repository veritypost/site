-- Seed the 12 canonical ad placements that the web codebase references
-- via <Ad placement="..." /> + serve_ad(). Without these rows in
-- ad_placements, every ad slot on the site silently returns null.
--
-- Real ad creatives are added by admins as ad_units rows attached to
-- these placements via /admin/ad-placements UI — this migration ships
-- only the slot definitions, not creatives.
--
-- Idempotent: ON CONFLICT (name) DO NOTHING so re-running this migration
-- does not clobber any admin-edited row.
INSERT INTO ad_placements
  (name, display_name, page, position, placement_type, is_active, max_ads_per_page, priority)
VALUES
  ('article_header',       'Article — Header',        'article',  'header',        'banner',  true, 1, 100),
  ('article_in_body',      'Article — In Body',       'article',  'in_body',       'banner',  true, 1, 100),
  ('article_rail',         'Article — Right Rail',    'article',  'rail',          'sidebar', true, 1, 100),
  ('article_end',          'Article — End of Story',  'article',  'end',           'banner',  true, 1, 100),
  ('home_top',             'Home — Top',              'home',     'top',           'banner',  true, 1, 100),
  ('home_below_fold',      'Home — Below Fold',       'home',     'below_fold',    'banner',  true, 1, 100),
  ('home_in_feed_1',       'Home — In Feed #1',       'home',     'in_feed_1',     'in_feed', true, 1, 100),
  ('home_in_feed_2',       'Home — In Feed #2',       'home',     'in_feed_2',     'in_feed', true, 1, 100),
  ('browse_top',           'Browse — Top',            'browse',   'top',           'banner',  true, 1, 100),
  ('category_top',         'Category — Top',          'category', 'top',           'banner',  true, 1, 100),
  ('category_in_feed_1',   'Category — In Feed #1',   'category', 'in_feed_1',     'in_feed', true, 1, 100),
  ('mobile_sticky_footer', 'Mobile Sticky Footer',    'global',   'sticky_footer', 'banner',  true, 1, 100),
  ('home_feed',            'Home — In Feed (iOS)',    'home',     'in_feed',       'in_feed', true, 1, 100)
ON CONFLICT (name) DO NOTHING;
