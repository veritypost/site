# BugList.md

11 verified bugs remaining. Compiled 2026-05-08; 14 of the original 40 shipped earlier today (2 blockers + 12 easy-tier), 9 more shipped today's safe-batch (this commit), 5 refuted in adversary reconfirm, 1 documented as "behavior matches reality, comment fixed" (#21). See CHANGELOG.md 2026-05-08 for the full set of shipped fixes and the refuted-list.

Severity:
- **risky** — wrong state / silent failure / abuse vector that needs a real fix
- **minor** — confirmed bug but bounded blast radius

---

## Web — backend (race / atomicity)

1. **[risky] Reports threshold check is non-atomic**
   `web/src/app/api/reports/route.js:188-195`
   Read-count + threshold-compare + auto-hide write run as separate statements. Two reports in the same window can both observe `count = threshold-1` and both fire (or neither fires) the auto-hide. Fix shape: move count + compare + update into a single atomic RPC.

2. **[risky] Kids seat cap is a non-atomic read-modify-insert**
   `web/src/app/api/kids/route.js:113-126`
   Two concurrent POSTs both observe `activeKidCount = max-1`, both pass the cap check, both insert — billing impact. Reconfirm-adversary said the right fix is a new SECURITY DEFINER RPC that wraps count + insert in one transaction with `pg_advisory_xact_lock`. Out of drop-in tier; needs a migration.

---

## Web — backend (admin / messaging — needs owner judgment)

3. **[risky] Permission key mismatch between auth-recovery and delete-account**
   `web/src/app/api/admin/auth-recovery/[user_id]/route.ts:40` vs `admin/users/[id]/route.ts`
   Auth-recovery requires `admin.users.delete`; delete-account requires `admin.users.delete_account`. Two different permission keys for related operations on the same target. Fix needs a renaming decision (which key wins) + a perm-set migration if any existing grants reference the loser; otherwise the rename silently revokes them.

4. **[risky] Approve-access-request flips status='approved' even when email send fails**
   `web/src/app/api/admin/access-requests/[id]/approve/route.ts:115-151`
   Status flips regardless of email outcome. Recoverable via DB script (find approved rows with `invite_sent_at IS NULL`), but no UI surface. Owner-judgment call: keep status pending on email failure (admin sees the failure surface but UX shifts), or add a "resend invite" admin action.

5. **[risky] Admin support reply missing `requireAdminOutranks`**
   `web/src/app/api/admin/support/[id]/reply/route.ts:12-80`
   Calls `requirePermission('admin.support.reply')` but never enforces rank. A junior moderator can send replies in the same chrome as senior staff. Needs verification that current support staff actually outrank the users they reply to before adding the guard.

6. **[risky] One-way DM block — blocker can't filter convos started before the block**
   `web/src/app/messages/page.tsx:234-244`
   Page loads only outgoing blocks. Owner-judgment call: should "I blocked you" mean "we can't talk in either direction," or just "I don't want to hear from you"?

7. **[risky] Report flood — same user can report the same target unbounded times**
   `web/src/app/api/reports/route.js:17-30`
   No `(reporter, target)` rate limit; auto-hide threshold = 3, so a single user with 3 reports trips the auto-hide alone. Fix needs a `UNIQUE(reporter_id, target_type, target_id)` constraint + threshold counts distinct reporters. Owner-judgment call: with low traffic the new threshold may rarely fire.

---

## iOS main

8. **[risky] `subscribeToNewComments` task overlap on rapid story switches**
   `VerityPost/VerityPost/StoryDetailView.swift:559`
   `.task(id: story.id)` cancels the prior task, but the channel-unsubscribe runs detached. Old + new subscribe/unsubscribe can interleave; Supabase realtime is idempotent so no payload-correctness issue, but log noise + transient channel-not-found warnings accumulate. The non-cancel branch can be awaited synchronously; `onCancel` must stay detached.

---

## Kids iOS

9. **[risky] `KidReaderView` AsyncImage has no size cap**
   `VerityPostKids/VerityPostKids/KidReaderView.swift:143-150`
   No `URLSession`-side byte cap on cover images. Multi-GB URL would OOM the kid's device. `allowedImageHosts` constrains origin only. Owner-set cap value needed; fix is ~30 lines (custom URLSession with content-length cap).

10. **[risky] Pending quiz writes can produce duplicate `quiz_attempts` rows**
    `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:37-51`
    On HTTP 200, the rehydrated pending-write queue removes the row from disk only after success; if the app is killed between response and queue-removal, the next launch retries an already-committed insert. Fix needs a server-side idempotency key on the RPC + UNIQUE constraint. Existing `quiz_attempts` rows may need dedup before the constraint can be added.

---

## Database / RPCs / RLS

11. **[minor] 3 `expert_thread_*` tables have RLS disabled — defense-in-depth only**
    `expert_mention_post_counters`, `expert_mention_quota_counters`, `expert_thread_chains` all have `relrowsecurity = false`. **However**, zero grants to `anon`/`authenticated`/`public` — PostgREST denies any direct read/write by default, so they aren't reachable from the public API today. Real risk only materializes if a future grant is accidentally added. Fix: enable RLS + add admin-only SELECT policies; needs a quick audit of existing service-role-less callers (if any) before enabling.

---

## Notes

- Earlier-shipped fixes deliberately excluded from this list: counter drift on `articles.view_count` / `articles.comment_count` / `articles.bookmark_count`, reading_log telemetry, admin analytics soft-delete, CommentThread N+1, Following sticky tab, iOS auto-zoom on inputs, AvatarEditor mobile grid, `receive_upvote` scoring, sticky tab strip, achievement parity on `events/batch`, mark-seen rollback, story-follow RPC rate-limit, signup_rollback IP cap, kids-end-session cap, 7-endpoint mid-priority rate-limit batch, `mark_story_seen` / `toggle_story_follow` RPC rate limits, `ai_prompt_presets_snapshot_history` RPC drop, item 13 article-summary tightening, expert UI launch-hide, all 12 easy-tier validation/null-safety fixes, the safe-batch 8 just shipped (FollowStoryButton shape, ConfirmDialog focus, HASH_SALT, bulk-approve surfacing, reject 409, iOS DM cluster + receipts cluster, kids PairingClient).
- Refuted (verified not real): `key={r.id}` won't compile (`r` is a ReactNode), `commit_expert_mentions` doesn't decrement asker quota, no `settings_version` pattern exists, `dm_read_receipts_enabled` is NOT NULL DEFAULT true, `get_kid_category_rank` is properly server-scoped, React 18 batching covers most claimed races, `useEffect` cleanup races already guarded by `cancelled` flags, `RegistrationWall` Shift+Tab works, `ParentSessionManager` foreground expiry check works, force-unwraps on hardcoded literal URLs, "missing await" on `PermissionService.has()` (synchronous), `messages` realtime no-filter (RLS handles), `user_roles_insert` RLS qual=NULL (INSERT uses `with_check`), 22-tables-no-RLS (most have RLS enabled but no policy → deny-all by default).
- Of the 11 remaining: **6 need owner judgment** before fixing (#3 perm rename, #4 approve UX trade-off, #5 support rank lockout risk, #6 DM block semantics, #7 threshold semantics, #9 image cap value). **5 are clean engineering work** but each needs a DB migration or non-trivial code (#1 atomic RPC, #2 advisory-lock RPC, #8 minor cosmetic, #10 idempotency key + UNIQUE + dedup, #11 RLS audit + enable).
