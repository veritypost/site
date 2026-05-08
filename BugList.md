# BugList.md

26 verified bugs remaining. Compiled 2026-05-08 via 7 parallel scouts + 3 adversary verifiers; 14 of the original 40 shipped today (2 blockers + 12 easy-tier). Refuted, intentional-by-design, and trivial-impact items were dropped during verification. See CHANGELOG.md 2026-05-08 for the full set of shipped fixes.

Severity:
- **blocker** — user-facing breakage, data loss, or security gap (none remaining)
- **risky** — wrong state / silent failure / abuse vector that needs a real fix soon
- **minor** — confirmed bug but bounded blast radius

---

## Web — frontend

1. **[risky] Index-as-key on CommentRow replies**
   `web/src/components/CommentRow.tsx:1080`
   `<React.Fragment key={i}>{r}</React.Fragment>` keys reply nodes by array index. When replies reorder (insert mid-thread, soft-delete, etc.) every reply remounts and loses internal UI state (open menus, edit drafts, focus).

2. **[risky] FollowStoryButton optimistic flip never reverts on malformed JSON**
   `web/src/components/FollowStoryButton.tsx:79`
   `setFollowing(!!data?.following)` runs after a 200 OK whose body is missing the `following` field. UI flips to `false` even though the server succeeded; user toggles back, loses sync.

3. **[minor] ConfirmDialog focus trap escapes when no focusable elements**
   `web/src/components/ConfirmDialog.tsx:60`
   When all dialog buttons are disabled, the focusable list is empty and the early return skips `e.preventDefault()` — Tab moves focus out of the modal, breaking the trap. Edge case; bounded but real.

---

## Web — backend (API + lib)

4. **[risky] `commit_expert_mentions` failure burns mention quota without ticking the counter**
   `web/src/app/api/comments/route.js:420-428`
   Cap reservation runs first; if `commit_expert_mentions` errors after the comment posts, the asker's quota is decremented but no live counter row exists. User loses an expert-mention budget for a no-op invocation.

5. **[risky] HASH_SALT falls back to a hardcoded literal in non-prod builds**
   `web/src/app/api/events/batch/route.ts:56-58`
   Dev/preview hash salt is `'dev-fallback-salt-v1'` — every dev env produces deterministic IP/UA hashes, defeating the anonymization the table is supposed to provide. Prod is guarded; preview deploys are not.

6. **[risky] Reports threshold check is non-atomic**
   `web/src/app/api/reports/route.js:188-195`
   Read-count + threshold-compare + auto-hide write run as separate statements. Two reports in the same window can both observe `count = threshold-1` and both fire (or neither fires) the auto-hide. Practical impact small but consistency cost real.

7. **[risky] Kids seat cap is a non-atomic read-modify-insert**
   `web/src/app/api/kids/route.js:113-126`
   Two concurrent POSTs both observe `activeKidCount = max-1`, both pass the cap check, both insert — billing impact. No advisory lock or unique-constraint backstop.

8. **[risky] Permission key mismatch between auth-recovery and delete-account**
   `web/src/app/api/admin/auth-recovery/[user_id]/route.ts:40` vs `admin/users/[id]/route.ts`
   Auth-recovery requires `admin.users.delete`; delete-account requires `admin.users.delete_account`. Two different permission keys for related operations on the same target — granting one without the other produces inconsistent privilege.

9. **[risky] Approve-access-request flips status='approved' even when email send fails**
   `web/src/app/api/admin/access-requests/[id]/approve/route.ts:115-151`
   `invite_sent_at` is correctly gated on `emailId`. But `status='approved'` flips regardless. Subsequent re-trigger from the same admin path returns 409 "Already approved." Recoverable via DB script (find approved rows with `invite_sent_at IS NULL`), but no UI surface for that today.

10. **[risky] Bulk-approve returns 200 with partial email failures buried in body**
    `web/src/app/api/admin/access-requests/bulk-approve/route.ts:115-162`
    `email_failed_ids` is the only signal; HTTP status is success either way. Admin who doesn't read the response body believes everyone was emailed.

