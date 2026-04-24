-- 160 — create the `avatars` Supabase Storage bucket + own-folder RLS.
--
-- Mirrors the live `banners` bucket shape (MCP-verified 2026-04-24):
--   public = true
--   file_size_limit = 5 MiB
--   allowed_mime_types = png / jpeg / webp / gif
--   RLS: each user can INSERT / SELECT / UPDATE / DELETE objects whose
--        path's first folder segment equals their auth.uid().
--
-- File layout in app code:
--   web/src/app/profile/settings/page.tsx uploads to `avatars/<user_id>/<timestamp>.<ext>`.
--   So `(storage.foldername(name))[1]` resolves to `<user_id>` and the
--   RLS match is exact.
--
-- Closes the SHIPPED-but-pending work from Session 1 commit 1c45eca
-- (graceful failure when the bucket was missing). After this lands,
-- avatar uploads work end-to-end.
--
-- SVG is excluded by the MIME allowlist in line with #34 (stored XSS
-- defense shipped commit 3056bc5). `image/gif` matches banners but the
-- avatar renderer should static-frame gifs in a later UI pass — not
-- blocking.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
   SET public = EXCLUDED.public,
       file_size_limit = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Own-folder RLS policies. Same shape the banners bucket uses.

DROP POLICY IF EXISTS "Users select own avatar" ON storage.objects;
CREATE POLICY "Users select own avatar"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- Public read: the bucket's `public=true` flag handles anonymous SELECT
-- via the built-in "Public Access" policy Supabase attaches to public
-- buckets. No extra policy needed for anon read — the 4 above gate
-- authenticated write + own-row read.
