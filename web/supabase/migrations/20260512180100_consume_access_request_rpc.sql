-- consume_access_request: atomic, row-locked consumption stamp.
--
-- Called from runSignupBookkeeping on every fresh signup. Finds the
-- oldest approved + unconsumed access_requests row matching the email
-- (case-insensitive), takes a row-level lock, stamps consumed_at/by/
-- source, and returns the row id. If no matching row exists (the common
-- case — most signups don't match the waitlist), returns NULL and the
-- caller treats it as a no-op.
--
-- FOR UPDATE makes the find+update atomic so an admin clicking Approve
-- at the same instant a user submits OTP can't both race past each
-- other and recreate the orphan bug we're trying to fix.

CREATE OR REPLACE FUNCTION public.consume_access_request(
  p_email TEXT,
  p_user_id UUID,
  p_source TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_email IS NULL OR p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('web', 'ios', 'kids') THEN
    RAISE EXCEPTION 'consume_access_request: invalid source %', p_source
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_id
  FROM public.access_requests
  WHERE LOWER(email) = LOWER(p_email)
    AND status = 'approved'
    AND consumed_at IS NULL
  ORDER BY approved_at ASC NULLS LAST, created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.access_requests
  SET
    consumed_at = NOW(),
    consumed_by_user_id = p_user_id,
    consumption_source = p_source
  WHERE id = v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.consume_access_request(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_access_request(TEXT, UUID, TEXT) TO service_role;
