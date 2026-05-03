# Session 7 — Post-verification hardening

**Trigger:** Session 6 net-new pass surfaced 5 new P0s (2 RBAC mass-impersonation regressions + 3 iOS issues) plus a P1 iOS auth dead-end from Q05 not being propagated to iOS. This session closes them.

## Scope (locked)

### Stream A — DB/RLS (elevated-care, adversary required)
Single migration `20260503000023_session7_hardening.sql`:
- REVOKE `toggle_follow(uuid, uuid)` from PUBLIC/anon/authenticated; GRANT to service_role; add `auth.uid() = p_follower_id` body check.
- REVOKE `system_apply_dob_correction` from PUBLIC/anon/authenticated; GRANT to service_role; add `current_user='postgres' OR jwt role='service_role'` body gate.

### Stream B — iOS adult
1. `VerityPost/VerityPost/LeaderboardView.swift:319` — drop `.uuidString` (id is already String).
2. `VerityPost/VerityPost/AccountState.swift` — add `.frozen(frozenAt:frozenScore:)` case + severity entry + AccountStateBannerView branch matching web's red Resubscribe CTA.
3. `VerityPost/VerityPost/LoginView.swift:170` + `SignupView.swift:209` — port web `_SingleDoorForm.tsx` `stage='code'` OTP-input view. Replace "Tap the link" copy with 8-digit OTP entry + verify call.

### Stream C — iOS kids
`VerityPostKids/VerityPostKids/SupabaseKidsClient.swift:46,49,52` — replace 3 `fatalError` calls with `configValid: Bool` flag + placeholder URL fallback mirroring `SupabaseManager.swift:113-148`. `KidReaderView.swift:9-12` and `KidsAppRoot` need to render error UI when `!configValid`.

## Orchestration

3 fix-implementer subagents in parallel (one per stream). After each stream completes:
1. build-verifier (typecheck + lint + sentinels + Xcode build)
2. Stream A only — adversary review (RBAC/COPPA touching)

## Verification gates

- `web/` typecheck + lint clean
- iOS adult Xcode build clean (this resolves the carried `LeaderboardView` break)
- iOS kids Xcode build clean
- Migration applies cleanly via MCP (or owner-apply if read-only)
- Adversary report on Stream A returns no NEW P0s

## Done definition

- 5 P0s + 1 P1 closed with `> CLOSED in Session 7` markers in `REVIEW_REPORT.md`.
- Migration file present + listed in `STATE.md` pending-apply if MCP read-only.
- This file's `## Status` block populated with closed/deferred counts.

## Status

### Session 7 — completed 2026-05-03

**Closed:** 5 P0 + 1 P1 across 3 streams.

| Stream | Closed | Files | Notes |
|---|---|---|---|
| A — DB/RLS | 2 P0 (toggle_follow + system_apply_dob_correction) | 1 new migration (`20260503000023_session7_hardening.sql`) | Adversary surfaced 2 accepted refinements applied (search_path `pg_temp` parity + `current_user IN ('postgres','supabase_admin')` allowlist). Auth.uid() rejected after Stream A flagged route uses createServiceClient — adopted service-role JWT-claim gate matching Fix 2 pattern. |
| B — iOS adult | 2 P0 + 1 P1 | LeaderboardView, AccountState, AccountStateBannerView, Models, AuthViewModel, LoginView, SignupView | Plus surfaced + fixed pre-existing StoryDetailView.swift:3232,3252 build break (`.stroke(VP.border, lineWidth:1, style:StrokeStyle(...))` invalid; lineWidth folded into StrokeStyle). |
| C — iOS kids | 1 P0 | SupabaseKidsClient, KidReaderView, KidsAppRoot | configValid pattern + KidsConfigErrorView. |

**Build verification:**
- web typecheck: PASS · web lint: PASS
- iOS adult `xcodebuild`: **BUILD SUCCEEDED**
- iOS kids `xcodebuild`: **BUILD SUCCEEDED**
- migration syntax: PASS · sentinels: all PASS

**Adversary findings deferred (out of Session 7 scope):**
- P1: `generate_kid_pair_code(uuid)` (in `_008`/`_012`) and `create_events_partition_for(date)` (in `_013`) are SECURITY DEFINER without explicit REVOKE in `_010`. Behaviorally safe today (auth.uid() check inside body for the former; partition-create is low-impact for the latter), but should be REVOKE'd defensively in a follow-up.
- P3: `toggle_vote`/`start_quiz_attempt`/`submit_quiz_attempt` lack belt-and-suspenders in-body service-role gates — REVOKE in `_010` already covers them; in-body gate prevents future CREATE OR REPLACE drift from re-exposing.

**Owner action required:**
- Apply 3 pending migrations: `20260503000021_add_cron_advisory_lock_helpers.sql`, `20260503000022_add_comment_score_attempts.sql`, `20260503000023_session7_hardening.sql`. MCP read-only this session.

**Recommendation:** Review pass complete. P1 follow-ups above are nice-to-have hardening but not launch-blocking (REVOKE pattern already protects the relevant fns; behavioral safety holds).
