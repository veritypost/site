# Session 3 — Audit_2026-04-24/ subfolder, full content audit

**Date:** 2026-04-25
**Files in scope:** ~100 files in `Current Projects/Audit_2026-04-24/` + `Round2/` subfolder.

**Files read end-to-end (28):**
- 12 top-level syntheses + working notes: `MASTER_FIX_LIST_2026-04-24.md` (307), `EXT_AUDIT_FINAL_PLAN.md` (207), `EXT_AUDIT_TRIAGE_2026-04-24.md` (135), `EXT_AUDIT_BUCKET5_TRACKER.md` (144), `QUESTIONABLE_ITEMS_2026-04-24.md` (163), `PHASE_8_VERIFICATION_2026-04-24.md` (49), `RLS_14_CLASSIFICATION.md` (75), `C26_RLS_CLASSIFICATION_DRAFT.md` (43), `Q_SOLO_VERIFICATION.md` (62), `_AGENT_BRIEFING.md` (97), `_RECONCILER_BRIEFING.md` (88), `_ANCHOR_SHA.txt` (2)
- 8 Recon group syntheses: `Recon_Group6_AdminPerms.md`, `Recon_Group7_AdminMod.md`, `Recon_Group8_Pipeline.md`, `Recon_Group9_KidsIOS.md`, `Recon_Group10_AdultIOS.md`, `Recon_Group11_CronsLib.md`, `Recon_Group12_DB.md`, `Recon_Group14_RoleMatrix.md`
- 7 Round 2 lens reports: `L03_quiz_comments`, `L05_settings_deep_walk`, `L06_billing_e2e`, `L07_parent_kids_mgmt`, `L09_admin_mod_operator`, `L10_pipeline_operator`, `L14_security_correctness` + `_LAYER1_BRIEFING` + `_NOTIFICATION_DIGEST`
- 2 extensionless docs: `review external audit` (3,536 lines), `review external audit-review` (387 lines)

**Plus already read in Session 2:** `OWNER_TODO_2026-04-24.md`, `OWNER_ACTIONS_2026-04-24.md`.

**Sampled / not deep-read:** ~80 raw `WaveA_*` / `WaveB_*` agent reports — read only when a synthesis claim looked doubtful. The Recon files cover the same ground at higher confidence.

**Total:** ~12,000+ lines read end-to-end across 28 files.

---

## Audit topology

The 2026-04-24 audit ran in three rounds against three different anchor commits:

| Round | Anchor SHA | What ran | Outputs |
|---|---|---|---|
| Round 1 | `ed4944ed40b865e6daf7fcea065630988a00e9b8` | 84 agents × 14 domain groups + 14 reconcilers | Wave A/B raw + Recon syntheses + MASTER_FIX_LIST + OWNER_ACTIONS + OWNER_TODO + QUESTIONABLE_ITEMS |
| Round 2 | `10b69cb99552fd22f7cebfcb19d1bbc32ae177fe` | 15 lens specialists (cross-cutting, not surface-organized) | 7 lens files on disk + `_NOTIFICATION_DIGEST` for 8 lenses that didn't write |
| Phase 8 verify | post-Batch-26 | 5 agents re-verifying every Round 1 item against actual code | `PHASE_8_VERIFICATION_2026-04-24.md` (65/71 PASS) |
| External + review | not stated | Outside-agent codebase audit + an internal verification pass | `review external audit` (240+ findings) + `review external audit-review` (BS-detection) |
| Post-ship close-out | `5ad6ad4` on main | 3-agent re-verification 2026-04-25 | `EXT_AUDIT_FINAL_PLAN.md` — 28 still-real items, sized into 4 batches |
| Bucket-5 follow-up | rolling | Batches 28–35 | `EXT_AUDIT_BUCKET5_TRACKER.md` (~50+ items shipped) |

Three SHAs in one folder. None of the syntheses explicitly map the anchor evolution; the reader has to infer.

---

## Topic map

### T1. The same critical items appear in multiple docs with different IDs

A single bug surfaces under several IDs depending on which doc you're reading. Examples:

