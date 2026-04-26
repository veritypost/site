# Session 7 — Root files + `scripts/` + `supabase/` overlap map

**Scope:** repo-root files (config, dotfiles, symlinks, README, the new top-level audit artifacts), `scripts/`, `supabase/`, plus the new `99.Organized Folder/` and `AuditV2/` siblings that landed since AuditV1 started.

**Read end-to-end / sampled:**

- **Root config / dotfiles:** `.gitignore` (full 128 lines), `.git-blame-ignore-revs` (full 6 lines), `.mcp.json` (full 13 lines), `.env.supabase-readonly` (full 34 lines — gitignored, contains a real `sbp_*` PAT — DO NOT surface in committed docs), `README.md` (full 2 lines: `<!-- deploy nudge 1776896446 -->`).
- **Root symlinks:** `CLAUDE.md → Reference/CLAUDE.md` (verified resolves), `STATUS.md → Reference/STATUS.md` (verified resolves).
- **`scripts/`** (9 files): `import-permissions.js` (full 325 lines), `check-admin-routes.js` (head 30 of unknown), `dev-reset-all-passwords.js` (full 76 lines), `smoke-v2.js` (head 30 + grep for SITE_DIR), `apply-seeds-101-104.js`, `check-stripe-prices.js`, `preflight.js`, `generate-apple-client-secret.js` (all sampled via AuditV2 Z19 wave file + grep), `stripe-sandbox-restore.sql` (full 14 lines).
- **`supabase/`** — single subfolder `supabase/.temp/` with 9 small CLI metadata files (`cli-latest`, `gotrue-version`, `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`, `rest-version`, `storage-migration`, `storage-version`); no `config.toml`, no migrations, no seed.sql. Project is run as a remote-only Supabase project; the local CLI is link-metadata only.
- **`99.Organized Folder/`** (NEW since AuditV1 started — discovered today): single file `Proposed Tree` (~14KB, head 150 lines + listing) — a `Current Projects/` reorganization proposal dated 2026-04-25.
- **`AuditV2/` + `AuditV2.md`** (NEW since AuditV1 started — discovered today): a parallel-fleet audit artifact set authored 2026-04-25 ~20:42, with `wave1/` (19 zone files), `wave2/` (11 cross-cutting topics), `wave3/` (1 verification summary), and a 28KB `AuditV2.md` synthesis at the root.

**Anchor SHA at session open:** `5ad6ad4`.

---

## Overlap map by topic

### T1 — Root files: config + symlinks are clean; README.md is a one-line deploy nudge

`.gitignore` is well-organized into named sections; `.git-blame-ignore-revs` correctly ignores the 04-21 autofix sweep. Symlinks resolve. `.mcp.json` configures the read-only Supabase MCP server using the gitignored `.env.supabase-readonly` for credentials.

`README.md` content is two characters of meaningful text: `<!-- deploy nudge 1776896446 -->`. This is the file used to force Vercel deploys via a dummy commit. **It is not a README in the conventional sense** — a reader landing here from GitHub gets nothing.

`.env.supabase-readonly` line 15 contains a real Supabase PAT (`sbp_9a99...`). The file is gitignored at `.env.*` (`.gitignore:11`). Per the file's own header: "Do not commit. Do not paste values into chat." Don't surface the PAT in any audit doc.

### T2 — `.gitignore` references retired `site/` paths

Lines 13-15: `site/.env`, `site/.env.*`, `!site/.env.example`. The `site/` directory was renamed `web/` 2026-04-20. These are dead patterns. **Corroborates AuditV2 §2.F** ("`.gitignore:12-13` Dead `site/.env*` patterns").

Line 57: `.mcp.json`. The file IS committed at the repo root (Session 1 read confirmed it exists, file mtime 2026-04-21). `.gitignore` ignores it; the file is committed anyway via `git add -f` or `.gitignore` was changed after. **Corroborates AuditV2 §2.F** ("`.mcp.json` ignored despite being committed"). Owner-decision: track it (drop the gitignore line) or stop tracking it (`git rm --cached .mcp.json`).

### T3 — `scripts/import-permissions.js` calls a non-existent RPC and falls through to a sentinel-value write

Verified (line 304-310): the script calls `supa.rpc('bump_global_perms_version').catch(...)`. The RPC does not exist in pg_proc (per AuditV2 wave3 spot-check + Reference/CLAUDE.md which lists `bump_user_perms_version` as the canonical RPC). The `.catch()` fallback writes `version: 999` (a literal "signal") via direct UPDATE, then a "Safer direct bump" block at line 312-319 reads the current version and increments it.

