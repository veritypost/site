# Future Repo Structure Plan

**Goal:** one clean status sheet, one clean working doc, products split by audience (kids / adult / shared), everything historical in archive. No duplication of facts.

**Not executing this now — this is the blueprint.**

---

## Target top-level layout

```
verity-post/
│
├── STATUS.md                    ← SINGLE "where we stand" sheet. Replaces REFERENCE.md + OWNER_TO_DO.md "done" sections.
├── WORKING.md                   ← SINGLE "what we're actively working on" doc. Replaces scattered round plans + LIVE_TEST_BUGS.
├── README.md                    ← Repo intro, pointers to STATUS.md + WORKING.md.
│
├── products/
│   ├── adult-site/              ← Next.js web (desktop + mobile). kids-site redirect lives inside.
│   ├── adult-app/                ← SwiftUI iOS adult app
│   └── kids-app/                 ← SwiftUI iOS kids app (split from VerityPost/)
│
├── shared/
│   ├── admin/                    ← shared control plane (affects kids-app + adult-app + adult-site)
│   ├── backend/                  ← Supabase schema, migrations, RPCs, edge functions
│   │   ├── schema/               ← reset_and_rebuild_v2.sql + migrations NNN_*.sql
│   │   ├── edge-functions/
│   │   └── seeds/
│   ├── types/                    ← generated TS types (source of truth for web)
│   ├── design-system/            ← cross-product UI primitives (if extracted)
│   └── contracts/                ← permission matrix, API contracts, feature ledger
│
├── platform/                     ← infrastructure + deploy + ops (not product code)
│   ├── vercel/                   ← vercel.json, env var docs, deploy config
│   ├── supabase/                 ← supabase CLI config, local dev
│   ├── stripe/                   ← setup docs, webhook registration notes
│   ├── apple/                    ← App Store Connect, APNs, universal links notes
│   ├── runbooks/
│   │   ├── cutover.md            ← from 04-Ops/CUTOVER.md
│   │   ├── test-walkthrough.md   ← from 04-Ops/TEST_WALKTHROUGH.md
│   │   └── rotate-secrets.md     ← from 05-Working/ROTATE_SECRETS.md
│
├── reference/                    ← stable, canonical, rarely-changing docs
│   ├── design-decisions.md       ← D1–D44 rules
│   ├── permission-matrix.xlsx    ← currently on desktop — move in
│   ├── feature-ledger.md         ← from 00-Where-We-Stand/FEATURE_LEDGER.md
│   └── folder-structure.md       ← from 00-Folder Structure.md
│
├── archive/                      ← everything historical or closed, structured by date/topic
│   ├── 2026-04-19-prelaunch-sprint/
│   ├── 2026-04-18-admin-lockdown/
│   ├── 2026-04-18-security-rounds-2-7/
│   ├── 2026-04-18-ui-ios-audits/
│   ├── 2026-04-18-phases-1-2/
│   ├── 2026-04-16-project-status/       ← 04-Ops/PROJECT_STATUS.md
│   ├── build-history/                    ← 03-Build-History/ contents
│   ├── one-off-plans/
│   └── obsolete-snapshots/
│
└── (root config — .gitignore, package.json if monorepo, .claude/, etc.)
```

---

## The two canonical docs at root

### `STATUS.md` — where we stand

- Living snapshot of **what exists today**. Updated when phases close, not daily.
- Sections: platforms (adult-site / adult-app / kids-app / admin / DB), permission system, deploy state, open product decisions.
- No TODO checkboxes. No "what's next." That's WORKING.md.
- Target length: one screen. Link out for detail.

### `WORKING.md` — what we're working on

- Living to-do. Updated every session.
- Sections: **NOW** (this session / this week), **NEXT** (queued), **BLOCKED** (waiting on decisions), **QUESTIONS** (owner calls pending).
- Bugs that are genuinely open go here with severity. Closed bugs move out to `archive/` in batches.
- When an item ships, it moves to STATUS.md (the fact of its existence) and out of WORKING.md.

**Rule:** a piece of information lives in exactly one place. If you ever type the same fact into both docs, the second copy becomes a link.

---

## How each of your requirements maps

| You said | Maps to |
|---|---|
| "current files for the current living docs for the site" | `products/adult-site/` |
| "kids app" | `products/kids-app/` |
| "adult app" | `products/adult-app/` |
| "kids site gets redirected to the app" | Inside `products/adult-site/` — kids URLs redirect to kids app store page |
| "shared shit" | `shared/` |
| "shared admin stuff" | `shared/admin/` |
| "other shit needed for the platforms" | `platform/` |
| "maybe another top level folder for something" | Reserved — `reference/` likely absorbs most loose ends |
| "top level archive folder structured cleanly" | `archive/` with date-stamped + topic folders |
| "top level folder w/ single working doc" | Actually a single **file** at root: `WORKING.md`. No folder needed. |

---

## Migration strategy (phased, when ready)

### Phase 1 — docs consolidation (1 session, low-risk)
- Merge `00-Where-We-Stand/REFERENCE.md` + `05-Working/OWNER_TO_DO.md` + `xx-updatedstatus/2026-04-19-audit.md` into `STATUS.md` (root)
- Extract active TODOs/bugs into `WORKING.md` (root)
- Rename `05-Working/` sections accordingly