| Bug | Round 1 Recon ID | MASTER_FIX_LIST ID | External-audit ID | Round 2 lens | Status today |
|---|---|---|---|---|---|
| Comments status enum mismatch | (Recon Group 3 — not deep-read) | C1 | A2 + F1 | — | OWNER-ACTION (O-DESIGN-01) — pending owner ruling |
| Admin role grant/revoke missing audit | R-6-AGR-01 | C19 | (covered) | L09-AGR-03 | EXT_AUDIT_BUCKET5_TRACKER: shipped Batch 33 (Q.2) |
| Penalty buttons no hierarchy gating | R-7-AGR-05 | C23 | (Round 1 only) | L09 L2-L09-02 | Open per master list |
| Pipeline cluster lock RPC | R-8-AGR-03 | (cited inline) | YY.A2 | L10 L2-L10-01 | Open: discovery_items state guard missing |
| Kids quiz threshold hardcoded | R-9-AGR-01 | C14 | W.12 | L08-001 in digest | EXT_AUDIT_BUCKET5_TRACKER Batch 35: schema/162 + W.5 lock — done |
| Kids parental gate no callers | R-9-AGR-02 + R-9-AGR-05 | C15 + C16 | W.7 | L08-002 in digest | OWNER-ACTION pending (matches MASTER_TRIAGE K5) |
| StoreKit sync race | R-10-AGR-02 | C18 | (Q deep) | — | Round 1 master list |
| Permissions dual-cache stale | R-11-AGR-04 | H16 | C2 + C3 | — | EXT_AUDIT_BUCKET5_TRACKER: shipped (commit `0493050`) |
| Cron maxDuration missing on 4 routes | R-11-AGR-01 | C25 | (cited) | — | Round 1 fix list — partial; per-route ship status varies |
| reset_and_rebuild_v2.sql stale | R-12-AGR-05 | C27 | T.1 | — | OWNER-ACTION |
| 14 RLS-no-policies tables | R-12-UB-03 | C26 | GG.3 (related) | — | OWNER-ACTION (RLS_14_CLASSIFICATION + C26_DRAFT) |
| follows_select OR true | (not in MASTER) | (not in MASTER — pure external find) | GG.1 | — | EXT_AUDIT_BUCKET5_TRACKER Batch 35: schema/173 — shipped |
| persist_generated_article rollback risk | (not in MASTER) | (not in MASTER) | T.3 | — | EXT_AUDIT_TRIAGE Bucket 2 → owner SQL verified exists → BUCKET5_TRACKER Batch 35: closed |
| 137/139 policy keys not seeded | (Recon Group 11/14 partial) | (M list) | CCC.3 | — | Open |

**Verdict:** there's no single ID space. Cross-referencing requires reading multiple docs to know whether any given finding has shipped.

### T2. Master Fix List vs External Audit — coverage overlap

- **MASTER_FIX_LIST_2026-04-24.md** = 27 CRITICAL + 27 HIGH + 17 MEDIUM = **71 items**, all from internal Wave A/B agents.
- **review external audit** = 240+ findings across sections A through DDD covering ~35 surfaces.
- **Overlap** is real but partial. External audit found things internal didn't (e.g., GG.1 follows graph, T.3 RPC rollback, BBB.* iOS Info.plist gaps); internal found things external didn't (e.g., C7 admin numeric blur-only, C9 bookmarks duplicates).
- **External audit-review** verified ~85% REAL / ~5% BS / ~10% PARTIAL/STALE — meaning ~17 of 240 external findings are wrong on the file:line evidence.
- The two audit threads were authored independently and weren't merged. Both are still in the repo with no master cross-index.

### T3. Hallucinations / wrong findings caught by review pass

`review external audit-review` (the BS-detection pass) explicitly invalidated several "Critical" external findings:

