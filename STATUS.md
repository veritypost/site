# STATUS

**Last refreshed:** 2026-04-19

Single source of truth for **where we stand**. What the product is, what's deployed, what's shipped, what's locked. Read top-to-bottom in under 3 minutes.

Active work / open items → see **`TASKS.md`** at repo root (101 tasks, IDs T-001…T-101, prioritized, file:line specific).

---

## One-line summary

Verity Post is a permission-driven news platform (web + iOS) whose admin console can toggle capabilities on any user and have the change reflect across every product surface on next navigation.

## Platforms

| Platform | Code | State |
|---|---|---|
| **Web (adult, desktop + mobile)** | `web/` | Launch-ready. Capstone verdict: CONDITIONAL YES. |
| **iOS (unified: adult + kid mode)** | `VerityPost/` | Code-complete for core flows. DUNS-blocked on App Store. |
| **Admin console** | `web/src/app/admin/*` + `web/src/app/api/admin/*` | 39 UI pages + 27 DS components **LOCKED** 2026-04-18 (marker: `@admin-verified`). Do not modify without explicit approval. |
| **Database** | Supabase project `fyiwulqphgmoqullmrfn` | 114 tables, 928 active permissions, 10 permission sets. |
| **Hosting** | Vercel | Ignored Build Step enabled — no auto-deploy; manual redeploy only. |

## Permission system (the core model)

- **928 active permissions** in `permissions` table, keys like `surface.action[.scope]`
- **10 sets:** `anon`, `unverified`, `free`, `pro`, `family`, `expert`, `moderator`, `editor`, `admin`, `owner`
- **Grants flow:** Role → set, Plan → set, Direct user grant, Per-permission scope override
- **Resolver:** `compute_effective_perms(user_id)` — returns every key with `granted boolean` + `granted_via text` + source detail
- **Clients:** `hasPermission('key')` (web, iOS). **Server:** `requirePermission('key')` (API routes).
- **Invalidation:** admin write bumps `users.perms_version` → client refetches capabilities on next navigation
- **Source of truth for the matrix:** `/Users/veritypost/Desktop/verity post/permissions.xlsx` (outside repo; planned to move in)

## Ship-readiness

**Verdict:** CONDITIONAL YES (capstone report, 2026-04-19).

All 6 Criticals + 22 Highs from the 9-round pre-launch hardening sprint (Rounds A–I) are verified resolved against live Supabase + dev server. Remaining blockers are owner-side (no code changes required):

