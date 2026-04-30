# Slice 02 — Publishing

**Status:** locked
**Locked:** 2026-04-29
**Session:** 3 (investigation + Q&A + adversarial review)

---

## What this slice covers

The publishing surface: what happens when an admin promotes a draft to live, the two routes that can do it, the state machine, side effects, and the security posture around article visibility. This slice does not touch the generation pipeline, the reader-side viewing experience, quizzes, timelines, or comments.

---

## How publishing works today

There are two paths to a published article:

**Standard path.** Admin clicks Publish on the stories page or story-manager. The UI sends `PATCH /api/admin/articles/[id]` with `{ status: 'published' }`. The route validates the transition via `ALLOWED_TRANSITIONS`, writes `status='published'`, `published_at=now()`, `unpublished_at=null`, `retraction_reason=null`, `moderation_status='approved'` to the article row, then runs child mutations (sources, timelines, quizzes — delete-all-then-reinsert) as sequential non-transactional Supabase calls, then writes an `article.publish` audit log entry.

**Breaking-news path.** Admin POSTs to `/api/admin/broadcasts/alert`. The route directly INSERTs an article row with `status='published'`, `is_breaking=true`, `published_at=now()` — it doesn't go through `ALLOWED_TRANSITIONS`. After the INSERT succeeds, it calls the `send_breaking_news` RPC as a best-effort fan-out to push subscribers. If the RPC fails, the article stays published with `push_error: true` in the response; the legacy `/api/admin/broadcasts/breaking` endpoint can retry the fan-out without re-publishing.

**Permission gates** (standard path only):
- `admin.articles.edit.any` — required to PATCH at all.
- `admin.articles.publish` — required to enter `published`.
- `admin.articles.unpublish` — required to leave `published`.

**The `ALLOWED_TRANSITIONS` state machine** (before this slice's changes):
```
draft       → published, archived
scheduled   → published, archived, draft
published   → archived
archived    → draft
```

After Decision 1 ships, `scheduled` is removed.

**Side effects on standard publish:**
- `published_at`, `unpublished_at`, `moderation_status` written.
- Children delete-and-reinserted (non-transactional; T5 RPC is a TODO).
- `audit_log` row written via `recordAdminAction()`.
- Sitemap lazy-regenerates on next request (Next.js `force-dynamic`).
- No push notification. No email. No analytics event. None of these are gaps — they're intentional per locked decisions below.

**Visibility model.** Reader API (`/api/articles/by-slug/[slug]`) returns 404 if `status != 'published'` and the caller can't edit. The public article page (`/[slug]`) mirrors this: `if (article.status !== 'published' && !canEdit) notFound()`. After Decision 2 ships, this is backed by a DB-level RLS policy as a second layer.

---

## Locked decisions

### 1. Rip the `scheduled` status

**Current state.** `scheduled` is declared in the Zod enum (`route.ts:249`), `ALLOWED_TRANSITIONS` (`route.ts:187`), stories-page filter type + dropdown + badge logic (`stories/page.tsx:27, 56, 307`). The `publish_at` column exists in the `articles` schema (`database.ts:1557, 1629, 1701`). But no code path ever sets `status='scheduled'` — no update logic, no UI, no cron. The column `publish_at` is never read by any code. The feature was started and abandoned.

**Locked:** Remove it completely. No scheduling feature.

**Implementation — all seven changes must ship together:**

1. `web/src/app/api/admin/articles/[id]/route.ts:249` — Remove `'scheduled'` from the Zod enum: `z.enum(['draft', 'published', 'archived'])`.
2. `web/src/app/api/admin/articles/[id]/route.ts:185-190` — Remove the `scheduled` key from `ALLOWED_TRANSITIONS`. Also remove `'scheduled'` from `draft`'s target list if it ever gets added (it hasn't, but confirm).
3. `web/src/app/admin/stories/page.tsx:27` — Remove `'scheduled'` from the `StatusFilter` type.
4. `web/src/app/admin/stories/page.tsx:43-52` — Remove or simplify `timeAgo()` — the `if (mins < 0) return 'scheduled'` branch is dead without `publish_at`.
5. `web/src/app/admin/stories/page.tsx:54-58` — Remove the `if (s === 'scheduled') return 'warn'` branch from `statusVariant()`.
6. `web/src/app/admin/stories/page.tsx:307` — Remove `{ value: 'scheduled', label: 'Scheduled' }` from the filter dropdown options.
7. New migration: `ALTER TABLE articles DROP COLUMN IF EXISTS publish_at;`
8. After migration runs: regenerate TypeScript types (`supabase gen types typescript`) so `database.ts` no longer references `publish_at`.

