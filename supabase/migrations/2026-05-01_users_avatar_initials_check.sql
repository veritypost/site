-- users metadata.avatar.initials format guard.
--
-- Mirrors the client-side cap shipped in commit f0748ce (Wave 2 batch,
-- item 5): up to 3 characters, alphanumeric only.
--
-- Schema reality (corrected 2026-05-01): there is NO users.avatar column.
-- Avatar persists inside the users.metadata JSONB column at the path
-- metadata->'avatar'->>'initials'. The iOS write path
-- (SettingsView.swift, ProfileView.swift) already uses this shape via the
-- metadata key in update_own_profile's p_fields. The web AvatarEditor
-- (web/src/app/profile/_components/AvatarEditor.tsx:165) currently sends
-- p_fields: { avatar: ..., avatar_color: ... } which DOES NOT match any
-- column the RPC handles for the avatar key, so web avatar saves are
-- silently dropped today — separate bug, see follow-up.
--
-- Constraint is added NOT VALID so existing rows with longer/legacy
-- initials don't fail the migration. New writes are constrained
-- immediately. After cleanup, run:
--
--     ALTER TABLE public.users VALIDATE CONSTRAINT users_avatar_initials_format;
--
-- Pre-cleanup audit query:
--
--     SELECT id, email, metadata->'avatar'->>'initials' AS initials
--     FROM public.users
--     WHERE metadata IS NOT NULL
--       AND jsonb_typeof(metadata) = 'object'
--       AND metadata ? 'avatar'
--       AND jsonb_typeof(metadata->'avatar') = 'object'
--       AND metadata->'avatar' ? 'initials'
--       AND (
--         char_length(metadata->'avatar'->>'initials') > 3
--         OR metadata->'avatar'->>'initials' !~ '^[A-Za-z0-9]*$'
--       );

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_avatar_initials_format;

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_initials_format
  CHECK (
    metadata IS NULL
    OR jsonb_typeof(metadata) <> 'object'
    OR NOT (metadata ? 'avatar')
    OR jsonb_typeof(metadata->'avatar') <> 'object'
    OR NOT (metadata->'avatar' ? 'initials')
    OR (
      char_length(metadata->'avatar'->>'initials') <= 3
      AND metadata->'avatar'->>'initials' ~ '^[A-Za-z0-9]*$'
    )
  ) NOT VALID;
