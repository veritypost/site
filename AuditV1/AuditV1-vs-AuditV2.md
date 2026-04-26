# AuditV1 vs AuditV2 — Comparison

Per owner direction "they are both separate things." This doc compares the two audits side-by-side: methodology, coverage, findings overlap, unique findings, agreement / disagreement, blind spots.

Both audits closed 2026-04-25.

---

## 1. Methodology

| Dimension | AuditV1 | AuditV2 |
|---|---|---|
| Pacing | Multi-session, owner-paced ("go" between sessions) | Single-session, parallel-fleet |
| Sessions / waves | 11 sessions | 3 waves (19 wave1 zone agents + 11 wave2 cross-cutting + 1 wave3 verification) |
| Reading mode | Manual full-file reads via `Read` tool, file-by-file in topical sessions | 19 parallel Explore agents reading concurrently, then 11 cross-reference threads |
| DB access | None (read-only doc-and-code audit per scope) | Live MCP queries against pg_proc + information_schema + actual table rows |
| Output structure | One overlap-map per session: topic map → confident bucket → inconsistent bucket → open questions → cross-zone hooks; final 99-synthesis | Single 28KB synthesis: confirmed-duplicates / confirmed-stale / confirmed-conflicts / unresolved + 4-sprint action plan; 31KB of wave1 + wave2 supporting files at `AuditV2/wave*/` |
| Verification | Direct file reads + grep | "Code wins, then DB, then most-recent doc" tiebreaker rule with live MCP probes |
| Reading depth | Every file in scope read end-to-end | "Wave 1 inventories ~7,000 lines / Wave 2 cross-reference findings ~1,250 lines" — broader sweep, less per-file deep-read |

---

## 2. Coverage

| Zone | AuditV1 session | AuditV2 zone |
|---|---|---|
| Reference/ tree | S1 | Z01 |
| Current Projects/ root | S2 | Z02 |
| Audit_2026-04-24/ | S3 | Z03/Z04/Z05 |
| Future Projects/ | S4 | Z06 |
| Unconfirmed/Completed Projects/ | S4 | Z10 |
| Sessions/ | S5 | Z07 |
| Archived/ | S6 | Z08/Z09 |
| Root + scripts/ + supabase/ | S7 | Z10 + Z19 |
| web/ source + tests | S8 | Z12/Z13/Z14/Z15/Z16 |
| iOS apps | S9 | Z17/Z18 |
| schema/ migrations | S10 | Z11 |
| DB live state | — | wave3 spot-checks |
| Cross-cutting topics | per-session "cross-zone hooks" | wave2: permissions integrity / F7 / kids / Apple / reader / billing / triage / doc drift / hardcoded / schema-API coherence / audit internals |

Coverage is roughly equivalent on the file surface. AuditV2 adds live-DB verification that AuditV1 doesn't have.

---

## 3. Findings present in BOTH audits

These are the high-confidence findings — surfaced independently by two different methodologies on the same repo within hours of each other.

