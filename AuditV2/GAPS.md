# AuditV2 — Gaps and Open Questions

Comprehensive list of what AuditV2 did NOT handle, broken into:
- **Definitely missing** (work that was deferred or skipped — needs to be done)
- **Questionable** (findings I'm less than fully confident in — need fresh-eyes verification)
- **Owner decisions** (need a human to choose, not more verification)

---

## 1. Definitely missing (mechanical work skipped due to time / budget)

### M1. Wave 3 independent verification was compromised
The user's spec required Wave 3 verification agents that "haven't seen any of the previous work." When the org token budget killed the Wave 2 agents partway through, I (the same instance who did Wave 2 cross-reference) also did Wave 3 spot-checks. Same eyes, no fresh-read independence.
**To close:** re-run the 11 W2 findings as fresh-agent verification when the budget resets.

### M2. 47 NOTIFICATION_DIGEST lens findings (Round 2 unwritten lenses) — fully deferred
8 lenses didn't write to disk: L01, L02, L04, L08, L11, L12, L13, L15. Their 47 findings live only in `Current Projects/Audit_2026-04-24/Round2/_NOTIFICATION_DIGEST.md`. Each one needs status classification: shipped / stale / still-open.
**To close:** read NOTIFICATION_DIGEST.md verbatim, walk every finding against current code/DB.

### M3. ~60 of 72 MASTER_TRIAGE SHIPPED claims not verified
I spot-checked ~12. The remaining ~60 SHIPPED blocks were trusted, not independently verified by reading the cited commit + the cited file.
**To close:** for each SHIPPED block: `git show <SHA> -- <files-touched>` + read current file at the cited line, confirm fix is present.

### M4. EXT_AUDIT_FINAL_PLAN open Tiers + 15 O-DESIGN-* items not classified
Listed in W2-11 as deferred. Many likely superseded by `Current Projects/PRELAUNCH_UI_CHANGE.md` (2026-04-25), but the diff was never done.
**To close:** read EXT_AUDIT_FINAL_PLAN.md, read PRELAUNCH_UI_CHANGE.md, classify each item: still-relevant / shipped / superseded.

### M5. F1-F4 vs PRELAUNCH_UI_CHANGE side-by-side scope diff
W2-05 asserts PRELAUNCH supersedes F1-F4 on overlapping scope (PRELAUNCH is more recent), but didn't do the line-by-line diff to mark which F-spec sections die vs survive.
**To close:** open all 4 F-specs + PRELAUNCH side-by-side, annotate each section.

### M6. xlsx ↔ DB row-by-row diff for permissions
The audit asserts `import-permissions.js` may drift xlsx vs DB but never actually compared the 998 DB permission rows + 3,090 permission_set_perms against the xlsx.
**To close:** Python/Node script that reads `permissions.xlsx` and `SELECT *` from the 5 perm tables, diff line by line.

### M7. `tsc --noEmit` + `xcodebuild` never run
AuditV2 cites the 9 truly-open MASTER_TRIAGE bugs as "still in code" based on grep, but didn't compile-verify either project. Could not claim "green build."
**To close:** `cd web && npx tsc --noEmit` and `cd VerityPost && xcodebuild -project ... build` (same for VerityPostKids).

### M8. `git log` cross-validation of SHIPPED commit SHAs
Each SHIPPED block cites a commit SHA; I never verified `git show <SHA>` matches what the SHIPPED block claims.
**To close:** loop through SHIPPED blocks; `git log --oneline` for each cited SHA, confirm commit message + file diff match the claim.

### M9. AuditV1's 4 completed files never read end-to-end
I cherry-picked findings from `AuditV1/01..04` via grep but didn't read each of the 4 maps in full.
**To close:** read AuditV1 fully; pull every finding I missed into AuditV2's confirmed-stale / confirmed-conflict / unresolved buckets.

### M10. MASTER_TRIAGE_2026-04-23.md not read end-to-end
Z02 (Wave 1) summarized the file; I spot-read it during W2-07 but didn't paginate the full 256 lines. Round 3 + Round 4 sub-items weren't enumerated.
**To close:** read all 256 lines; build a complete item-by-item inventory.

### M11. Future Projects/db/*.md 11 individual files not read
Z06 summarized as a zone; per-file content not captured. Specifically:
- `db/00_INDEX.md` (already flagged stale)
- `db/01..11_*.md` — schema-change specs that may overlap or contradict
**To close:** open each, capture purpose + schema-changes-proposed.

### M12. Q_SOLO_VERIFICATION items Q-SOLO-01 + Q-SOLO-05 unresolved
Listed in audit but never resolved against code/DB.
**To close:** read `Current Projects/Audit_2026-04-24/Q_SOLO_VERIFICATION.md`; walk each unresolved item.

### M13. `PROFILE_FULL_FLOW.md` (Z08 promotion candidate) never opened
**To close:** read it; decide whether it goes to `Reference/` or stays in `Archived/`.

### M14. F7 tables ↔ migration 177 SELECT-grant audit — never enumerated
W2-02 + W2-10 deferred. Need to list all F7-era tables and check each for `SELECT` grant on the `authenticated` role.
**To close:** `SELECT tablename, has_table_privilege('authenticated', 'public.'||tablename, 'SELECT') FROM pg_tables WHERE tablename IN (...)`.

### M15. F7-PM-LAUNCH-PROMPT vs F7-DECISIONS-LOCKED full diff
W2-02 listed only the high-level superseded-points; never did the granular diff.
**To close:** read both; produce a marker doc showing every section that drifted.

### M16. `lib/rlsErrorHandler.js` cross-client semantics
W2-01 flagged that this file imports `permissions.js#hasPermissionServer` (uses browser cookie client) while `rlsErrorHandler` is invoked from server route handlers. Possibly wrong client; never traced.
**To close:** read `web/src/lib/rlsErrorHandler.js` end-to-end; identify whether it's invoked in server context with the wrong client.

### M17. permissions.js dual-cache stale-fallthrough trace
Wave A 4 vs 1 dispute resolved as "bug" but never traced through cache logic to confirm the actual failure mode.
**To close:** read `permissions.js` cache code; simulate scenarios where section-cache is stale + full-cache is missing.

### M18. ExpertWatchlistCard concurrency mitigation status
W2-11 noted the comment at `profile/settings/page.tsx:2732` acknowledges concurrent A11yCard / ExpertWatchlistCard saves; never read line 4892 to confirm the clobber-prevention pattern.
**To close:** read both blocks; verify lock or sequence-id pattern.

### M19. F2 reading-receipt UI gate
W2-05 confirmed `reading_log` table is built and used; UI gating not verified — F2 may be code-built but UI-hidden.
**To close:** read `story/[slug]/page.tsx` for any reading-receipt UI render; confirm hide flag.

### M20. F3 earned-chrome perm-vs-plan gating
W2-05 deferred. Need to read `CommentRow` to see whether comment-author chrome differentiation uses `hasPermission` or just plan-tier.
**To close:** read `web/src/components/CommentRow.tsx`.

### M21. Round 2 L03 TOCTOU specifics
Lens reported races in comment edit/delete + quiz attempt-count; never read the lens text or inspected specific routes for the race.
**To close:** read `Current Projects/Audit_2026-04-24/Round2/L03_quiz_comments.md`; verify each cited TOCTOU.

### M22. Round 2 L06 cross-provider duplicate-row repro
Live DB has no duplicate subscription rows; need to determine whether L06-001 was a real repro or theoretical.
**To close:** read `Round2/L06_billing_e2e.md` verbatim.

### M23. Story-page launch-hide enumeration
W2-05 deferred. Need to enumerate every kill-switched UI block in `story/[slug]/page.tsx`.
**To close:** grep for env-flag conditional renders in story page.

### M24. BUCKET5_TRACKER stale "queued" entries sweep
Z03 flagged. Need to walk each "queued" item and verify whether it's in closed Batches 28-35.
**To close:** read `Current Projects/Audit_2026-04-24/EXT_AUDIT_BUCKET5_TRACKER.md` end-to-end.

### M25. `audit_log` (6,456 rows) vs `admin_audit_log` (90 rows) disambiguation
Two audit log tables. AuditV2 noted the existence but never determined the canonical use of each.
**To close:** read schema migrations that define each + read RPC bodies that write to each.

### M26. Storage bucket state for MASTER_TRIAGE #19 (avatar bucket)
W2-07 flagged. Need to verify storage buckets via Supabase MCP (not in default list_tables).
**To close:** `mcp__supabase__execute_sql` against `storage.buckets`.

### M27. `verity_score_events` table existence post 109/111 rollback
Z11 said rolled back; W2-10 deferred verifying. (Recent list_tables I ran did NOT show `verity_score_events`, suggesting rolled back correctly — but never explicitly confirmed.)
**To close:** explicit `\d verity_score_events` or `SELECT to_regclass('public.verity_score_events')`.

### M28. APP_STORE_METADATA.md beyond `site/` paths
The audit cites 5+ stale `site/` paths but didn't audit the document for other staleness (e.g., outdated screenshot file names, retired feature claims, old IAP product IDs).
**To close:** read end-to-end, validate every claim against current state.

### M29. `audit_log` table policies + write-paths inventory
RLS state not enumerated; not all routes that write to `audit_log` were checked for `record_admin_action` consistency. W2-10 listed routes missing `record_admin_action` but didn't enumerate routes that write directly to `audit_log` instead of via the helper.
**To close:** `grep -rn "from('audit_log').insert\|.into('audit_log')"` across web/src.

### M30. `webhook_log` (22 rows) idempotency claim verification
Stripe webhook is asserted idempotent via `webhook_log` claim, but the locking mechanism was not code-verified end-to-end.
**To close:** read the full claim block in `api/stripe/webhook/route.js` lines 88-115.

---

## 2. Questionable findings (lower-confidence claims in AuditV2)

### Q1. C2 — "migrations 092/093/100 missing on disk" severity
I confirmed the files don't exist and the RPCs do live in pg_proc. But I didn't determine whether `100_backfill_admin_rank_rpcs_*.sql` was renumbered or simply lost. The fix recommendation (dump pg_proc bodies → 178) is correct regardless, but the "what happened to the original file" mystery is unresolved.

### Q2. C7 — 127 rollback DELETE perm-key bug severity
Confirmed the bug is real, but didn't analyze whether anyone has actually run the rollback. If never run, severity is "future footgun" not "currently affected."

### Q3. C16-C20 — MASTER_TRIAGE items #6, #7, #8, #9 status
Listed as still-open in W2-07 based on the triage file text. Did NOT independently verify each is still in code (would require reading the 4 cited line ranges). Some may have shipped without their SHIPPED blocks getting added.

### Q4. D7 — `/api/comments/[id]/report` "no rate limit" claim
Confirmed in the file's first ~40 lines. Didn't read past that — possible (unlikely) that rate-limit is added below body parsing. **Read the full file to confirm.**

### Q5. C8 — `adminMutation.ts:84-88` `p_ip` / `p_user_agent` gap
Z12 reported the gap from a self-comment in the file. I didn't read the file directly to confirm.
**To close:** read `web/src/lib/auth/adminMutation.ts` lines 80-100.

### Q6. C13 — adult quiz threshold "no setting exists"
I queried `WHERE key LIKE 'quiz%'` AND saw all 30 settings rows. No `quiz_unlock_threshold` exists. But there's no setting *named* anything like "adult unlock threshold" — possible the intent was always "use kid pct as adult percent too" and the RPC `>= 3` was just literal-coded. **The rec to add a setting is correct, but the framing as a violation may overstate intent.**

### Q7. C45 — 5 orphan components (Recap/Sidebar/ToastProvider/Follow/TTS)
Z16 verified via grep. But Z16's grep may have missed dynamic imports (`React.lazy`, `next/dynamic`). Two of those (RecapCard, FollowButton) match recap + follows feature names, both of which have launch-hide gates. Possibly orphan-by-kill-switch, not actually unused. **Verify whether the launch-hide is the only reason.**

### Q8. The "Wave A comment_status enum drift was a false alarm" verdict
I verified the live system uses `'visible'`/`'hidden'`. But the 6/6 audit consensus is unusually strong — possible they observed something specific I didn't reproduce (a particular admin moderation API path, a server-side migration, or a non-public route). **Wave 4 should grep `comment` + `published` across schema/ migrations + admin API to absolutely rule out.**

### Q9. The "L08-001 wrong / C15 closer" verdict
Live RLS verified correct from a structural standpoint. But L08 may have been about a specific edge case (NULL kid_profile_id during the kid-JWT validation step, before claims are populated). Without reading L08 verbatim, the refutation is partial.

### Q10. The "Wave B handlePaymentSucceeded missing bump REFUTED" verdict
Confirmed the bump call exists at line 846. Didn't trace whether the surrounding code path always reaches line 846 (early-return paths possible). **Read lines 812-870 end-to-end.**

### Q11. Z02's "67 items" vs my "39 numbered" count discrepancy
I noted the gap but didn't reconcile. Z02 may have counted lettered items (K1, K8, AD1, B1, B3, B11) plus Round-3 / Round-4 sub-items.
**To close:** count all distinct item IDs in the file (numbered + lettered).

### Q12. AuditV1's 4 sessions vs AuditV2 — claimed AuditV2 is "broader"
True for code zones (V2 covered web + iOS + schema; V1 didn't reach those yet). But for the doc zones V1 covered, V1 may have caught nuance V2 missed. The "AuditV2 supersedes" framing assumes V2 is at least as thorough — needs spot-checking against V1 findings to confirm.

### Q13. `events` parent table no-policies state
Reported as intentional. Likely true (writes via service role from `/api/events/batch`), but not explicitly confirmed by reading the batch route to verify it uses service role.
**To close:** read `web/src/app/api/events/batch/route.*`.

### Q14. AppIcon claim "no PNG"
Z17 reported. Didn't directly inspect `VerityPost/VerityPost/Assets.xcassets/AppIcon.appiconset/`.
**To close:** `ls VerityPost/VerityPost/Assets.xcassets/AppIcon.appiconset/`.

### Q15. The `superadmin` count — said 8
8 routines have `prosrc LIKE '%superadmin%'`. Didn't verify each is actually a role-allowlist string vs a comment / variable name / table reference.
**To close:** read each routine body; confirm the string is in a role-check.

### Q16. `cleanup_rate_limit_events` runtime error claim severity
The function would throw `column "occurred_at" does not exist`. But I didn't verify whether pg_cron actually schedules this function — possible no scheduler runs it, in which case the bug is dormant.
**To close:** check `cron.job` table for any reference to `cleanup_rate_limit_events`.

### Q17. C36 — AASA file missing
Z16 said `web/public/` only has `ads.txt`. Didn't check whether `apple-app-site-association` is served by a Next.js route handler at `/.well-known/apple-app-site-association/route.ts` or similar.
**To close:** `find web/src/app -path '*well-known*'`.

### Q18. C44 — `JsonLd.tsx` references `/icon.svg` claimed missing
Z16 noted this. Didn't verify whether `web/src/app/icon.svg/route.ts` exists or whether icon.svg lives in another path.
**To close:** `find web -name "icon.svg*"`.

### Q19. C40 — `HomeFeedSlots.swift` and `Keychain.swift` orphan claim
Z17 reported. Didn't verify with a comprehensive grep across the iOS target.
**To close:** `grep -rn "HomeFeedSlots\|Keychain" VerityPost/`.

### Q20. C46 — `admin/PipelineRunPicker.tsx` "two call sites" comment stale
Z16 said only newsroom imports it now. Didn't look for dynamic imports.
**To close:** check for `dynamic(import('PipelineRunPicker'))`.

---

## 3. Owner-decision items (unverifiable; need a human)

(Same as AuditV2 §4 U1-U20.)

- U1. Charter 4 retired docs: resurrect or mass-edit citations
- U2. Story-manager fate (parallel admin or deprecate legacy)
- U3. kids-story-manager merge with `?kid=true` toggle
- U5. `verity_family_annual` + `verity_family_xl` plans `is_active=false` — intentional or oversight?
- U18. `ai_models` dual-provider (Anthropic + OpenAI) — both intended?
- U20. AuditV1 vs AuditV2 archival decision

---

## How to close the gaps

If the agent budget refreshes:
- **Highest leverage:** dispatch a fresh-eyes Wave 4 covering items M2 (47 lens findings), M3 (60 SHIPPED claims), M4 (O-DESIGN + Tiers A-D), M5 (F1-F4 vs PRELAUNCH diff). These are the bulk of the unresolved volume.
- **Mechanical follow-ups:** items M7 (tsc + xcodebuild), M8 (git log SHA validation), M14 (F7 grant audit), M27 (verity_score_events check), M30 (webhook idempotency), Q4-Q20 (in-thread spot reads) can all run in main thread without agents.
- **Owner-only:** §3 above; no amount of agents will resolve.

If continuing in main thread without agent budget:
- Each Q-item is a 5-15 minute read. Total ~3-4 hours to close the questionable list.
- Each M-item is 15-60 minutes. M2-M5 are the largest (could be 8-10 hours combined).
- Total full-close estimate: 1-2 working days of in-thread work.
