-- 103_seed_reserved_usernames.sql
-- T-014 — seed reserved_usernames. Before this seed ran, signup
-- accepted any username including admin/root/system/owner. The
-- `reserved_usernames` table exists with a UNIQUE index on `username`
-- but had 0 rows, so nothing was reserved.
--
-- The signup validator and `/api/auth/resolve-username` query this
-- table (see also the admin/words UI at /admin/words).
--
-- Keep the list conservative: system/brand/role names and obvious
-- impersonation vectors. Admin can extend via /admin/words without
-- another migration. Idempotent via ON CONFLICT (username).

INSERT INTO public.reserved_usernames (username, reason) VALUES
  -- System / brand
  ('admin',            'system'),
  ('administrator',    'system'),
  ('root',             'system'),
  ('system',           'system'),
  ('superadmin',       'system'),
  ('moderator',        'system'),
  ('owner',            'system'),
  ('official',         'system'),
  ('staff',            'system'),
  ('team',             'system'),
  ('support',          'system'),
  ('help',             'system'),
  ('contact',          'system'),
  ('info',             'system'),
  ('security',         'system'),
  ('legal',            'system'),
  ('privacy',          'system'),
  ('abuse',            'system'),
  ('noreply',          'system'),
  ('no-reply',         'system'),
  ('postmaster',       'system'),
  ('webmaster',        'system'),
  ('hostmaster',       'system'),
  ('billing',          'system'),
  ('accounts',         'system'),
  ('account',          'system'),

  -- Brand
  ('verity',           'brand'),
  ('veritypost',       'brand'),
  ('verity_post',      'brand'),
  ('verity-post',      'brand'),
  ('veritynews',       'brand'),
  ('editor',           'brand'),
  ('editorial',        'brand'),
  ('news',             'brand'),
  ('press',            'brand'),

  -- Surface / route names (collide with URL paths)
  ('www',              'route'),
  ('mail',             'route'),
  ('api',              'route'),
  ('app',              'route'),
  ('auth',             'route'),
  ('login',            'route'),
  ('logout',           'route'),
  ('signup',           'route'),
  ('signin',           'route'),
  ('register',         'route'),
  ('reset',            'route'),
  ('verify',           'route'),
  ('welcome',          'route'),
  ('settings',         'route'),
  ('profile',          'route'),
  ('home',             'route'),
  ('feed',             'route'),
  ('search',           'route'),
  ('explore',          'route'),
  ('discover',         'route'),
  ('bookmarks',        'route'),
  ('messages',         'route'),
  ('notifications',    'route'),
  ('leaderboard',      'route'),
  ('story',            'route'),
  ('stories',          'route'),
  ('article',          'route'),
  ('articles',         'route'),
  ('kids',             'route'),
  ('kid',              'route'),
  ('family',           'route'),
  ('experts',          'route'),
  ('expert',           'route'),
  ('recap',            'route'),
  ('about',            'route'),
  ('terms',            'route'),
  ('tos',              'route'),
  ('status',           'route'),
  ('transparency',     'route'),
  ('careers',          'route'),
  ('jobs',             'route'),
  ('blog',             'route')
ON CONFLICT (username) DO NOTHING;