| Finding | AuditV1 ID | AuditV2 ID |
|---|---|---|
| CLAUDE.md "Apple-block" paragraph stale (account active 2026-04-23) | A-1 | §2.A row 1 (P0) |
| CLAUDE.md "FALLBACK_CATEGORIES hardcode still there" — 0 hits | A-1 | §2.A row 2 (P0) |
| CLAUDE.md "ParentalGate zero callers (T-tbd)" — 4 live callers | A-1, B-13 | §2.A row 4 (P1) |
| CLAUDE.md "23 rules-of-hooks disables" — actual is 25 | A-1 | §2.A row 3 |
| Reference/README.md / FEATURE_LEDGER.md / parity/* — site/ paths, retired refs | A-2/A-3/A-4 | §2.A rows 5-7 |
| Reference/runbooks/CUTOVER.md §5 TBD | A-5 | §2.A row 8 |
| APP_STORE_METADATA.md uses retired site/ paths | A-6 | §2.B (P0) |
| PM_PUNCHLIST_2026-04-24.md:60 strict:false claim wrong (actual: true) | A-7 | §2.B + W3 |
| F7 4 docs, only 2 authoritative | (S2 finding) | D9 |
| F7-DECISIONS-LOCKED Decision 8 vs §5 contradiction | I-3 | C25 |
| F1-F4 conflict with PRELAUNCH_UI_CHANGE | (S2 finding) | C26+C27 |
| F2 reading-receipt silently dropped | A-10 | §2.B |
| F5 ads-gameplan superseded by F6 | A-11 | §2.B |
| F6 §5 describes rolled-back schema/109 design | A-12 | C31 |
| F7-PM-LAUNCH-PROMPT stale | A-13 | §2.B |
| review external audit / -review extensionless files | A-14 | §2.A note |
| _RECONCILER_BRIEFING.md external-agent paths | A-15 | §2.C |
| Future Projects views/* deps on retired strategy docs | A-16 | §2.D rows 5-6 + U1 |
| Future Projects db/00_INDEX migration count stale | A-17 | §2.D row 1 |
| Future Projects 24_AI_PIPELINE_PROMPTS path drift | A-18 | §2.D row 2 |
| @admin-verified residuals in Future Projects + 1 page.tsx + active docs | A-19, B-15 | C24 |
| Unconfirmed Projects/ heavily stale | A-22 | §2.E |
| Completed Projects/ uses site/ paths | A-23 | §2.E (implicit) |
| .gitignore site/.env* dead patterns | D-1 | §2.F |
| .mcp.json ignored despite committed | D-2 | §2.F |
| scripts/smoke-v2.js references site/ | D-4 | §2.F |
| scripts/import-permissions.js calls non-existent RPC | D-5 | C3 (P0) |
| scripts/import-permissions.js hardcoded role/plan→set maps | D-6 | D2 |
| scripts/dev-reset-all-passwords.js zero prod safety | D-7 | §2.F (P1) |
| 100_backfill in Archived/ but CLAUDE.md tree says schema/ | A-1, C-2 | C2 (DR replay) |
| schema/092 + 093 missing on disk | C-2 | C2 (live RPC bodies have no source) |
| 8 RPC bodies still reference superadmin | C-5 | C6 |
| schema/127 rollback wrong perm-key form | C-3 | C7 |
| user_passed_article_quiz hardcoded >= 3 | C-4 | C13 |
| cleanup_rate_limit_events column bug | C-1 | C1 (P0) |
| hasPermissionServer dual export different semantics | B-1 | D1 |
| recordAdminAction missing p_ip / p_user_agent | B-2 | C8 |
| lib/plans.js hardcoded TIERS/PRICING | B-3 | C23 + L12 |
| Adult aps-environment entitlement missing | B-5 | C4 (P0) |
| Adult applesignin present (already shipped) | B-5 context | C35 (AuditV2 said "TBD" — slight disagreement, see §5) |
| AASA file missing | B-6 | C36 |
| Both apps AppIcon empty | B-8 | C5 (P0) |
| Kids aps-environment=development needs production | B-7 | C37 |
| KidsAppLauncher fallback URL placeholder | B-10 | C43 |
| OpenKidsAppButton App Store URL placeholder | B-11 | C43 |
| HomeFeedSlots + Keychain orphans | B-12 | C40 |
| BadgeUnlockScene unreachable (biasedSpotted hardcoded false) | B-13 | C11 |
| QuizPassScene orphan | (subsumed under B-13 / C-7) | C12 |
| CFBundleVersion=1 never bumped | B-14 | C41 |
| possibleChanges/ ships in app bundle | B-9 | C42 |
| Adult AlertsView Manage tab gated off | E-1 | C39 |
| Adult expert Q&A panel #if false'd | E-1 | C38 |
| AlertsView Manage / kids #if false blocks | E-1 | (subsumed in C39) |
| web/public bare; JsonLd.tsx references missing /icon.svg | B-16/B-17 | C44 |
| APNS_BUNDLE_ID vs APNS_TOPIC env mismatch | B-18 | C34 |
| 27 .jsx admin component files (CLAUDE.md says no .jsx) | (Session 8 count) | C28 |
| 218 .js files in web/src (CLAUDE.md says no new .js) | (Session 8 count) | C29 |
| Charter trust pages cited but cut from scope | I-1 | U1 |
| Story-manager fate (legacy vs F7) | I-5 | U2 + D5 |
| Kids-story-manager near-duplicate | I-6 | U3 + D6 |
| MASTER_TRIAGE 1-9 still listed open (launch-blockers) | (P0 list) | C14 (and C15-C20 individual items) |

Total overlap: ~55 finding pairs.

---

## 4. Findings unique to AuditV1

These are findings AuditV2 doesn't surface (or surfaces only obliquely).

### Process / convention findings

- **Session-folder doc drift specifics**:
  - `Sessions/04-21-2026/Session 1/NEW_TREE_STRUCTURE_2026-04-21.md` — empty 3-line placeholder (A-24)
  - `Sessions/04-23-2026/Session 1/ADMIN_VERIFIED_RECONCILE.md` — documents 77 marker-bumps that were both based on a hallucinated premise AND superseded same day (A-25)
  - `Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md` — `Status: ACTIVE` but trigger fired (A-26)
  - `Sessions/04-22-2026/Session 1/F7_SMOKE_TEST_RUNBOOK.md` — missing the GRANT step that the 04-25 bug-hunt surfaced (A-27)
  - `Sessions/04-23-2026/Session 1/` missing SESSION_LOG file (A-28)
  - 3 Sessions/04-21 audit artifacts use retired FIX_SESSION_1 numbering (A-29)
  - REVIEW_UNRESOLVED_2026-04-21.md M46 status drift (A-30)

- **Archived/ specific findings**:
  - `Archived/2026-04-18-admin-lockdown/_README.md` claims @admin-verified live (A-31)
  - `Archived/obsolete-snapshots/_README.md` references nonexistent `/WORKING.md` (A-32)
  - `Archived/2026-04-20-consolidation/FUTURE_DEDICATED_KIDS_APP.md` "unified launch-ready" — decision reversed (A-33)
  - `Archived/restructure-2026-04-19/structure-synthesis.md` "ready for review" — never adopted (A-34)
  - `Archived/_retired-2026-04-21/future-projects-README.md` is the OLD 8-doc README (cross-zone hook to the chronology gap)
  - 3 cross-folder owner-action checklists overlap (S6 finding)

- **Process-level inconsistencies**:
  - I-12: Future Projects chronology gap — 8-doc → 24-doc transition not captured anywhere
  - I-13: Per-session NEXT_SESSION_PROMPT files never archived to `_superseded/` (only one session-day used the convention)
  - I-14: .mcp.json committed AND gitignored

- **Other**:
  - A-20: Future Projects views/00_INDEX.md says "Kids iOS (8 files)" but enumerates 9
  - A-21: `mockups/web-home.html` and `web-home-standalone.html` are byte-identical
  - A-35: VerityPost/REVIEW.md not annotated with what shipped (cross-references files like `KidViews.swift` that no longer exist)
  - C-6: schema/snapshots/snapshot-2026-04-18-pre-perms-import.sql is 0 bytes
  - C-7: Schema gaps 001-004, 007-008, 052 (AuditV2 only flagged 092/093/100)
  - C-8: Rollback discipline drops at migration 150
  - D-3: README.md is a 2-line deploy-nudge with no real content
  - D-8: scripts/stripe-sandbox-restore.sql references site/.env.local
  - D-10: 99.Organized Folder/Proposed Tree — file lacks .md extension
  - SHOW_BOTTOM_NAV verified flipped on (CZ-G web-side resolution)

### Why AuditV1 caught these

The serial multi-session approach with full-file reads catches small per-file artifacts (empty files, mid-file `Status: ACTIVE` lines, retired-FIX_SESSION_1 numbering, byte-identical duplicates, single-line stale headers in archive READMEs) that an agent doing a broader sweep skims past.

---

## 5. Findings unique to AuditV2

These are findings AuditV1 couldn't reach because the AuditV1 scope was read-only doc-and-code (no DB access).

### DB-state findings

- **C1 (P0): cleanup_rate_limit_events column bug + 8,562 row count.** AuditV1 could see the source bug from `schema/170` (and did, in C-1) but couldn't measure that the table is at 8,562 rows growing unbounded — that requires a live row count query.
- **C2: 092/093/100 live RPC bodies.** AuditV1 detected the missing-on-disk pattern via Sessions/Archived cross-reference; AuditV2 dumped the actual live RPC bodies to confirm there's no source anywhere.
- **C6: 8 RPC bodies referencing superadmin.** AuditV1 confirmed 8 source files mention the role but could only guess at live pg_proc state; AuditV2 queried pg_proc directly.
- **U17: events_* partition RLS-disabled state — confirmed intentional** (correct PostgreSQL pattern).
- **wave3 verification spot-checks**:
  - settings table has 30 rows (not 24); pipeline cost-cap IS DB-driven; kid quiz threshold IS DB-driven; comment config IS DB-driven; pipeline operations all DB-driven
  - ai_models table has 4 active rows (anthropic/claude-sonnet-4-6, anthropic/claude-haiku-4-5-20251001, openai/gpt-4o, openai/gpt-4o-mini)
  - Only `events` parent table has RLS-no-policies (intentional)
  - reading_log table is actively used (8 rows) — F2 data layer is built, not just hidden
- **U5: verity_family_annual + verity_family_xl is_active=false** — flagged as owner-decision

### Refutations of older audit claims

AuditV2 explicitly refutes 6 older audit claims that AuditV1 couldn't refute without DB access:
- Wave A "comment_status enum drift `'visible'` vs `'published'`" — refuted (zero `'published'` writes)
- Wave A "35 tables missing RLS" + Wave B "1+14 RLS-no-policies" — refuted (only `events` parent, intentional)
- L08-001 "kid RLS blocks writes" — refuted (live RLS verified correct)
- Wave B "/api/access-request no auth" — refuted (route is 410 stub since Ext-AA1 owner decision)
- Wave B "registerIfPermitted never called" — refuted (function does not exist anywhere)
- Wave B "handlePaymentSucceeded missing perms_version bump" — refuted (bump IS wired at api/stripe/webhook/route.js:846)
- L06-001 "cross-provider duplicate sub rows" — no production duplicates exist

### Format / packaging

- **4-sprint priority-sequenced action plan** with date-bound tiers (Sprint 1 P0 / Sprint 2 P1 / Sprint 3 P2 / Sprint 4 P3). AuditV1 has its own §5 priority sequencing, also 4-tier — converged on a similar shape.
- **20 unresolved owner-decisions (U1-U20)** itemized as a separate section. AuditV1 has 14 open questions across the synthesis.

### Why AuditV2 caught these

Live MCP queries + parallel-fleet sweep + tiebreaker rule "code wins, then DB, then most-recent doc" surface DB-state findings + actively refute stale doc claims. AuditV1's scope didn't include MCP per the audit-charter ("read every file end-to-end" — the file scope, not live state).

---

## 6. Disagreements / different framings

Few outright disagreements. Three notable cases:

1. **AuditV2 §C35: "Adult-side `appleSignin` capability TBD"** vs AuditV1 B-5 verification that adult `VerityPost.entitlements` already has `com.apple.developer.applesignin = Default`. AuditV1 reads the file directly and confirmed the entitlement is present. AuditV2's claim "TBD" appears stale — the entitlement landed before either audit started.

2. **AuditV2 D9 says F7 docs duplicate the 12-step canonical vocabulary**; AuditV1 frames this as "F7 has 4 docs and only 2 are authoritative" (Sessions 2/3/4/7/8). Same finding, different framings — AuditV2 emphasizes vocabulary duplication, AuditV1 emphasizes which doc is canonical.

3. **AuditV2 C24 lists "7 active-doc @admin-verified residuals"** vs AuditV1 B-15 finding only 1 code-side residual (`web/src/app/admin/pipeline/runs/page.tsx` — actual marker line) plus the doc-side residuals AuditV1 found in Future Projects (A-19). Counting differs; the sweep target is the same.

These are framing/granularity differences, not factual contradictions.

---

## 7. Where each is stronger

**AuditV1 strengths:**
- **Per-file forensic depth**: spotted single-line drift (M46 status, Status: ACTIVE, retired numbering) and intra-folder lifecycle artifacts (NEW_TREE_STRUCTURE empty placeholder, _superseded/ convention adoption gap)
- **Cross-session continuity tracking**: 17 cross-zone hooks (CZ-A through CZ-Q) explicitly threaded across sessions, each marked resolved/partial/owner-call in the synthesis
- **Process-level inconsistencies**: e.g., the F7_SMOKE_TEST_RUNBOOK missing GRANT step (only catchable by reading the runbook + comparing against a later bug-hunt) was not surfaced by AuditV2
- **Convention-level findings**: NEXT_SESSION_PROMPT archival, session-log naming consistency, byte-identical mockup duplicate

**AuditV2 strengths:**
- **DB-side findings** AuditV1's read-only doc scope can't reach (C1, C2, C6, U17, multiple wave3 spot-checks)
- **Active refutation** of older audit claims via live verification (6 claims refuted)
- **Broader breadth** in single sitting — 19 zones + 11 cross-cutting + DB queries
- **Live-state tiebreaker** ("code wins, then DB, then most-recent doc") catches the doc-vs-reality drift more directly

---

## 8. Where both are blind

Both audits failed to:
- Run the actual `scripts/check-admin-routes.js` against current code (Session 8 / 5 noted the script exists but wasn't wired into CI; neither audit re-ran the 75/87 route compliance audit end-to-end)
- Click-through verify any UI flow — both are static analysis only
- Verify Vercel env vars / dashboard settings (per the no-visibility memory rule, both audits flag "needs owner check" for AdSense, Apple Console, Stripe team membership)
- Test any end-to-end production behavior

Both are static-analysis audits, not integration tests.

---

## 9. Net assessment

The two audits are highly correlated (~55 finding pairs out of ~67 confident-bucket items in AuditV1 and ~46 entries in AuditV2's confirmed-stale + confirmed-conflict tables). Where they disagree, it's almost always framing/granularity, not facts.

The complementary parts are real:
- AuditV2's DB-state findings (cleanup_rate_limit_events column, superadmin RPC bodies, settings DB-coverage map, refutation of stale audit claims) are unreachable from AuditV1's scope
- AuditV1's process-level findings (REVIEW.md not annotated, ADMIN_VERIFIED_RECONCILE undone same day, NEW_TREE_STRUCTURE empty, byte-identical mockup, F7_SMOKE_TEST_RUNBOOK missing step) are not in AuditV2's output

A merged work plan that takes AuditV1's process findings + AuditV2's DB-state findings + the corroborated overlap captures more of the real cleanup surface than either alone.

Per owner direction "they are both separate things" — keeping them separate as parallel records of the same project state at the same moment, with each carrying its own action plan, is intentional. Either audit's §5 priority list is sufficient as a starting point; the other adds delta items.

---

## 10. Documents

- **AuditV1**: `AuditV1/00-README.md` index + 10 session overlap maps (`01-` through `10-`) + `99-final-synthesis.md` + this comparison
- **AuditV2**: `AuditV2.md` (28KB synthesis at repo root) + `AuditV2/wave1/Z01-Z19_*.md` + `AuditV2/wave2/W2-01-11_*.md` + `AuditV2/wave3/W3_verification_summary.md`