- **K.2 (BS)** — claimed 6 admin pages have NO client-side permission gate. Re-verification: all 6 have gates (different idiom, but present).
- **BB.2 (BS)** — claimed `log_ad_impression` RPC in schema/110 enforces budget caps. Re-verification: function isn't in schema/110 at all — either hallucinated or misattributed.
- **BBB.1 (STALE, labeled CRITICAL)** — claimed VerityPostKids has no Info.plist. Re-verification: file exists. *Contents* may still miss Kids-Category keys; file-existence claim was wrong.
- **FF.2 (BS)** — referenced `comment_reports` table; actual is `reports`. Drift in the audit itself.
- **AAA.9 (BS / STALE)** — claimed settings PATCH has no rate limit. Verification: `checkRateLimit` at line 59-70.
- **Y.11 (STALE)** — claimed schema/108 may not be applied. Re-verified: events appears in `types/database.ts` (types regenerate only post-apply).
- **L.3 (BS)** in BUCKET5_TRACKER Batch 33 — original audit claim about a permission key was hallucinated.
- **U.6 (BS)** — original claim that "no DELETE was deliberate" was wrong.
- **W.7 ("4 callers exist")** in BUCKET5 — caller count was wrong.
- **EE.1** — Swift `static let` race claim wrong (Swift language guarantees thread-safety).
- **BB.1** — mechanism claim wrong (gate is on `_user_tier_or_anon`, not `stripe_customer_id`).
- **RR.1 (severity wrong)** — claimed ~3 of 216 routes emit Sentry; actual is 100. Severe undercount.

The review pass is a real defense-in-depth artifact and matters for trust. **At least 12 hallucinations or material errors were caught in the external audit alone.** Any reader who trusts the external audit at face value will chase ghosts.

### T4. Internal contradictions inside the audit folder

- **C26 — two docs with two different positions:**
  - `RLS_14_CLASSIFICATION.md` (75 lines) lists the 14 tables explicitly with per-table classification (12 USER_ACCESSIBLE + 2 SERVICE_ROLE_ONLY).
  - `C26_RLS_CLASSIFICATION_DRAFT.md` (43 lines) says "The audit didn't enumerate which 14 — let me actually look them up. Owner: please run this query and paste the result so the classifier sees the real list."
  - Two docs in the same folder, one solving the problem, one claiming the problem isn't solved. C26_DRAFT must be older or the author didn't see RLS_14_CLASSIFICATION.

- **MASTER_FIX_LIST_2026-04-24 vs PHASE_8_VERIFICATION_2026-04-24:**
  - MASTER_FIX_LIST presents 71 items as if all open at compile time.
  - PHASE_8_VERIFICATION (49 lines) reports 65/71 PASS, 5 FAIL, 1 UNCLEAR — meaning by the verify pass, most master-list items had shipped.
  - Reader hitting MASTER_FIX_LIST first may not know it's mostly closed.

- **EXT_AUDIT_TRIAGE Bucket 5 vs EXT_AUDIT_BUCKET5_TRACKER:**
  - TRIAGE lists ~80 deferred medium-effort follow-ups.
  - TRACKER documents Batches 28–35 closing many of them.
  - Both alive. Reader has to cross-reference per item to know status.

- **EXT_AUDIT_FINAL_PLAN vs EXT_AUDIT_BUCKET5_TRACKER overlap:**
  - FINAL_PLAN (post-ship at SHA `5ad6ad4`) lists 28 still-real items in 4 batches (36-39).
  - TRACKER batches 28-35 (pre-FINAL_PLAN) closed many items already.
  - FINAL_PLAN says "Items already shipped silently (caught by re-verification): A.2 ... X.1 ..." — confirms re-verify shrank the list.
  - But TRACKER has its own "future batches (queued)" list at lines 110-145 with ~80 items. FINAL_PLAN scope (4 batches, 5 hours) doesn't reconcile with TRACKER's 80-item queue.

- **OWNER_ACTIONS vs OWNER_TODO** (from Session 2): not duplicates, complementary lists. Sub-confirmed by Q_SOLO_VERIFICATION cross-references.

- **EXT_AUDIT_TRIAGE Bucket 1 ("Shipped this session"):** lists 6 items shipped at `e8898a8`. None of these IDs (C2, Q.1, M.2, K.6, L.4, F.1) appear in the MASTER_FIX_LIST C-tier list. They're external-audit IDs that map to MASTER_FIX_LIST H8/M-equivalents — but the mapping isn't documented.

### T5. The "review external audit" was authored outside this filesystem

Lines 3527-3536 of `review external audit` show the file ends with conversational meta-content:

> "And don't work on anything"
> "Got it — leaving the artifact alone. It stays at /root/.claude/plans/i-don-t-want-you-scalable-octopus.md, no further edits."

