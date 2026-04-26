# Zone Z03: Audit_2026-04-24/ (top-level)

## Summary

Top-level zone of `Current Projects/Audit_2026-04-24/` is a multi-phase audit
sandbox dispatched on 2026-04-24 against anchor SHA
`ed4944ed40b865e6daf7fcea065630988a00e9b8`. The flow was: 84 wave-A/wave-B
domain agents → 14 reconciler files (9 of which live in this top-level zone)
→ aggregate `MASTER_FIX_LIST_2026-04-24.md` (71 confirmed items, C1-C28 +
H1-H27 + M1-M17) → `OWNER_ACTIONS_2026-04-24.md` (15 design items + 8 infra)
→ `OWNER_TODO_2026-04-24.md` (TODO-1..9) → `QUESTIONABLE_ITEMS_2026-04-24.md`
(7 Q-SOLO, 4 Q-CON contradictions, 5 Q-ENV) → `Q_SOLO_VERIFICATION.md` (3
STALE / 2 CONFIRMED) → `PHASE_8_VERIFICATION_2026-04-24.md` (65 PASS / 5 FAIL
/ 1 UNCLEAR; 3 regressions fixed in commit `07c9d29` Batch 26).

A second, independent stream re-graded the original external audit:
`review external audit` (3536-line dump, ~260 findings, sections A through CCC),
`review external audit-review` (BS-detection pass, ~85% REAL / 5% BS / 10%
PARTIAL-or-STALE), `EXT_AUDIT_TRIAGE_2026-04-24.md` (Buckets 1-5),
`EXT_AUDIT_BUCKET5_TRACKER.md` (Batches 28-35 shipped, ~50 IDs closed),
`EXT_AUDIT_FINAL_PLAN.md` (Tier A-F + Batches 36-39 = launch close-out).
`C26_RLS_CLASSIFICATION_DRAFT.md` and `RLS_14_CLASSIFICATION.md` are the
working artifacts for the C.26 / GG.3 RLS-policy gap; owner sign-off pending.

The two streams are largely consistent but produced overlapping / parallel
fix queues — the MASTER_FIX_LIST (Cn/Hn/Mn IDs) is the internal-audit
canonical aggregator; the EXT_AUDIT_* docs use the external audit's letter
IDs (A.* through CCC.*). Neither is fully retired.

## Files

### `_AGENT_BRIEFING.md`
- Purpose: shared briefing for all 84 domain auditors (waves A and B).
- Topics: scope, read-only constraints, output format, finding-ID convention
  (`F-[GROUP][AGENT][nn]`), severity tiers, ≤1500 words / 15 min budget.
- Anchor: `_ANCHOR_SHA.txt` reference.
- Status: artifact-of-record; not updated post-audit.

### `_ANCHOR_SHA.txt`
- Anchor SHA `ed4944ed40b865e6daf7fcea065630988a00e9b8`, dispatched
  2026-04-24T13:03:54Z. Two-line file.

### `_RECONCILER_BRIEFING.md`
- Purpose: briefing for the 14 phase-4 reconcilers.
- Output spec: `Recon_GroupN_NAME.md` with AGREED / UNIQUE-A / UNIQUE-B /
  STALE sections, severity counts, AUTONOMOUS-FIXABLE / OWNER-ACTION /
  UI-NEEDS-INPUT dispositions. ≤2500 words.

### `MASTER_FIX_LIST_2026-04-24.md`
- Canonical aggregator. 71 items: 28 CRITICAL, 27 HIGH, 17 MEDIUM (matches
  PHASE_8 totals once C26 is excluded as deferred).
- C1-C28 cover comments-RLS-status, settings clobber, unblock/data-export
  bypass, story+messages stale closures, bookmarks dedup/PATCH gate, home
  inactive-categories, signup orphans (web+iOS), kid pair-code TOCTOU, kids
  quiz threshold + pre-gate writes + ParentalGate placement, StoreKit
  premature finish, admin audit gaps (roles/billing/moderation), HIERARCHY
  drift, prompt-preset versioning, 4 cron `maxDuration`, 14-table RLS gap,
  reset-rebuild staleness, 3 unauthed endpoints.