1. HIBP toggle in Supabase Auth dashboard
2. Rotate live secrets per `ROTATE_SECRETS.md` (Supabase service-role, Stripe live secret, Stripe webhook secret)
3. `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel env (build fails in prod without)
4. Publish 10+ real articles replacing 5× `Test:` headlines
5. CSP Report-Only → Enforce flip in `web/src/middleware.js` (after 48h Report-Only soak)
6. Commit migrations 092/093 to `schema/` from `archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql` (live DB has them; disk doesn't)

Full blocker list with detail → **`TASKS.md`** (P0 section).

## What's done per area

### Sprint 2026-04-19 — 9-round hardening (CLOSED)
Three reviewer passes (deploy / flow / security) each filed NO. 87 raw issues deduped → 59 (6 Critical, 22 High, 20 Medium, 11 Low) → organized into Rounds A–I in the attack plan → all 6 Criticals + 22 Highs verified resolved in capstone.
- **A** — RLS lockdown (migration 092 on disk gap — see WORKING.md)
- **B** — RPC actor-spoof sweep (migration 093 on disk gap)
- **C** — Money-path UX (`/billing` shim, DM regwall, quiz dead-ends)
- **D** — Public surface (`/status` removed, `/contact`, Stripe URL hardening, sitemap)
- **E** — Auth/signup integrity (migration `094`)
- **F** — CSP nonce, CORS, cron header, Sentry
- **G** — Storage bucket + HIBP (owner-side)
- **H** — `search_path` hygiene on 13 functions
- **I** — UX/copy polish

Full detail → `archive/2026-04-19-prelaunch-sprint/`.

### Wave 2 permission migration
**332 of 356 source files** (93.3%) carry either `@migrated-to-permissions` or `@admin-verified` marker. Unmarked 24 are framework files (`robots.js`, `sitemap.js`, `loading.js`, etc.). Effectively complete.

### Admin lockdown (CLOSED 2026-04-18)
39 admin pages + 27 DS components converted to TypeScript, typed against generated Supabase types, rebuilt on unified design system, mobile-responsive, 23 schema bugs fixed, 18 write-path sync fixes applied. Every file carries `@admin-verified 2026-04-18`. Full detail → `archive/2026-04-18-admin-lockdown/`.

### Phase 5 cleanup (CLOSED 2026-04-18)
- `requireRole` helper removed from `web/src/lib/auth.js` — 54 call-sites migrated to `requirePermission`
- `role_permissions` table DROPped (migration 079)
- Hierarchy map (`getMaxRoleLevel`) retained in 5 consumer files with documented rationale

### Permission system phases 1+2 (CLOSED 2026-04-18)
- 916-permission + 10-set matrix imported to live DB
- User-centric admin console at `/admin/users/[id]/permissions`
- `compute_effective_perms` resolver RPC

### Security rounds 2–7 (CLOSED 2026-04-18)
Six rounds of incremental hardening preceding the capstone sprint — admin RPC lockdown, PSO RLS tightening, iOS column-drift fixes, paid-tier bypass closure, bearer-token binding, atomic conversation/support RPCs. Full detail → `archive/2026-04-18-security-rounds-2-7/`.

## Ops state

| Concern | State |
|---|---|
| Vercel auto-deploy | OFF (Ignored Build Step = skip all) |
| Dev server | `cd web/ && npm run dev` → `localhost:3000` |
| Type check | `cd web/ && npx tsc --noEmit` → exits 0 |
| Supabase CLI | linked to `fyiwulqphgmoqullmrfn` |
| Stripe | live prices set, `plans.stripe_price_id` populated |
| Sentry | code wired (throws loud in prod if module fails); DSN still pending in Vercel env |
| CSP | Report-Only mode, enforce flip pending |
| Rate limits | active, production-only |
| Cron | 3 Vercel crons (`/api/cron/freeze-grace`, `/api/cron/sweep-kid-trials`, `/api/cron/send-emails`) |

## Test accounts

- 17 role test accounts (one per role/tier) + 30 community users + 2 kid profiles
- Real user count: 1 (admin@veritypost.com, owner role)
- Articles published: 6 (5 still `Test:` placeholders — replace before launch)
- Seed scripts: `scripts/seed-test-accounts.js`, `scripts/import-permissions.js`, `scripts/preflight.js`

## Key files to know

| File | Purpose |
|---|---|
| `web/src/lib/permissions.js` | Client `hasPermission` + cache + version polling |
| `web/src/lib/auth.js` | Server helpers: `requireAuth`, `requirePermission` |
| `web/src/types/database.ts` | Generated Supabase types. Regen: `cd site && npm run types:gen` |
| `schema/reset_and_rebuild_v2.sql` | Canonical schema (disaster-recovery replay primary) |
| `schema/064_compute_effective_perms.sql` | Permission resolver RPC |
| `docs/reference/Verity_Post_Design_Decisions.md` | D1–D44 canonical product rules |
| `VerityPost/VerityPost/PermissionService.swift` | iOS equivalent of `permissions.js` |
| `web/middleware.js` | Auth gates, CORS allow-list, CSP (Report-Only currently) |

## Where things live

| What you need | Where |
|---|---|
| Live status (this doc) | `STATUS.md` (repo root) |
| Active work / open items | `WORKING.md` (repo root) |
| Schema + migrations | `schema/` (005–094) |
| Web app code | `web/` |
| iOS app code | `VerityPost/` |
| Dev scripts | `scripts/` |
| Test data + seeds | `test-data/` |
| Runbooks (cutover, rotate secrets, test walkthrough) | `docs/runbooks/` |
| Design decisions (D1–D44) | `docs/reference/` |
| Feature ledger + app-store metadata | `docs/product/` |
| Closed sprint history | `archive/<pass>/_README.md` |
| Product parity docs | `docs/product/parity/` |
| Build history logs | `docs/history/` |

## Related (at root)

- `WORKING.md` — active to-do / blockers / decisions
- `README.md` — repo intro (not yet written; placeholder)
- `00-Folder Structure.md` — legacy folder map (may be stale)
- `archive/restructure-2026-04-19/` — audit + structure-synthesis docs from today's reorg

---

## How to keep this file current

- **Refresh** on any phase close, sprint close, or major capability shipped. Bump the "Last refreshed" date.
- **Never add TODOs here** — those belong in `WORKING.md`. This doc describes what IS, not what's next.
- **Never add narrative history** — that belongs in `archive/<date-scope>/`. Link from here.
- **Never duplicate** — if you find yourself restating a fact from another doc, delete the restating and link instead.
