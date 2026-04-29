-- Slice 02: rip `scheduled` status + add articles RLS
-- Decision 1: drop the publish_at column (scheduled feature was never built)
ALTER TABLE public.articles DROP COLUMN IF EXISTS publish_at;

-- Decision 2: add RLS on articles
-- anon + authenticated can only SELECT published rows.
-- Service role bypasses RLS (Supabase default) — all admin routes unaffected.
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_can_read_published"
  ON public.articles
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');