- H1-H27 cover verify-email/oauth/RLS-defense-in-depth, search/notifications
  filtering, settings cache invalidation, iOS APNs/PermissionService/StoreKit
  glitches, dual-cache stale-fallthrough, cost-cap TTL, generate finally
  race, send-push concurrency, promo perms-version, admin idempotency, audit
  hygiene, support/conversations rate limits.
- M1-M17 are MEDIUM polish (tsconfig strict, `as any` count, exhaustive-deps,
  plagiarism fallback, xlsx path, ingest dedup, etc.).
- Each item carries file:line evidence + agent-count provenance (e.g. C12
  6/6 unanimous, C2 3/5).

### `OWNER_ACTIONS_2026-04-24.md`
- Two sections: 8 infra/dashboard items (Vercel typo, ex-dev removal,
  pg_cron, Apple Dev, Stripe webhook test, Sentry-deferred, MCP-verify
  migrations 148/120/160, PREVIEW_BYPASS_TOKEN) and 15 design decisions
  (O-DESIGN-01..15). Each design item lists option A/B(/C) + Claude's
  recommendation. Several overlap MASTER_FIX_LIST items.

### `OWNER_TODO_2026-04-24.md`
- Tightened 9-item version of OWNER_ACTIONS infra side: TODO-1 Supabase URL
  typo, TODO-2 ex-dev removal, TODO-3 pg_cron, TODO-4 Apple enrollment,
  TODO-5 Stripe webhook test, TODO-6 migration verification SELECT,
  TODO-7 import-permissions --dry-run, TODO-8 PREVIEW_BYPASS_TOKEN, TODO-9
  Sentry deferred. Bottom of file lists the 34-item Phase 7 implementation
  plan that fires on owner "GO".

### `PHASE_8_VERIFICATION_2026-04-24.md`
- Independent post-ship verification by 5 fresh agents against current code.
- 65 PASS / 5 FAIL / 1 UNCLEAR. 3 genuine regressions (H8 settings cache,
  H11 pair rate-limit, H24 double-audit) fixed in commit `07c9d29` Batch 26.
- C26 + M13 deferred (owner-pending / accepted intentional). M16 cite
  mismatch only.
- Notes audit-ID provenance markers in code (`// C2`, `// H8`) "exemplary";
  lint 158→0; `as any` 94→~10. Calls out 26 ship batches between
  `ed4944e` and `07c9d29`.

### `QUESTIONABLE_ITEMS_2026-04-24.md`
- 4 Wave-A vs Wave-B contradictions (Q-CON-01..04: handlePaymentSucceeded
  bump, billing audit_log scope, coming-soon scope, T0-1 status).
- 7 single-agent CRITICALs needing tiebreak (Q-SOLO-01..07).
- 15 design decisions (cross-ref OWNER_ACTIONS).
- 5 environment-dependent (Q-ENV-01..05: migration state, xlsx sync, dev
  bypass token, pg_cron, dashboard state).
- 5 stale-but-noted (T0-1 fixed in 4a59752, L3-L6/L19 unverified-prod,
  Expert Q&A `#if false`, perm-scope-overrides historical).

### `Q_SOLO_VERIFICATION.md`
- Resolves 5 of the 7 Q-SOLOs against anchor SHA.
- Q-SOLO-02 STALE (requireAdminOutranks present at lines 58, 130).
- Q-SOLO-03 CONFIRMED (permission-set DELETE has no per-affected-user rank
  re-check; route.js:74-133).
- Q-SOLO-04 STALE (merge/split RPCs have FOR UPDATE locks + precondition
  checks).
- Q-SOLO-06 CONFIRMED (generate finally UPDATE silently swallowed; 200 OK
  returned despite DB write failure).
- Q-SOLO-07 STALE (depends on migration 120 being deployed; code right under
  that assumption).
- Q-SOLO-01 + Q-SOLO-05 NOT covered here.

### `RLS_14_CLASSIFICATION.md`
- Field-by-field classification of the 14 RLS-enabled-but-zero-policy tables
  surfaced by F-B12-3-02 / R-12-UB-03.
- 12 USER_ACCESSIBLE (weekly_recap_*, kid_expert_sessions/questions,
  family_achievements*, bookmark_collections, user_warnings,
  comment_context_tags, category_supervisors, expert_queue_items).
