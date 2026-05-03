-- Session 3 follow-up — replace role-name JOIN with hierarchy_level constant
-- so a future role rename can't silently turn the trigger into a fail-open.
-- admin = 80.
CREATE OR REPLACE FUNCTION public.check_ticket_message_is_staff()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.is_staff = true THEN
    IF NOT EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = NEW.sender_id
        AND r.hierarchy_level >= 80
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'is_staff may only be set by admin or above (sender_id=%)', NEW.sender_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
