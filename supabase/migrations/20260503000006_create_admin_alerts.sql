-- admin_alerts: durable escalation signals for CSAM/urgent reports.
-- Written by service role only (no RLS INSERT policy).
-- Swept by admin moderation queue; human review required before resolving.
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type text NOT NULL,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'critical',
  metadata jsonb DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

-- Admins and owners can read; writes are service-role only (no INSERT policy)
CREATE POLICY "admin_alerts_admin_read" ON public.admin_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'owner')
    )
  );

COMMENT ON TABLE public.admin_alerts IS
  'Durable escalation signals for CSAM/urgent reports (18 U.S.C. § 2258A). '
  'Written by service role only. Swept by admin moderation queue.';