- 2 SERVICE_ROLE_ONLY (behavioral_anomalies, sponsored_quizzes — no runtime
  references).
- Methodology: grep `from('table_name')` across .ts/.tsx/.js, classify by
  createClient vs createServiceClient.

### `C26_RLS_CLASSIFICATION_DRAFT.md`
- Owner-locked option (a) per memory `project_locked_decisions_2026-04-25`.
- Drafts `owner-only / read-public / service-role-only / kid-aware-owner`
  posture vocabulary.
- Asks owner to paste output of `pg_class WHERE relrowsecurity AND no
  policies` SELECT so migration `schema/174_ext_audit_rls_14_tables.sql`
  can be written. Pending pasteback.

### `EXT_AUDIT_TRIAGE_2026-04-24.md`
- Routes the external-audit findings into 5 buckets.
  Bucket 1: 6 fixes shipped in commit `e8898a8` (C2, Q.1, M.2, K.6, L.4, F.1).
  Bucket 2: 4 owner-decision items (GG.1, AA.1+YY.C1, T.3, TODO-6+7).
  Bucket 3: 6 Apple-block items (BBB.2-8).
  Bucket 4: posture-deferred (PP.*, RR.*, SS.1, UU.*).
  Bucket 5: ~70 medium-effort follow-ups across A.1..CCC.*.

### `EXT_AUDIT_BUCKET5_TRACKER.md`
- Live tracker for Bucket 5 work: Batches 28-35 detailed, all marked
  shipped except the explicitly-owner-decision / posture-deferred items
  (W.5, F.2/F.3, K.1, L.3, KK.4, AA.3 etc.).
- Batch 35 (8 owner-locked decisions + Apple BBB.* unblock) shipped on
  2026-04-25. C.26 is the only remaining open ticket and is the same item
  as MASTER_FIX_LIST C26.
- Footer "Future batches (queued)" enumerates ~50 IDs still-open at
  Batch 35 close.

### `EXT_AUDIT_FINAL_PLAN.md`
- Most recent doc in the zone (modified 21:15 on 2026-04-24).
- Anchor `5ad6ad4`, migrations 161-174 deployed.
- 28 still-real items grouped Tier A (3 launch gates: GG.3, J.4
  SettingsView URL, C.3 refreshIfStale), Tier B (5 compliance: X.8 export,
  X.7 retention, W.1 keychain, OO.2 CSP, BB.3 ad URL), Tier C (4 SEO/obs:
  SS.2 JSON-LD, SS.4 sitemap-index, Y.2 payload, Y.4 iOS events), Tier D
  (4 iOS polish + W.2 owner-decision), Tier E (8 quality debt accepted),
  Tier F (4 architectural post-launch).
- Batches 36-39 plan to ship Tiers A-D in ~4 sessions. "No more audits.
  Pick a launch date."
- Notes 5 items shipped silently and 5 items the original audit got wrong
  (L.3, U.6, W.7, EE.1, BB.1).

### `Recon_Group6_AdminPerms.md`
- 5 AGREED (3 CRITICAL): role grant/revoke audit gap (3/6), audit-before-
  mutation pattern (2/6), permission-set toggle double-audit (3/6), RPC
  error leakage (2/6), billing freeze/cancel audit gap (1/6).
- 3 UNIQUE-A, 5 UNIQUE-B, 1 STALE (T0-1 confirmed fixed in 4a59752).
- Total 15.

### `Recon_Group7_AdminMod.md`
- 6 AGREED (3 CRITICAL: HIERARCHY drift 2/6, moderation audit gap 3/6,
  penalty buttons no hierarchy gate 2/6; 3 HIGH: enum validation 5/6,
  bulk_resolve naming 2/6, MOD vs ADMIN_ROLES 2/6).
- 5 UNIQUE-A, 5 UNIQUE-B, 1 STALE (supervisor flag false alarm), 1
  clarification.
- Total 18.

### `Recon_Group8_Pipeline.md`
- 6 AGREED (1 CRITICAL prompt-preset versioning 4/6, 2 HIGH cost cache TTL
  3/6 + discovery state race 2/6, 3 MEDIUM plagiarism fallback 3/6, ingest
  dedup 2/6, archive idempotent log 2/6).
- 3 UNIQUE-A, 4 UNIQUE-B, 3 STALE.
- Total 16.

