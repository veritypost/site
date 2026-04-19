-- Limit reply depth to 2 so threads stay at 3 tiers total:
--   depth 0: root post
--   depth 1: reply
--   depth 2: reply to reply      <- deepest allowed
-- No further nesting.

UPDATE settings SET value = '2', updated_at = now()
 WHERE key = 'comment_max_depth';