The artifact was authored by an external agent in `/root/.claude/plans/` and `/home/user/site/` — paths that don't exist on this filesystem. It was then copied into the repo. The execution-plan section at lines 3512-3523 is also boilerplate from that other agent's working session, not project-internal. The `review external audit-review` correctly flags this in its meta observation: "treat as 'what a thorough outsider would say after two days in your code' — useful as a second read, not as your backlog."

**Implication:** the external audit's findings should be cross-checked against internal findings before being treated as authoritative. The review pass already did some of that work; an end-state cleanup should keep the verified findings and drop the conversational tail.

### T6. Round 2 lenses — half wrote files, half didn't

- 7 lens reports on disk: L03, L05, L06, L07, L09, L10, L14.
- 8 lens reports captured only as paraphrased summaries in `_NOTIFICATION_DIGEST.md` because those agents didn't run the Write tool: L01, L02, L04, L08, L11, L12, L13, L15.
- The digest acknowledges this and flags it: "If a finding needs deeper triage, re-run that specific lens with explicit Write-to-disk enforcement."
- **Result:** the Round 2 layer is uneven. Half the lenses have full file:line audit reports; half have ~10-line summaries with weaker provenance.

### T7. Wave A vs Wave B disagreement patterns (from QUESTIONABLE_ITEMS)

`QUESTIONABLE_ITEMS_2026-04-24.md` documents 4 direct Wave A vs Wave B contradictions:

- **Q-CON-01:** Billing B1 — Wave A says fully closed by migration 148; Wave B Agent 2 says `handlePaymentSucceeded` still missing perms bump. **Resolved by reading code directly** — Wave B was right at SHA `ed4944e`; later closed by EXT_AUDIT_BUCKET5_TRACKER Batch 33.
- **Q-CON-02:** Billing audit_log coverage — Wave A says present; Wave B says iOS + admin paths skip. **Resolved as policy call** — became OWNER_ACTIONS O-DESIGN-08, then shipped per BUCKET5_TRACKER.
- **Q-CON-03:** Coming-soon wall scope — Wave A says blocks /signup/login/verify-email; reviewer disagreed; needs browser test. **Owner-pending verification** — listed in OWNER_ACTIONS O-DESIGN-03 with the specific ask to "visit /signup in incognito."
- **Q-CON-04:** T0-1 DELETE /roles crash — MASTER_TRIAGE flagged it; Wave B + agents say already fixed in commit `4a59752`. **Q_SOLO_VERIFICATION.md confirms** the fix is present (line 9-13). MASTER_TRIAGE Tier 0 #1 is therefore stale — never updated to mark closed.

### T8. Cross-doc agreement points (where multiple sources converge)

When 3+ docs agree, confidence is high:

- **Permissions dual-cache stale-fallthrough on revoke** — Round 1 H16 + Round 1 R-11-AGR-04 + external C2/C3 + multiple lens mentions. Closed by Bucket 5 commit `0493050`.
- **`/api/access-request`, `/api/support/public`, `/api/kids/generate-pair-code` unauthenticated** — Round 1 C28 + R-14-UB-02/03/05 + external AA.1 + YY.C1 + KK side notes. Pending owner direction.
- **`reset_and_rebuild_v2.sql` is stale** — Round 1 C27 + R-12-AGR-05 + external T.1 + multiple supporting cites. OWNER-ACTION.
- **Discovery items state race** in pipeline finally vs cancel — Round 1 H18 + R-8-AGR-03 + L10 L2-L10-01 + external YY.A4. Open.
- **Cost cap cache TTL too long (60s)** — Round 1 H17 + R-8-AGR-02 + L10 L2-L10-05 + external U.1. Open.
- **iOS perms not refreshed on app foreground** — R-10-AGR-04 + external J.4 + EXT_AUDIT_FINAL_PLAN D1. Open (Batch 39 D1).
- **Kids ParentalGateModal ~zero callers** — R-9-AGR-02/05 + external W.7 + L08 in digest + MASTER_TRIAGE K5. Pending owner.

### T9. Cross-zone hooks — Audit_2026-04-24 vs Sessions 1+2

