# Round 2 — Phase 5 Cleanup — Prep Doc

**Purpose:** this doc scopes the Phase 5 ("remove the old code") pass into 4 non-overlapping execution tracks. Execution agents will follow this literally.

**Working dir:** `/Users/veritypost/Desktop/verity-post`
**Supabase project:** `fyiwulqphgmoqullmrfn`
**Date:** 2026-04-18

---

## Part 1 — Discovery (raw findings)

### 1.1 `requireRole` — every call-site + the definition

**Definition** (authoritative): `site/src/lib/auth.js:75-91` (`export async function requireRole(roleName, client)`). Uses an inline `hierarchy` map (line 79) independent of `lib/roles.js`.

**Comment-only references** (not calls, safe to leave or prose-edit):
- `site/src/lib/auth.js:77,81,121` — internal docstring + error string.
- `site/src/middleware.js:7` — prose comment.
- `site/src/app/admin/page.tsx:101` — prose comment (admin-LOCKED file, **do not touch**).
- `site/src/app/api/admin/users/[id]/permissions/route.js:29,32,67` — 3 prose comments.

**Actual `await requireRole(...)` call-sites — 54 calls across 38 files:**

```
site/src/app/api/admin/ad-campaigns/[id]/route.js        (2)
site/src/app/api/admin/ad-campaigns/route.js             (2)
site/src/app/api/admin/ad-placements/[id]/route.js       (2)
site/src/app/api/admin/ad-placements/route.js            (2)
site/src/app/api/admin/ad-units/[id]/route.js            (2)
site/src/app/api/admin/ad-units/route.js                 (2)
site/src/app/api/admin/appeals/[id]/resolve/route.js     (1)
site/src/app/api/admin/billing/cancel/route.js           (1)
site/src/app/api/admin/billing/freeze/route.js           (1)
site/src/app/api/admin/billing/sweep-grace/route.js      (1)
site/src/app/api/admin/broadcasts/breaking/route.js      (1)
site/src/app/api/admin/data-requests/[id]/approve/route.js (1)
site/src/app/api/admin/data-requests/[id]/reject/route.js  (1)
site/src/app/api/admin/data-requests/route.js            (1)
site/src/app/api/admin/expert/applications/[id]/approve/route.js            (1)
site/src/app/api/admin/expert/applications/[id]/clear-background/route.js   (1)
site/src/app/api/admin/expert/applications/[id]/mark-probation-complete/route.js (1)
site/src/app/api/admin/expert/applications/[id]/reject/route.js  (1)
site/src/app/api/admin/expert/applications/route.js      (1)
site/src/app/api/admin/moderation/comments/[id]/hide/route.js    (1)
site/src/app/api/admin/moderation/comments/[id]/unhide/route.js  (1)
site/src/app/api/admin/moderation/reports/[id]/resolve/route.js  (1)
site/src/app/api/admin/moderation/reports/route.js       (1)
site/src/app/api/admin/moderation/users/[id]/penalty/route.js    (1)
site/src/app/api/admin/recap/[id]/questions/route.js     (1)
site/src/app/api/admin/recap/[id]/route.js               (3)
site/src/app/api/admin/recap/questions/[id]/route.js     (2)
site/src/app/api/admin/recap/route.js                    (2)
site/src/app/api/admin/send-email/route.js               (1)
site/src/app/api/admin/settings/invalidate/route.js      (1)
site/src/app/api/admin/settings/route.js                 (2)
site/src/app/api/admin/sponsors/[id]/route.js            (2)
site/src/app/api/admin/sponsors/route.js                 (2)
site/src/app/api/admin/stories/route.js                  (3)
site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js (1)
site/src/app/api/admin/users/[id]/permissions/route.js   (1)
site/src/app/api/admin/users/[id]/roles/route.js         (2)
site/src/app/api/expert/answers/[id]/approve/route.js    (1)
```

**Scope surprise flagged:** brief said "handful" — actual is **54 call-sites across 38 files**. All but one live under `site/src/app/api/admin/` (the outlier is `site/src/app/api/expert/answers/[id]/approve/route.js`). None of these files carry `@admin-verified` (the admin LOCK is only on admin **page** + **component** files, not `api/admin/*` routes — confirmed via `grep -l "@admin-verified"` which returns zero `api/admin/**` hits).