Net effect: works (the safer block at the bottom does the right thing), but writes a sentinel `999` value to `perms_global_version` momentarily. If the safer block ever fails or is skipped, the version stays at 999 and downstream cache-invalidation logic that uses simple integer compare may misbehave.

**Corroborates AuditV2 C3** (P0). Also, the same script lines 156-184 hardcode `roleToSets` + `planToSets` mappings in JavaScript — corroborates AuditV2 D2.

### T4 — `scripts/smoke-v2.js` is broken

Line 24: `const SITE_DIR = path.resolve(__dirname, '..', 'site');`. The `site/` directory was renamed to `web/` 2026-04-20. The script throws on require. **Corroborates AuditV2 §2.F** + W2 finding.

The other 3 scripts that use a `SITE_DIR` constant (`check-stripe-prices.js`, `import-permissions.js`, `preflight.js`) all correctly resolve `'..', 'web'` — only `smoke-v2.js` was missed in the rename sweep.

### T5 — `scripts/dev-reset-all-passwords.js` has zero prod-safety guards

Verified (full file). The script reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from environment and resets every `auth.users` password to `Password1?`. There is:
- No `NODE_ENV !== 'production'` check
- No project-ref allowlist
- No interactive confirmation prompt
- No "are you sure" gate of any kind

The header comment (lines 6-7) warns "NEVER run against production with real users" — but only conventionally, not enforced in code.

**Corroborates AuditV2 §2.F** ("zero prod-safety guards") + AuditV2 P1 fix #1 (Sprint 2).

### T6 — `scripts/stripe-sandbox-restore.sql` is a 14-line SQL block hardcoding 8 sandbox `price_*` IDs

Captured 2026-04-17. The header explicitly notes: "Requires `STRIPE_SECRET_KEY` in site/.env.local to be swapped back to the sk_test_... sandbox key". Two issues:
1. Path reference `site/.env.local` — should be `web/.env.local`.
2. The 8 hardcoded `price_*` IDs are sandbox-only. If owner wants to restore sandbox state today, the IDs would need to be re-captured (no proof these match current Stripe sandbox state).

Low priority — script is a manual rollback aid, not a regular operations tool.

### T7 — `scripts/check-admin-routes.js` is a drift-fence; `Wire this into CI` comment unactioned

Per `check-admin-routes.js` header: "Wire this into CI when there's a CI to wire it into." No CI exists yet. Script is a manual lint, not enforced. The 2026-04-21 ADMIN_ROUTE_COMPLIANCE_AUDIT (Session 5 read) showed 52/75 routes failing the canonical pattern at that snapshot; the drift fence isn't running.

### T8 — `scripts/apply-seeds-101-104.js` is one-shot, already executed

Per `CHANGELOG.md` (per AuditV2 Z19 sample): "Seeds 101-104 applied to live DB (`d1c25e3` 2026-04-20)". The script is one-shot — re-running would idempotently re-upsert the same data. Mildly stale. Not removable (re-run safety net), but no current consumer.

### T9 — `supabase/` is essentially empty

Only `supabase/.temp/` exists, with 9 CLI metadata files. No `config.toml`, no `migrations/` folder, no `seed.sql`. The project is remote-only; the local CLI is used for `supabase link` metadata. The folder is correctly gitignored (`.gitignore:109`). Nothing to audit beyond confirming it's intentionally minimal. **Corroborates AuditV2 Z19** ("supabase/ … no actual config files … no migrations folder … remote-only Supabase project").

### T10 — `99.Organized Folder/Proposed Tree` is a Current Projects reorg proposal — overlaps directly with AuditV1 Session 2 + Session 3 findings

A single file. Identified scope: Current Projects/ root + `Audit_2026-04-24/` + `ad-mockups/`. Findings (1-8 per the doc):

1. The folder mixes 4 kinds of things (live trackers, active feature specs, frozen audit artifacts, stray code asset).
2. F7 has 4 docs and only 2 are still authoritative — DECISIONS-LOCKED + PHASE-3-RUNBOOK.
3. F1-F4 are launch-parked per memory but sit alongside live work.
4. `Audit_2026-04-24/` is 90% raw agent output; only the syntheses are load-bearing.
5. Two extensionless 190KB+ files (`review external audit`, `review external audit-review`).
6. `ad-mockups/` is code, not a project doc.
7. No README / index.
8. `Audit_2026-04-24/` overlaps with `MASTER_TRIAGE_2026-04-23.md` and the relationship isn't documented in the audit folder.

