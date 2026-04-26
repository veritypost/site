<!-- ARCHIVED: This document is read-only historical record. Do not modify or act on its contents as active tasks. -->
<!-- Completed: 2026-04-26 -->
# v1 → v2 migration — page & code map per phase

Which files / pages / directories each phase touches. Use this as a work checklist, not a spec.

---

## Phase 0 — Lock the source of truth
Pure planning. No code.

**Files touched:**
- `reset_and_rebuild.sql` → archive (rename to `_v1_deprecated`)
- `reset_and_rebuild_v2.sql` → promote to canonical
- `Verity_Post_Schema_Guide.xlsx` → reference doc
- `PROFILE_FULL_FLOW.md` → re-read to stay grounded

---

## Phase 1 — Schema foundation
DB only. No frontend.

**Files touched:**
- `reset_and_rebuild_v2.sql`
- New: `scripts/smoke-test.js` (or similar) — signup / login / fetch profile / resolver check

**Affected DB surfaces:**
- All 108 tables in the Table Inventory
- All triggers (`handle_new_auth_user`, `handle_auth_user_updated`)
- All grants for `supabase_auth_admin`, `authenticator`, `service_role`
- Test user seed block at bottom of the SQL

---

## Phase 2 — Auth & verification
Small surface. Mostly Supabase dashboard + a couple of route files.

**Files touched:**
- `site/src/app/api/auth/callback/route.js` — confirm it flips `public.users.email_verified`
- `site/src/app/api/auth/signup/route.js` — confirm flow respects confirm-email toggle
- `site/src/app/login/page.js` — error state for unconfirmed users (if strict policy)
- `site/src/app/verify-email/page.js` — already rewritten; revisit after toggle flip
- `site/src/app/reset-password/page.js`
- `site/src/app/forgot-password/page.js`
- `site/src/app/auth/callback/page.js`
- `site/.env.local` — Site URL + Redirect URLs + SMTP keys

**Dashboard changes (not in code):**
- Supabase → Authentication → Providers → Email → Confirm email toggle
- Supabase → Authentication → SMTP Settings → Resend
- Supabase → Authentication → URL Configuration → Site URL + Redirect URLs

---

## Phase 3 — Permission model rewiring
Pure logic. Touches DB + the permissions layer in the client. No visible UI yet.

**DB files touched:**
- `reset_and_rebuild_v2.sql` — permission_sets, role_permission_sets, plan_permission_sets rows
- `plan_features` seed block for all 9 plans

**Client files touched:**
- `site/src/lib/permissionKeys.js` — align perm keys with v2
- `site/src/lib/permissions.js` — resolver client helpers
- `site/src/components/PermissionsProvider.jsx`
- `site/src/components/PermissionGate.jsx`
- `site/src/lib/auth.js` — align helpers, rip `requireVerifiedEmail` if policy changed
- `site/src/lib/kidSession.js`
- `site/src/lib/rlsErrorHandler.js`

**Dead code to remove:**
- `permLocked` helper in `profile/page.js`
- All `user_has_feature` RPC calls (site-wide grep)

---

## Phase 4 — Pricing & billing
Touches plan UI, subscription flow, cancellation states.

**Files touched:**
- `site/src/app/profile/settings/billing/page.js` — plan picker (3 → 9 plans)
- `site/src/app/admin/plans/page.js` — admin plan management
- `site/src/app/admin/promo/page.js` — promo codes
- `site/src/app/admin/subscriptions/page.js`
- `site/src/app/profile/page.js` — upgrade banner (new tier copy)
- Stripe/IAP backend routes: `site/src/app/api/stripe/**`, `site/src/app/api/iap/**` (create as needed)
- New: frozen-profile state logic (middleware + RLS policies)
- New: kid trial conversion flow in kids pages

**Pages showing plan-aware gates (need tier updates):**
- Everywhere that currently checks `plan_status` or `user.plans.name`
- `site/src/app/messages/page.js`
- `site/src/app/bookmarks/page.js`
- `site/src/app/profile/kids/**`

---

## Phase 5 — Core feature rebuilds
Biggest phase. One sub-phase per feature.

