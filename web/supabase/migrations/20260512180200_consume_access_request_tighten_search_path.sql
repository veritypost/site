-- Tighten the consume_access_request search_path. The original definition
-- (20260512180100) set search_path = public, auth on a hunch, but the
-- function body only touches public.access_requests. Removing auth from
-- the path eliminates any (theoretical) avenue for an auth-schema function
-- shadow to be exploited under the function's SECURITY DEFINER context.
--
-- CREATE OR REPLACE so this lands cleanly on top of the original.

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