- **CSP enforcement state** — external OO.1 confirms Report-Only at middleware:188. Lines up with Session 1 I-2 + Session 2 T7 (PM_PUNCHLIST). Three audits agree — strong evidence CLAUDE.md "(enforce)" wording is wrong.
- **`@admin-verified` markers** — external audit doesn't reference them (suggesting they were already gone in the external author's view). Aligns with memory `feedback_admin_marker_dropped` (2026-04-23). Reference/README + FEATURE_LEDGER are stale.
- **`tsconfig.json: strict: false`** — external UU.1 confirms strict is false. PM_PUNCHLIST claim from Session 2 was right; my earlier web-config audit (which said strict: true) was wrong. **Verified resolution to Session 2 I-13.**
- **MASTER_TRIAGE Tier 0 #1 (DELETE /roles handler crash)** — Session 2 I-14 flagged this as "documented bug without SHIPPED marker." Q_SOLO_VERIFICATION.md confirms it's actually fixed in `4a59752`. **MASTER_TRIAGE entry is stale**, not a real open bug.
- **MASTER_TRIAGE B1 (Stripe webhook perms_version)** — Session 2 I-14 flagged unmarked. EXT_AUDIT_TRIAGE Bucket 1 confirms shipped via `e8898a8` C2 / Q.1 cluster. **MASTER_TRIAGE entry is stale**.
- **F7 / pipeline workflow** — external audit U section + L10 lens line up with Session 2 F7 doc analysis. The U.5 finding ("prompt overrides aren't versioned") is the same as F7-DECISIONS-LOCKED's known C24 (preset versioning absent).

### T10. The audit folder's evolution timeline

The folder is a layered archive of three audit threads, each running against a moving codebase. Reading it cold without the timeline is hard:

| Date | Event | Doc |
|---|---|---|
| 2026-04-24 | Round 1 dispatched at SHA `ed4944e` | `_AGENT_BRIEFING.md`, `_ANCHOR_SHA.txt` |
| 2026-04-24 | Wave A/B + Recon syntheses written | `WaveA_*`, `WaveB_*`, `Recon_*` |
| 2026-04-24 | MASTER_FIX_LIST + OWNER_TODO + OWNER_ACTIONS + QUESTIONABLE_ITEMS synthesized | (top-level files) |
| 2026-04-24 | External audit dropped (authored elsewhere) | `review external audit` |
| 2026-04-24 | External audit BS-detection ran | `review external audit-review` |
| 2026-04-24 | EXT_AUDIT_TRIAGE produced | `EXT_AUDIT_TRIAGE_2026-04-24.md` (Bucket 1 shipped at `e8898a8`) |
| 2026-04-24 | Round 2 lens specialists ran at SHA `10b69cb` | `Round2/L*.md`, `_NOTIFICATION_DIGEST.md` |
| 2026-04-24 → 2026-04-25 | Bucket 5 work shipped in 8+ batches | `EXT_AUDIT_BUCKET5_TRACKER.md` (Batches 28-35) |
| 2026-04-24 (post-ship) | Phase 8 verification | `PHASE_8_VERIFICATION_2026-04-24.md` (65/71 PASS) |
| 2026-04-25 | Q-SOLO single-agent items verified | `Q_SOLO_VERIFICATION.md` |
| 2026-04-25 | C.26 RLS classification drafted | `C26_RLS_CLASSIFICATION_DRAFT.md` |
| 2026-04-25 | Final close-out plan at SHA `5ad6ad4` | `EXT_AUDIT_FINAL_PLAN.md` (28 items in 4 batches) |
| 2026-04-25 | 8 owner-locked decisions resolved | (per memory `project_locked_decisions_2026-04-25.md`, also embedded in BUCKET5 Batch 35) |

The folder mixes raw inputs (Wave A/B), per-group syntheses (Recon), top-level syntheses (MASTER_FIX_LIST), policy artifacts (OWNER_ACTIONS), classification drafts (C26), execution trackers (BUCKET5), close-out plans (FINAL_PLAN), and verification reports (PHASE_8, Q_SOLO). No README explains the order or the SHA evolution. Every reader has to reconstruct.

---

## Confident bucket — Audit_2026-04-24/ only

