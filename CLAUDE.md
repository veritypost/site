# Verity Post — CLAUDE.md

## Kill-Switch Inventory

Features intentionally disabled at launch time. Do not flag missing functionality on these surfaces as bugs. Only flag broken chrome *on the disabled surface itself*, prefixed `[KILL-SWITCHED]`.

| # | Surface | Gate type | Location | How to re-enable |
|---|---------|-----------|----------|-----------------|
| 1 | `/u/[username]` — public profile | Code flag | `web/src/app/u/[username]/page.tsx:22` | Flip `PUBLIC_PROFILE_ENABLED` to `true` |
| 2 | `/profile/[id]` — profile by numeric ID | Code flag | `web/src/app/profile/[id]/page.tsx` | Same `PUBLIC_PROFILE_ENABLED` flag |
| 3 | Public profile share link in `/profile` | Code comment | `web/src/app/profile/_sections/PublicProfileSection.tsx:192` | Re-enable when `PUBLIC_PROFILE_ENABLED` flips |
| 4 | OAuth login (Google/Apple buttons on web) | Code flag | `web/src/app/login/_SingleDoorForm.tsx:9` | Flip `OAUTH_ENABLED` to `true` |
| 5 | iOS alerts — "Manage subscriptions" section | Code flag | `VerityPost/VerityPost/AlertsView.swift:305` | Flip `manageSubscriptionsEnabled` to `true` |
| 6 | `/ideas/*` — ideas preview routes | Middleware admin-gate | `web/src/middleware.js:165` | Admin-only; not a public surface |
| 7 | Sitewide holding mode | Env var | `web/src/app/preview/route.ts` | Set `NEXT_PUBLIC_SITE_MODE` (currently not `coming_soon`) |
| 8 | RSS ingest pipeline | DB setting | `ai.ingest_enabled` in `settings` table | Toggle in admin → Pipeline Settings |
| 9 | Adult article generation pipeline | DB setting | `ai.adult_generation_enabled` in `settings` table | Toggle in admin → Pipeline Settings |
| 10 | Kids article generation pipeline | DB setting | `ai.kid_generation_enabled` in `settings` table | Toggle in admin → Pipeline Settings |

> **Note for bug reviewers:** The `/ideas/*` routes are an admin-only preview surface and render inline sample data — not a user-facing flow. Middleware hard-gates it. Do not treat anything inside `/ideas/` as representing real user behaviour.
