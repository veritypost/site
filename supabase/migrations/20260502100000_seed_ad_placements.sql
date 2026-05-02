-- Seed ad_placements rows for the 13 live slots + 1 deferred (browse_sidebar).
-- ON CONFLICT DO NOTHING makes this idempotent; safe to re-run.
-- hidden_for_tiers is text[] (not jsonb) per database.ts Row definition.

INSERT INTO ad_placements (name, display_name, placement_type, platform, page, position, hidden_for_tiers, max_ads_per_page, is_kids_safe, is_active)
VALUES
  -- Home
  ('home_top',             'Home — Top',                'banner',       'web', 'home',     'top',          ARRAY['verity_plus'], 1, false, true),
  ('home_in_feed_1',       'Home — In-Feed 1',          'in_feed',      'web', 'home',     'in_feed_1',    ARRAY['verity_plus'], 1, false, true),
  ('home_in_feed_2',       'Home — In-Feed 2',          'in_feed',      'web', 'home',     'in_feed_2',    ARRAY['verity_plus'], 1, false, true),
  ('home_below_fold',      'Home — Below Fold',         'banner',       'web', 'home',     'below_fold',   ARRAY['verity_plus'], 1, false, true),
  -- Browse
  ('browse_top',           'Browse — Top',              'banner',       'web', 'browse',   'top',          ARRAY['verity_plus'], 1, false, true),
  ('browse_sidebar',       'Browse — Sidebar',          'sidebar',      'web', 'browse',   'sidebar',      ARRAY['verity_plus'], 1, false, false),
  -- Category
  ('category_top',         'Category — Top',            'banner',       'web', 'category', 'top',          ARRAY['verity_plus'], 1, false, true),
  ('category_in_feed_1',   'Category — In-Feed 1',      'in_feed',      'web', 'category', 'in_feed_1',    ARRAY['verity_plus'], 1, false, true),
  -- Article
  ('article_header',       'Article — Header',          'banner',       'web', 'article',  'header',       ARRAY['verity_plus'], 1, false, true),
  ('article_in_body',      'Article — In Body',         'in_feed',      'web', 'article',  'in_body',      ARRAY['verity_plus'], 1, false, true),
  ('article_end',          'Article — End',             'banner',       'web', 'article',  'end',          ARRAY['verity_plus'], 1, false, true),
  ('article_rail',         'Article — Rail',            'sidebar',      'web', 'article',  'rail',         ARRAY['verity_plus'], 1, false, true),
  ('article_quiz_interstitial', 'Article — Quiz Interstitial', 'interstitial', 'web', 'article', 'quiz_interstitial', ARRAY['verity_plus'], 1, false, true),
  -- Mobile (all surfaces)
  ('mobile_sticky_footer', 'Mobile — Sticky Footer',   'sticky_footer','web', 'all',      'sticky_footer',ARRAY['verity_plus'], 1, false, true)
ON CONFLICT (name) DO NOTHING;
