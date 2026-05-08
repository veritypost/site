# BugList.md

5 verified bugs remaining. The 6 owner-judgment items got recon-and-adversary'd this session: 1 dropped from the list (#6 was misdiagnosed — fixing it would cause the failure mode the existing comment predicts), 5 shipped in commit-pending. See CHANGELOG.md 2026-05-08 for the full set of shipped fixes.

Severity:
- **risky** — wrong state / silent failure / abuse vector that needs a real fix
- **minor** — confirmed bug but bounded blast radius

---

## Web — backend (race / atomicity)

1. **[risky] Reports threshold check is non-atomic**
   `web/src/app/api/reports/route.js:188-195`
   Read-count + threshold-compare + auto-hide write run as separate statements. Two reports in the same window can both observe `count = threshold-1` and both fire (or neither fires) the auto-hide. Fix shape: move count + compare + update into a single atomic RPC. Note: with the new UNIQUE(reporter, target_type, target_id) constraint shipped in #7, the race is narrower — only happens between two distinct reporters landing simultaneously — but still real.

2. **[risky] Kids seat cap is a non-atomic read-modify-insert**
   `web/src/app/api/kids/route.js:113-126`
   Two concurrent POSTs both observe `activeKidCount = max-1`, both pass the cap check, both insert — billing impact. Reconfirm-adversary said the right fix is a new SECURITY DEFINER RPC that wraps count + insert in one transaction with `pg_advisory_xact_lock`. Out of drop-in tier; needs a migration.

---

## iOS main

3. **[risky] `subscribeToNewComments` task overlap on rapid story switches**
   `VerityPost/VerityPost/StoryDetailView.swift:559`
   `.task(id: story.id)` cancels the prior task, but the channel-unsubscribe runs detached. Old + new subscribe/unsubscribe can interleave; Supabase realtime is idempotent so no payload-correctness issue, but log noise + transient channel-not-found warnings accumulate. The non-cancel branch can be awaited synchronously; `onCancel` must stay detached.

---

## Kids iOS

4. **[risky] Pending quiz writes can produce duplicate `quiz_attempts` rows**
   `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:37-51`
   On HTTP 200, the rehydrated pending-write queue removes the row from disk only after success; if the app is killed between response and queue-removal, the next launch retries an already-committed insert. Fix needs a server-side idempotency key on the RPC + UNIQUE constraint. Existing `quiz_attempts` rows may need dedup before the constraint can be added.

---

## Database / RPCs / RLS

5. **[minor] 3 `expert_thread_*` tables have RLS disabled — defense-in-depth only**
   `expert_mention_post_counters`, `expert_mention_quota_counters`, `expert_thread_chains` all have `relrowsecurity = false`. **However**, zero grants to `anon`/`authenticated`/`public` — PostgREST denies any direct read/write by default, so they aren't reachable from the public API today. Real risk only materializes if a future grant is accidentally added. Fix: enable RLS + add admin-only SELECT policies; needs a quick audit of existing service-role-less callers (if any) before enabling.

---

## Notes

- Earlier-shipped fixes deliberately excluded from this list: counter drift on `articles.view_count` / `articles.comment_count` / `articles.bookmark_count`, reading_log telemetry, admin analytics soft-delete, CommentThread N+1, Following sticky tab, iOS auto-zoom on inputs, AvatarEditor mobile grid, `receive_upvote` scoring, sticky tab strip, achievement parity on `events/batch`, mark-seen rollback, story-follow RPC rate-limit, signup_rollback IP cap, kids-end-session cap, 7-endpoint mid-priority rate-limit batch, `mark_story_seen` / `toggle_story_follow` RPC rate limits, `ai_prompt_presets_snapshot_history` RPC drop, item 13 article-summary tightening, expert UI launch-hide, all 12 easy-tier validation/null-safety fixes, the safe-batch 8 (FollowStoryButton shape, ConfirmDialog focus, HASH_SALT, bulk-approve surfacing, reject 409, iOS DM cluster + receipts cluster, kids PairingClient), and the owner-judgment 5 just shipped (admin.users.recovery permission + auth-recovery route swap, approve resend-invite route + email_status metadata + 3-row backfill, support reply outranks-omitted-by-design comment, reports UNIQUE + autohide threshold setting, kid cover-image 2MB byte cap loader).
- Refuted (verified not real): `key={r.id}` won't compile (`r` is a ReactNode), `commit_expert_mentions` doesn't decrement asker quota, no `settings_version` pattern exists, `dm_read_receipts_enabled` is NOT NULL DEFAULT true, `get_kid_category_rank` is properly server-scoped, **DM block one-way load is intentional** (the messages-page comment at :234-244 explicitly justifies it for the unblock-button DELETE decision; "fixing" it to two-way would surface an Unblock button when the OTHER party blocked you, click-Unblock would silently no-op at the API, toast "unblocked" when the user is still blocked — exactly the predicted failure mode), React 18 batching covers most claimed races, `useEffect` cleanup races already guarded by `cancelled` flags, `RegistrationWall` Shift+Tab works, `ParentSessionManager` foreground expiry check works, force-unwraps on hardcoded literal URLs, "missing await" on `PermissionService.has()` (synchronous), `messages` realtime no-filter (RLS handles), `user_roles_insert` RLS qual=NULL (INSERT uses `with_check`), 22-tables-no-RLS (most have RLS enabled but no policy → deny-all by default).
- Of the 5 remaining: all need a DB migration or non-trivial code (atomic RPC for #1, advisory-lock RPC for #2, partial-await rework for #3, idempotency-key + UNIQUE + dedup for #4, RLS audit + enable for #5). None are owner-judgment blocks.