### `Recon_Group9_KidsIOS.md`
- 6 AGREED (2 CRITICAL: quiz threshold 5/5, data-collection pre-gate 3/5;
  4 HIGH: streak dual-source 5/5, bearer token leak 5/5, expert sessions
  no gate 4/5, pair rate-limit IP 3/5).
- 3 UNIQUE-A, 3 UNIQUE-B, 0 STALE. Total 12.

### `Recon_Group10_AdultIOS.md`
- 7 AGREED (2 CRITICAL: signup orphan 3/5, StoreKit sync premature
  finish 3/5; 5 HIGH including APNs token race 4/5, perms cache
  invalidation 3/5, deep-link fallback 3/5, pre-prompt dismiss 2/5,
  Expert Q&A flagged off 3/5).
- 4 UNIQUE-A, 7 UNIQUE-B (incl. registerIfPermitted never called),
  2 STALE/clarification. Total 20. Notes WaveB Agent1 file missing.

### `Recon_Group11_CronsLib.md`
- 4 AGREED (1 CRITICAL: 4 cron routes missing maxDuration; 3 HIGH:
  send-push allSettled, CONCURRENCY=50 pool, permissions dual-cache
  stale-fallthrough).
- 7 UNIQUE-A, 6 UNIQUE-B, 0 STALE. Total 17.

### `Recon_Group12_DB.md`
- 8 AGREED (2 CRITICAL: RLS gaps 35-49 tables, reset_and_rebuild_v2.sql
  55-mig stale; 5 HIGH: xlsx-on-Desktop, env handling, role→set drift,
  perms_global_version no RLS, promo-redeem perms-bump gap; 1 MEDIUM:
  permission_scope_overrides historical).
- 2 UNIQUE-A, 3 UNIQUE-B (including the 14-table RLS list that becomes
  RLS_14_CLASSIFICATION.md and C26).
- Total 13.

### `Recon_Group14_RoleMatrix.md`
- 6 AGREED (1 CRITICAL: admin mutations missing audit; 2 HIGH: support
  uses requireAuth instead of permission, missing rate limits on
  bookmark-collections + conversations; 3 MEDIUM: frozen MOD/ADMIN_ROLES,
  cron shared secret, client-side permission checks).
- 3 UNIQUE-A, 7 UNIQUE-B (incl. role-vs-plan-tier briefing-scope mismatch
  flagged CRITICAL), 2 clarifications/stale.
- Total 18.

### `review external audit`
- 3536-line external-agent dump, anchor `ed4944e`. Sections A through CCC
  cover ~260 findings including: partial gating (A1-A3), dual sources of
  truth (B1-B3), cache drift (C1-C3), swallowed RPCs (D1-D3), hardcoded
  config (E1-E4), UX dead ends (F1-F3), cross-surface UI parity (I.1-I.6),
  profile/settings deep audit (J.1-J.5), admin UI (K.1-K.9), admin API
  (L.1-L.5), auth (M.1-M.12), reader (O.1-O.9), messages (P.1-P.2), billing
  (Q.1-Q.11), cron (S.1-S.4), schema (T.1-T.6), pipeline (U.1-U.7), Kids
  iOS (W.1-W.19), data lifecycle (X.1-X.16), events (Y.1-Y.12), onboarding
  (AA.1-AA.7), ads (BB.1-BB.9), social graph (CC.1-CC.15), adult iOS
  (EE.1-EE.12), reports/moderation (FF.1-FF.11), RLS (GG.1-GG.11), storage
  (II.1-II.13), components (JJ.1-JJ.15), feeds (KK.1-KK.15), email
  (LL.1-LL.10), a11y (NN.1-NN.8), CSP (OO.1-OO.5), perf (PP.1-PP.12),
  observability (RR.1-RR.11), i18n/SEO (SS.1-SS.12), infra (UU.1-UU.12),
  webhooks (WW.1-WW.8), newsroom/support/access-request (YY.A1-YY.D),
  settings/flags/scoring (AAA.1-AAA.10), iOS compliance (BBB.1-BBB.11),
  triggers/roles/limits (CCC.1-CCC.9). Footer DDD priority roll-up.