11. **[risky] Settings upsert never bumps a cache version**
    `web/src/app/api/admin/settings/upsert/route.ts:67-86`
    Compare with `stripe/webhook.ts:672-677` which explicitly bumps `perms_version` after a settings change. Settings updates here propagate only when client caches naturally expire — admin tweaks have stale-cache lag.

12. **[risky] Reject-access-request route has no idempotency guard**
    `web/src/app/api/admin/access-requests/[id]/reject/route.ts:52-62`
    Plain UPDATE without prior-status check. An already-approved row can be silently flipped to rejected by a network retry / accidental double-click. The approve route returns 409 in the analogous case; reject has no parity.

13. **[risky] Admin support reply missing `requireAdminOutranks`**
    `web/src/app/api/admin/support/[id]/reply/route.ts:12-80`
    Calls `requirePermission('admin.support.reply')` but never enforces rank — every other admin mutation that touches a target user does. A junior moderator can send support replies in the same chrome as senior staff.

14. **[risky] One-way DM block — blocker can't filter incoming convos started before the block**
    `web/src/app/messages/page.tsx:234-244`
    Page loads only outgoing blocks (`blocker_id = me`). If A blocks B, then B initiates a conversation, the post_message RPC enforces "is sender blocked by recipient" only — not "did recipient block sender." A's UI surfaces the message because A's outgoing-block list isn't joined into the receiving check.

15. **[risky] Report flood — same user can report the same target unbounded times**
    `web/src/app/api/reports/route.js:17-30`
    Rate limit is `reports:user:${user.id}` global, not `(reporter, target)`. With auto-hide threshold = 3, a single user submitting 3 reports on one comment trips the auto-hide alone. No `UNIQUE(reporter_id, target_type, target_id)` on the table.

---

## iOS main (VerityPost)

16. **[risky] `DataPrivacyView.saveDmReceiptsPref` never reverts the toggle on error**
    `VerityPost/VerityPost/SettingsView.swift:3911-3922`
    The Hub-side version of the same function (`SettingsView.swift:1248-1265`) reverts state and shows an alert on RPC failure. The DataPrivacy duplicate only `print()`s the error — toggle stays flipped, user thinks the setting saved when it didn't.

17. **[risky] Two divergent `saveDmReceiptsPref` implementations**
    `VerityPost/VerityPost/SettingsView.swift:1248-1265` vs `:3911-3922`
    Same functional name, different error semantics. Different surfaces show different recovery behavior for the same operation.

18. **[risky] DM-receipts toggle re-tap during in-flight save races server state**
    `VerityPost/VerityPost/SettingsView.swift:1049-1056`
    `isDisabled: dmReceiptsLoading` only flips during initial load, not during save. User can tap the toggle while a prior save is mid-RPC, firing a second save that races the first.

19. **[risky] `subscribeToNewComments` task overlap on rapid story switches**
    `VerityPost/VerityPost/StoryDetailView.swift:559`
    `.task(id: story.id)` cancels the prior task, but the channel-unsubscribe runs detached. Old + new subscribe/unsubscribe can interleave; Supabase realtime is idempotent so payload-correctness is fine, but log noise + transient channel-not-found warnings accumulate.

20. **[minor] `dmReceiptsEnabled = r.first?.dm_read_receipts_enabled ?? true` fallback**
    `VerityPost/VerityPost/SettingsView.swift:1244 + :3907`
    Silent fallback to `true` on no-rows or null column. A user who explicitly set `false` in a prior version sees their preference flip to `true` if the column is ever migrated away or the row is wiped.

---

## Kids iOS (VerityPostKids)

21. **[risky] Graduated kid profile falls back to `["kids"]` instead of empty**
    `VerityPostKids/VerityPostKids/ArticleListView.swift:205`
    Owner comment at :201-204 says the fallback is defense-in-depth and should produce an empty list. Code does the opposite — graduated kids see the `kids` band feed when they should see nothing. RLS still blocks the SELECT, so today the symptom is invisible; if RLS regresses, graduated kids leak into kids content.

