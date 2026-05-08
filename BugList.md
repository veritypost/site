# BugList.md

1 verified bug remaining. The 5 race / atomicity / cosmetic items got recon-and-adversary'd this session: 4 shipped (#1, #2, #4, #5) and 1 dropped from the list (#3 was misdiagnosed — `RealtimeHelpers.swift:44-49` documents the detached unsubscribe is intentional under cancellation). See CHANGELOG.md 2026-05-08 for the full set of shipped fixes.

Severity:
- **risky** — wrong state / silent failure / abuse vector that needs a real fix
- **minor** — confirmed bug but bounded blast radius

---

(no risky entries remaining)

---

## Other — pre-existing, surfaced during the #5 audit

1. **[minor] iOS expert thread-chain affordances never load**
   `VerityPost/VerityPost/StoryDetailView.swift:3739`
   `loadExpertThreadChains` queries `expert_thread_chains` with the user JWT, but the table has zero `authenticated` grants — the call returns `[]` silently. The chain-cap UI affordances (asker reply count, "X replies left in this expert chain") never populate. Pre-existing since shipping; surfaced during the #5 RLS audit. Not a new regression. Fix: add a self-scoped SELECT policy + GRANT SELECT TO authenticated, or move the read to a service-role API route.

---

## Notes

- The "(no risky entries remaining)" reflects: every previously-listed risky bug from the original 40 is either shipped or refuted. The single remaining minor entry is a pre-existing iOS read-path that was already silently broken and only got noticed during this session's RLS audit — not a new finding from the original sweep.
- Earlier-shipped fixes deliberately excluded from this list: counter drift on `articles.view_count` / `articles.comment_count` / `articles.bookmark_count`, reading_log telemetry, admin analytics soft-delete, CommentThread N+1, Following sticky tab, iOS auto-zoom on inputs, AvatarEditor mobile grid, `receive_upvote` scoring, sticky tab strip, achievement parity on `events/batch`, mark-seen rollback, story-follow RPC rate-limit, signup_rollback IP cap, kids-end-session cap, 7-endpoint mid-priority rate-limit batch, `mark_story_seen` / `toggle_story_follow` RPC rate limits, `ai_prompt_presets_snapshot_history` RPC drop, item 13 article-summary tightening, expert UI launch-hide, all 12 easy-tier validation/null-safety fixes, the safe-batch 8 (FollowStoryButton shape, ConfirmDialog focus, HASH_SALT, bulk-approve surfacing, reject 409, iOS DM cluster + receipts cluster, kids PairingClient), the owner-judgment 5 (admin.users.recovery permission + auth-recovery route swap, approve resend-invite route + email_status metadata + 3-row backfill, support reply outranks-omitted-by-design comment, reports UNIQUE + autohide threshold setting, kid cover-image 2MB byte cap loader), and the race-and-atomicity 4 (atomic `report_and_maybe_autohide` RPC + route swap, atomic `add_kid_with_seat_check` RPC + route swap, `quiz_attempts.client_attempt_id` column + partial unique index + iOS upsert with ignoreDuplicates, RLS enabled on `expert_mention_post_counters` / `expert_mention_quota_counters` / `expert_thread_chains` with admin-only SELECT policies).
- Refuted (verified not real): `key={r.id}` won't compile (`r` is a ReactNode), `commit_expert_mentions` doesn't decrement asker quota, no `settings_version` pattern exists, `dm_read_receipts_enabled` is NOT NULL DEFAULT true, `get_kid_category_rank` is properly server-scoped, DM block one-way load is intentional (the messages-page comment at :234-244 explicitly justifies it for the unblock-button DELETE decision), iOS `subscribeToNewComments` `Task.detached` on the success branch is intentional per `RealtimeHelpers.swift:44-49` (a non-detached await would itself be cancelled by the parent Task mid-cancel and leak the websocket server-side), React 18 batching covers most claimed races, `useEffect` cleanup races already guarded by `cancelled` flags, `RegistrationWall` Shift+Tab works, `ParentSessionManager` foreground expiry check works, force-unwraps on hardcoded literal URLs, "missing await" on `PermissionService.has()` (synchronous), `messages` realtime no-filter (RLS handles), `user_roles_insert` RLS qual=NULL (INSERT uses `with_check`), 22-tables-no-RLS (most have RLS enabled but no policy → deny-all by default).
