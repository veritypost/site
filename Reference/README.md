# Verity Post

Permission-driven news discussion platform. Web + iOS, shared Supabase backend.

## Start here

- **[STATUS.md](STATUS.md)** — where we stand (what's shipped, what's locked, what's running where)
- **[WORKING.md](WORKING.md)** — what we're actively resolving (launch blockers, open bugs, decisions)

## Top-level layout

| Folder | What |
|---|---|
| [`web/`](web/) | Next.js 14 adult web app (desktop + mobile). Also serves `/admin`. |
| [`VerityPost/`](VerityPost/) | SwiftUI iOS app (currently unified: adult + kid mode). |
| [`VerityPostKids/`](VerityPostKids/) | SwiftUI Kids iOS app — pair-code auth via custom JWT, kid-safe reader, expert sessions. |
| [`schema/`](schema/) | Supabase schema + migrations (005–094) + `reset_and_rebuild_v2.sql`. |
| [`supabase/`](supabase/) | Supabase CLI config. |
| [`scripts/`](scripts/) | Dev scripts: seed accounts, import permissions, preflight, smoke tests. |
| [`test-data/`](test-data/) | Seed JSON + SQL fixtures. |
| [`docs/`](docs/) | Documentation: reference, runbooks, product, planning, history. |
| [`Archived/`](Archived/) | Closed passes, obsolete snapshots, scratch UI. Historical only. |

## Docs map

- `docs/reference/` — design decisions (D1–D44), permissions matrix, schema guide
- `docs/runbooks/` — cutover, rotate-secrets, test walkthrough
- `docs/product/` — feature ledger, app-store metadata, permission migration tracker, parity
- `docs/planning/` — kids app plan, holding-page blueprint, iOS UI agent briefing, product roadmap
- `docs/history/` — closed build logs

## Conventions

- **Two canonical status docs** at root: `STATUS.md` + `WORKING.md`. Facts live in exactly one of them. Don't duplicate.
- **Migrations** are numbered sequentially in `schema/` and already applied to prod under those names. Do not renumber.
- **Admin files** under `web/src/app/admin/` and `web/src/components/admin/` carry `@admin-verified 2026-04-18` — **LOCKED**, don't modify without explicit approval.
- **Permission migration markers** — `@migrated-to-permissions <date>` on files that have been swapped from role/plan gates to `hasPermission`.

## Dev

```bash
# Web
cd web && npm run dev                    # localhost:3000
cd web && npx tsc --noEmit               # type check
cd web && npm run types:gen              # regen Supabase TS types

# iOS
# open VerityPost/ in Xcode
# (kids iOS doesn't exist yet — see VerityPostKids/README.md)
```

## Cutover

See `docs/runbooks/CUTOVER.md` for the deploy checklist. `scripts/preflight.js` must exit 0 before prod deploy.