### 1.2 `@/lib/tiers` — 4 call-sites

```
site/src/app/card/[username]/layout.js:2          import { isPaidTier } from '@/lib/tiers';
site/src/app/card/[username]/opengraph-image.js:3 import { isPaidTier } from '@/lib/tiers';
site/src/app/card/[username]/page.js:10           import { isPaidTier } from '@/lib/tiers';
site/src/app/profile/card/page.js:4               import { isPaidTier } from '@/lib/tiers';
```

Definition: `site/src/lib/tiers.js` (3 lines — `PAID_TIERS` array + `isPaidTier` helper). All 4 callers are in the `/card/*` + `/profile/card/*` surface. The `PAID_TIERS` array (`['verity', 'verity_pro', 'verity_family', 'verity_family_xl']`) is semantically "any paid plan" — maps cleanly to `hasPermission('profile.card.view')` or similar.

### 1.3 `@/lib/plans` — 1 call-site in src/app

```
site/src/app/profile/settings/page.tsx:45 } from '@/lib/plans';
```

Pulls `TIERS, TIER_ORDER, PRICING, formatCents, pricedPlanName, getPlans, resolveUserTier, annualSavingsPercent` (full export surface). Also imported by **admin-LOCKED** `site/src/app/admin/subscriptions/page.tsx:7` — do not touch that file.

`site/src/lib/plans.js` itself is NOT a legacy gate helper — it's the plan **catalog** (marketed tiers, pricing, DB plan lookups per §3 of plans.js comment). It is actively used by the profile settings long-scroll billing section. **Not a Phase 5 candidate for deletion.** Keep and flag. The "remove `@/lib/plans` legacy helpers if fully unused" item from REFERENCE.md §10 line 7 resolves as: **not unused; do not delete.**

### 1.4 `role_permissions` table references

- **Schema:** `01-Schema/reset_and_rebuild_v2.sql` lines 405-407 (CREATE TABLE), 2366-2367 (FKs), 2613-2614 (indexes), 2839 (UNIQUE), 3005 (RLS enable), 3126 (seed-skip comment), 4213-4215 (RLS policies).
- **Types:** `site/src/types/database.ts` lines 5896, 5917, 5924 (generated types — will auto-regenerate after DROP + `npm run types:gen`).
- **No code references in `site/src`** outside of `types/database.ts`. Safe to drop.

**Supabase row count (live):** `SELECT COUNT(*) FROM role_permissions` → **0 rows**. Confirmed empty.

### 1.5 `hierarchy` / role-hierarchy map

**In-code maps (2 independent copies):**
- `site/src/lib/roles.js:19-29` — `ROLE_HIERARCHY` frozen object. Consumed by `getMaxRoleLevel()`, `roleLevel()`, `isValidRole()`. Imported by 5 files: `api/admin/moderation/users/[id]/penalty/route.js`, `api/admin/users/[id]/roles/route.js`, `api/admin/billing/freeze/route.js`, `api/admin/billing/cancel/route.js`, `api/admin/subscriptions/[id]/manual-sync/route.js`, `admin/layout.tsx` (latter is admin-LOCKED — imports `MOD_ROLES` not the hierarchy map).
- `site/src/lib/auth.js:79` — inline `hierarchy` object inside `requireRole`. Local to that function.
- `site/src/app/admin/moderation/page.tsx:28` — `HIERARCHY` map in the admin-LOCKED moderation page. **Do not touch.** Its actor-outranks-target check for the mod UI is still used locally.

**DB source of truth:** `roles.hierarchy_level` column — `getMaxRoleLevel()` already prefers the DB column and falls back to the in-code map only for NULL rows.

**Conclusion for Phase 5:** the hierarchy map still has live consumers (actor-outranks-target checks on admin-action writes in 5 API routes, and `admin/moderation/page.tsx`). Deleting it wholesale would break rank-guard logic. **Recommendation: keep `lib/roles.js` as-is for this pass.** The REFERENCE.md §10 item "Remove the role-hierarchy map" is premature — flag as deferred pending an actor-vs-target rework (could be a `require_outranks(target_user_id)` RPC in a later phase). Only the `requireRole`-internal inline `hierarchy` map in `auth.js:79` gets deleted (in Track P, together with the whole `requireRole` function).