### Phase 2 — top-level reorg (1 session, medium-risk)
- Create `platform/`, `reference/`, `archive/` (at root)
- Move `04-Ops/` → `platform/runbooks/` + `platform/` subfolders
- Move `03-Build-History/` → `archive/build-history/`
- Move `00-Reference/` → `reference/`
- Move `00-Where-We-Stand/` contents → `reference/` (feature-ledger) and `STATUS.md` (reference)
- Move current `99-Archive/` + `xx-updatedstatus/` → `archive/`

### Phase 3 — shared backend extraction (1–2 sessions, medium-risk)
- Move `01-Schema/` → `shared/backend/schema/`
- Move `supabase/` → `shared/backend/` (CLI config)
- Move `site/src/types/database.ts` source → `shared/types/`
- Update all import paths (can be done with find/replace + `tsc --noEmit` verification)

### Phase 4 — product split (2–4 sessions, higher-risk)
- `site/` → `products/adult-site/`
- Extract admin from `site/src/app/admin/` + `site/src/app/api/admin/` → `shared/admin/` (as a Next.js app or a Next.js route group that both `adult-site` and a future standalone admin host can mount)
- `VerityPost/` → split into `products/adult-app/` + `products/kids-app/`
   - Two separate Xcode projects, two bundle IDs, two App Store Connect entries
   - `shared/ios/` for Swift packages if you extract cross-app code (SupabaseClient, PermissionService, Keychain, etc.)

### Phase 5 — shared design system (optional, later)
- If extracting cross-product UI makes sense, carve out `shared/design-system/`
- Could be npm workspace for web, SwiftPM for iOS

---

## Gotchas to surface before executing

### 1. iOS split is a real project, not a rename
- Two Xcode projects = two bundle IDs (`com.veritypost.app`, `com.veritypost.kids`) = two App Store Connect entries = two TestFlight pipelines
- Apple's **Kids Category** has strict rules (no third-party analytics/ads/tracking, parental gate on every external link, stricter review). Already documented in `05-Working/FUTURE_DEDICATED_KIDS_APP.md` — read that before splitting.
- StoreKit product IDs for kids-app need separate registration
- Shared auth: both apps hit the same Supabase project, same `users` table, same `kid_profiles` table. Kids-app is just a different client.

### 2. Where does admin actually live?
- Option A (simpler): admin stays in `adult-site/` as Next.js routes, accessible only to staff roles. Changes affect all apps via shared DB. This is today's model.
- Option B (cleaner long-term): `shared/admin/` becomes its own Next.js app with its own deploy. Admin staff use `admin.veritypost.com`.
- Recommendation: **A now, migrate to B later** if admin grows too big or needs separate scaling.

### 3. `permissions.xlsx` lives outside the repo today
- Source of truth at `/Users/veritypost/Desktop/verity post/permissions.xlsx`. Fragile.
- Move into `reference/permission-matrix.xlsx` during Phase 2.

### 4. Monorepo tooling
- Today: no package manager workspace; each product is independent.
- Option: npm workspaces for web (`adult-site`, `shared/admin`, `shared/design-system`) — gives shared `node_modules`, shared dev scripts.
- Option: Bun workspaces (faster), pnpm workspaces (most common).
- Don't overthink this until you actually extract shared code — premature workspace config is a tax.

### 5. The `.claude/` directory
- Lives at `.claude/projects/<path>/memory/` and follows your working-directory path.
- If you rename or move the repo, memory stays put but the path mapping may break. Consider keeping the repo name (`verity-post`) stable through all moves.

### 6. Git history
- Use `git mv` for all moves to preserve history via rename detection.
- Do the big moves in separate, well-labeled commits (`chore: split site to products/adult-site`, `chore: extract backend to shared/`) so future `git log --follow` can trace any file back.

---

## The "no repetition" hygiene rule

Every fact lives in exactly one place:

| Fact | Canonical home |
|---|---|
| "The project has 928 active permissions" | `STATUS.md` |
| "We're currently migrating Wave 2 files" | `WORKING.md` |
| "Here's how the permission resolver works" | `reference/design-decisions.md` or `shared/backend/schema/` inline comments |
| "Round F shipped CSP nonce on 2026-04-19" | `archive/2026-04-19-prelaunch-sprint/_README.md` |
| "Run `node scripts/preflight.js` before prod deploy" | `platform/runbooks/cutover.md` |

If you ever catch yourself typing the same fact into two docs, the second becomes a link to the first.

---

## Order of first small wins

When you're ready to start (not now), the highest-value sequence:

1. **Build STATUS.md + WORKING.md at root.** (Phase 1, half a day.) This alone eliminates most of the "where do I look" pain.
2. **Move stale docs to archive.** (Phase 2 partial, 1 hour.) Archive `04-Ops/PROJECT_STATUS.md`, `03-Build-History/` contents, any scratch files at root.
3. **Top-level reorg** only after STATUS + WORKING are proven useful. (Phase 2 full.)
4. **Product split** only when you're genuinely ready to ship two iOS apps. (Phase 4.)

Do NOT split products before launch. You've got a shippable product. Reorg after v1 is out the door — structure serves the work, not the other way around.
