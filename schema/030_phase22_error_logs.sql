-- ============================================================
-- Phase 22.1 — Lightweight error logging (in-house, not Sentry)
--
-- Captures server + client runtime errors into a single Supabase
-- table. Admins can query / tail / alert on it. Service-role writes
-- only; authenticated users can read their own rows for debugging.
-- ============================================================

CREATE TABLE IF NOT EXISTS "error_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "severity" varchar(20) NOT NULL DEFAULT 'error',   -- info | warning | error | fatal
  "source" varchar(30) NOT NULL,                     -- 'server' | 'client' | 'cron' | ...
  "route" varchar(200),                              -- request path or component trail
  "message" text NOT NULL,
  "stack" text,
  "user_id" uuid,                                    -- nullable for anon errors
  "session_id" uuid,
  "user_agent" text,
  "ip_address" varchar(45),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_occurred_at
  ON error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity_occurred
  ON error_logs (severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_user_id
  ON error_logs (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE "error_logs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "error_logs_select_own" ON "error_logs";
CREATE POLICY "error_logs_select_own" ON "error_logs" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