### 1.6 Supabase role_permissions count

`SELECT COUNT(*) FROM role_permissions;` → `[{"row_count":0}]`. Table is empty. Safe to DROP.

### 1.7 Tracker drift sweep

**Method:** extracted every `site/src/**` file path mentioned in `05-Working/PERMISSION_MIGRATION.md` (159 unique), then for each one checked whether `@migrated-to-permissions` and `@feature-verified` markers exist on disk.

**Summary:**
```
total_claimed = 159
ok_both_markers = 112
missing_feature_marker_only = 32
missing_migrated_marker_only = 0
missing_both_markers = 10
not_on_disk = 5
```

**not_on_disk (5)** — expected deletions; tracker documents the deletion:
- `site/src/app/profile/settings/page.js` (deleted when .tsx took over)
- `site/src/components/DestructiveActionConfirm.jsx` (moved to admin/, J's cleanup)
- `site/src/components/ObservabilityInit.js` (J's cleanup)
- `site/src/components/PermissionGate.jsx` (J's cleanup)
- `site/src/components/QuizPoolEditor.jsx` (superseded by .tsx)

**missing_both_markers (10)** — mostly tracker mentions these files as **call-sites being fixed**, not claims that they're "sealed":
- `site/src/app/NavWrapper.js` (tracker mentions the `deletion_scheduled_for` column fix)
- `site/src/app/layout.js` (mentioned for PermissionsProvider wiring)
- `site/src/lib/permissionKeys.js` (mentioned only as a reference target in a note)
- `site/src/app/admin/permissions/page.tsx` — has `@admin-verified` marker (admin LOCK)
- `site/src/app/admin/story-manager/page.tsx` — has `@admin-verified`
- `site/src/app/admin/subscriptions/page.tsx` — has `@admin-verified`
- `site/src/app/admin/users/page.tsx` — has `@admin-verified`
- `site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js` — **REFERENCE.md §12 claims `@admin-verified` but no marker on disk** — real drift
- `site/src/app/api/admin/users/[id]/permissions/route.js` — **§12 claims `@admin-verified` but no marker on disk** — real drift
- `site/src/app/api/admin/users/[id]/roles/route.js` — **§12 claims `@admin-verified` but no marker on disk** — real drift

**Real tracker drift (3 API files) — must be fixed in Track P.** These are the Track D admin-gap fixes where §12 of REFERENCE.md explicitly says "`@admin-verified` marker preserved" but the marker was never written to the file.

**missing_feature_marker_only (32)** — these files have `@migrated-to-permissions` but the `@feature-verified` second marker is absent. Tracker generally records these as "marker only" or "migrated" — it never claims a second marker for them. **These are NOT tracker drift; they are files that legitimately only have the first marker.** Listed for completeness:

```
site/src/app/accessibility/page.tsx
site/src/app/api/comments/[id]/context-tag/route.js
site/src/app/api/comments/[id]/flag/route.js
site/src/app/api/comments/[id]/report/route.js
site/src/app/api/comments/[id]/route.js
site/src/app/api/comments/[id]/vote/route.js
site/src/app/api/comments/route.js
site/src/app/api/expert-sessions/[id]/questions/route.js
site/src/app/api/expert-sessions/questions/[id]/answer/route.js
site/src/app/api/expert-sessions/route.js
site/src/app/api/expert/apply/route.js
site/src/app/api/expert/ask/route.js
site/src/app/api/expert/back-channel/route.js
site/src/app/api/family/achievements/route.js
site/src/app/api/reports/route.js
site/src/app/api/reports/weekly-reading-report/route.js
site/src/app/appeal/page.tsx
site/src/app/browse/page.tsx
site/src/app/cookies/page.tsx
site/src/app/dmca/page.tsx
site/src/app/forgot-password/page.tsx
site/src/app/how-it-works/page.tsx
site/src/app/leaderboard/page.tsx
site/src/app/login/page.tsx
site/src/app/privacy/page.tsx
site/src/app/reset-password/page.tsx
site/src/app/signup/expert/page.tsx
site/src/app/signup/page.tsx
site/src/app/signup/pick-username/page.tsx
site/src/app/status/page.tsx
site/src/app/terms/page.tsx
site/src/app/welcome/page.tsx
```

---

## Part 2 — 4-track split

All four tracks below are parallelizable except that **Track P must wait for Track M to finish.**

### Track M — migrate `requireRole` callers → `requirePermission`

**Owns (files edited):** exactly these 38 files (every one that currently calls `await requireRole(...)`):
```
site/src/app/api/admin/ad-campaigns/[id]/route.js
site/src/app/api/admin/ad-campaigns/route.js
site/src/app/api/admin/ad-placements/[id]/route.js
site/src/app/api/admin/ad-placements/route.js
site/src/app/api/admin/ad-units/[id]/route.js
site/src/app/api/admin/ad-units/route.js
site/src/app/api/admin/appeals/[id]/resolve/route.js
site/src/app/api/admin/billing/cancel/route.js
site/src/app/api/admin/billing/freeze/route.js
site/src/app/api/admin/billing/sweep-grace/route.js
site/src/app/api/admin/broadcasts/breaking/route.js
site/src/app/api/admin/data-requests/[id]/approve/route.js
site/src/app/api/admin/data-requests/[id]/reject/route.js
site/src/app/api/admin/data-requests/route.js
site/src/app/api/admin/expert/applications/[id]/approve/route.js
site/src/app/api/admin/expert/applications/[id]/clear-background/route.js
site/src/app/api/admin/expert/applications/[id]/mark-probation-complete/route.js
site/src/app/api/admin/expert/applications/[id]/reject/route.js
site/src/app/api/admin/expert/applications/route.js
site/src/app/api/admin/moderation/comments/[id]/hide/route.js
site/src/app/api/admin/moderation/comments/[id]/unhide/route.js
site/src/app/api/admin/moderation/reports/[id]/resolve/route.js
site/src/app/api/admin/moderation/reports/route.js
site/src/app/api/admin/moderation/users/[id]/penalty/route.js
site/src/app/api/admin/recap/[id]/questions/route.js
site/src/app/api/admin/recap/[id]/route.js
site/src/app/api/admin/recap/questions/[id]/route.js
site/src/app/api/admin/recap/route.js
site/src/app/api/admin/send-email/route.js
site/src/app/api/admin/settings/invalidate/route.js
site/src/app/api/admin/settings/route.js
site/src/app/api/admin/sponsors/[id]/route.js
site/src/app/api/admin/sponsors/route.js
site/src/app/api/admin/stories/route.js
site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js
site/src/app/api/admin/users/[id]/permissions/route.js
site/src/app/api/admin/users/[id]/roles/route.js
site/src/app/api/expert/answers/[id]/approve/route.js
```

**Must not touch:**
- `site/src/lib/auth.js` (Track P deletes `requireRole` itself — M only migrates callers)
- `site/src/lib/roles.js` (still used by actor-vs-target checks; keep)
- Any `@admin-verified` page/component under `site/src/app/admin/**/*.tsx` or `site/src/components/admin/**` (LOCKED)
- `site/src/middleware.js` (prose-comment touch is Track P's concern)

**Mapping strategy — how to pick the permission key for each `requireRole(role)` call:**
1. Read the route body, find the mutation being guarded.
2. Pick the `admin.*` permission key that describes the write (examples: `admin.moderation.reports.resolve`, `admin.broadcasts.breaking.create`, `admin.recap.edit_question`, `admin.stories.edit_quiz`, `admin.billing.freeze`, `admin.expert.applications.approve`, `admin.ad_campaigns.create`, `admin.ad_units.create`, `admin.sponsors.create`, `admin.settings.invalidate`, `admin.send_test_email` — pattern mirrors the existing `admin.push.send_test` swap in `/api/push/send/route.js`).
3. If the target key doesn't exist in `permissions` table, flag for human review and **do not fabricate**. Cross-check against `permissions.xlsx` matrix. Prior examples where this pattern held: `fix_permission_set_hygiene_2026_04_18`, `fix_settings_leak_bindings`.
4. Preserve the outranks-target / `getMaxRoleLevel` / F-035 checks — those are a separate rank-guard layer and stay exactly as-is.
5. Preserve the `catch` → 403 error shape (use the `err.status`/`err.message` forwarding pattern from the existing sealed tracks — see `/api/push/send/route.js` as the canonical template).

**Dependencies:** none upstream. **Track P blocks on M.**

**Flip-test plan:** spot-check 3 random migrated routes. For each pick one key and run the standard flip-test pattern:
- baseline call on `admin@veritypost.com` → expect 200 (`granted=true via role`)
- insert `permission_scope_overrides` with `override_action='block'` on that key for `admin@`
- call → expect 403 (`PERMISSION_DENIED:<key>`)
- delete override → call → expect 200

**Expected size:** 38 files × ~3-line diff (import swap + call replacement + optional comment update) ≈ 120-150 lines changed, + DB binding additions for keys missing from `admin` set. One migration file (`fix_admin_api_route_bindings_2026_04_18`).

**Marker policy:** each migrated file gets `// @migrated-to-permissions 2026-04-18` (if not already present) and an appropriate `@feature-verified <area> 2026-04-18` for the feature area being gated (admin-moderation, admin-expert, admin-broadcasts, admin-recap, admin-billing, admin-ad-ops, admin-sponsors, admin-stories, admin-data-requests, admin-users, admin-appeals, admin-settings, admin-send-email).

---

### Track N — drop `role_permissions` table + hierarchy-map evaluation

**Owns:**
- **DB migration:** a new Supabase migration `phase5_drop_role_permissions.sql` that:
  - Verifies `SELECT COUNT(*) FROM role_permissions = 0` (guard).
  - `DROP TABLE public.role_permissions CASCADE;` (cascades the 2 FKs + 2 indexes + 1 UNIQUE + 3 RLS policies that reference it).
  - Idempotent: wrap in `DO $$ BEGIN ... IF EXISTS ... END $$;`.
- `01-Schema/reset_and_rebuild_v2.sql` — remove the 10 `role_permissions`-related blocks (lines: 405-407, 2366-2367, 2613-2614, 2839, 3005, 3126 comment stays, 4213-4215).
- `site/src/types/database.ts` — regenerate via `cd site && npm run types:gen` after the DROP.

**Hierarchy map decision (from 1.5):** **DO NOT DELETE `site/src/lib/roles.js`.** It has 5 live callers doing actor-vs-target rank guards. Deleting it would remove the F-034/F-035/F-036 protections. Phase 5's REFERENCE.md §10 line 7 "remove the role-hierarchy map" is deferred — flag in the final Phase 5 report as: "deferred pending actor-vs-target rework (server RPC replacement)."

**Must not touch:**
- `site/src/lib/roles.js`, `site/src/lib/auth.js`, any `api/admin/**` route.
- Any `@admin-verified` file.
- Any file that Tracks M, O, P are editing.

**Dependencies:** none. Can run fully in parallel.

**Flip-test plan:** no flip-test needed for the DROP (empty table). After `npm run types:gen`, run `cd site && npx tsc --noEmit` — expect EXIT=0. The generated `database.ts` drops the `role_permissions` entry.

**Expected size:** 1 Supabase migration (~30 lines SQL), `reset_and_rebuild_v2.sql` diff (~10 lines removed), auto-regenerated `database.ts` (~30 lines removed). Zero hand-edits to `database.ts`.

---

### Track O — delete `QuizPoolEditor.tsx` orphan + clean stale `viewerTier` comment + card/tiers migration

**Owns:**
1. **Delete `site/src/components/QuizPoolEditor.tsx`** — confirmed orphan: `grep -rn "QuizPoolEditor"` under `site/src` returns only the file itself (3 hits). Functional duplicate of the inline editor in `site/src/app/admin/story-manager/page.tsx` (per tracker Carry-over #5 and Track H gap). No consumer, safe delete.
2. **Clean stale `viewerTier` comment block** in `site/src/app/u/[username]/page.tsx:14-26`. The comment still says "viewerTier prop is still passed so FollowButton's internal double-check keeps working" but Track J already removed the `viewerTier` prop from FollowButton. Rewrite the comment block to current truth (FollowButton self-gates on `profile.follow`; no prop passed).
3. **Migrate `@/lib/tiers` call-sites** (4 files) to `hasPermission`:
   - `site/src/app/card/[username]/layout.js`
   - `site/src/app/card/[username]/opengraph-image.js`
   - `site/src/app/card/[username]/page.js`
   - `site/src/app/profile/card/page.js`
   Replace `isPaidTier(...)` with `hasPermission('profile.card.view')` (or the closest existing profile-card permission key; verify against DB first — candidates: `profile.card.view`, `profile.card.share_link`). Where the file is a server component / OG route, use `hasPermissionServer`.
4. **Delete `site/src/lib/tiers.js`** after all 4 call-sites are migrated and `grep -rn "from.*tiers"` under `site/src` returns zero.

**Must not touch:**
- `site/src/lib/plans.js` (active, not a Phase 5 deletion candidate — see 1.3).
- Any `requireRole` call-site (that's Track M).
- `site/src/lib/auth.js` (that's Track P).
- Any `@admin-verified` file.

**Dependencies:** none upstream. Fully parallel with M, N, P (though P cannot finish until M does).

**Flip-test plan:** for the profile-card migration, flip-test `profile.card.view` on a test account (e.g. `premium@test.veritypost.com`):
- baseline → expect 200 card render
- insert block override on `profile.card.view` → expect card denied / fallback
- delete override → restore

**Expected size:** 1 file deletion (QuizPoolEditor.tsx ≈ 400 lines), 1 comment rewrite in `u/[username]/page.tsx` (~12 lines), 4 files migrated (~10 lines each), 1 file deletion (`tiers.js`, 3 lines). Total ≈ 450 lines touched.

---

### Track P — delete `requireRole` helper + legacy cleanups + tracker drift fix

**MUST RUN SERIALLY AFTER TRACK M COMPLETES.** Verify M finished by running `grep -rn "await requireRole" site/src --include='*.js' --include='*.ts'` → expect zero hits before starting P.

**Owns:**
1. **Delete `requireRole` from `site/src/lib/auth.js`** — remove lines 75-91 (the function body). Also remove the unused `hierarchy` local object.
2. **Delete `hasRole` from `site/src/lib/auth.js`** if `grep -rn "hasRole"` under `site/src` returns only the definition (verify; if callers exist, leave it for a future pass). This is opportunistic — not strictly a Phase 5 requirement.
3. **Delete `assertPlanFeature` + `getPlanFeatureLimit` from `site/src/lib/auth.js`** if `grep -rn "assertPlanFeature\|getPlanFeatureLimit"` returns only definitions. Both are legacy plan-feature gates superseded by `requirePermission`.
4. **Update prose comments** that reference `requireRole`:
   - `site/src/middleware.js:7` — rewrite to reference `requirePermission` instead.
   - `site/src/app/api/admin/users/[id]/permissions/route.js:29,32,67` — rewrite comments to reference the new permission key (will be set by Track M; read the file post-M and sync the prose). **Admin-LOCKED file `site/src/app/admin/page.tsx:101` — do NOT touch, leave the stale comment.**
5. **Tracker drift — add the 3 missing `@admin-verified 2026-04-18` markers** that REFERENCE.md §12 explicitly claims but are not on disk:
   - `site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js`
   - `site/src/app/api/admin/users/[id]/permissions/route.js`
   - `site/src/app/api/admin/users/[id]/roles/route.js`
   These three admin-API routes were claimed as admin-locked in the §12 write-up; the marker was simply omitted during the Track D pass. Add `// @admin-verified 2026-04-18` at the top of each. **Coordinate with Track M — M is migrating the `requireRole` calls in those same 3 files; P re-reads post-M and adds the marker.** (Alternative: fold this marker write into Track M's own pass for those 3 files. Recommended folding into M to avoid the re-read.)
6. **Subscription spec-vs-DB naming drift (from REFERENCE carry-over)** — **flag only, do not rename.** Leave spec docs' 5 missing semantic-alias keys (`subscription.cancel`, `subscription.resume`, `subscription.upgrade`, `subscription.downgrade`, `plan.switch`, `checkout.initiate`, `billing.view.invoices`) un-renamed because the canonical `billing.*` keys are what the code uses and the DB agrees. Add a one-paragraph note to `REFERENCE.md` §6 listing the canonical names. (Do NOT rename live keys — flagged as spec-doc issue only.)
7. **3 duplicate key pairs in `billing.*`** — **flag, deactivate the unused side** (`is_active=false`) after grep-confirming zero code references to the deprecated side:
   - `billing.cancel` (pro/admin/owner — unused) vs `billing.cancel.own` (in use). Grep shows `/api/billing/cancel/route.js` uses `.own`; zero hits for bare `billing.cancel` outside comments. Mark `billing.cancel` as `is_active=false`.
   - `billing.invoices.view` (pro/admin/owner — unused) vs `billing.invoices.view_own` (in use). Same pattern. Mark `billing.invoices.view` as `is_active=false`.
   - `billing.portal.open` (all tiers — in use in spec/marketing) vs `billing.stripe.portal` (pro/admin/owner — in use on `/api/stripe/portal` route). **DO NOT deactivate either** — this is the gap flagged in track-I Phase 5 gaps (the server route gates on the narrower key, which excludes family/expert). **DEFERRED per brief — "Stripe portal gate excludes family/expert (product)".** Do not touch in Phase 5.
8. **Do a final tracker drift sweep** after the helper deletion: `grep -L "@feature-verified" <every file in PERMISSION_MIGRATION.md claiming the second marker>`. Target: 0 claims-without-marker. The 32 "missing_feature_marker_only" files from Part 1.7 are NOT claims-without-marker (tracker records them as "marker only" or similar) — leave them.

**Must not touch:**
- Any file that still has live `requireRole` callers (verify M is complete first).
- Any `@admin-verified` page/component file's body (marker additions for the 3 API routes are the only admin-marker writes P is authorized for).
- `site/src/lib/roles.js` (deferred per 1.5).
- `site/src/lib/plans.js` (active).

**Dependencies:** **SERIAL on Track M.** Can run parallel with N and O once M has finished.

**Flip-test plan:**
- After `requireRole` deletion: `grep -rn "requireRole" site/src` → expect zero non-comment hits.
- `cd site && npx tsc --noEmit` → EXIT=0.
- Regression spot-check: pick 3 sealed features (e.g. comments, subscription, notifications) and verify their hasPermission / requirePermission call-sites still work (flip-test one key per feature).

**Expected size:** ~15 lines deleted from `lib/auth.js`, ~5 prose-comment edits, 3 marker additions, 1 Supabase migration to deactivate 2 duplicate billing keys (`is_active=false`), ~20-line addition to REFERENCE.md §6 note. Total ≈ 100 lines touched.

---

## Part 3 — Sequencing

**Recommended order (canonical):**

1. **Dispatch in parallel:** M, N, O (no inter-dependencies).
2. **Wait for M to finish.** Verify: `grep -rn "await requireRole" site/src --include='*.js' --include='*.ts'` → 0 hits.
3. **Dispatch P.** P reads M's post-migration file state and (a) deletes the helper, (b) adds the 3 tracker-drift `@admin-verified` markers, (c) updates prose comments, (d) does the final drift sweep.

Steps 1 and 3 can run at 3-wide / 1-wide concurrency respectively. N and O can continue to run while P executes (they don't touch anything P touches).

**Alternative — fold P's marker writes into M:** M is editing those 3 files anyway; having M add the missing `@admin-verified` marker at the same time it does the `requireRole` → `requirePermission` swap removes one serial step. Recommended. In that case, Track P's scope shrinks to: (1) delete `requireRole` helper, (2) prose-comment updates, (3) duplicate-key deactivation migration, (4) final drift grep.

---

## Part 4 — Review criteria (for the Round 2 REVIEW AGENT)

After all 4 tracks land, the review agent must verify:

1. **`requireRole` fully gone.** `grep -rn "requireRole" site/src` returns zero results (not even in comments — Track P should have rewritten them).
2. **All former `requireRole` call-sites have a working `requirePermission` gate.** Spot-check 5 random routes from the Track M owns-list: verify the permission key exists in DB, resolves correctly for `admin@`, and blocks correctly under a scope-override.
3. **`role_permissions` table dropped.** `SELECT to_regclass('public.role_permissions')` → `null`. Zero code references outside `01-Schema/reset_and_rebuild_v2.sql` (the CREATE block should be removed). `site/src/types/database.ts` has no `role_permissions` key.
4. **Hierarchy map status flagged but NOT deleted.** `site/src/lib/roles.js` still present, with the original 5 import sites intact. Phase 5 report in REFERENCE.md §10 must note "hierarchy-map removal deferred pending actor-vs-target rework".
5. **No orphan `QuizPoolEditor.tsx`** under `site/src/components/`.
6. **No stale `viewerTier`-prop comment** in `site/src/app/u/[username]/page.tsx` (lines 14-26 rewritten).
7. **`@/lib/tiers` fully removed.** `grep -rn "from.*tiers"` under `site/src` returns zero; `site/src/lib/tiers.js` deleted; all 4 former call-sites use `hasPermission`/`hasPermissionServer` instead.
8. **`@/lib/plans` retained and active.** This is the plan catalog, not a gate helper — do not delete. Review just confirms it's still imported by `profile/settings/page.tsx` and admin/subscriptions/page.tsx (the LOCKED admin consumer).
9. **3 admin-verified markers added** on the Track D API routes. `grep -l "@admin-verified" api/admin/subscriptions/\[id\]/manual-sync/route.js api/admin/users/\[id\]/permissions/route.js api/admin/users/\[id\]/roles/route.js` → 3 hits.
10. **2 deactivated billing duplicate keys** (`billing.cancel`, `billing.invoices.view`) now have `is_active=false`. Zero remaining code references.
11. **Subscription spec-vs-DB drift:** REFERENCE.md §6 or §10 has a one-paragraph note listing canonical `billing.*` keys; no live keys renamed.
12. **DEFERRED items NOT touched in Phase 5:**
    - Stripe-portal `billing.stripe.portal` vs `billing.portal.open` — both still active.
    - iOS `SubscriptionView.redeemPromo` bypass — unchanged.
    - iOS-only spec keys with no iOS code — unchanged.
    - `supervisor.*` visibility — unchanged.
12. **Tracker drift eliminated.** Run the drift scan script (see Part 1.7 methodology) — expect zero `missing_both_markers` hits outside the 5 expected-deleted files and zero real claims-without-marker.
13. **`cd site && npx tsc --noEmit` → EXIT=0.**
14. **DB migrations idempotent.** Re-running `phase5_drop_role_permissions.sql` should be a no-op (second run: table already gone, guard passes). Same for `fix_admin_api_route_bindings_2026_04_18` (upsert-style WHERE NOT EXISTS on permission_set_permissions rows).
15. **Regression spot-check:** pick 3 random sealed features (e.g. `comments`, `notifications`, `kids`) — flip-test one key per feature. All three round-trip clean (baseline → block override → denied → delete override → restored).

---

## Part 5 — Surprises / scope notes

1. **`requireRole` scope is 54 calls × 38 files**, not "a handful". Brief was optimistic. Still parallelizable within Track M (all files live under `api/admin/` with the same pattern), mechanical to migrate, but non-trivial size. Recommend giving Track M a ~2x time budget vs N and O.
2. **Hierarchy map (`lib/roles.js`) cannot be deleted in Phase 5.** It guards 5 actor-vs-target checks. Deferred — flagged in REFERENCE.md.
3. **`@/lib/plans` is the plan catalog, not a gate helper.** Keep it. The Phase 5 REFERENCE line about "legacy helpers if fully unused" only applies to `@/lib/tiers` (which IS fully orphaned after Track O).
4. **Only 3 real tracker-drift entries** (the §12 Track D API routes). The 32 "missing second marker" files are not tracker claims — they're legitimately single-marker files. Track L already caught `NotificationBell.tsx` and added its second marker.
5. **The `billing.portal.open` vs `billing.stripe.portal` duplicate is DEFERRED** (product call per brief) — not deactivated in Phase 5. Only `billing.cancel` (dup of `billing.cancel.own`) and `billing.invoices.view` (dup of `.view_own`) are deactivated in Phase 5.

---

End of prep doc.