- File ends with agent boilerplate (commit/push plan to a non-existent
  `claude/review-files-c8HQu` branch + chat back-and-forth) — last ~25 lines
  are conversational artifacts not findings.
- Status: source document for the entire EXT_AUDIT_* track.

### `review external audit-review`
- 387-line BS-detection pass against the above. Anchor `e27a00c`.
- Per-section ledger marks each claim REAL/BS/STALE/PARTIAL/UNVERIFIED.
- Identifies BS: K.2 (audit said 6 admin pages no gate; all 6 have gates),
  RR.1 (claimed 3 of 216 routes Sentry; agent found 100), BBB.1 (claimed
  Info.plist missing; file exists), BB.2 (`log_ad_impression` not in
  schema/110 — fabricated), FF.2 (table is `reports` not `comment_reports`).
- STALE: AAA.9 (rate limit already there), Y.11 (schema/108 applied per
  types).
- Top-priority where-to-look-first list (10 items) ends with GG.1, T.3,
  A2+F1, BBB.1+BBB.2+BBB.8, C2+L1+M.2+M.3, W.7+W.8, Q.1+Q.2, S.1, CC.7,
  AA.1+YY.C1.
- Status: BS-pass output; feeds EXT_AUDIT_TRIAGE.

## Recon_Group ↔ MASTER_FIX_LIST mapping

| Recon group | MASTER_FIX_LIST items it feeds |
|---|---|
| Group 1 (Auth, files in zone but not the recon — recon not in this zone) | C12 signup orphan, C13 kid pair TOCTOU, H1, H2 |
| Group 2 (Reader, recon not in this zone) | C9 bookmarks dedup, C10 PATCH gate, C11 home inactive cats, H5 |
| Group 3 (Comments, recon not in this zone) | C1 status mismatch, H3, H4, H22 |
| Group 4 (Settings, recon not in this zone) | C2 metadata clobber, C3 unblock bypass, C4 export bypass, H8 |
| Group 5 (Billing, recon not in this zone) | (Q-CON-01 perms-bump, H20 promo) |
| **Group 6 AdminPerms (this zone)** | **C19 role audit, C20 billing audit, H23 RPC error leak, H24 double audit, M9 client-side audit, M10 audit oldValue** |
| **Group 7 AdminMod (this zone)** | **C21 4-route mod audit, C22 HIERARCHY drift, C23 penalty buttons, H25 enum validation, M8 MOD/ADMIN_ROLES** |
| **Group 8 Pipeline (this zone)** | **C24 prompt-preset versioning, H17 cost-cap TTL, H18 finally-block race, M4 plagiarism fallback, M6 ingest dedup, M7 cluster archive log** |
| **Group 9 KidsIOS (this zone)** | **C13 pair-code TOCTOU, C14 quiz threshold, C15 data pre-gate, C16 expert sessions gate, H9 bearer leak, H10 streak persistence, H11 pair-code rate-limit** |
| **Group 10 AdultIOS (this zone)** | **C17 signup orphan iOS, C18 StoreKit, H12 APNs not called, H13 perms cache, H14 pre-prompt dismiss** |
| **Group 11 CronsLib (this zone)** | **C25 4 cron maxDuration, H15 send-push allSettled, H16 dual-cache stale, H19 CONCURRENCY=50, M12 pipeline-cleanup, M13 cursor race** |
| **Group 12 DB (this zone)** | **C26 14-table RLS, C27 reset_and_rebuild_v2 stale, H20 promo perms-bump, M5 xlsx hardcoded** |
| Group 13 (UI Smoke, recon not in this zone) | C5 story stale closure, C6 messages 5 hooks, C7 admin numeric edits, C8 messages stale loadMessages, M3 hook deps |
| **Group 14 RoleMatrix (this zone)** | **C28 unauthed endpoints, H6 search filters, H7 notifications gate, H21 admin client-gate, H26 support/public, H27 conversations rate limit** |

`MASTER_FIX_LIST` cleanly numbers across groups — every C*/H*/M* maps back
to at least one R-N-AGR finding, and ID provenance is preserved in the
PHASE_8 verification's "audit-ID provenance markers in code are exemplary"
note (each shipped fix carries a `// C2` / `// H8` comment).

## Owner-action vs in-progress vs already-shipped breakdown

