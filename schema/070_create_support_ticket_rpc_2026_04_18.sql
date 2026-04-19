-- Round 7 -- create_support_ticket RPC: atomic (ticket header + first user
-- message) to prevent orphan tickets when the second insert fails.

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_user_id   uuid,
  p_email     text,
  p_category  text,
  p_subject   text,
  p_body      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_number text;
  v_ticket_id     uuid;
  v_body          text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'category required';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'body required'; END IF;

  v_ticket_number := 'VP-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

  INSERT INTO public.support_tickets (
    ticket_number, user_id, email, category, subject, status, source
  ) VALUES (
    v_ticket_number, p_user_id, p_email, p_category, p_subject, 'open', 'in_app'
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, sender_id, is_staff, body)
  VALUES (v_ticket_id, p_user_id, false, v_body);

  RETURN jsonb_build_object(
    'id',            v_ticket_id,
    'ticket_number', v_ticket_number,
    'status',        'open'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, text, text, text, text) TO authenticated, service_role;
