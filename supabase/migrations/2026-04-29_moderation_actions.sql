CREATE TABLE public.moderation_actions (
  id           bigserial PRIMARY KEY,
  comment_id   uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action       text NOT NULL CHECK (action IN ('hide', 'unhide', 'remove', 'redact', 'ai_flagged')),
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX moderation_actions_comment_idx
  ON public.moderation_actions (comment_id, created_at DESC);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_actions_admin_all ON public.moderation_actions
  FOR ALL TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());
