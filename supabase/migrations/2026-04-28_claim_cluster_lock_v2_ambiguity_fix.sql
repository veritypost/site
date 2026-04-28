-- Session D verification — fix ambiguous column reference in
-- claim_cluster_lock_v2. The function declares
-- RETURNS TABLE(acquired, locked_by, locked_at), so those names become
-- OUT parameters that are visible everywhere in the function body. The
-- DELETE in the original migration referenced `locked_at` without a
-- table qualifier, which Postgres flagged as ambiguous against the
-- `locked_at` OUT param. Every adult/tweens/kids generate failed at
-- lock acquisition with `column reference "locked_at" is ambiguous`.
--
-- Fix: alias the table as `l` in the DELETE and qualify both column
-- references. Matches the alias style already used by the conflict
-- branch below. Public return shape and signature are unchanged, so
-- TS types and route callers do not need to update.
--
-- Run id that surfaced the bug: 9aa4f308-1408-41fc-ac54-a0ee84235208.

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

  DELETE FROM feed_cluster_locks l
   WHERE l.cluster_id    = p_cluster_id
     AND l.audience_band = p_audience_band
     AND l.locked_at     < now() - make_interval(secs => p_ttl_sec);

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
