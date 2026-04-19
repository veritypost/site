# Verity Post Repo Structure — 3-Architect Synthesis

**Method:** Three architects produced independent proposals. A fourth synthesized the best-of-all-three. Below is the merged recommendation.

**Status:** Ready for owner review. Nothing executed yet.

---

## Convergences — all 3 architects agreed

Adopt without debate:

1. Monorepo with **pnpm workspaces** (npm is flaky with Next.js; bun acceptable if you already use it).
2. **Three product surfaces** side-by-side: adult web, adult iOS, kids iOS.
3. **Shared Swift code** extracts into ONE Swift Package consumed by both iOS Xcode projects (not a workspace with two targets).
4. **Supabase migrations + config + edge functions + seed** live under `platform/`.
5. **One status file + one active-work file** at the top. Duplication is the enemy.
6. **Preserve `com.veritypost.app` bundle ID for adult** (keeps existing TestFlight); kids gets new `com.veritypost.kids`.
7. **Do NOT renumber migrations 005–094** — already applied to prod by those names.
8. **Bring permissions matrix into the repo** (today it lives on Desktop).
9. **`git mv` per phase, one sweeping commit per phase, tag `pre-restructure` first.**

---

## Divergences resolved

| Decision | Verdict | Why |
|---|---|---|
| `apps/` vs `products/` | **`apps/`** | Industry-standard monorepo vocabulary (pnpm/Turbo/Nx). |
| `packages/` vs `shared/` | **`packages/`** | Matches pnpm workspace glob convention. |
| `scripts/` vs `tools/` | **`tools/`** | Signals "dev/ops helpers, not runtime." Cheap rename. |
| `test-data/` at root vs `platform/supabase/seed/` | **`platform/supabase/seed/`** | Fixtures belong next to the DB they seed. |
| Status docs at root vs under `docs/` | **Root** (`STATUS.md` + `WORKING.md`) | Solo owner opens these 10x/day — visibility beats taxonomy. |
| `docs/reference/` vs top-level `reference/` | **`docs/reference/`** | Keep `docs/` as umbrella; reserve root real estate. |
| Admin inside `web-adult` vs `shared/admin/` | **Inside `apps/web-adult/`** | Solo owner, one deploy. Defer split until real incident justifies. Document as ADR-001. |
| Backend under `platform/` vs `shared/` | **`platform/supabase/`** | Schema is infra contract, not shared library. |
| Kids web redirect — dedicated app vs middleware | **Middleware** in `web-adult` | One config line vs a whole Vercel project. |
| Admin as separate deploy | **No — bundled for now** | Same reasoning as admin location. |
| ADRs vs flat reference | **Adopt ADRs** under `docs/decisions/` | Cheap structure, saves "why did I decide X?" 6 months later. |
| Pre-commit hook blocking "currently/as of/today" in reference docs | **Adopt** | 20-min hook, saves drift forever. |
| 9th top-level slot | **Reserve `design/`** | Scratch HTML needs a home. |

---

## Final Recommended Structure

```
verity-post/
├── STATUS.md                      # single "where we stand" — daily
├── WORKING.md                     # single active-work list — daily
├── README.md                      # index + links + duplication rule
├── package.json                   # pnpm workspace root
├── pnpm-workspace.yaml
│
├── apps/
│   ├── web-adult/                 # Next.js 14 (today's site/), serves /admin
│   ├── ios-adult/                 # com.veritypost.app (keeps existing TestFlight)
│   └── ios-kids/                  # com.veritypost.kids
│
├── packages/
│   ├── db-types/                  # generated Supabase TS types
│   ├── web-ui/                    # shared React components
│   ├── web-lib/                   # Supabase client, permission helpers, Stripe
│   ├── ios-core/                  # Swift Package: Models, Supabase, Auth, TTS, Permissions, Keychain, Log, Theme
│   └── permissions/               # permissions.xlsx + generated JSON
│
├── platform/
│   ├── supabase/                  # migrations/, config.toml, seed/, functions/
│   ├── stripe/                    # products/prices, webhook contracts
│   ├── vercel/                    # vercel.json, redirects, env templates
│   └── apple/                     # App Store metadata, screenshots, review notes per app
│
├── tools/                         # preflight.js, seed-test-accounts.js, smoke-v2.js, check-stripe-prices.js, import-permissions.js
│
├── design/                        # prototypes, mocks, scratch HTML
│
├── docs/
│   ├── README.md                  # index + duplication rule
│   ├── architecture.md            # system shape, data flow, auth, permission engine
│   ├── reference/                 # durable facts (schema guide, permissions, test-accounts, parity)
│   ├── decisions/                 # ADRs, immutable once merged
│   ├── runbooks/                  # cutover, rotate-secrets, release, app-store-submission
│   ├── product/                   # feature ledger, parity matrix, app-store metadata
│   └── history/                   # dated append-only build logs, never edited after date rolls
│
├── archive/                       # frozen historical material (99-Archive lands here)
│
└── .github/                       # CI workflows, PR templates, pre-commit hook
```

**Root: 9 directories + 4 files. Disciplined.**

---

## Phased Migration Order (merged from all 3 plans)

**Phase 0 — Safety net.** Tag `pre-restructure`. Branch `restructure/v1`. Draft `STATUS.md` at root BEFORE anything moves.

**Phase 1 — Docs consolidation.** `git mv` docs into `docs/` tree. Write `docs/README.md` duplication rule. Add pre-commit hook. Low risk, high morale.

**Phase 2 — Platform + tools.** `git mv 01-Schema → platform/supabase/migrations`. Merge `supabase/`. `git mv scripts → tools`. `git mv test-data → platform/supabase/seed`.

**Phase 3 — Web relocation.** `git mv site → apps/web-adult`. **Update Vercel project root dir BEFORE merging PR.**

**Phase 4 — Swift core extraction.** Pull shared Swift files into `packages/ios-core` as Swift Package. Unified Xcode project consumes it. Prove boundary while app still builds.

**Phase 5 — iOS split (HIGHEST risk).** Create `apps/ios-adult` (retains `com.veritypost.app`) and `apps/ios-kids` (`com.veritypost.kids`). Both consume `packages/ios-core`. Separate App Store Connect record for kids (COPPA review).

**Phase 6 — Kids web redirect.** Middleware in `web-adult` matching `kids.veritypost.com` → App Store link.

**Phase 7 — Shared TS extraction.** `packages/web-lib`, `packages/web-ui`, `packages/db-types`. Wire into pnpm workspace.

**Phase 8 — Cleanup.** Scratch HTML → `design/prototypes/`. Delete `00-Folder Structure.md`. Archive `99-Archive` → `archive/`. Seed first 3 ADRs: admin-bundled, migration-numbering-preserved, bundle-ID-inheritance.

---

## Owner Decisions Required Before Executing

1. **Package manager**: pnpm (recommended) or bun? One-way door for workspace config.
2. **Permissions matrix format**: keep xlsx (CI generates JSON) or migrate to YAML/CSV (diffable PRs)?
3. **Kids TestFlight**: confirm `com.veritypost.app` stays with adult, kids gets fresh `com.veritypost.kids`.
4. **COPPA readiness timing**: kids App Store submission needs privacy labels, review notes, screenshots. Schedule this separately — blocks kids launch but not restructure.
5. **Vercel root-dir update window**: Phase 3 merge needs a 15-minute maintenance note while previews rebuild.

---

*Produced 2026-04-19 via 3-architect independent proposal + 1 synthesis round. No execution yet — awaiting owner review.*
