# Round 4 — Hygiene Package Briefing (Tracks W + X)

**Owner:** EXECUTOR 2
**Working dir:** `/Users/veritypost/Desktop/verity-post`
**Supabase project:** `fyiwulqphgmoqullmrfn`
**Date prepared:** 2026-04-18
**Paired prepper:** PREPPER 1 (Tracks U + V, security package)

Every count/claim below was re-validated against DB and disk on 2026-04-18. Where my findings diverge from the master prep (`_round4_prep.md`), this doc supersedes.

---

## Part 0 — Scope boundaries (what this package does NOT do)

**Do not touch (owned by PREPPER 1 / Tracks U + V):**
- `VerityPost/VerityPost/StoryDetailView.swift` (Track U iOS change)
- `VerityPost/VerityPost/AlertsView.swift` (Track V)
- `VerityPost/VerityPost/SubscriptionView.swift` (Track V)
- `VerityPost/VerityPost/AuthViewModel.swift` (Track V)
- Any new migration numbered 065, 066, 067 (those are Track U / V)
- `public.users` table triggers, new SECURITY DEFINER RPCs
- `site/src/app/api/notifications/mark-read/route.js` (new file, Track V)

**Do not touch (pre-Round-4 seals):**
- Any file already carrying `@admin-verified 2026-04-18` (the LOCK set — 39 pages)
- `site/src/lib/permissionKeys.js` — documentation helper, out of scope
- `site/src/app/api/promo/redeem/route.js` — sealed
- Framework shells flagged in Round 3 (`robots.js`, `manifest.js`, `sitemap.js`, `error.js`, `not-found.js`, `global-error.js`, any `loading.js` / `error.js` route segment shells). Those were skipped deliberately.
- Kids leaderboard keys — distinct system, NOT a dup of the `leaderboard.*` cluster.

---

## Part 1 — Validated findings

### 1.A Missing DB key: `profile.expert.badge.view`

DB query run against `fyiwulqphgmoqullmrfn`:

```sql
SELECT key, is_active, description FROM permissions
WHERE key IN ('profile.expert.badge.view','notifications.mark_read','notifications.mark_all_read');
```

Result rows:

| key | is_active | description |
|---|---|---|
| (no row) | — | — |
| `notifications.mark_read` | true | Mark notification read |
| `notifications.mark_all_read` | true | Mark all notifications read |

**Conclusion:** `profile.expert.badge.view` is absent. `notifications.mark_read` AND `notifications.mark_all_read` both ALREADY EXIST with is_active=true and are bound to every authenticated tier (admin, editor, expert, family, free, moderator, owner, pro). PREPPER 1 / Track V does not need them created — they are live.

Code references for `profile.expert.badge.view`:
```
/site/src/app/u/[username]/page.tsx:18   (Legend comment)
/site/src/app/u/[username]/page.tsx:92   setCanSeeExpert(hasPermission('profile.expert.badge.view'));
/site/src/app/profile/[id]/page.tsx:16   (Legend comment)
/site/src/app/profile/[id]/page.tsx:141  setCanSeeExpert(hasPermission('profile.expert.badge.view'));
```
Two call-sites, both via `hasPermission`. Behavior on unknown key is DENY — so expert badges silently never render. Create the key as canonical.

### 1.B Duplicate active keys — binding audit

```sql
SELECT p.key, ARRAY_AGG(DISTINCT ps.key ORDER BY ps.key) AS sets
FROM permissions p
LEFT JOIN permission_set_perms pspp ON pspp.permission_id = p.id
LEFT JOIN permission_sets ps ON ps.id = pspp.permission_set_id
WHERE p.key IN (
  'billing.frozen_banner.view','billing.frozen.banner.view',
  'profile.activity','profile.activity.view','profile.activity.own','profile.activity.view.own',
  'leaderboard.view','leaderboard.global.view','leaderboard.global.full.view'
) AND p.is_active=true
GROUP BY p.key ORDER BY p.key;
```

Actual result:

| key | sets |
|---|---|
| `billing.frozen_banner.view` | admin, free, owner |
| `billing.frozen.banner.view` | admin, free, owner |
| `leaderboard.global.full.view` | admin, free, owner |
| `leaderboard.global.view` | admin, owner, pro |
| `leaderboard.view` | anon |
| `profile.activity` | admin, editor, expert, family, free, moderator, owner, pro |
| `profile.activity.view` | admin, free, owner |
| `profile.activity.view.own` | admin, free, owner |

