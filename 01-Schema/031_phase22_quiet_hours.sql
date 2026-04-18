-- ============================================================
-- Phase 22.2 — Quiet hours predicate extraction
--
-- The midnight-spanning branch lives inline in create_notification,
-- which makes it untestable without time mocking. This extracts the
-- exact same logic into a pure helper so a verifier can exercise all
-- 24 hours against any (start, end) window.
-- ============================================================

CREATE OR REPLACE FUNCTION public._is_in_quiet_hours(
  p_start time,
  p_end time,
  p_at time
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_start IS NULL OR p_end IS NULL THEN false
    WHEN p_start = p_end THEN false                         -- zero window
    WHEN p_start < p_end THEN p_at >= p_start AND p_at < p_end
    ELSE p_at >= p_start OR p_at < p_end                    -- midnight spanner
  END;
$$;
GRANT EXECUTE ON FUNCTION public._is_in_quiet_hours(time, time, time) TO authenticated, service_role;
