-- 104_seed_blocked_words.sql
-- T-015 — seed blocked_words. Comment path queried `blocked_words`
-- but the table had 0 rows, so no profanity filtering fired.
-- `admin/comments/page.tsx:92` references this table for the UI
-- count; admin/words manages it.
--
-- Starter list: clearly-profane English terms only. Stays conservative
-- on ambiguous / reclaimed terms since the action is hard-reject, not
-- asterisk-mask. Admin can extend via /admin/words.
--
-- Idempotent via ON CONFLICT (word). Severity high = slurs (action
-- deny, applies everywhere); medium = general profanity (default
-- action 'flag' per column default — admin can tighten to 'deny' for
-- any row).

INSERT INTO public.blocked_words (word, severity, action, language) VALUES
  -- Common English profanity (medium severity, default 'flag' action
  -- per table default; admin may escalate to 'deny' per-row).
  ('fuck',      'medium', 'flag', 'en'),
  ('fucking',   'medium', 'flag', 'en'),
  ('fucker',    'medium', 'flag', 'en'),
  ('fuckers',   'medium', 'flag', 'en'),
  ('shit',      'medium', 'flag', 'en'),
  ('shitty',    'medium', 'flag', 'en'),
  ('bullshit',  'medium', 'flag', 'en'),
  ('asshole',   'medium', 'flag', 'en'),
  ('assholes',  'medium', 'flag', 'en'),
  ('bitch',     'medium', 'flag', 'en'),
  ('bitches',   'medium', 'flag', 'en'),
  ('cunt',      'high',   'deny', 'en'),
  ('cunts',     'high',   'deny', 'en'),
  ('dick',      'medium', 'flag', 'en'),
  ('dickhead',  'medium', 'flag', 'en'),
  ('douche',    'medium', 'flag', 'en'),
  ('douchebag', 'medium', 'flag', 'en'),
  ('pussy',     'medium', 'flag', 'en'),
  ('bastard',   'medium', 'flag', 'en'),
  ('piss',      'low',    'flag', 'en'),
  ('pissed',    'low',    'flag', 'en'),

  -- Sexual / obscene
  ('whore',     'high',   'deny', 'en'),
  ('slut',      'high',   'deny', 'en'),
  ('sluts',     'high',   'deny', 'en'),

  -- Slurs (high severity, deny). Kept deliberately short — the goal
  -- is shipping a non-empty table, not a comprehensive filter. Admin
  -- extends via /admin/words.
  ('faggot',    'high',   'deny', 'en'),
  ('fag',       'high',   'deny', 'en'),
  ('nigger',    'high',   'deny', 'en'),
  ('nigga',     'high',   'deny', 'en'),
  ('retard',    'high',   'deny', 'en'),
  ('retarded',  'high',   'deny', 'en'),
  ('tranny',    'high',   'deny', 'en'),
  ('spic',      'high',   'deny', 'en'),
  ('kike',      'high',   'deny', 'en'),
  ('chink',     'high',   'deny', 'en')
ON CONFLICT (word) DO NOTHING;
