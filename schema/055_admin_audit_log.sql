-- 055_admin_audit_log.sql
-- Pass 17 / Task 141a — admin audit trail. Every destructive admin
-- action (ban, delete, cancel subscription, webhook retry, promo delete,
-- etc.) records a row here via `public.record_admin_action` before the
-- action fires. RLS permits admin+ SELECT; INSERT is only through the
-- SECURITY DEFINER function (rows cannot be inserted directly).

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL,
  "action" text NOT NULL,
  "target_table" text,
  "target_id" uuid,
  "reason" text,
  "old_value" jsonb,
  "new_value" jsonb,
  "ip" inet,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "admin_audit_log"
  DROP CONSTRAINT IF EXISTS "fk_admin_audit_log_actor";
ALTER TABLE "admin_audit_log"
  ADD CONSTRAINT "fk_admin_audit_log_actor"
  FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_actor" ON "admin_audit_log" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_action" ON "admin_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_target" ON "admin_audit_log" ("target_table", "target_id");
CREATE INDEX IF NOT EXISTS "idx_admin_audit_log_created_at" ON "admin_audit_log" ("created_at" DESC);

ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;

-- Select: any admin or above.
DROP POLICY IF EXISTS "admin_audit_log_select" ON "admin_audit_log";
CREATE POLICY "admin_audit_log_select" ON "admin_audit_log"
  FOR SELECT TO authenticated
  USING (public.is_admin_or_above());

-- No direct INSERT/UPDATE/DELETE — writes happen via the function below.

CREATE OR REPLACE FUNCTION public.record_admin_action(
  p_action       text,
  p_target_table text DEFAULT NULL,
  p_target_id    uuid DEFAULT NULL,
  p_reason       text DEFAULT NULL,
  p_old_value    jsonb DEFAULT NULL,
  p_new_value    jsonb DEFAULT NULL,
  p_ip           inet DEFAULT NULL,
  p_user_agent   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'record_admin_action: no authenticated actor';
  END IF;

  IF NOT public.is_admin_or_above() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_actor AND r.name IN ('moderator', 'editor')
  ) THEN
    RAISE EXCEPTION 'record_admin_action: insufficient privileges';
  END IF;

  INSERT INTO public.admin_audit_log (
    actor_user_id, action, target_table, target_id,
    reason, old_value, new_value, ip, user_agent
  )
  VALUES (
    v_actor, p_action, p_target_table, p_target_id,
    p_reason, p_old_value, p_new_value, p_ip, p_user_agent
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_admin_action(
  text, text, uuid, text, jsonb, jsonb, inet, text
) TO authenticated, service_role;
