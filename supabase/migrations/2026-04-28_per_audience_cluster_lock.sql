-- Session A — per-audience cluster lock (additive).
--
-- Decision 5 + H1 (AI-today.md Part 3): three audiences must be able to
-- generate independently against the same Story. Today's
-- claim_cluster_lock(cluster_id, run_id, ttl) is single-lock-per-cluster
-- and stays callable; new RPCs key on (cluster_id, audience_band) so
-- adult / tweens / kids cannot block each other. Old locked_by/locked_at
-- columns on feed_clusters stay populated by the legacy RPC during the
-- bridge; Session E drops them.

CREATE TABLE public.feed_cluster_locks (
  cluster_id    uuid NOT NULL REFERENCES public.feed_clusters(id) ON DELETE CASCADE,
  audience_band text NOT NULL CHECK (audience_band IN ('adult','tweens','kids')),
  locked_by     uuid NOT NULL,
  locked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, audience_band)
);

CREATE INDEX idx_feed_cluster_locks_locked_at
  ON public.feed_cluster_locks(locked_at);

ALTER TABLE public.feed_cluster_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_cluster_locks_select
  ON public.feed_cluster_locks
  FOR SELECT
  USING (public.is_editor_or_above());

CREATE POLICY feed_cluster_locks_insert
  ON public.feed_cluster_locks
  FOR INSERT
  WITH CHECK (public.is_editor_or_above());

CREATE POLICY feed_cluster_locks_update
  ON public.feed_cluster_locks
  FOR UPDATE
  USING (public.is_editor_or_above());

CREATE POLICY feed_cluster_locks_delete
  ON public.feed_cluster_locks
  FOR DELETE
  USING (public.is_editor_or_above());

CREATE OR REPLACE FUNCTION public.claim_cluster_lock_v2(
  p_cluster_id    uuid,
  p_audience_band text,
  p_locked_by     uuid,
  p_ttl_sec       integer DEFAULT 600
) RETURNS TABLE(acquired boolean, locked_by uuid, locked_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_audience_band NOT IN ('adult','tweens','kids') THEN
    RAISE EXCEPTION 'invalid audience_band: %', p_audience_band;
  END IF;

  DELETE FROM feed_cluster_locks
   WHERE cluster_id    = p_cluster_id
     AND audience_band = p_audience_band
     AND locked_at     < now() - make_interval(secs => p_ttl_sec);

  BEGIN
    INSERT INTO feed_cluster_locks(cluster_id, audience_band, locked_by)
      VALUES (p_cluster_id, p_audience_band, p_locked_by);
    RETURN QUERY SELECT true, p_locked_by, now();
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY
      SELECT false, l.locked_by, l.locked_at
        FROM feed_cluster_locks l
       WHERE l.cluster_id    = p_cluster_id
         AND l.audience_band = p_audience_band;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.release_cluster_lock_v2(
  p_cluster_id    uuid,
  p_audience_band text,
  p_locked_by     uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM feed_cluster_locks
   WHERE cluster_id    = p_cluster_id
     AND audience_band = p_audience_band
     AND locked_by     = p_locked_by;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_cluster_lock_v2(uuid, text, uuid, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_cluster_lock_v2(uuid, text, uuid)
  TO authenticated, service_role;
