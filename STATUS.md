# STATUS

What the product IS. Not what's left.

- Active work → **`TODO.md`** at repo root.
- How to work in this codebase → **`CLAUDE.md`** at repo root.

## One-line summary

Verity Post is a permission-driven news platform (web + iOS) whose admin console can toggle capabilities on any user and have the change reflect across every product surface on next navigation.

## Platforms

| Platform | Code | Stack |
|---|---|---|
| Web (adult, desktop + mobile) | `web/` | Next.js 14 app router, TypeScript |
| iOS adult | `VerityPost/` | SwiftUI, iOS 17+ |
| iOS kids | `VerityPostKids/` | SwiftUI, iOS 17+ (COPPA, custom JWT) |
| Admin console | `web/src/app/admin/*` + `web/src/app/api/admin/*` | 39 pages + 27 DS components, `@admin-verified` LOCKED |
| Database | Supabase project `fyiwulqphgmoqullmrfn` | 114 tables |
| Hosting | Vercel | Ignored Build Step ON — manual redeploy only |

## Permission system (product DNA)

- **928 active permissions** in `permissions`, keys `surface.action[.scope]`
- **10 permission sets:** anon, unverified, free, pro, family, expert, moderator, editor, admin, owner
- **Grants:** role → set, plan → set, direct user grant, per-permission scope override
- **Resolver:** `compute_effective_perms(user_id)` returns every key with `granted` + `granted_via` + source detail
- **Server gate:** `requirePermission('key')`. **Client gate:** `hasPermission('key')`.
- **Invalidation:** admin write bumps `users.perms_version` → clients refetch on next navigation.
- **Matrix source of truth:** `~/Desktop/verity post/permissions.xlsx` (outside repo). Sync: `scripts/import-permissions.js --apply`. xlsx and DB must stay 1:1.

## Architecture

Three apps, one DB, shared Supabase.

- **Web is adult-only.** `/kids/*` on web redirects authed users to `/profile/kids` (parent management) and anon users to `/kids-app` (marketing landing). No kid-facing web UI.
- **Adult iOS + web** use GoTrue sessions.
- **Kids iOS** uses a server-minted custom JWT with `is_kid_delegated: true` + `kid_profile_id` claims; RLS branches on those claims. Kid JWT never touches GoTrue.

## Key machinery (stay fluent)

| File | Purpose |
|---|---|
| `web/src/middleware.js` | auth gate + CORS + CSP (enforce) + `/kids/*` redirect |
| `web/src/lib/auth.js` | `requireAuth`, `requirePermission`, `requireVerifiedEmail`, `requireNotBanned` |
| `web/src/lib/permissions.js` | client `hasPermission` + dual cache + version polling |
| `web/src/lib/roles.js` | canonical role Sets + DB-live `getRoles`/`rolesAtLeast` |
| `web/src/lib/rateLimit.js` | `checkRateLimit(svc, {key, policyKey, max, windowSec})` — fail-closed in prod, fail-open in dev |
| `web/src/lib/supabase/server.ts` | `createClient` (RLS), `createServiceClient` (bypass), `createClientFromToken` (bearer), `createEphemeralClient` |
| `web/src/lib/adminMutation.ts` | canonical admin-mutation shape: `requireAdminOutranks` + `recordAdminAction` |
| `web/src/lib/apiErrors.js` | `safeErrorResponse` — maps Postgres errors to stable client copy |
| `web/src/lib/siteUrl.js` | prod-throw fallback for `NEXT_PUBLIC_SITE_URL` |
| `web/src/lib/stripe.js` | fetch-only Stripe wrapper + HMAC webhook verify |
| `web/src/lib/appleReceipt.js` | Apple StoreKit 2 JWS chain verify (ES256, vendored root CA) |
| `web/src/lib/kidPin.js` | PBKDF2 100k / salted kid PIN hashing + legacy SHA-256 rehash |
| `web/src/lib/cronAuth.js` | `verifyCronAuth` — `x-vercel-cron` header OR constant-time bearer |
| `schema/reset_and_rebuild_v2.sql` | canonical DR replay (see `TODO.md` — drift known) |

## Canonical route shape

Every mutation route:
```
requirePermission → createServiceClient → checkRateLimit → body parse/validate → RPC or direct write → safeErrorResponse on catch → response
```
Admin mutations additionally: `require_outranks(target_user_id)` + `recordAdminAction(...)`.
Rate-limited 429 responses include `Retry-After: <windowSec>`.

## Brand rules

- **No emojis on adult surfaces.** Adult web, adult iOS, admin pages, emails, commit messages, dev docs — all plain text. Kids iOS is the only surface where emojis are intentional.
- **Paid tier names are canonical:** `verity`, `verity_pro`, `verity_family`, `verity_family_xl`. Display labels map from DB.
- **Dates are ISO in code, human-readable in UI.**

## Test accounts

After superadmin removal (TODO #1): **19 test + 30 community + 2 kids** (Emma, Liam under `test_family`). Seeds in `test-data/accounts.json`. Script: `scripts/seed-test-accounts.js` (path-broken — TODO #2).