### 5a. Quiz overhaul
- `site/src/app/story/[slug]/page.js` — quiz UI inline in article
- Any standalone quiz components under `site/src/components/` (grep `quiz`)
- `site/src/app/admin/stories/page.js` + `story-manager/page.js` — quiz pool editor
- API routes under `site/src/app/api/quiz/**`

### 5b. Context pinning (replaces community notes)
- `site/src/app/story/[slug]/page.js` — comment thread UI + Article Context tag button
- `site/src/app/admin/notes/page.js` → repurpose or deprecate
- `site/src/components/` — comment card needs context-tag button + pinned-state rendering

### 5c. Expert Queue + @mentions
- `site/src/app/expert-queue/page.js` — full rebuild
- `site/src/app/story/[slug]/page.js` — @mention parser in comment input
- `site/src/app/profile/settings/expert/page.js` — expert back-channel access
- New: expert discussion / back-channel page
- API routes under `site/src/app/api/expert/**`

### 5d. Bookmarks
- `site/src/app/bookmarks/page.js` — cap enforcement + collections UI
- `site/src/app/story/[slug]/page.js` — bookmark button with cap counter
- New: bookmark collection management (create / rename / delete)

### 5e. Category Supervisor
- New page: eligibility + opt-in flow (likely `site/src/app/profile/settings/supervisor/page.js` or banner)
- `site/src/app/story/[slug]/page.js` — fast-lane flag button on comments
- `site/src/app/admin/reports/page.js` — supervisor-flag fast lane in queue

### 5f. Weekly recap quizzes
- `site/src/app/page.js` (home) — entry point / card
- `site/src/app/category/[id]/page.js` — per-category recap
- New: recap quiz page
- `site/src/app/admin/stories/page.js` — curator

### 5g. Family plan features
- `site/src/app/profile/kids/page.js` + `profile/kids/me/page.js`
- `site/src/app/kids/page.js` — kid experience
- New: family leaderboard page
- New: family achievements UI
- New: kid expert session scheduler + live session page

### 5h. Ads rework
- `site/src/components/` ad wrapper (grep `Ad`)
- `site/src/app/story/[slug]/page.js` — article ad slots
- `site/src/app/page.js` — feed ad slots
- `site/src/app/admin/sponsors/page.js`

---

## Phase 6 — Trust & safety
Backend-heavy, light UI.

**Files touched:**
- `site/src/app/admin/users/page.js` — warning + mute level display/controls
- `site/src/app/admin/reports/page.js` — progressive action flow
- `site/src/app/admin/verification/page.js` — expert probation + annual re-verification
- `site/src/app/appeal/page.js` — user appeal flow
- Backend: behavioral anomaly detection (new `site/src/app/api/anomaly/**` or cron)
- DB: `user_warnings`, `behavioral_anomalies` tables (already in v2)

---

## Phase 7 — Production cutover
No code edits. Operations only.

- Backup prod
- Run migration rehearsal twice against staging
- Execute on prod, monitor:
  - `site/src/app/api/auth/**` error rate
  - Stripe / IAP webhooks
  - Supabase realtime channels (notifications, messages, perms version)

---

## Phase 8 — Cleanup

**Files to delete / drop:**
- `reset_and_rebuild.sql` (v1)
- `site/src/app/admin/notes/page.js` (if replaced by context tags)
- Any `reactions` UI references (grep site-wide)
- Dead permission helpers
- Unused email template refs (`morning_digest`)

**DB cleanup:**
- `DROP TABLE reactions, community_notes, community_note_votes` (after confirming zero reads)

---

## Files that span multiple phases (hot paths)

These get edited repeatedly — budget accordingly:
- `site/src/app/profile/page.js`
- `site/src/app/story/[slug]/page.js`
- `site/src/app/page.js` (home)
- `site/src/lib/permissionKeys.js`
- `reset_and_rebuild_v2.sql`
- `site/src/components/PermissionGate.jsx`

---

## Files likely untouched by the migration

No v1→v2 changes expected in these (verify anyway):
- Static pages: `/privacy`, `/terms`, `/cookies`, `/dmca`, `/accessibility`, `/how-it-works`, `/status`
- `/signup/pick-username/page.js` (unless username rules changed)
- `/logout/page.js`
- `/dev/**` scratch pages