---

### 2. Add RLS to the `articles` table

**Current state.** No RLS policies exist on `articles`. Every code path that reads articles uses `createServiceClient()` (service-role key, which bypasses RLS entirely). The only thing preventing public access to draft articles is a code-level `status` check in two places: `page.tsx:104` and `by-slug/route.ts:55-56`. There is no database backstop.

**Locked:** Add RLS. Policy: anon and authenticated roles can only SELECT rows where `status = 'published'`. Service role bypasses all (default Supabase behavior — no explicit policy needed for it).

**Implementation.**

New migration:
```sql
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_can_read_published"
  ON articles
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');
```

No other policies needed. INSERT, UPDATE, DELETE on `articles` are only ever done via service-client routes (all admin PATCH/POST/DELETE handlers use `createServiceClient()`). Service role bypasses RLS, so those paths are unaffected.

**iOS note.** Both iOS apps (adult `SupabaseManager.swift:89`, kids `SupabaseKidsClient.swift:57`) use the publishable anon key and will be subject to this policy. All iOS reads that start from published-article lists are safe — the `status='published'` filter is redundant with RLS but not harmful. Two queries lack explicit status filters — `KidsAppState` (queries by `.in("id", ...)`) and `KidReaderView` (queries by `id` + `is_kids_safe`) — but in both cases the article IDs originate from published-article fetches, so RLS will agree with what's already true. Verify both queries still return expected results in testing.

**Web note.** All web non-admin queries (`page.tsx`, `browse/page.tsx`) explicitly filter `status='published'` and use the anon client — RLS is redundant but not harmful. Admin routes use service client — unaffected.

---

### 3. No push notification on regular publish

**Current state.** When a standard article is published, no push notification fires. The `push_sent` boolean column on `articles` is never written by the PATCH route. The push cron only delivers notifications already in the `notifications` table, and nothing inserts a notification row on standard publish. Breaking news is the only push-wired path (`send_breaking_news` RPC, best-effort fan-out via `/api/admin/broadcasts/alert`).

**Locked:** No change. Breaking news is the only push event. Regular publish is silent to subscribers.

---

### 4. Defer T5 transactional RPC

**Current state.** The article PATCH route runs article update + children mutations as six sequential non-transactional Supabase calls (lines 482–684). A mid-flight failure leaves the DB in partial state. The `article.edit.begin` / `article.edit.commit` audit markers (lines 462–463, 466, 690) detect but do not prevent this. `TODO(T5)` at `route.ts:461` tracks the fix: a `update_admin_article_with_children` RPC that would run the whole patch in a Postgres transaction.

**Locked:** Defer. The failure mode requires a mid-request Supabase error, which is rare. Audit markers flag it when it happens. T5 stays a TODO for a hardening session.

---

## Implementation order

1. `scheduled` rip (all 8 changes in one PR, migration first).
2. RLS migration (standalone migration PR).
3. TypeScript type regeneration (after both migrations are applied).

Decisions 3 and 4 require no implementation work.

---

## What this slice does NOT include

- **Editor UI.** Story-manager, kids-story-manager — how an admin edits the article before publishing. Not in scope.
- **Viewing the published article.** What readers see is Slice 03.
- **Breaking-news flow redesign.** The two-path publish model (PATCH vs direct INSERT) is left as-is. Both paths work. Merging them into a single path is out of scope.
- **Notification infrastructure.** The push cron, email cron, notification table — Slice 02 only decided what events do NOT fire on publish. Building new notification events is out of scope here.
- **T5 transactional RPC.** Explicitly deferred.

---

## Cross-slice notes

- After Decision 1, the `ALLOWED_TRANSITIONS` table has no `scheduled` entry. If a future session ever revisits scheduling, it needs to re-add both the enum value and the transition rules.
- After Decision 2, iOS queries that lack explicit `status='published'` filters silently become filtered at the DB layer. This is correct behavior but should be verified during the RLS migration test.
- The `push_sent` boolean column on `articles` remains in the schema. Nothing writes it on standard publish (Decision 3). If a future session wires standard-publish notifications, `push_sent` is the natural column to use — don't drop it.
