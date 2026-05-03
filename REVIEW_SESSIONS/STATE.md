# Review cleanup — current state

**This is the source of truth.** Whoever picks up next reads this first, then acts.

## Current phase
`ready_for_session_6`

## What's done
- 11-PM review pass complete. 156 findings in `REVIEW_REPORT.md` (18 P0, 56 P1, 63 P2, 19 P3).
- 6 session docs drafted in `REVIEW_SESSIONS/SESSION_0[0-6]_*.md`.
- 12 question docs in `REVIEW_SESSIONS/QUESTIONS/Q01..Q12_*.md`.
- All 12 owner decisions locked 2026-05-03 (see Decisions log below).
- Locked decisions folded into Sessions 1–6 docs.
- **Session 0 shipped 2026-05-03 — commit `0ed48a4`. 5/5 closed.**
- **Session 1 shipped 2026-05-03. 9/9 P0 CLOSED. 5 migrations applied + Session-0 pair-code body retroactively log-recorded. 4 PMs in parallel + independent reviewer 9/9 + adversary 9/9 structural; adversary surfaced 3 new findings (P0 #13 kid_profiles INSERT bypass, P0 #12 metadata escape hatch, P1 users INSERT denylist gap) — all closed in Session 1b follow-up migration `20260503000014`. Types regen'd. Remaining adversary deferrals: P1 #4 (comments policy → Session 2), P2 #9 (articles UPDATE WITH CHECK → Session 6), P2 #15 (DEFAULT PRIVILEGES for `supabase_admin` → Session 6).**
- **Session 2 shipped 2026-05-03. 6/10 closed + 4/10 refuted in pre-impl pass + 5 reviewer-surfaced follow-ups closed in same session. 13 files touched. Q04 + Q05 owner-locked decisions applied. Smoke-test deferred (needs test inbox + live Supabase).**
- **Session 3 shipped 2026-05-03. 8/8 P0+P1+P2 closed (2 P0 + 5 P1 + 1 P2). Q03 owner-locked decision applied. 5 migrations applied via MCP; 6 new permission keys minted. 5 reviewer follow-ups + 7 adversary follow-ups closed in same session — including a P0 truth-up where the "retry" route was cosmetic theater (honest-fix per `feedback_genuine_fixes_not_patches.md`). 6 lower-priority adversary items documented as deferred. iOS / kids N/A.**
- **Session 4 shipped 2026-05-03. 2 P0 + 11 P1 + 6 polish closed (Q06 cross-platform precheck + Q07 pricing-source-of-truth + Q12c kill-switch + iOS S2S ordering guard + cancel-state correctness). 4-stream parallel + 1 second-pass slice on adversary follow-ups (cancel-route precheck reverted, is_active filters added, iOS sync .update() error captured, StoreManager seenConflict cleanup). 16 files modified + 5 new files (billingPlatformGuard.ts, pricingCopy.ts, SubscriptionConflictSheet.swift, 2 migrations). Owner action required: apply 2 migrations (MCP read-only blocked auto-apply) + mint Stripe price IDs for verity_monthly/verity_annual then flip is_visible=true. Pre-existing LeaderboardView.swift:319 build error unchanged (out-of-scope).**
- **Session 5 shipped 2026-05-03. 1 P0 + ~21 P1 closed across 5 PMs + 1 follow-up slice. PM-A: 5 LLM routes routed through call-model.ts + audience param threaded + 4 cron hardening items (AbortController, deadletter, advisory locks, freshness guard). PM-B: Q08 privacy drop + share-link unblock + RegistrationWall hardening + CTA target. PM-C: Q12a dead URL parser deleted + Q10 5-state account-state banner ported (frozenAccountBanner removed). PM-D: kids stats SELECT + Q12d dead path + streak flicker + Q11 image allowlist. PM-E: Q09 web-push doc + Q12b kids APNs entitlement + story-page kids deep-link scheme. 30 files changed (2 new Swift files, 1 deleted route). Reviewer + adversary surfaced 11 must-fix items; all closed in follow-up slice. 4 owner-attention items: frozen_at users see no banner (need confirmation), score-comments has no kill-switch, needs_manual_review has no admin queue, 2 migrations pending apply (MCP read-only).**

## What's blocked
- Owner's "fire Session 6" signal unblocks the final run (verification + remaining polish + CLAUDE.md kill-switch doc-drift cleanup + Session 5 deferrals: Q02 articles UPDATE WITH CHECK, Q02 DEFAULT PRIVILEGES, frozen_at banner question, score-comments kill-switch question, needs_manual_review queue).
- 2 Session-5 migrations need owner apply: `20260503000021_add_cron_advisory_lock_helpers.sql`, `20260503000022_add_comment_score_attempts.sql`.

## Next action (read this carefully)

When owner says **"continue session"**:

1. Read `REVIEW_SESSIONS/QUESTIONS/Q*.md` decision blocks. For each Q with no checkbox checked + no entry in Decisions Log below, it's still pending.
2. If pending questions exist, tell the owner:
   - The list of pending Q numbers
   - Each one's recommendation in one line
   - Offer 3 choices: (a) accept all recommendations, (b) tell me picks now, (c) "I'll review the docs first"
3. If all 12 are locked in Decisions Log, fold answers into the relevant `SESSION_0X_*.md` files (replace the "Option A vs B" choices with the locked decision), then update this STATE.md to `phase: ready_for_session_0` and ask owner if they want to fire Session 0.
4. If `phase: ready_for_session_N`, run that session (architect → PMs → subagents pattern, mandatory verification gates per the session doc), then update phase to `running_session_N`.
5. If `phase: running_session_N`, check the session doc's `## Status` block. If it has a final entry → mark `phase: ready_for_session_(N+1)` and prompt owner. Otherwise resume where it left off.

## Phase machine
- `awaiting_owner_question_decisions` → owner answers → `ready_for_session_0`
- `ready_for_session_N` → owner says go → `running_session_N`
- `running_session_N` → session done → `ready_for_session_(N+1)` (after Session 6 → `complete`)

## Decisions log

Format: `Q<N>: <owner's pick> — <one-line note>`. Append entries as owner decides.

- Q01: Option A (REVOKE + ALTER DEFAULT PRIVILEGES) — single migration, deny-by-default + per-fn revoke + Class B/C regrants; no body guards.
- Q02: drop GUC, gate triggers on `current_user='postgres' OR jwt role='service_role'` — applies to enforce_kid_dob_immutable, enforce_band_ratchet, users_protect_columns; remove set_config calls from admin_apply_dob_correction, system_apply_dob_correction, graduate_kid_profile, handle_auth_user_updated.
- Q03: Option A (server route) — new /api/admin/top-stories/* with requirePermission + recordAdminAction + checkRateLimit; drop open RLS policy.
- Q04: Option A (last_login_at) — fix /api/auth/email-change:60; centralize via assertRecentAuth(user) helper.
- Q05: Option D — drop the clickable button from the email; OTP-only.
- Q06: Option A — hard-block 409 with code + manage_url. Sub-decisions defaulted: include /pricing prefetch + iOS conflict sheet primary CTA "Open Verity Post billing", refund secondary.
- Q07: Option B (ISR revalidate: 300 from DB) + shared fallback constants. Solo Verity SKU = $7.99/mo (insert/activate `verity_monthly` plan row + mint Stripe price).
- Q08: Option B — drop "Followers-only" option, fix copy. No DB change.
- Q09: Path B — document iOS-only at launch; rewrite NotificationsCard copy + add CLAUDE.md kill-switch row 11.
- Q10: Port 5 banners (muted, verify_locked + unverified_email paired, plan_grace, deletion_scheduled, banned) at chrome level (ContentView.swift:245).
- Q11: 2-host first-party allowlist (Supabase project host + reserved cdn.veritypost.com) on KidReaderView.swift.
- Q12a: Option B — delete the verityposts:// parser branch in VerityPostApp.swift.
- Q12b: Option B — remove aps-environment from VerityPostKids.entitlements.
- Q12c: Option A — flip manageSubscriptionsEnabled to false (AlertsView.swift:340); update CLAUDE.md kill-switch row 5 line number 305 → 340.
- Q12d: Option B — delete dead biasedHeadlinesSpotted state field, parameter, branch, and call-site arg; keep BadgeUnlockScene view.

## Recommendation summary (for fast owner read)

- **Q01 — Mass-impersonation:** Option A (REVOKE + ALTER DEFAULT PRIVILEGES). Hits 55 RPCs not 30. Single migration.
- **Q02 — DOB admin override:** Drop `app.dob_admin_override` GUC; gate on `current_user='postgres' OR jwt role='service_role'`. SQL only.
- **Q03 — top_stories write path:** Option A (new `/api/admin/top-stories/*` route matching `adminMutation.ts` skeleton). Drop open RLS policy.
- **Q04 — Email-change recent-auth:** Option A (`public.users.last_login_at`). Centralize in `assertRecentAuth(user)` helper.
- **Q05 — Magic-link prefetch:** Drop the clickable button from email; ship OTP-only. 12% prefetch rate observed in beta.
- **Q06 — Apple/Stripe conflict UX:** Option A (hard-block 409 with `code` + `manage_url`). Re-apply existing `family/add-kid-with-seat` pattern.
- **Q07 — Pricing source-of-truth:** Option B (Next.js ISR `revalidate: 300` from DB) + shared fallback constants. **Also: pricing page sells `verity_monthly` which doesn't exist in DB — every paid web checkout 404s.** Hidden P0.
- **Q08 — Privacy Followers-only:** Option B (drop the option, fix copy). Zero users selected it.
- **Q09 — Web Push:** Document iOS-only at launch. ~30 min of work (copy fix + CLAUDE.md row).
- **Q10 — iOS banner port:** Port 5 states: `muted`, `verify_locked`+`unverified_email` (paired), `plan_grace`, `deletion_scheduled`, `banned`. Insert at chrome-level `ContentView.swift:245`.
- **Q11 — Kid image allowlist:** 2-host first-party allowlist (Supabase host + reserved `cdn.veritypost.com`). DB has 0 kid covers today; pipeline silently drops `cover_image_url`.
- **Q12 — iOS mini-decisions:**
  - Q12a `verityposts://`: delete the dead parser branch
  - Q12b Kids APNs: remove the entitlement
  - Q12c `manageSubscriptionsEnabled`: flip to `false`
  - Q12d `biasedHeadlinesSpotted`: delete the dead path

## Notes for whoever picks this up
- Owner wants tight responses (memory `feedback_browse_slice_brevity.md`).
- Don't recite history (memory `feedback_status_recitation.md`) — work from this STATE doc + REVIEW_REPORT.md.
- Owner has been answering with single chars ("1") — accept short answers as decisive.
- Don't auto-advance phases; ask owner to fire next session.