1. **`_ANCHOR_SHA.txt` is one anchor among three** in this folder. Add a paragraph to the folder README (or `EXT_AUDIT_FINAL_PLAN.md` header) mapping `ed4944e → 10b69cb → 5ad6ad4` so future readers can follow the audit timeline.
2. **`C26_RLS_CLASSIFICATION_DRAFT.md` is superseded by `RLS_14_CLASSIFICATION.md`** (T4 above). Either consolidate into one doc or strikethrough C26_DRAFT and point at RLS_14.
3. **`MASTER_FIX_LIST_2026-04-24.md` is largely closed** per `PHASE_8_VERIFICATION_2026-04-24.md` (65/71 PASS as of post-Batch-26). Add a "STATUS: this list was the pre-ship synthesis; Phase 8 verification confirms 65/71 closed at anchor `e8898a8`" header so readers don't treat it as live work.
4. **`review external audit` contains conversational meta-content at the end** (lines 3524-3536) from another agent's working session, plus an "Execution plan (on approval)" stanza at lines 3512-3523 that proposes a commit + push to `claude/review-files-c8HQu` branch — irrelevant to this repo. Strip the tail.
5. **`review external audit` should be renamed `review external audit.md`** and `review external audit-review` should become `review external audit-review.md` (already noted in `99.Organized Folder/Proposed Tree`). Without `.md` they don't render in editors and don't sort alphabetically with siblings.
6. **`_NOTIFICATION_DIGEST.md` documents 8 Round 2 lenses that didn't write to disk.** Either re-run those lenses with Write enforcement and replace the digest with full files, or accept the digest as the authoritative summary and mark it canonical. Currently it sits in a half-state.
7. **MASTER_TRIAGE Tier 0 #1 (DELETE /roles crash)** is documented as stale by both `QUESTIONABLE_ITEMS` Q-CON-04 and `Q_SOLO_VERIFICATION.md`. Update MASTER_TRIAGE_2026-04-23.md to mark it closed (reference Session 2 I-14).
8. **MASTER_TRIAGE B1 (Stripe webhook perms_version)** shipped in `e8898a8` per `EXT_AUDIT_TRIAGE.md` Bucket 1. Update MASTER_TRIAGE.
9. **EXT_AUDIT_TRIAGE Bucket 1 is shippped history**, not active scope. Add a SHIPPED header pointing at commit `e8898a8`.
10. **EXT_AUDIT_TRIAGE Bucket 5 + EXT_AUDIT_BUCKET5_TRACKER need cross-reference.** TRACKER is the live execution doc; TRIAGE Bucket 5 is the source list. Either merge or add a "see TRACKER for status" pointer at the top of TRIAGE Bucket 5.
11. **EXT_AUDIT_FINAL_PLAN's "Items already shipped silently"** section (line 205) caught two items (`A.2`, `X.1`) that were closed during the audit window. Add a similar section to MASTER_FIX_LIST listing the 65/71 from PHASE_8.
12. **Raw `WaveA_*` and `WaveB_*` files (~80 files) are pre-synthesis material.** Recon + MASTER_FIX_LIST absorbed them. They're large (some 500+ lines). Per the `99.Organized Folder/Proposed Tree`, move them under `90-raw-waves/`. Keep accessible for source-of-truth disputes; don't surface in normal navigation.
13. **External audit hallucinations** (T3 list above) are documented in `review external audit-review` but the original `review external audit` doc isn't annotated. A reader who only finds the audit (not the review) takes false-positive findings as real. Either annotate the audit inline (`<!-- VERIFIED FALSE per review -->`) or merge the verdicts into a single doc.
14. **External audit "Y.11 / events table may not be applied"** is STALE per review (events appears in `types/database.ts`). Remove from any followup queue.
15. **External audit "BBB.1 / VerityPostKids Info.plist missing"** is STALE per review. The file exists. The actual concern (missing Kids-Category keys) is a different finding and should be documented as such, not as "file missing."

### What can be retired entirely from Audit_2026-04-24/ (subject to owner sign-off)

