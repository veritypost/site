# Round G plan — storage bucket tightening + HIBP toggle

Scope: H-03 (`banners` bucket SELECT policy allows LIST) and H-04 (Supabase Auth leaked-password check). Read-only planning; no migrations applied here.

Source of truth:
- `05-Working/_prelaunch_attack_plan.md` (Round G section, lines 240–255)
- `05-Working/_prelaunch_master_issues.md` (H-03 line 112, H-04 line 120)

Supabase project: `fyiwulqphgmoqullmrfn` (VP Project, us-east-1). The `banners` bucket does not exist in the VP2 project and does not need tightening there.

---

## H-03 — `banners` bucket SELECT policy

### Current state (queried via Supabase MCP)

Bucket metadata:

```
id       = banners
name     = banners
public   = true
created  = 2026-04-19 16:04:57+00
```

Current `storage.objects` policies scoped to `banners`:

```sql
-- SELECT (permissive, role: public)
CREATE POLICY "Banners public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'banners');

-- INSERT (role: authenticated)
CREATE POLICY "Users upload own banner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- UPDATE (role: authenticated)
CREATE POLICY "Users update own banner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE (role: authenticated)
CREATE POLICY "Users delete own banner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = auth.uid()::text);
```

The SELECT policy matches any row in the bucket, including LIST calls. Because the bucket is also marked `public: true`, object GETs by URL flow through Supabase's public CDN path and do not require this RLS policy to succeed.

### Why LIST is the real hole

`supabase.storage.from('banners').list()` calls `POST /storage/v1/object/list/banners`, which reads `storage.objects` directly and is gated by this SELECT policy. The current `USING (bucket_id = 'banners')` clause returns every row to the anon role, letting anyone enumerate every user's uploaded banner filename (which encodes `user_id/timestamp-filename`). That is a user-enumeration leak even though the files themselves are already public.

### Code callers that depend on LIST

Grepped `/Users/veritypost/Desktop/verity-post` for `.storage.from('banners').list(` and `.storage.from` + `.list(`:

- Zero callers list the `banners` bucket anywhere in the app.
- Only callers on the bucket:
  - `site/src/app/profile/settings/page.tsx:1298` — `.upload(path, file, { upsert: true })`
  - `site/src/app/profile/settings/page.tsx:1306` — `.getPublicUrl(path)`
- No admin banner manager exists (`site/src/app/admin/**` has no `storage.from` calls).

Safe to drop the broad SELECT policy.

### Proposed migration (DO NOT APPLY YET)

Replace the blanket SELECT with one that allows `authenticated` users to SELECT only their own folder (needed for upsert overwrite semantics and future "delete my banner" UI), and rely on the public CDN for read-by-URL. Anon LIST will return empty.

```sql
-- Migration: tighten_banners_select_policy_2026_04_19
BEGIN;

DROP POLICY IF EXISTS "Banners public read" ON storage.objects;

-- Authenticated users can only SELECT rows in their own folder.
-- Anon role has no SELECT policy on banners -> LIST returns [].
-- Public GET-by-URL still works because bucket.public = true routes
-- through the public CDN and bypasses row-level SELECT.
CREATE POLICY "Users select own banner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'banners'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
```

Alternative (stricter, keep bucket public-read via URL only, no authenticated listing either):

```sql
BEGIN;
DROP POLICY IF EXISTS "Banners public read" ON storage.objects;
-- No SELECT policy at all on banners; rely entirely on bucket.public = true
-- for URL reads. `upload(..., { upsert: true })` still works because INSERT
-- policy covers the write path; upsert on storage does not require SELECT.
COMMIT;
```

Recommendation: go with the first variant. It preserves the ability for a signed-in user to list their own folder (useful later for a "my uploads" pane) while closing the enumeration leak for everyone else. Both variants satisfy the advisor.

### Dependency flag

No admin UI depends on listing banners. Server-side callers that need to list (e.g. a future cleanup job) must use the service role, which bypasses RLS — no change needed.

