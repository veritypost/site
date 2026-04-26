# W2-09: Hardcoded Values + JS/TS Drift

## JS/TS drift inventory (verified)

Total `.js` files in web/src: **218**
- `web/src/app/api/**/route.js` files: **155** (API layer is mostly JS — appropriate; routes are simple handlers)
- `web/src/app/**` non-API: **63** (33 layouts/loading/error/route shims + 30 actual page or lib files)
- `web/src/lib/**`: **counted in app/lib mix below**

Total `.jsx` files: **27**
- `web/src/components/admin/`: **26** (the entire admin component tree is JSX)
- `web/src/components/`: **1** (`Ad.jsx`)

### Migration priority groups

**Easy (< 100 LOC, obvious props):**
- `web/src/app/error.js`, `global-error.js`, `not-found.js`, `manifest.js`, `robots.js`, `sitemap.js`
- `web/src/app/{section}/layout.js` × ~10 (mostly auth-guard wrappers)
- `web/src/app/{section}/loading.js`, `error.js`

**Medium (a page with data + props):**
- `web/src/app/profile/contact/page.js` (277 LOC, duplicates TS `/contact/page.tsx`)
- `web/src/app/profile/activity/page.js`, `milestones/page.js`, `card/page.js`, `category/[id]/page.js`
- `web/src/app/logout/page.js` (247 LOC)
- `web/src/app/card/[username]/page.js` (326)
- `web/src/app/category/[id]/page.js` (524)

**Hard (heavily dynamic or shared):**
- The 26 `components/admin/*.jsx` files — many are typed via `web/types/admin-components.d.ts` JSDoc; converting to native TSX requires moving prop types into the file
- `web/src/components/Ad.jsx` (148 LOC; security-sensitive — javascript: protocol scheme issue per MASTER_TRIAGE #7)

**API routes** (`api/**/route.js`):
- 155 files. Per CLAUDE.md "Web is TypeScript", new files should be TS. Existing route.js files compile and run fine; migration is incremental "when you touch the file."
- Recommendation: don't bulk-migrate; migrate when modifying. Establish "no new .js" rule.

## Hardcoded constants ↔ DB

### settings table (verified — only 2 rows)
- `comment_max_depth = 2`
- `comment_max_length = 4000`

The settings table has 24 rows total per list_tables earlier — query returned 2 because I filtered for `comment%` and `quiz%`. Wave 3 should `SELECT * FROM settings;`.

### Hardcoded → DB mapping

| File:line | Constant | DB has it? | Fix |
|---|---|---|---|
| `lib/plans.js` | TIERS marketing copy | `plans.display_name` exists | Replace with `getActivePlans()` cached helper |
| `lib/plans.js` | PRICING cents | `plans.price_cents` | Same helper |
| `lib/plans.js` | TIER_ORDER | `plans.sort_order` | Same helper |
| `lib/pipeline/cost-tracker.ts` | cost-cap (per W2-02) | NO setting | Add `pipeline_cost_cap_usd` to settings |
| `app/admin/system/page.tsx` | RATE_LIMIT_DEFAULTS | `rate_limits` table (40 rows) | UI should read from rate_limits |
| `app/admin/system/page.tsx` | WEBHOOK_SOURCES | possibly in settings | Wave 3 verify |
| `app/admin/email/page.tsx` | EMAIL_SEQUENCES | `email_templates` (1 row) | Add sequences table OR JSON column |
| `app/admin/system/page.tsx` | RESOURCE_USAGE (demo banner) | NO | acceptable — banner says demo |
| `app/admin/streaks/...` | STREAK config | possibly in settings | Wave 3 verify |
| `app/admin/system/page.tsx` | DEFAULT_ONBOARDING_STEPS | NO | Add onboarding_steps table |
| `components/CommentRow.tsx:31` | COMMENT_MAX_DEPTH=2 | YES (`settings.comment_max_depth=2`) | Replace with `getSettings()` read |
| `app/profile/settings/page.tsx` | TEXT_SIZES, AVATAR_COLORS | NO | acceptable — design-token list |
| `app/page.tsx` | (no FALLBACK_CATEGORIES — Z13 was wrong) | n/a | n/a |
| 3 files | FALLBACK_BOOKMARK_CAP=10 | `plans.metadata` may have caps | Wave 3 verify |
| 2 files | TOPICS (contact form) | NO | could move to settings or stay (small list) |
| `app/signup/expert/page.tsx` | EXPERTISE_FIELDS | NO | could move to settings |
| `app/profile/settings/page.tsx` | ALERT_ROWS, ALERT_CHANNELS | possibly in `alert_preferences` | Wave 3 verify |

### import-permissions.js hardcoded mappings (W2-01 carryover)

Lines 156-184 hardcode role→set + plan→set mappings. Live DB has 45 rows in `role_permission_sets` + 21 in `plan_permission_sets`. **Drift hazard:** any new role/plan combination requires editing the script.

**Fix:** rewrite script to derive mappings FROM the xlsx rows (which already encode them via row labels). The script should be xlsx-driven only.

## Three competing client-side gating patterns (per Z14 + W2-01)

**Canonical**: `hasPermission('key')` against the resolver — used in 6 admin pages.

**Pages on canonical:** categories, permissions, prompt-presets, users (4); partial in cleanup.

**Pages on role-set:** ~30 (tolerable drift; lower priority)

**Pages on hardcoded `'owner'||'admin'` literals:** access, analytics, feeds, notifications, subscriptions, system (6 — P0 fix)

## Confirmed duplicates
- `lib/plans.js` TIERS/PRICING vs `plans` table
- `CommentRow.tsx` COMMENT_MAX_DEPTH vs `settings.comment_max_depth`
- `import-permissions.js` role→set vs `role_permission_sets` table
- `profile/contact/page.js` vs `contact/page.tsx` (likely auth-only vs anon variants — Wave 3 verify)

## Confirmed stale
- Z13's "FALLBACK_CATEGORIES still hardcoded" — gone (W2-07 already noted)

## Confirmed conflicts
- (no contradictions in this thread; everything here is gradient drift, not boolean conflict)

## Unresolved (Wave 3)
- Full `settings` table contents
- Whether STREAK / WEBHOOK_SOURCES / EMAIL_SEQUENCES already have DB tables
- profile/contact/page.js vs contact/page.tsx duplication semantics

## Recommended actions

**P0:**
1. Migrate 6 admin pages from `'owner'||'admin'` literal → `hasPermission('key')`
2. Move cost-cap to `settings` (W2-02 carryover)

**P1:**
3. Replace `lib/plans.js` hardcoded TIERS/PRICING with DB-backed helper
4. Replace `CommentRow.tsx` `COMMENT_MAX_DEPTH=2` with `settings` read
5. Rewrite `scripts/import-permissions.js` to be xlsx-only (no hardcoded role→set fallbacks)

**P2:**
6. Move `RATE_LIMIT_DEFAULTS`, `EMAIL_SEQUENCES`, `WEBHOOK_SOURCES` admin UIs to read from DB tables
7. Migrate ~30 role-set admin pages to `hasPermission` (incremental)
8. Establish "no new .js" rule via ESLint `unicorn/prefer-typescript-extension` or similar

**P3:**
9. Bulk-migrate `components/admin/*.jsx` (26 files) when next admin work happens
10. Clean up the 33 layout/loading/error JS shims (mostly trivial)