**These all directly corroborate AuditV1 Sessions 2 + 3 findings** (S2 found F7 4-doc overlap; S3 found "review external audit" extensionless artifact + raw-vs-synthesis structure; both noted CLAUDE.md-as-only-cross-reference).

The doc also proposes a numbered-prefix tree (`00-LIVE/`, `10-LAUNCH-PACKETS/`, `20-FEATURES/{active,parked-launch,F7-pipeline}/`, `30-AUDITS/2026-04-24/{00-syntheses, 10-recon, 20-round2-lenses, 30-classifications, 90-raw-waves, _process}/`, `90-ASSETS/`). This is a concrete cleanup plan for the inconsistent-bucket items I've been logging.

The folder name `99.Organized Folder/` (with a literal period and capital-O space) is itself unusual — looks like an in-progress drop, not a final location.

### T11 — `AuditV2/` + `AuditV2.md` are a parallel-fleet audit that landed during this AuditV1 session

`AuditV2.md` (28KB synthesis) opens: "Multi-wave audit of every file in the project … three waves over one session: Wave 1 (19 parallel reading agents), Wave 2 (11 cross-reference threads), Wave 3 (targeted spot-checks via Supabase MCP + grep)."

Folder structure:
- `AuditV2/wave1/` — 19 zone files Z01–Z19, each ~20-50KB. Total ~620KB inventory.
- `AuditV2/wave2/` — 11 cross-cutting topic files W2-01 through W2-11, each ~5-10KB.
- `AuditV2/wave3/` — single 4KB W3_verification_summary.md.

`AuditV2.md` self-describes its relationship to AuditV1: **"A prior `AuditV1/` exists in the repo (4 of 11 sessions complete, started today 2026-04-25). It overlaps in spirit; AuditV2 is broader and resolved-via-code rather than handcrafted. Recommendation: archive AuditV1 once V2 is acted on."** And lists `U20: AuditV1 vs AuditV2 — once V2 acted on, archive AuditV1?` as an open owner decision.

**This is a direct intersection with the work the user asked for in AuditV1.** AuditV2 was apparently spawned in parallel by the same user against the same repo.

#### T11a — Methodology contrast

| Dimension | AuditV1 (this audit) | AuditV2 |
|---|---|---|
| Pace | Multi-session, owner-paced ("go" between sessions) | Single-session, parallel-fleet |
| Reading mode | Manual full-file reads, primary tool: `Read` | 19 parallel Explore agents, primary tool: agent dispatch |
| DB verification | None (read-only doc audit per scope) | Live MCP queries against pg_proc + information_schema + tables |
| Output structure | One overlap-map per session, confident vs inconsistent buckets | Single synthesis doc with confirmed-duplicates / confirmed-stale / confirmed-conflicts / unresolved buckets + 4-sprint action plan |
| Coverage at AuditV2 publication | Sessions 1-4 complete (Reference + Current + Audit_2026-04-24 + Future/Unconfirmed/Completed) | Full repo via 19 zones + 11 cross-cutting passes |

#### T11b — Findings overlap (high signal-to-noise)

AuditV2 corroborates many AuditV1 findings:

| AuditV1 finding | AuditV2 cross-ref |
|---|---|
| S1: Reference/CLAUDE.md says "Apple Dev account pending" but memory says it landed 2026-04-23 | AuditV2 §2.A row 1: "P0 rewrite" |
| S1: README references retired paths | AuditV2 §2.A row 5: "P1 rewrite or delete" |
| S2: F7 has 4 contradictory docs | AuditV2 D9 + Sprint 2 #18 |
| S2: F1-F4 conflict with PRELAUNCH | AuditV2 C26 + C27 + Sprint 3 #44 |
| S2: APP_STORE_METADATA uses retired `site/` paths | AuditV2 §2.B "P0 fix paths (App Store submission depends on it)" |
| S3: review external audit / review external audit-review extensionless | AuditV2 §2.A note (file rename plan in `99.Organized Folder/Proposed Tree`) |
| S3: external audit hallucinations (K.2, BB.2, BBB.1, FF.2, AAA.9, Y.11, RR.1) | AuditV2 §2.C "P1 mark refuted" |
| S3: cross-zone hook for F7 V4 vs F7-DECISIONS-LOCKED | AuditV2 D9 + Sprint 2 #15 |
| S4: Future Projects views/00_INDEX.md retired @admin-verified marker | AuditV2 C24 + Sprint 2 #16 |
| S4: db/00_INDEX.md retired @admin-verified marker | AuditV2 §2.D row 8 |
| S4: 4 retired strategy docs cited from views/* | AuditV2 §2.D rows 5-6 + U1 |
| S4: db/03 + db/06 deferred yet still cited | AuditV2 §2.D row 4 |
| S4: pricing not locked (Option A vs B) | AuditV2 doesn't surface as separate item — captured under U1 / general charter retirement |
| S5: ADMIN_VERIFIED_RECONCILE work undone same day | AuditV2 C24 ("7 active-doc `@admin-verified` residuals contradict CLAUDE.md retirement") |
| S5: APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE Status:ACTIVE but trigger fired | not in AuditV2 — unique to AuditV1 |
| S5: F7_SMOKE_TEST_RUNBOOK missing GRANT step | not in AuditV2 — unique to AuditV1 |
| S6: 100_backfill in Archived/ but CLAUDE.md tree says schema/ | AuditV2 C2 ("Migrations 092/093/100 missing on disk") — same root cause, AuditV2 frames as live-RPC-with-no-source rather than wrong-tree-comment |
| S6: 2026-04-18-admin-lockdown README claims @admin-verified live | AuditV2 C24 (doc-side residuals) |
| S6: FUTURE_DEDICATED_KIDS_APP says unified launch-ready | AuditV2 doesn't surface — unique to AuditV1 |

#### T11c — AuditV2 unique findings (DB-backed, AuditV1 couldn't get)

AuditV2 surfaces several findings AuditV1 couldn't reach because AuditV1 didn't query live DB:

- **C1**: `cleanup_rate_limit_events` RPC references nonexistent column `occurred_at`; live column is `created_at`. RPC errors on every invocation; `rate_limit_events` at 8,562 rows and growing unbounded. **P0 runtime bug.**
- **C2**: Migrations 092/093/100 missing on disk; `require_outranks` + `caller_can_assign_role` RPCs (live in pg_proc) have zero on-disk source.
- **C6**: 8 RPC bodies still reference dropped `superadmin` role.
- **C13**: Adult quiz pass threshold hardcoded `>= 3` in `user_passed_article_quiz` RPC; no `quiz.unlock_threshold` setting.
- **C7**: schema/127 rollback DELETE references wrong perm-key form.
- **U17**: `events_*` partition RLS-disabled state — confirmed intentional (correct PostgreSQL pattern).

#### T11d — AuditV1 unique findings (process / human-readable)

AuditV1 surfaces things AuditV2 deprioritizes or doesn't enumerate:

- S2 / S5: Specific session-log-vs-current-state contradictions (ADMIN_VERIFIED_RECONCILE undone same day; APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE Status: ACTIVE).
- S2: Cross-doc retired-marker tracking inside session logs.
- S3: External audit `reviewed` content that contradicted live state.
- S4: Pricing option A/B not locked (specific call-out).
- S5: `Sessions/04-23-2026/Session 1/` missing SESSION_LOG file.
- S5: `Sessions/04-21-2026/Session 1/NEW_TREE_STRUCTURE_2026-04-21.md` empty placeholder.
- S5: Per-session NEXT_SESSION_PROMPT files never archived to `_superseded/`.
- S6: `Archived/` cross-folder content overlap pattern.
- S6: `Archived/_from-05-Working/` — content correctly preserved.

#### T11e — AuditV1 vs AuditV2 — what to do

AuditV2 explicitly recommends archiving AuditV1 once V2 is acted on (its U20). The question is symmetrically valid: archive V2 once V1 finishes? Both audits independently arrive at substantially the same headline conclusions where they overlap; AuditV2 is broader (full repo + DB) but less granular per-doc; AuditV1 is more granular per-zone but missing DB-side findings.

The user-facing question is owner direction. Both audits' findings should be merged into a single "fix list" rather than maintained as parallel stacks.

### T12 — `99.Organized Folder/Proposed Tree` is dated 2026-04-25 (same day as AuditV2 + AuditV1) and matches Current Projects/ scope only

The Proposed Tree predates AuditV2 in finding-density (only covers Current Projects/) but proposes concrete moves that I'd have recommended in AuditV1 Session 11 synthesis. Its scope is a subset; AuditV2 is broader. The Proposed Tree could be folded into either audit's recommendation set.

The folder name `99.Organized Folder/` looks like a temporary working location for an in-progress reorg. Not gitignored.

---

## Confident bucket (ready for cleanup decisions)

**C-1.** `.gitignore:13-15` references retired `site/` paths. Delete the 3 lines.

**C-2.** `.gitignore:57` ignores `.mcp.json` even though the file is tracked. Owner-decision: drop the gitignore line, or `git rm --cached .mcp.json`. (Note: `.mcp.json` references `.env.supabase-readonly` which contains a real PAT — make sure neither file gets committed if owner chooses to gitignore both.)

**C-3.** `README.md` is a 2-line "deploy nudge" file with zero meaningful content. Either replace with a proper repo README or accept as-is (it serves a real Vercel-deploy-trigger function — losing the comment may break that workflow).

**C-4.** `scripts/smoke-v2.js` line 24 references `'..', 'site'` (renamed to `web/` 2026-04-20). Script is broken. Fix the path or retire the script.

**C-5.** `scripts/import-permissions.js` line 304 calls non-existent RPC `bump_global_perms_version`; falls through to sentinel-value write of `version: 999` then "safer direct bump". Either create the RPC OR remove the broken call + sentinel write and rely on the safer block alone. (Same as AuditV2 C3 P0.)

**C-6.** `scripts/import-permissions.js` lines 156-184 hardcode `roleToSets` + `planToSets` maps in JS; per CLAUDE.md "DB is the default, always" these belong in DB. (Same as AuditV2 D2.)

**C-7.** `scripts/dev-reset-all-passwords.js` has zero prod-safety guards. Add: project-ref allowlist (only `fyiwulqphgmoqullmrfn` if owner accepts that's the dev project too, OR a separate dev-only ref) + interactive `Are you sure?` prompt + maybe a `--yes-i-mean-it` flag.

**C-8.** `scripts/stripe-sandbox-restore.sql` references `site/.env.local` (now `web/.env.local`) in the comment header. 1-line fix.

**C-9.** `supabase/` — confirmed essentially empty + correctly gitignored. No action.

**C-10.** `99.Organized Folder/Proposed Tree` — folder name is unusual and the file lacks an extension. Either rename the file `Proposed_Tree.md` (so editors render markdown) and the folder to something descriptive, or move the doc into AuditV1/ as a candidate Session 11 synthesis input.

**C-11.** `AuditV2/` and `AuditV2.md` together form a parallel audit. Owner decision needed (per AuditV2 U20 + the symmetric question for AuditV1): which lives, which retires, or merge into a single fix-list.

---

## Inconsistent bucket (project-itself-is-inconsistent — flag for resolution session)

**I-1.** `.mcp.json` is committed AND gitignored — the gitignore rule is at line 57 (`Claude Code session data` section). Either the file was committed before the gitignore rule was added (and `git add -f` is required to update it), or the rule was added without removing tracked state. Owner needs to pick a policy.

**I-2.** `scripts/import-permissions.js` references `matrix/permissions.xlsx` as the "preferred canonical location" but the folder doesn't exist; only the legacy `~/Desktop/verity post/permissions.xlsx` resolves. CLAUDE.md says the legacy location is canonical. The "preferred" path comment in the script disagrees with CLAUDE.md.

**I-3.** AuditV1 (this work) and AuditV2 (the parallel-fleet audit) overlap on most major findings but are independent stacks of recommendations. There's no documented relationship between them. (Captured as C-11 with the recommendation.)

**I-4.** `99.Organized Folder/Proposed Tree` proposes a concrete numbered-prefix reorg of `Current Projects/` that addresses many of the inconsistencies AuditV1 surfaced in Session 2 + Session 3. The proposal is dated 2026-04-25 — same day AuditV1 started. No documented relationship between the proposal and either audit.

---

## Open questions (need owner direction)

**Q-1.** AuditV1 vs AuditV2 — which lives, which retires, or merge? (Both audits reach overlapping conclusions; AuditV2 is broader + DB-aware, AuditV1 is more granular per-doc + multi-session-paced.)

**Q-2.** `99.Organized Folder/Proposed Tree` — adopt the proposed `00-LIVE/` / `10-LAUNCH-PACKETS/` / `20-FEATURES/` / `30-AUDITS/` / `90-ASSETS/` structure? It's a concrete answer to Session 2 + Session 3 inconsistencies but reorgs feel risky mid-launch.

**Q-3.** `scripts/dev-reset-all-passwords.js` — does this script get used at all anymore (post-test-data retirement 2026-04-21)? If not, retire the file. If yes, harden per C-7.

**Q-4.** `.mcp.json` — track or untrack? Either way is defensible; current state (committed + gitignored) is incoherent.

---

## Cross-zone hooks (carried forward)

- **CZ-A** (continued from S2/S3/S4/S5/S6): F7 prompt versioning. AuditV2 D9 + C25 corroborate; same threads. Resolves Session 8 + 11.
- **CZ-F** (continued from S5/S6): `Future Projects/` chronology — AuditV2 doesn't surface, so the question of how the 24-doc panel set came into being is still open. Resolves Session 11 (or owner conversation).
- **CZ-G** (continued from S5): KILL_SWITCH_INVENTORY 11 items — AuditV2 cites several launch-hide items but doesn't enumerate the 11. Resolves Session 8.
- **CZ-H** (continued from S5): ADMIN_ROUTE_COMPLIANCE_AUDIT 52/75 routes failing — AuditV2 C8 surfaces the helper bug + C9 surfaces a missing rate limit, but no end-to-end re-run. Resolves Session 8.
- **CZ-J** (continued from S6): permissions matrix history — AuditV2 W2-01 gives a full integrity check; should reconcile with Reference/PERMISSIONS_DECISIONS.md in Session 11.
- **CZ-K** (continued from S6): PROFILE_FULL_FLOW promotion — AuditV2 U9 explicitly defers this. Need owner direction.
- **CZ-L** (new): AuditV2 surfaces P0 runtime bugs (C1: cleanup_rate_limit_events column drift; C2: missing schema/092+093+100 source; C3: import-permissions broken RPC) that AuditV1's read-only doc scope can't reach. These need to be fed back into MASTER_TRIAGE regardless of which audit lives.
- **CZ-M** (new): the Proposed Tree, if adopted, would change every absolute-path reference in CLAUDE.md / STATUS.md / memory. Coordinate execution with a CLAUDE.md rewrite to avoid drift.

---

## Plan for Session 8

`web/` source + config + tests. By far the largest session in scope. Per the earlier folder audit and AuditV2 zone coverage:

- `web/package.json` + `web/.env.example` + `web/next.config.js` + `web/tsconfig.json` + `web/.eslintrc.json` + `web/.prettierrc.json` + `web/.prettierignore` + `web/vercel.json` + `web/.husky/pre-commit`
- `web/src/middleware.js` (~310 lines per audit)
- `web/src/app/` — pages (most are TS, some still JS — per AuditV2 C29 there are 218 `.js` files in web/src). Prioritize: `layout.js`, `page.tsx` (home feed — checks FALLBACK_CATEGORIES claim), `story/[slug]/page.tsx` (the launch-hide story), `profile/settings/*` (the 3800-line settings page), `admin/*` (highest blast radius).
- `web/src/app/api/` — 100+ route files split across auth/, kids/, admin/, stripe/, billing/, etc.
- `web/src/lib/` — auth.js, permissions.js, roles.js, plans.js, rateLimit.js, supabase/{client,server}.ts, featureFlags.js, pipeline/ (13 files), apiErrors.js, adminMutation.ts.
- `web/src/components/` — shared kit + admin/ subkit.
- `web/src/types/database.ts` (8,900 lines, generated — skim only).
- `web/tests/e2e/` — fixtures + 8+ deep specs added 2026-04-25.

Approach:
1. Scope check: list `web/` to confirm what exists.
2. Verify the AuditV2 P0 / P1 findings against current code (CZ-L).
3. Verify outstanding KILL_SWITCH_INVENTORY items vs current code (CZ-G).
4. Verify ADMIN_ROUTE_COMPLIANCE_AUDIT 52/75 status vs current code (CZ-H).
5. Resolve open Session 5 + 6 cross-zone hooks where they require web/ reads.
6. Spot-check `front_page_state` vs `articles.hero_pick_for_date` bridge state (CZ-D from Session 4).
7. Check `tsconfig.json` strict (Session 5 question).
8. Write `AuditV1/08-web-overlap-map.md` — likely the longest session doc.
9. Update `AuditV1/00-README.md`.

Given web/ is the implementation surface and many AuditV2 findings now corroborate things I had as open questions, Session 8 may benefit from running my read-pattern in parallel with AuditV2 wave1 zones Z12-Z16 (web_lib, web_pages, web_admin, web_api, web_components) for cross-verification rather than re-walking the same ground.