22. **[risky] `KidReaderView` AsyncImage has no size cap**
    `VerityPostKids/VerityPostKids/KidReaderView.swift:143-150`
    Cover images render via `AsyncImage(url:)` with `.scaledToFill()`. No `URLSession`-side byte cap. A cover URL pointing at a multi-GB file (admin compromise, CDN bug) would OOM the kid's device. `allowedImageHosts` constrains the origin set, not the size.

23. **[risky] `get_kid_category_rank` RPC scoping is unverifiable from the client**
    `VerityPostKids/VerityPostKids/LeaderboardView.swift:301`
    Client passes `p_category_id` only and trusts the RPC to scope to the calling kid via JWT. If the RPC body doesn't enforce `auth.uid()` (or its kid analog), the same call can fetch another kid's rank by varying the category. The client cannot verify scoping; a defensive `result.id == kidId` re-check would be cheap.

24. **[risky] Pending quiz writes can produce duplicate `quiz_attempts` rows**
    `VerityPostKids/VerityPostKids/KidQuizEngineView.swift:37-51`
    On HTTP 200, the rehydrated pending-write queue removes the row from disk only after success; if the app is killed between the 200 response and the queue-removal write, the next launch retries an already-committed insert. No idempotency key on the RPC server-side.

25. **[risky] PairingClient silently treats malformed `expiresIso` as live**
    `VerityPostKids/VerityPostKids/PairingClient.swift:275`
    `if let expires = Self.isoFormatter.date(from: expiresIso)` — on parse failure, the conditional falls through and no expiry check runs. A corrupted UserDefaults string keeps the kid logged in until the server rejects on next request.

---

## Database / RPCs / RLS

26. **[minor] 3 `expert_thread_*` tables have RLS disabled — defense-in-depth only**
    Verified: `expert_mention_post_counters`, `expert_mention_quota_counters`, `expert_thread_chains` all have `relrowsecurity = false`. **However**, `information_schema.role_table_grants` shows zero grants to `anon`, `authenticated`, or `public` on those tables — PostgREST denies any direct read/write by default, so they aren't reachable from the public API today. Real risk only materializes if a future grant is accidentally added. Worth fixing for defense-in-depth, not active.

---

## Notes

- Earlier-shipped fixes deliberately excluded from this list: counter drift on `articles.view_count` / `articles.comment_count` / `articles.bookmark_count`, reading_log telemetry, admin analytics soft-delete, CommentThread N+1, Following sticky tab, iOS auto-zoom on inputs, AvatarEditor mobile grid, `receive_upvote` scoring, sticky tab strip, achievement parity on `events/batch`, mark-seen rollback, story-follow RPC rate-limit, signup_rollback IP cap, kids-end-session cap, 7-endpoint mid-priority rate-limit batch, `mark_story_seen` / `toggle_story_follow` RPC rate limits, `ai_prompt_presets_snapshot_history` RPC drop, item 13 article-summary tightening, expert UI launch-hide.
- 14 shipped today (see CHANGELOG.md 2026-05-08): 2 blockers (#23 escalation cron sweep, #37 score_events FK) + 12 easy-tier (#7-13 input validation, #24 NULL-safe filter, #29 iOS HTTP success range, #36 kids fetch timeout, #38 categories counter trigger + backfill, #40 orphan trigger function drop).
- Refuted candidates from the original 40 (not bugs): React 18 batching protections, `useEffect` cleanup races already guarded by `cancelled` flags, `RegistrationWall` Shift+Tab handling that does exist, `ParentSessionManager` foreground expiry check that does exist, force-unwraps on hardcoded literal URLs, "missing await" on `PermissionService.has()` (it's synchronous), `messages` realtime no-filter (RLS handles it), `user_roles_insert` RLS qual=NULL (INSERT uses `with_check`), 22-tables-no-RLS (most have RLS enabled but no policy → deny-all by default).
