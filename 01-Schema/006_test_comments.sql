-- ============================================================
-- Test Comments + Reading Log + Quiz Attempts
-- Run in Supabase SQL Editor (bypasses RLS)
-- ============================================================

-- Add comments from various users on articles
INSERT INTO "comments" ("article_id", "user_id", "body", "status", "upvote_count")
SELECT
  a.id,
  u.id,
  c.body,
  'published',
  floor(random() * 20)::int
FROM
  (SELECT id, row_number() OVER () as rn FROM articles WHERE status = 'published' LIMIT 10) a,
  (SELECT id, row_number() OVER () as rn FROM users WHERE username IS NOT NULL AND username NOT LIKE 'test_banned%' AND username NOT LIKE 'test_kid%' ORDER BY random() LIMIT 30) u,
  (VALUES
    ('Great reporting on this. The implications are far-reaching.'),
    ('I think this needs more context. What about the opposing viewpoint?'),
    ('This is exactly why we need better policy frameworks.'),
    ('Fascinating. I had no idea the numbers were this significant.'),
    ('Can anyone verify the sources on this? I want to share it.'),
    ('This aligns with what experts have been saying for years.'),
    ('Important story. More people need to be aware of this.'),
    ('The data here tells a compelling story.'),
    ('I disagree with the framing but the facts seem solid.'),
    ('Thanks for covering this.'),
    ('Well written. Clear and concise.'),
    ('This changes my perspective on the issue.'),
    ('Would love to see a follow-up on the economic impact.'),
    ('The timeline of events really helps put things in context.'),
    ('Shared this with my family. Important for everyone to understand.')
  ) AS c(body)
WHERE a.rn = (u.rn % 10) + 1
  AND random() < 0.3
LIMIT 80;

-- Update article comment counts
UPDATE articles SET comment_count = (
  SELECT count(*) FROM comments WHERE comments.article_id = articles.id AND comments.status = 'published'
);

-- Add some reading log entries
INSERT INTO "reading_log" ("user_id", "article_id", "completed", "read_percentage", "time_spent_seconds", "points_earned")
SELECT
  u.id,
  a.id,
  true,
  (0.8 + random() * 0.2)::float,
  (120 + floor(random() * 300))::int,
  5
FROM
  (SELECT id FROM users WHERE username IS NOT NULL ORDER BY random() LIMIT 25) u
CROSS JOIN
  (SELECT id FROM articles WHERE status = 'published' ORDER BY random() LIMIT 5) a
WHERE random() < 0.6;

-- Update article view counts
UPDATE articles SET view_count = (
  SELECT count(*) FROM reading_log WHERE reading_log.article_id = articles.id AND reading_log.completed = true
);

-- Add some comment votes
INSERT INTO "comment_votes" ("comment_id", "user_id", "vote_type")
SELECT
  c.id,
  u.id,
  'upvote'
FROM
  (SELECT id FROM comments WHERE status = 'published' ORDER BY random() LIMIT 20) c
CROSS JOIN
  (SELECT id FROM users WHERE username IS NOT NULL ORDER BY random() LIMIT 10) u
WHERE random() < 0.3
ON CONFLICT DO NOTHING;

-- Add some follows
INSERT INTO "follows" ("follower_id", "following_id")
SELECT
  u1.id,
  u2.id
FROM
  (SELECT id FROM users WHERE username IS NOT NULL ORDER BY random() LIMIT 20) u1
CROSS JOIN
  (SELECT id FROM users WHERE username IS NOT NULL ORDER BY random() LIMIT 15) u2
WHERE u1.id != u2.id AND random() < 0.15
ON CONFLICT DO NOTHING;

-- Update follower/following counts
UPDATE users SET followers_count = (
  SELECT count(*) FROM follows WHERE follows.following_id = users.id
), following_count = (
  SELECT count(*) FROM follows WHERE follows.follower_id = users.id
)
WHERE username IS NOT NULL;