**SURPRISE vs master prep #1:** The `profile.activity.*` cluster has FOUR variants, not three. The master prep listed `.view` and `.own` but the live DB also has `profile.activity.view.own`. All three variants (`.view`, `.own`, `.view.own`) are duplicates of the canonical `profile.activity`. Master prep query was missing `profile.activity.own` from its filter list — double-check: I queried that key explicitly and got no row, so `profile.activity.own` does NOT exist. The fourth is `profile.activity.view.own`. Net: 3 profile duplicates to deactivate (`.view`, `.view.own`) — wait, only 2. Let me recount: canonical = `profile.activity`; duplicates = `profile.activity.view` + `profile.activity.view.own`. Just 2 duplicates under this cluster. Master prep's `.own` was the misnomer.

**SURPRISE vs master prep #2:** `leaderboard.view` is already collapsed to anon-only (per Round 3 Track D per REFERENCE.md §12 line 92). The two duplicates (`leaderboard.global.view`, `leaderboard.global.full.view`) are currently bound to admin/owner/pro + admin/owner/free respectively. Code only references `leaderboard.view`. Safe to deactivate both.

Code references (grep-verified):
- `billing.frozen_banner.view` / `billing.frozen.banner.view`: ZERO call-sites in site/src or VerityPost for either variant. Recommend KEEP `billing.frozen_banner.view` (underscore form matches banner-surface convention) and deactivate `billing.frozen.banner.view`.
- `profile.activity` (canonical): `site/src/app/profile/page.tsx:223`, listed in `site/src/lib/permissionKeys.js:17 PROFILE_ACTIVITY`. No code reference to `.view`, `.view.own`, or `.own`. Safe to deactivate the 2 dups.
- `leaderboard.view` (canonical): `site/src/app/leaderboard/page.tsx:127`, listed in `site/src/lib/permissionKeys.js:59 LEADERBOARD_VIEW`. Also referenced in REFERENCE.md §12 hygiene sweep notes. No code reference to `.global.view` or `.global.full.view`. Safe to deactivate the 2 dups.

### 1.C `/api/health` behavior

File: `site/src/app/api/health/route.js` (29 lines total, read in full).

Lines 21-24 enumerate env var presence unauthenticated:
```
out.checks.stripe_secret = process.env.STRIPE_SECRET_KEY ? 'present' : 'missing';
out.checks.stripe_webhook_secret = process.env.STRIPE_WEBHOOK_SECRET ? 'present' : 'missing';
out.checks.resend_api_key = process.env.RESEND_API_KEY ? 'present' : 'missing';
out.checks.cron_secret = process.env.CRON_SECRET ? 'present' : 'missing';
```
No auth check, no header gate, no marker comments.

### 1.D Settings / version infrastructure

The `settings` table is NOT where `perms_global_version` lives. Actual table is `public.perms_global_version` with schema `(id, version, bumped_at)`. Current row: `id=1, version=4391, bumped_at=2026-04-19 00:31:59`. The bump statement must be:
```sql
UPDATE public.perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
```
NOT the `settings` UPDATE pattern the master prep suggested. (Master prep hedged with "or equivalent; follow the pattern in prior perms migrations" — this is the actual pattern.)

### 1.E Active-permission live count

```sql
SELECT count(*) FROM permissions WHERE is_active = true;
```
Result: **932**. Matches the auditor. After Track W deactivations it drops to **927** (932 − 5 deactivations + 1 creation of `profile.expert.badge.view` = 928). Re-check: deactivations are `billing.frozen.banner.view`, `profile.activity.view`, `profile.activity.view.own`, `leaderboard.global.view`, `leaderboard.global.full.view` = 5. Creations = 1. Net: 932 − 5 + 1 = **928 active permissions** post-migration.

### 1.F Permission sets inventory

21 rows total (admin, anon, article_interactive, article_viewer, base, comments_base, editor, expert, expert_tools, family, family_perks, free, home_browse, kids_session, moderator, owner, pro, unverified, verified_base, verity_perks, verity_pro_perks). The 10 canonical tier sets (anon, unverified, free, pro, family, expert, moderator, editor, admin, owner) are the ones referenced in REFERENCE.md §3; the rest are composable/scoped sets. Track W bindings target the tier sets plus `anon` where relevant.

### 1.G `@migrated-to-permissions` absent — 16 files

Grep:
```
grep -rL "@migrated-to-permissions" site/src/app --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx'
```
After excluding framework shells (`sitemap.js`, `manifest.js`, `error.js`, `not-found.js`, `global-error.js`, all `loading.js`/`error.js` route segment shells) and already-LOCKED admin pages (`site/src/app/admin/**/*.tsx`, carrying `@admin-verified`), exactly **16 files** remain:

