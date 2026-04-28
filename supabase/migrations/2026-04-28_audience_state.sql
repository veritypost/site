-- Session A — per-audience state machine for the new Newsroom (additive).
--
-- Decision 9 (AI-today.md): each Story has 3 audience cards whose state
-- (pending / generating / generated / skipped / failed) must be tracked
-- independently. Generate route writes 'generating' before LLM work and
-- 'generated' on persist; cancel route resets 'generating' → 'pending';
-- skip route writes 'skipped'. v_cluster_lifecycle exposes the
-- "all 3 audiences resolved?" boolean used by Discovery's Active /
-- Completed split.

CREATE TABLE public.feed_cluster_audience_state (
  cluster_id    uuid NOT NULL REFERENCES public.feed_clusters(id) ON DELETE CASCADE,
  audience_band text NOT NULL CHECK (audience_band IN ('adult','tweens','kids')),
  state         text NOT NULL CHECK (state IN ('pending','generating','generated','skipped','failed')),
  article_id    uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  skipped_by    uuid REFERENCES public.users(id),
  skipped_at    timestamptz,
  generated_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, audience_band)
);

CREATE INDEX idx_feed_cluster_audience_state_state
  ON public.feed_cluster_audience_state(state);

ALTER TABLE public.feed_cluster_audience_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_cluster_audience_state_select
  ON public.feed_cluster_audience_state
  FOR SELECT
  USING (public.is_editor_or_above());

CREATE POLICY feed_cluster_audience_state_insert
  ON public.feed_cluster_audience_state
  FOR INSERT
  WITH CHECK (public.is_editor_or_above());

CREATE POLICY feed_cluster_audience_state_update
  ON public.feed_cluster_audience_state
  FOR UPDATE
  USING (public.is_editor_or_above());

CREATE POLICY feed_cluster_audience_state_delete
  ON public.feed_cluster_audience_state
  FOR DELETE
  USING (public.is_editor_or_above());

-- Bump updated_at on every UPDATE so the cron's "stuck in generating"
-- sweep can use updated_at < threshold without callers having to set it.
CREATE OR REPLACE FUNCTION public.touch_audience_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_audience_state_touch_updated_at
  BEFORE UPDATE ON public.feed_cluster_audience_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_audience_state_updated_at();

-- Seed 3 rows (adult / tweens / kids) for every newly-created cluster.
CREATE OR REPLACE FUNCTION public.seed_audience_state()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO feed_cluster_audience_state(cluster_id, audience_band, state)
    VALUES
      (NEW.id, 'adult',  'pending'),
      (NEW.id, 'tweens', 'pending'),
      (NEW.id, 'kids',   'pending')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_feed_clusters_seed_audience_state
  AFTER INSERT ON public.feed_clusters
  FOR EACH ROW EXECUTE FUNCTION public.seed_audience_state();

-- One-shot backfill for any existing clusters. Greenfield (admin-test
-- rows only) but keeps the table coherent.
INSERT INTO public.feed_cluster_audience_state(cluster_id, audience_band, state)
  SELECT c.id, b.b, 'pending'
    FROM public.feed_clusters c
    CROSS JOIN (VALUES ('adult'),('tweens'),('kids')) AS b(b)
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.v_cluster_lifecycle AS
  SELECT c.id AS cluster_id,
         BOOL_AND(s.state IN ('generated','skipped')) AS completed
    FROM public.feed_clusters c
    JOIN public.feed_cluster_audience_state s ON s.cluster_id = c.id
   GROUP BY c.id;

GRANT SELECT ON public.v_cluster_lifecycle TO authenticated, service_role;
