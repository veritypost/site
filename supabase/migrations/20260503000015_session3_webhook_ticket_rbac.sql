-- Session 3 — webhook retry RLS + ticket_messages is_staff enforcement
-- Finding 1: webhook_log had no UPDATE policy; retry button always failed.
-- Finding 2: ticket_messages.is_staff was client-trusted with no DB enforcement.

-- ── 1. webhook_log admin UPDATE policy ────────────────────────────────────────
ALTER TABLE public.webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_log_update ON public.webhook_log
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_above())
  WITH CHECK (public.is_admin_or_above());

-- ── 2. ticket_messages is_staff check trigger ─────────────────────────────────
-- is_admin_or_above() reads auth.uid(), not NEW.sender_id, so the trigger
-- queries user_roles + roles directly against NEW.sender_id.
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
      JOIN roles req ON req.name = 'admin'
      WHERE ur.user_id = NEW.sender_id
        AND r.hierarchy_level >= req.hierarchy_level
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ) THEN
      RAISE EXCEPTION 'is_staff may only be set by admin or above (sender_id=%)', NEW.sender_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ticket_messages_check_is_staff
  BEFORE INSERT OR UPDATE ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.check_ticket_message_is_staff();

-- ── 3. New permission keys ─────────────────────────────────────────────────────
INSERT INTO public.permissions (key, display_name, description, category, is_active)
VALUES
  ('admin.webhooks.retry',  'Retry webhook log entry',  'Mark a failed webhook_log row as retried', 'admin', true),
  ('admin.support.reply',   'Reply to support ticket',  'Send a staff reply to a support ticket',   'admin', true)
ON CONFLICT (key) DO NOTHING;

-- ── 4. Grant to admin + owner permission sets ─────────────────────────────────
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE ps.key IN ('admin', 'owner')
  AND p.key IN ('admin.webhooks.retry', 'admin.support.reply')
ON CONFLICT DO NOTHING;