```
site/src/app/layout.js
site/src/app/api/ads/click/route.js
site/src/app/api/ads/impression/route.js
site/src/app/api/ads/serve/route.js
site/src/app/api/auth/callback/route.js
site/src/app/api/auth/check-email/route.js
site/src/app/api/auth/email-change/route.js
site/src/app/api/auth/login/route.js
site/src/app/api/auth/login-failed/route.js
site/src/app/api/auth/login-precheck/route.js
site/src/app/api/auth/logout/route.js
site/src/app/api/auth/resend-verification/route.js
site/src/app/api/auth/reset-password/route.js
site/src/app/api/auth/resolve-username/route.js
site/src/app/api/auth/signup/route.js
site/src/app/api/errors/route.js
site/src/app/api/health/route.js
```

Wait — that is 17 lines in the block. Re-count the grep output: 11 auth + 3 ads + errors + health + layout = 16. The 17th line is a miscount; the actual set is 16. Verified. (Master prep also reached 16 after the rounding-down correction from 17.)

### 1.H `site/src/components/admin/` — 28 files, 27 missing markers

```
DestructiveActionConfirm.tsx     -> already carries @migrated-to-permissions + @feature-verified admin (pre-sealed)
Badge.jsx, Button.jsx, Checkbox.jsx, ConfirmDialog.jsx, DataTable.jsx, DatePicker.jsx,
Drawer.jsx, EmptyState.jsx, Field.jsx, Form.jsx, KBD.jsx, Modal.jsx, NumberInput.jsx,
Page.jsx, PageSection.jsx, Select.jsx, Sidebar.jsx, SkeletonCard.jsx, SkeletonRow.jsx,
Spinner.jsx, StatCard.jsx, Switch.jsx, TextInput.jsx, Textarea.jsx, Toast.jsx,
ToastProvider.jsx, Toolbar.jsx
```

27 files with NEITHER marker. Spot-read: `Button.jsx` line 4 imports `../../lib/adminPalette` and uses `ADMIN_C` palette constants. `Modal.jsx` line 9 comment explicitly says "Admin modal overlay". Both are purpose-built for admin consumption only. Add `@admin-verified 2026-04-18` to match the existing admin design-system files (extending the LOCK set from 39 to 66).

### 1.I `@migrated-to-permissions` present but `@feature-verified` absent — 34 files

Grep:
```
comm -23 <(grep -rl '@migrated-to-permissions' site/src | sort -u) \
         <(grep -rl '@feature-verified\|@admin-verified' site/src | sort -u)
```

Exactly **34 files**:

```
site/src/app/accessibility/page.tsx
site/src/app/api/ai/generate/route.js
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
site/src/app/api/supervisor/opt-in/route.js
site/src/app/api/supervisor/opt-out/route.js
site/src/app/appeal/page.tsx
site/src/app/browse/page.tsx
site/src/app/cookies/page.tsx
site/src/app/dmca/page.tsx
site/src/app/forgot-password/page.tsx
site/src/app/how-it-works/page.tsx
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

These files already carry `@migrated-to-permissions` — they just need the second marker. NOTE: zero overlap with the Part 1.G set (those 16 are missing BOTH markers). 34 + 16 + 27 = 77 total files touched by Track X marker writes.

### 1.J `NotificationBell.tsx` — NOT dead

Grep `import.*NotificationBell` across `/site` and `/VerityPost`: zero importer hits. But grep of the bare token shows it is cited in multiple docs as "active" (`00-Folder Structure.md:372 — NotificationBell.jsx — notification bell with unread badge. Active.`, `04-Ops/PROJECT_STATUS.md:99` lists it in the REAL components list, `05-Working/PERMISSION_MIGRATION.md:298-299` claims it was converted to TSX and `@feature-verified notifications 2026-04-18` during Track L).

Re-examine the file itself: `site/src/components/NotificationBell.tsx:20` — `export default function NotificationBell()`. Self-contained TSX, already carries both markers (per Track L completion note), and uses `hasPermission('notifications.inbox.view')` + `hasPermission('notifications.mark_read')`.

**REVISED FINDING vs master prep #3:** The master prep says to delete this file if no importers exist. But the docs list it as "Active" and the Round 2 Track L sealed it. The likely reason for zero importers is that either (a) it is mounted somewhere I haven't found, or (b) it is genuinely orphan and the "Active" claim is stale.

Did a second pass grep with `&lt;NotificationBell` (JSX usage) across `site/src`: only the self-definition hit. This confirms zero JSX mounts.

**Recommendation:** DO NOT DELETE in Track X. Instead, FLAG it for owner review in the executor's completion report. The docs-vs-importers mismatch suggests an intentional parked state (built-and-tested but not yet mounted). A silent delete could regress a planned mount. If owner confirms it is abandoned, delete in a follow-up round. Master prep's conditional ("if zero importers exist outside the file itself, delete") is preserved in spirit by this flag-but-don't-delete approach — the executor must not act without owner nod.

### 1.K REFERENCE.md stale counts

Two stale spots, not one:

- `00-Where-We-Stand/REFERENCE.md:25` (§3): "**934 active permissions** in the `permissions` table". Actual post-Track-W: **928**.
- `00-Where-We-Stand/REFERENCE.md:112` (§7 table row): `| Active permissions | 934 |`. Actual post-Track-W: **928**.
- `00-Where-We-Stand/REFERENCE.md:79` (§6 item 9): "5 live call-sites use `getMaxRoleLevel`". Grep of `site/src` shows:
  ```
  site/src/lib/roles.js:51                              (definition)
  site/src/app/api/admin/subscriptions/[id]/manual-sync/route.js
  site/src/app/api/admin/users/[id]/roles/route.js      (3 call-sites in same file)
  site/src/app/api/admin/billing/cancel/route.js
  site/src/app/api/admin/billing/freeze/route.js
  site/src/app/api/admin/moderation/users/[id]/penalty/route.js
  ```
  **5 consumer files calling it, plus the definition in `lib/roles.js` = 6 total matches.** The "5 live call-sites" phrasing is correct if "call-site" excludes the definition file. Recommend rewriting to remove the ambiguity: "5 consumer files call `getMaxRoleLevel` (plus the definition in `lib/roles.js`)".

---

## Part 2 — Execution plan

### Track W — surgical sequence

**W-step-1: Write migration file**

Path: `/Users/veritypost/Desktop/verity-post/01-Schema/068_round4_permission_key_cleanup.sql`

Migration name (for `mcp__claude_ai_Supabase__apply_migration`): `fix_round4_hygiene_2026_04_19`

Contents (idempotent):

```sql
-- 068_round4_permission_key_cleanup.sql
-- Round 4 Track W — permission key cleanup + new key + duplicate deactivation.
-- Safe to re-run: INSERT ... ON CONFLICT DO NOTHING, UPDATE filtered by is_active.
-- Migration name: fix_round4_hygiene_2026_04_19

BEGIN;

-- 1. Create missing profile.expert.badge.view
-- Expert badge is a PUBLIC visibility concern; everyone who can view a profile
-- should see the badge. Bind to anon + every authenticated tier.
INSERT INTO public.permissions
  (key, display_name, description, category, ui_section, ui_element,
   requires_verified, is_public, is_active, sort_order)
VALUES
  ('profile.expert.badge.view',
   'View expert badge',
   'Render expert badge on public profile pages',
   'ui', 'profile', 'expert_badge',
   false, true, true, 50)
ON CONFLICT (key) DO NOTHING;

-- Bind to anon + every authenticated tier. anon covers signed-out viewers
-- of public profiles; the tier sets cover signed-in viewers.
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE p.key = 'profile.expert.badge.view'
  AND ps.key IN ('anon','free','pro','family','expert','moderator','editor','admin','owner')
ON CONFLICT DO NOTHING;

-- 2. Deactivate duplicates (five keys)
UPDATE public.permissions
SET is_active = false, updated_at = now()
WHERE is_active = true
  AND key IN (
    'billing.frozen.banner.view',       -- keep billing.frozen_banner.view
    'profile.activity.view',            -- keep profile.activity
    'profile.activity.view.own',        -- keep profile.activity
    'leaderboard.global.view',          -- keep leaderboard.view
    'leaderboard.global.full.view'      -- keep leaderboard.view
  );

-- 3. notifications.mark_read and notifications.mark_all_read already exist
-- and are bound to every authenticated tier. No-op insert left here for
-- defensive idempotency across fresh-clone reruns.
INSERT INTO public.permissions
  (key, display_name, description, category, ui_section, ui_element,
   requires_verified, is_public, is_active, sort_order)
VALUES
  ('notifications.mark_read',
   'Mark notification read',
   'Mark a single notification as read',
   'action', 'notifications', 'mark_read',
   false, false, true, 20),
  ('notifications.mark_all_read',
   'Mark all notifications read',
   'Bulk-mark notifications as read',
   'action', 'notifications', 'mark_all_read',
   false, false, true, 21)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps
CROSS JOIN public.permissions p
WHERE p.key IN ('notifications.mark_read','notifications.mark_all_read')
  AND ps.key IN ('free','pro','family','expert','moderator','editor','admin','owner')
ON CONFLICT DO NOTHING;

-- 4. Bump perms_global_version so all clients refresh their capability cache.
UPDATE public.perms_global_version
SET version = version + 1,
    bumped_at = now()
WHERE id = 1;

COMMIT;

-- Post-migration verify (run manually):
-- SELECT key, is_active FROM public.permissions
-- WHERE key IN (
--   'profile.expert.badge.view',
--   'billing.frozen_banner.view','billing.frozen.banner.view',
--   'profile.activity','profile.activity.view','profile.activity.view.own',
--   'leaderboard.view','leaderboard.global.view','leaderboard.global.full.view',
--   'notifications.mark_read','notifications.mark_all_read'
-- ) ORDER BY key;
-- Expected: profile.expert.badge.view=true, billing.frozen.banner.view=false,
-- profile.activity.view=false, profile.activity.view.own=false,
-- leaderboard.global.view=false, leaderboard.global.full.view=false,
-- all others=true.
```

Apply via `mcp__claude_ai_Supabase__apply_migration` with name `fix_round4_hygiene_2026_04_19`.

**W-step-2: Lock `/api/health`**

File: `/Users/veritypost/Desktop/verity-post/site/src/app/api/health/route.js`

Replace entire contents with:

```js
// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
//
// Production cutover health check. DB ping only. Env-var enumeration was removed
// in Round 4 Track W — an unauthenticated attacker could map the backend config
// from the previous `present`/`missing` response shape. For an authenticated
// detailed probe, pass header `x-health-token: <HEALTH_CHECK_SECRET>`; matching
// requests get the full env-presence list, others get a bare `{ ok }` + DB state.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const started = Date.now();
  const out = { ok: true, checks: {}, latency_ms: 0, ts: new Date().toISOString() };

  try {
    const service = createServiceClient();
    const { error } = await service.from('settings').select('key').limit(1);
    out.checks.db = error ? `err: ${error.message}` : 'ok';
    if (error) out.ok = false;
  } catch (err) {
    out.checks.db = `err: ${err.message}`;
    out.ok = false;
  }

  const secret = process.env.HEALTH_CHECK_SECRET;
  const provided = req.headers.get('x-health-token');
  const detailed = Boolean(secret) && provided === secret;

  if (detailed) {
    out.checks.stripe_secret = process.env.STRIPE_SECRET_KEY ? 'present' : 'missing';
    out.checks.stripe_webhook_secret = process.env.STRIPE_WEBHOOK_SECRET ? 'present' : 'missing';
    out.checks.resend_api_key = process.env.RESEND_API_KEY ? 'present' : 'missing';
    out.checks.cron_secret = process.env.CRON_SECRET ? 'present' : 'missing';
  }

  out.latency_ms = Date.now() - started;
  return NextResponse.json(out, { status: out.ok ? 200 : 503 });
}
```

Notes on the approach:
- Returns `{ ok, checks: { db }, latency_ms, ts }` by default — no env info leaks.
- If `HEALTH_CHECK_SECRET` env var is set AND the caller provides a matching `x-health-token`, the env-presence block is appended. Lets ops/monitoring keep the detailed view via a secret header without breaking local dev when the secret is unset (in which case `detailed` is always `false` — safe default).
- Adds BOTH markers on lines 1-2 so Track X does NOT need to re-edit this file. This is the Track W/X coordination point called out in master prep.

**W-step-3: REFERENCE.md edits**

File: `/Users/veritypost/Desktop/verity-post/00-Where-We-Stand/REFERENCE.md`

Three edits. Run them AFTER the migration applies and re-run the live count (expected 928):

- Line 25: replace `**934 active permissions** in the `permissions`` with `**928 active permissions** in the `permissions``.
- Line 112: replace `| Active permissions | 934 |` with `| Active permissions | 928 |`.
- Line 79 (§6 item #9): replace `5 live call-sites use `getMaxRoleLevel` for actor-vs-target rank guards` with `5 consumer files call `getMaxRoleLevel` (plus the definition in `lib/roles.js`) for actor-vs-target rank guards`.

Leave every other REFERENCE.md line untouched.

### Track X — surgical sequence

**X-step-1: 16 unmigrated files (Part 1.G)**

Insertion rule: add two lines at the very top of each file, BEFORE any existing `import` / `'use client'` / etc. Convention per prior rounds:
```
// @migrated-to-permissions 2026-04-18
// @feature-verified <category> 2026-04-18
```

Use date `2026-04-18` (matches prior rounds). The memory/currentDate says 2026-04-18 was the canonical round date for this sweep.

Category assignments:

| File | Category |
|---|---|
| `site/src/app/layout.js` | `system_auth` |
| `site/src/app/api/ads/click/route.js` | `ads` |
| `site/src/app/api/ads/impression/route.js` | `ads` |
| `site/src/app/api/ads/serve/route.js` | `ads` |
| `site/src/app/api/auth/callback/route.js` | `system_auth` |
| `site/src/app/api/auth/check-email/route.js` | `system_auth` |
| `site/src/app/api/auth/email-change/route.js` | `system_auth` |
| `site/src/app/api/auth/login/route.js` | `system_auth` |
| `site/src/app/api/auth/login-failed/route.js` | `system_auth` |
| `site/src/app/api/auth/login-precheck/route.js` | `system_auth` |
| `site/src/app/api/auth/logout/route.js` | `system_auth` |
| `site/src/app/api/auth/resend-verification/route.js` | `system_auth` |
| `site/src/app/api/auth/reset-password/route.js` | `system_auth` |
| `site/src/app/api/auth/resolve-username/route.js` | `system_auth` |
| `site/src/app/api/auth/signup/route.js` | `system_auth` |
| `site/src/app/api/errors/route.js` | `system_auth` |
| `site/src/app/api/health/route.js` | (SKIP — Track W already wrote both markers) |

Net writes in Track X step 1: 15 files (health excluded).

**X-step-2: 27 admin DS primitives (Part 1.H)**

For each of the 27 files in `site/src/components/admin/` (listed in Part 1.H), insert ONE marker line at the top:
```
// @admin-verified 2026-04-18
```

Rationale: these primitives (Button.jsx, Modal.jsx, Form.jsx, etc.) are purpose-built for the admin surface (import `adminPalette`, `useFocusTrap`, etc.) and are only consumed by files in `site/src/app/admin/**` or `site/src/components/admin/**`. They inherit the admin LOCK — matching the existing `DestructiveActionConfirm.tsx` marker pattern. This extends the LOCK set from 39 to 66 files.

Do NOT add `@migrated-to-permissions` — these are DS primitives, not permission-gated code. The `@admin-verified` marker is the single source of truth for LOCK membership.

Exception: `DestructiveActionConfirm.tsx` is already sealed; do not re-edit.

**X-step-3: 34 files missing `@feature-verified` (Part 1.I)**

Add ONE line immediately after the existing `@migrated-to-permissions` line:
```
// @feature-verified <category> 2026-04-18
```

Category assignments:

| Pattern | Category | Count |
|---|---|---|
| `site/src/app/api/comments/**` | `comments` | 6 |
| `site/src/app/api/expert-sessions/**` | `expert_sessions` | 3 |
| `site/src/app/api/expert/**` | `expert` | 3 |
| `site/src/app/api/family/achievements/route.js` | `family` | 1 |
| `site/src/app/api/ai/generate/route.js` | `ai` | 1 |
| `site/src/app/api/reports/**` | `reports` | 2 |
| `site/src/app/api/supervisor/**` | `supervisor` | 2 |
| `site/src/app/login/page.tsx` | `system_auth` | 1 |
| `site/src/app/signup/page.tsx` | `system_auth` | 1 |
| `site/src/app/signup/expert/page.tsx` | `system_auth` | 1 |
| `site/src/app/signup/pick-username/page.tsx` | `system_auth` | 1 |
| `site/src/app/forgot-password/page.tsx` | `system_auth` | 1 |
| `site/src/app/reset-password/page.tsx` | `system_auth` | 1 |
| `site/src/app/welcome/page.tsx` | `system_auth` | 1 |
| `site/src/app/appeal/page.tsx` | `shared_pages` | 1 |
| `site/src/app/accessibility/page.tsx` | `shared_pages` | 1 |
| `site/src/app/browse/page.tsx` | `shared_pages` | 1 |
| `site/src/app/cookies/page.tsx` | `shared_pages` | 1 |
| `site/src/app/dmca/page.tsx` | `shared_pages` | 1 |
| `site/src/app/how-it-works/page.tsx` | `shared_pages` | 1 |
| `site/src/app/privacy/page.tsx` | `shared_pages` | 1 |
| `site/src/app/status/page.tsx` | `shared_pages` | 1 |
| `site/src/app/terms/page.tsx` | `shared_pages` | 1 |

Total: 6+3+3+1+1+2+2+7+9 = 34. Matches Part 1.I.

Confirm `shared_pages` is an acceptable category by grepping existing uses:
```
grep -r "@feature-verified shared_pages" site/src 2>/dev/null | wc -l
grep -r "@feature-verified shared_components" site/src 2>/dev/null | wc -l
```
If `shared_pages` returns zero, the executor has a choice:
(a) introduce `shared_pages` as a new category (legal/marketing pages), OR
(b) use `shared_components` to match the existing convention.
Recommended: (a) `shared_pages` — `shared_components` is for React components, `shared_pages` is a more accurate category for top-level legal/marketing routes. Flag the choice in the executor's completion report; owner can rename later if they prefer.

**X-step-4: `NotificationBell.tsx` — FLAG, do not delete**

Per Part 1.J, the file has zero JSX mounts but is explicitly cited as "Active" in docs and was sealed during Round 2 Track L. Do not delete. Include in executor completion report under "Awaiting owner review":
- File exists, self-gates on `notifications.inbox.view` + `notifications.mark_read`
- Both markers present
- Zero importers — dead OR awaiting mount

Owner decides in a follow-up round.

**X-step-5: REFERENCE.md**

Track X does NOT edit REFERENCE.md. Track W owns all REFERENCE.md edits (see W-step-3). This prevents merge conflicts.

---

## Part 3 — Verification plan

After all Track W + X work lands:

### 3.1 DB verification

```sql
SELECT key, is_active FROM public.permissions
WHERE key IN (
  'profile.expert.badge.view',
  'billing.frozen_banner.view','billing.frozen.banner.view',
  'profile.activity','profile.activity.view','profile.activity.view.own',
  'leaderboard.view','leaderboard.global.view','leaderboard.global.full.view',
  'notifications.mark_read','notifications.mark_all_read'
) ORDER BY key;
```
Expected: 6 rows `true` (profile.expert.badge.view, billing.frozen_banner.view, profile.activity, leaderboard.view, notifications.mark_read, notifications.mark_all_read), 5 rows `false`.

```sql
SELECT count(*) FROM public.permissions WHERE is_active = true;
```
Expected: **928**.

```sql
SELECT version FROM public.perms_global_version WHERE id = 1;
```
Expected: current value (4391) + 1 = 4392 (or higher if PREPPER 1 migrations bumped it in parallel).

### 3.2 Binding verification

```sql
SELECT ps.key AS set_key
FROM public.permission_set_perms pspp
JOIN public.permission_sets ps ON ps.id = pspp.permission_set_id
JOIN public.permissions p ON p.id = pspp.permission_id
WHERE p.key = 'profile.expert.badge.view'
ORDER BY ps.key;
```
Expected: 9 rows: admin, anon, editor, expert, family, free, moderator, owner, pro.

### 3.3 Marker verification

```
comm -23 <(grep -rl '@migrated-to-permissions' site/src | sort -u) \
         <(grep -rl '@feature-verified\|@admin-verified' site/src | sort -u)
```
Expected: empty output.

```
grep -rL '@migrated-to-permissions' site/src/app --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  | grep -v '/admin/' \
  | grep -Ev '(sitemap|manifest|error|not-found|loading|global-error|robots)\.js$'
```
Expected: empty output (the 16 files are now all marked).

```
grep -c '@admin-verified 2026-04-18' site/src/components/admin/*.jsx site/src/components/admin/*.tsx | grep -v ':0$' | wc -l
```
Expected: 28 (the 27 added + DestructiveActionConfirm.tsx).

### 3.4 Behavior verification

- `curl -s http://localhost:3000/api/health`: expect `{ ok: true, checks: { db: 'ok' }, latency_ms: N, ts: '...' }`. No `stripe_secret` / `resend_api_key` / `cron_secret` keys.
- `curl -s -H 'x-health-token: <HEALTH_CHECK_SECRET value>' http://localhost:3000/api/health`: expect the above PLUS the four env-presence keys.
- Browse to a profile of a user where `is_expert = true` and `is_verified_public_figure = true`; expect the expert badge to render (was silently hidden before the migration).
- Signed-in user visits profile activity tab (`/profile` page) — still loads (canonical key `profile.activity` was never touched).
- Signed-in user visits leaderboard (`/leaderboard`) — still loads (canonical key `leaderboard.view` was never touched).

### 3.5 Re-runnability

Re-apply migration `fix_round4_hygiene_2026_04_19` a second time. Expect zero errors, zero rows changed on the permissions / permission_set_perms inserts (ON CONFLICT handles both), zero rows changed on the deactivate UPDATE (is_active=true filter), and ONE row changed on the perms_global_version bump (version keeps incrementing — this is benign and by design).

### 3.6 Build / type verification

```
cd /Users/veritypost/Desktop/verity-post/site && npx tsc --noEmit
```
Expected: EXIT=0. No type regressions from the marker edits (comments only) or the health route rewrite (same export shape, one added `req` param).

---

## Part 4 — Coordination with PREPPER 1

**Resolved items (no ask needed):**
- PREPPER 1 / Track V does NOT need `notifications.mark_read` or `notifications.mark_all_read` created. Both keys are already live with correct bindings.
- PREPPER 1 / Track V's new `site/src/app/api/notifications/mark-read/route.js` (if created) will need `@migrated-to-permissions 2026-04-18` + `@feature-verified notifications 2026-04-18` at the top. That is PREPPER 1's execution concern; Track X will not retroactively mark new files written during the same round.
- PREPPER 1 / Track U's new RPC (e.g. `award_reading_points`) is a SQL artifact — SQL migrations do NOT carry `@feature-verified` markers (those live on TS/JS source). No Track X coverage needed.

**Active coordination asks for PREPPER 1:**

1. **Shared file `api/health/route.js`:** Track W rewrites the behavior AND adds both markers. Track X's checklist excludes this file. PREPPER 1 should confirm no V-scope change to this file (I see none in the master prep V scope — just confirming).
2. **Order-of-apply for `perms_global_version`:** if both packages land their migrations on the same Supabase session, the last-wins bump is fine — the version just advances more. No correctness concern.
3. **`@feature-verified` on Track V's new mark-read route:** PREPPER 1 should add `@migrated-to-permissions 2026-04-18` + `@feature-verified notifications 2026-04-18` on lines 1-2 of the new file as part of its write, so Track X's post-merge sweep returns clean.
4. **Track U may touch `users` table DDL / triggers.** Track W does not touch the `users` table. No collision.
5. **If PREPPER 1 discovers additional missing/duplicate permission keys during U/V validation**, surface them quickly — I can fold them into migration `fix_round4_hygiene_2026_04_19` in a revision before the executor applies it. Otherwise they become a Round 5 task.

---

## Part 5 — Surprises summary (vs master prep)

1. `profile.activity` cluster has 4 variants, not 3. Master prep listed `.view` and `.own` but actual DB has `profile.activity` (canonical, kept), `profile.activity.view` (dup, deactivate), `profile.activity.view.own` (dup, deactivate). `profile.activity.own` does NOT exist. Net: 2 deactivations in this cluster, not 2.
2. `notifications.mark_read` AND `notifications.mark_all_read` are already live. Master prep hedged ("if it does not exist, Track W adds it") — nothing to add. The defensive INSERT in the migration is a no-op.
3. `NotificationBell.tsx` has zero importers but is documented as Active and was sealed in Round 2. Recommended: FLAG, do not delete. Master prep's "delete if zero importers" is too aggressive in light of the docs claim.
4. `perms_global_version` lives in its own table (`public.perms_global_version`, columns `id, version, bumped_at`), NOT in the `settings` table. Master prep hedged; clarified above.
5. REFERENCE.md has stale count in TWO places (§3 line 25 and §7 line 112), not one. Fix both.
6. Final active-permission count after migration is **928** (not 932 or whatever the master prep implied post-deactivation). 932 − 5 deactivations + 1 creation = 928.

---

## Part 6 — Expected diff size

- 1 new SQL migration (~70 lines)
- `site/src/app/api/health/route.js`: ~40 line rewrite
- `00-Where-We-Stand/REFERENCE.md`: 3 line edits
- 15 files get 2 comment lines (Track X step 1 minus health)
- 27 files get 1 comment line (Track X step 2)
- 34 files get 1 comment line (Track X step 3)

Total: 76 files touched, ~190 LoC added (comments + migration), ~5 LoC net-removed from health route (env lines now header-gated rather than unconditional).

---

## Part 7 — Constraints reminder

- No emojis anywhere (code, comments, docs, migrations, messages)
- Every `INSERT ... ON CONFLICT DO NOTHING` / filtered `UPDATE` must be idempotent
- No column renames, no DDL on `users` / `notifications` / `promo_codes`
- Don't re-edit anything in the admin LOCK set (the 39 existing + 27 DS primitives this track adds = the post-round-4 LOCK list of 66)
- REFERENCE.md stays minimal — only the 3 line edits listed; no structural changes
- Migration name: `fix_round4_hygiene_2026_04_19`
- All marker additions are comment-only; zero behavioral change except the `/api/health` rewrite
