-- users.avatar.initials format guard.
--
-- Mirrors the client-side cap shipped in commit f0748ce (Wave 2 batch,
-- item 5): up to 3 characters, alphanumeric only. The client-side
-- enforcement clamps display via Avatar.tsx slice + AvatarEditor input
-- maxLength + filter, but a curl-savvy caller could still write a
-- noncompliant value via update_own_profile, leaving DB rot for any
-- future renderer that doesn't slice.
--
-- Constraint is added NOT VALID so existing rows with longer/legacy
-- initials don't fail the migration. New writes are constrained
-- immediately. After cleanup, run:
--
--     ALTER TABLE public.users VALIDATE CONSTRAINT users_avatar_initials_format;
--
-- Pre-cleanup audit query:
--
--     SELECT id, email, avatar->>'initials' AS initials
--     FROM public.users
--     WHERE avatar IS NOT NULL
--       AND jsonb_typeof(avatar) = 'object'
--       AND avatar ? 'initials'
--       AND (
--         char_length(avatar->>'initials') > 3
--         OR avatar->>'initials' !~ '^[A-Za-z0-9]*$'
--       );

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_initials_format
  CHECK (
    avatar IS NULL
    OR jsonb_typeof(avatar) <> 'object'
    OR NOT (avatar ? 'initials')
    OR (
      char_length(avatar->>'initials') <= 3
      AND avatar->>'initials' ~ '^[A-Za-z0-9]*$'
    )
  ) NOT VALID;
