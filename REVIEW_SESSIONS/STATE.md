# Review cleanup — current state

**This is the source of truth.** Whoever picks up next reads this first, then acts.

## Current phase
`ready_for_session_1`

## What's done
- 11-PM review pass complete. 156 findings in `REVIEW_REPORT.md` (18 P0, 56 P1, 63 P2, 19 P3).
- 6 session docs drafted in `REVIEW_SESSIONS/SESSION_0[0-6]_*.md`.
- 12 question docs in `REVIEW_SESSIONS/QUESTIONS/Q01..Q12_*.md`.
- All 12 owner decisions locked 2026-05-03 (see Decisions log below).
- Locked decisions folded into Sessions 1–6 docs.
- **Session 0 shipped 2026-05-03 — commit `0ed48a4`. 5/5 closed; A1 migration written but pending live-DB apply (MCP read-only this session).**

## What's blocked
- A1 migration `supabase/migrations/20260503000008_generate_kid_pair_code_csprng.sql` needs `supabase db push` (or dashboard SQL paste) before A1 is fully live. Owner action.
- Owner's "fire Session 1" signal unblocks the next run (DB / RLS — Q01, Q02, Q03 territory).

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