- **`C26_RLS_CLASSIFICATION_DRAFT.md`** — fully superseded by `RLS_14_CLASSIFICATION.md`. Retire.
- **Conversational tail of `review external audit`** (lines 3512-3536). Retire.
- **Most raw `WaveA_*` and `WaveB_*` reports** — keep as archival in a subfolder; not for normal reading.
- **`_AGENT_BRIEFING.md` + `_RECONCILER_BRIEFING.md`** are process artifacts. Useful for understanding how the audit was structured; not load-bearing for the findings. Move to a `_process/` subfolder with the briefings + anchor SHA.

### What stays as canonical

- **`EXT_AUDIT_FINAL_PLAN.md`** — most recent, post-ship close-out. The actual queue for the remaining work (4 batches, 28 items).
- **`MASTER_FIX_LIST_2026-04-24.md`** — historical synthesis; needs a "65/71 closed by Phase 8" header.
- **`OWNER_ACTIONS_2026-04-24.md` + `OWNER_TODO_2026-04-24.md`** — both needed (proven in Session 2 cross-check).
- **`QUESTIONABLE_ITEMS_2026-04-24.md`** — open-question doc; some items resolved (Q-CON-04 stale, Q-CON-01 closed) — needs status updates per item.
- **`PHASE_8_VERIFICATION_2026-04-24.md`** — proves 65/71 closure. Keep.
- **`EXT_AUDIT_TRIAGE_2026-04-24.md`** — source-list for external audit; bucket 1 is history, bucket 2/3/4/5 are live.
- **`EXT_AUDIT_BUCKET5_TRACKER.md`** — live execution doc for the rolling follow-up batches.
- **`Q_SOLO_VERIFICATION.md`** — verifies single-agent items; concrete conclusions (3 STALE, 2 CONFIRMED). Keep.
- **`RLS_14_CLASSIFICATION.md`** — the actual classification of the 14 tables. Pairs with C.26 owner ruling.
- **8 Recon files** — synthesis layer between raw waves and MASTER_FIX_LIST. Useful for "where did C19 come from" tracing. Keep.
- **7 Round 2 lens files (L03/L05/L06/L07/L09/L10/L14)** — cross-cutting lens audits. Keep.
- **`_NOTIFICATION_DIGEST.md`** — captures 8 lenses that didn't disk-write. Keep until those lenses re-run.
- **`review external audit` + `review external audit-review`** — outside-perspective layer. Keep both, fix tail in audit, rename for `.md` extension.

---

## Inconsistent bucket — Audit_2026-04-24/

### I-18. C26 — RLS_14 vs C26_DRAFT (T4)

Two docs in the same folder with the same scope and incompatible positions. RLS_14 lists the tables; C26_DRAFT says the list isn't known. Owner needs to confirm which doc reflects current intent before any policy migration ships.

### I-19. PHASE_8 65/71 PASS vs MASTER_FIX_LIST appearing live (T1, Confident #3)

PHASE_8 says most master-list items are closed; MASTER_FIX_LIST has no SHIPPED markers. A reader hitting MASTER_FIX_LIST first treats 71 items as open. Either the master list gets per-item SHIPPED blocks (like MASTER_TRIAGE), or it gets a top-level header pointing at PHASE_8.

### I-20. EXT_AUDIT_FINAL_PLAN's 28 items vs EXT_AUDIT_BUCKET5_TRACKER's 50+ shipped (T4)

The two docs both manage the same external-audit follow-up queue but with different scopes. FINAL_PLAN is post-ship close-out (4 batches, 28 items, Tier A-D). TRACKER documents Batches 28-35 already shipped (50+ items). Reader can't tell whether FINAL_PLAN's 28 is the after of TRACKER's shipped work or a different list. Needs a cross-reference.

### I-21. External audit hallucinations not annotated in source (T3, Confident #13)

`review external audit-review` documents 12+ verified-false findings. The original `review external audit` is not annotated. Anyone who reads the original alone treats false-positive findings (K.2, BB.2, BBB.1, FF.2, AAA.9, Y.11, RR.1, etc.) as real. Either annotate inline or merge audit + review into a single doc with verdicts.

### I-22. External audit's outside-author tail (T5, Confident #4)

Lines 3512-3536 are conversational meta from a different agent's working session, not project content. Should not be in a canonical artifact.

### I-23. Round 2 lens half-coverage (T6, Confident #6)