**Already-shipped (verified in PHASE_8):** 65 of 71 master items (C1-C25,
C27-C28, H1-H10, H12-H23, H25-H27, M1-M12, M14-M17). Plus EXT_AUDIT
Batches 28-35 closing ~45 letter-ID items (C2 surgical, K.3, K.5, B.3,
W.8, CC.1/CC.7, NN.*, LL.*, X.5, AAA.4, KK.1, GG.2, GG.1, AA.1, M.8, etc.).

**Regression-fixed in commit 07c9d29:** H8 (5 settings paths), H11 (kid
pair device-fingerprint rate limit), H24 (3 client-side audit RPCs).

**Still-in-progress / pending owner:**
- C26: 14-table RLS — owner pasteback of `pg_class` query needed; draft
  ready in `C26_RLS_CLASSIFICATION_DRAFT.md`. Owner-locked option (a).
- M13: check-user-achievements cursor race — accepted intentional.
- All 15 O-DESIGN-* items (some mapped into Phase 7 GO list).
- 8 OWNER_TODO items (especially TODO-1 Vercel typo, TODO-2 ex-dev
  removal — both URGENT, owner-only).
- TIER A/B/C/D items in `EXT_AUDIT_FINAL_PLAN.md` (Batches 36-39, ~5 hrs of
  work to ship, plus W.2 pair-code TTL parked for owner).

**Already-shipped silently per FINAL_PLAN re-verification:** A.2
(security-critical layer), X.1 (bookmarks UNIQUE constraint).

**Audit got wrong (per FINAL_PLAN re-verification):** L.3 hallucinated
permission key; U.6 no-DELETE deliberate; W.7 4 callers exist; EE.1 Swift
`static let` is race-safe; BB.1 mechanism claim wrong.

## Within-zone duplicates / overlap

- **Same item appears under multiple IDs across the two streams:**
  - GG.3 / C26 / R-12-UB-03 = the 14-table RLS gap. EXT_AUDIT calls it
    GG.3 (and "permission-set tables `USING (true)`" which is actually a
    different finding); MASTER_FIX_LIST calls it C26; reconciliation
    calls it R-12-UB-03. C26_RLS_CLASSIFICATION_DRAFT and
    RLS_14_CLASSIFICATION are two different artifacts on the same fix.
  - C28 (unauthed endpoints) = R-14-UB-02 + R-14-UB-03 + R-14-UB-05 +
    BBB-track via O-DESIGN-12.
  - Permissions dual-cache (H16) = R-11-AGR-04 = "C.3 refreshIfStale"
    in EXT_AUDIT_FINAL_PLAN.
  - Q-CON-02 billing audit_log = O-DESIGN-08 = R-14-UB-04 = batch-33
    closure of D.1+D.2+Q.2.

- **OWNER_ACTIONS vs OWNER_TODO:** OWNER_TODO is the 9-item tightened
  version; OWNER_ACTIONS includes those plus the 15 design decisions.
  TODOs 1-9 ⊂ O-INFRA-01..08 (with Sentry split into TODO-9). No
  contradictions, just two views.

- **EXT_AUDIT_TRIAGE Bucket 1 (commit `e8898a8`) overlaps MASTER_FIX_LIST
  C2 + H1-adjacent**: same fixes, different IDs. Not duplicated work,
  just twin tracking.

- **Q-CON-01 (handlePaymentSucceeded perms-bump)** appears as Q-CON-01,
  Q-SOLO-01, and is referenced in OWNER_TODO Phase-7 GO item #27. Same
  finding, three IDs.

## Within-zone obvious staleness

- `C26_RLS_CLASSIFICATION_DRAFT.md` says "owner: paste SQL result" — that
  pasteback was never integrated; `RLS_14_CLASSIFICATION.md` already has
  the names from grep methodology. The DRAFT is awaiting an owner step
  that the sibling file partially obviates.
- `OWNER_ACTIONS_2026-04-24.md` § O-INFRA-07 references migrations 148
  (B1/B3/B6) and 120 (pipeline retry) — `EXT_AUDIT_FINAL_PLAN.md` anchor
  is `5ad6ad4` and notes migrations 161-174 deployed, so 148/120 are live.
  TODO-6 still asks for the pasteback — superseded.
