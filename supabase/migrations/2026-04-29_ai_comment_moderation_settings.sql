INSERT INTO public.settings (key, value, value_type, category, display_name, description, is_public, is_sensitive)
VALUES
  ('ai_comment_toxicity_flag_threshold', '0.7', 'number', 'moderation',
   'AI Toxicity Flag Threshold',
   'Comments scoring at or above this toxicity score (0.0–1.0) are auto-flagged for manual review.',
   false, false),
  ('ai_comment_score_window_hours', '24', 'number', 'moderation',
   'AI Comment Score Window (hours)',
   'How far back the comment scoring cron looks for unscored comments.',
   false, false)
ON CONFLICT (key) DO NOTHING;