7 lenses on disk + 8 in digest = 15 lenses, but unequal evidence. The 8 digest-only lenses lack file:line citations and individual write-ups. Either re-run with Write enforcement, or accept digest as the only Round 2 record.

### I-24. Wave A vs Wave B unresolved Q-CON-03 (T7)

Coming-soon wall scope (Wave A says blocks /signup; reviewer disagrees) is the only Q-CON not closed. Listed in OWNER_ACTIONS O-DESIGN-03 with the explicit ask: "visit /signup in incognito." Until owner does this or the middleware code is read directly, the audit has an open contradiction with launch-blocking implications.

### I-25. The whole folder needs a README mapping the timeline (T10, Confident #1)

Three SHAs, three audit threads, layered close-out, and ~100 files with no top-level navigation. Without the timeline a fresh reader either reads the wrong doc first or believes the wrong doc.

---

## Open questions deferred to later sessions

- **Round 2 lens re-run policy** — owner ruling: re-run the 8 missing lenses with Write enforcement, or accept the digest?
- **Live DB verification of GG.1 follows_select status** — schema/173 (per BUCKET5 Batch 35) dropped the `OR true`. Need MCP query to confirm in production.
- **Live verification of Tier 0 #1 (`assertActorOutranksTarget` → `requireAdminOutranks`)** — Q_SOLO claims fixed in `4a59752`; needs MASTER_TRIAGE update with that SHA reference.
- **Live verification of access-codes wiring** — per AA.1 + YY.C1, the invite gate was unwired end-to-end. BUCKET5 Batch 35 says `/api/access-request returns 410; access tab restricted to codes only; access_codes management retained for promo use`. Confirm posture matches owner intent.
- **The "Items already shipped silently" pattern** — FINAL_PLAN caught A.2 and X.1. Are there others in MASTER_FIX_LIST that PHASE_8 marked PASS but also shipped silently outside the original tracker? Worth a one-time reconciliation pass.

---

## Cross-zone topics flagged but not yet mapped

These items cross between the audit and other zones and need verification in later sessions:

- **`tsconfig.json: strict: false`** — confirmed by external UU.1, contradicting my own web-config audit. Needs Session 8 (web/) re-read of the actual `web/tsconfig.json`.
- **CSP enforcement** — external OO.1 + Session 2 T7 + Session 1 I-2 all agree on Report-Only. Needs Session 8 (web/src/middleware.js) confirmation.
- **`reset_and_rebuild_v2.sql` staleness** — multiple audits say 55+ migrations stale. Needs Session 7 (schema/) reconcile.
- **`@admin-verified` markers** — external audit doesn't reference them at all (suggesting they were already retired in the audit's view). Needs Session 8 grep across `web/src/app/admin/**`.
- **External audit "Universal Links" + AASA file gap** (BBB.7) — pairs with iOS audit + ROTATIONS Apple-block (Session 1 I-3). Cross-zone with `web/public/.well-known/`.
- **MASTER_FIX_LIST C7 admin numeric blur-only** + L05 L13-002 — both flag the same admin settings persistence bug. Verify per Session 8 admin code read.

---

## Plan for Session 4

`Future Projects/`, `Unconfirmed Projects/`, `Completed Projects/`. Per the earlier folder audit:

- `Future Projects/` — 81 files (24 numbered specs + 8 HTML mockups + supporting docs). Read every numbered spec end-to-end. Check each against current codebase (which features actually shipped, which are still future). The HTML mockups (kinetic edition, etc.) are exploratory; sample but don't deep-read.
- `Unconfirmed Projects/` — 2 files (`UI_IMPROVEMENTS.md`, `product-roadmap.md`). Read both. Cross-check against PRELAUNCH_UI_CHANGE.md (Session 2) and Future Projects.
- `Completed Projects/` — 3 files (`CATEGORY_FIXES.md`, `FINAL_WIRING_LOG.md`, `MIGRATION_PAGE_MAP.md`). Read all three. They claim "complete" — verify which claims are still true.

Estimated work: ~3,000+ lines across ~30 files. One full session.

---

*End of Session 3 findings. Sessions 1+2+3 cumulative: ~3,400 + 4,741 + 12,000+ = ~20,000+ lines read end-to-end. ~70 distinct topics mapped. Pending owner go for Session 4.*