- `Q_SOLO_VERIFICATION.md` covers 5 of the 7 Q-SOLOs; Q-SOLO-01 and
  Q-SOLO-05 are unresolved per that file. Q-SOLO-01 was closed by
  Bucket-5 Batch 33 (O.7 / D.1 sweep + handlePaymentSucceeded would be
  in the perms-bump audit) but the verification doc never updated.
- `review external audit` ends with chat dialogue ("Got it — leaving the
  artifact alone") — clear agent-output artifact, not findings.
- The "Future batches (queued)" list at the bottom of
  `EXT_AUDIT_BUCKET5_TRACKER.md` is partially stale: batches 28-35 close
  many of the listed IDs (CC.1, CC.7, E.2, NN.1, NN.3, JJ.1, JJ.2, AA.1,
  GG.1, M.8, KK.1, etc.) but those IDs still appear in the queued list.
- `MASTER_FIX_LIST_2026-04-24.md` references migration `159` (claim_push_batch)
  in S.1; OWNER_TODO Phase-7 GO list includes "27. handlePaymentSucceeded
  → add bump_user_perms_version" — this is Q-CON-01 / Q-SOLO-01, not
  separately resolved in this zone's verification docs.
- `_AGENT_BRIEFING.md` cites `Current Projects/PM_PUNCHLIST_2026-04-24.md`
  for context — file exists per CLAUDE.md but isn't in this zone; need to
  confirm whether it's still current.

## Notable claims worth verifying in later waves

1. **C26 / GG.3 RLS gap status.** Whether migrations 173 / 174 closed all
   14 tables. EXT_AUDIT_BUCKET5_TRACKER says GG.1 shipped via 173 and
   C.26 is the only "draft" remaining. RLS_14_CLASSIFICATION classifies
   the tables but no migration is recorded as shipped for the full set.
2. **Migration 120 (`error_type` column) deployment state.** Q-SOLO-07
   marked STALE under the assumption that 120 is live; OWNER_TODO still
   asks for verification (TODO-6).
3. **C26 vs GG.3 conflation.** EXT_AUDIT calls "permission_set_perms /
   role_permission_sets / plan_permission_sets `USING (true)`" GG.3, and
   that's distinct from the 14 RLS-no-policies tables (R-12-UB-03).
   `EXT_AUDIT_FINAL_PLAN.md` Tier A1 cites GG.3 for the SELECT(true) gap.
   The two findings have been treated as one on occasion — verify the
   final migration scope.
4. **Q-SOLO-01 (handlePaymentSucceeded bump) actual code state.** The
   most-cross-referenced unresolved CRITICAL in this zone; never directly
   verified in `Q_SOLO_VERIFICATION.md`.
5. **`reset_and_rebuild_v2.sql` regeneration (C27 / R-12-AGR-05).**
   MASTER_FIX_LIST and Phase-8 mark it deferred but the file is still 55+
   migrations stale per audit; FINAL_PLAN does not list it in any of
   batches 36-39. May have been silently dropped from scope.
6. **`bump_global_perms_version` RPC existence** (R-12-UB-01). Recon
   claims it doesn't exist in schema; `import-permissions.js:300-306`
   calls it. Either the script silently falls back, or the RPC was added
   later.
7. **The 5 EXT_AUDIT items the FINAL_PLAN says the original audit "got
   wrong" (L.3 / U.6 / W.7 / EE.1 / BB.1).** L.3 still appears as
   MASTER M-style work; W.7 is referenced in the EXT_AUDIT priority
   roll-up. Worth re-checking which list is right.
8. **C28 unauthed endpoints triage.** O-DESIGN-12 distinguishes per-
   endpoint posture (access-request public+CAPTCHA, kids/generate-pair-code
   auth-required); EXT_AUDIT_BUCKET5_TRACKER batch-35 says AA.1 was
   stripped but `kids/generate-pair-code` post-fix is not separately
   tracked.
9. **WaveB_Group10_AdultIOS_Agent1.md missing.** Recon_Group10 footnote
   says this file was not found; the absent agent's findings are
   unrepresented.
10. **R-7-AGR-01 HIERARCHY drift fix.** C22 in master list, but no
    PHASE_8 verification line item explicitly shows the live HIERARCHY
    came from DB. Worth re-grepping `web/src/app/admin/moderation/page.tsx`.