---

## H-04 — Supabase Auth HIBP leaked-password check

This is a dashboard-only toggle. No migration, no code change.

### Owner clickpath

1. Open https://supabase.com/dashboard/project/fyiwulqphgmoqullmrfn
2. Left sidebar: `Authentication`
3. Top tabs: `Providers` (on some dashboard revisions this is `Sign In / Up` -> `Auth Providers`)
4. Find `Email` provider -> click to expand
5. Scroll to `Password Security` section
6. Toggle ON: `Prevent use of leaked passwords`
   (Supabase label may read: `Check passwords against HaveIBeenPwned`)
7. Click `Save`

If the toggle is not visible under the Email provider panel, it lives under `Authentication` -> `Policies` -> `Password strength and leaked password protection` in newer dashboard builds. Look for the HIBP / "leaked password" string.

### Expected effect

- New signups and password changes are rejected with an error similar to `Password has appeared in a data breach. Please choose a different password.`
- Existing users with previously-set breached passwords are not forcibly reset; only the next password change is checked.
- Combine with existing `site/src/lib/password.js` length/complexity rules — HIBP is additive.

---

## Verification

All curl calls are read-only. Substitute the project URL and anon key from `.env` (never commit). Reference: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### H-03 verification

Set shell vars locally (do not paste into any file):

```
PROJECT_URL=https://fyiwulqphgmoqullmrfn.supabase.co
ANON_KEY=...   # from .env, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

1. Anon LIST must return empty (before the fix it returns filenames):

```
curl -sS -X POST "$PROJECT_URL/storage/v1/object/list/banners" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"","limit":100,"offset":0}'
```

Expected after fix: `[]`

2. Anon GET by public URL must still succeed (pick any known object path, or upload one first while signed in):

```
curl -sS -o /dev/null -w "%{http_code}\n" \
  "$PROJECT_URL/storage/v1/object/public/banners/<user_id>/<filename>"
```

Expected: `200`

3. Authenticated LIST scoped to own folder must still work (sign in via UI, grab `sb-access-token` from browser cookies, export as `USER_JWT`):

```
curl -sS -X POST "$PROJECT_URL/storage/v1/object/list/banners" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"prefix":"<own_user_id>/","limit":100,"offset":0}'
```

Expected: array of own objects only. Listing another user's prefix returns `[]`.

4. Advisor recheck: `mcp__claude_ai_Supabase__get_advisors` with type `security` — `public_bucket_allows_listing` warning for `banners` should clear (or downgrade if the bucket is still marked public; advisor may also suggest `public = false` + signed URLs, which is a bigger change and out of scope for Round G).

### H-04 verification

1. Sign up flow (UI or curl):

```
curl -sS -X POST "$PROJECT_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"hibp-test+$(date +%s)@veritypost.com","password":"password123"}'
```

Expected response: 4xx with message referencing leaked/breached password. Before the toggle it returns 200 with a session.

2. Password change on an existing account using a breached password:
   - Sign in as a test user.
   - POST `/auth/v1/user` with `{ "password": "password123" }` and the user's bearer token.
   - Expected: error. Try `Tr0ub4dor&-unique-$(date +%s)` — expected: success.

---

## Order of operations (owner)

1. Apply H-04 dashboard toggle first (zero code risk, independent).
2. Re-check advisor after step 1.
3. Apply H-03 migration in a Supabase branch first if available; otherwise straight to prod is acceptable because:
   - No production caller reads via LIST.
   - Rollback is a single `CREATE POLICY` restoring the old clause.
4. Run the four curl checks above.
5. Re-run advisor; mark H-03 and H-04 closed in `_prelaunch_master_issues.md`.

## Rollback

H-03 rollback (if anything breaks):

```sql
BEGIN;
DROP POLICY IF EXISTS "Users select own banner" ON storage.objects;
CREATE POLICY "Banners public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'banners');
COMMIT;
```

H-04 rollback: toggle off in the same dashboard panel.
