# Expert Threads — Owner Smoke Checklist

**Run before flipping `features.expert_threads_enabled` to true.** Once everything below passes locally and in TestFlight, set the kill switch via `/admin/system` (or `UPDATE settings SET value='true' WHERE key='features.expert_threads_enabled'`).

## 0. Prep

- Pull latest `main`, run `web/` locally with `npm run dev`.
- Confirm `features.expert_threads_enabled = false` in `/admin/system` — the smoke run starts kill-switch-OFF, then flips to ON for the bulk of the matrix.
- Open TestFlight build of iOS adult app. Kids iOS = N/A for this feature.
- Test accounts you'll need (already seeded by `web/scripts/seed-test-accounts.mjs`):
  - `free@veritypost.com` (asker — Free plan)
  - `pro@veritypost.com` (asker — Pro)
  - `family@veritypost.com` (asker — Family seat)
  - `expert@veritypost.com` (verified expert — Politics)
  - `expert2@veritypost.com` (verified expert — Politics + Tech)
  - `mod@veritypost.com` (moderator — `comments.moderate`)
  - `admin@veritypost.com` (owner-mode)
- Pick a published article in the **Politics** category for most flows. For cross-category sanity, pick one in **Tech** for the chrome-attribution check.
- All copy below is verbatim — if the UI shows different wording, that's a regression.

## 1. Kill switch OFF (gate verification)

These confirm Wave 4b doesn't leak feature surfaces while the master flag is false.

- [ ] As `free@`, `expert@`, and `admin@`, type `@expert` in a comment composer on a Politics article. Picker MUST NOT open. The textarea may show the bare-mention picker (treating `@expert` as a username), or nothing — either is acceptable. The expert-styled picker with broadcast + directed list MUST NOT appear.
- [ ] `curl /api/expert/picker?article_id=<any>` while kill-switch off → 404.
- [ ] `curl /api/comments/expert-thread-state?article_id=<any>` while kill-switch off → 404.
- [ ] `curl /api/comments/[id]/close` and `/api/expert/threads/<root>/grant` while kill-switch off → both 404.
- [ ] On iOS: typing `@expert` in a comment composer surfaces no expert picker. Existing bare-mention behavior unchanged.

Now flip `features.expert_threads_enabled = true` in `/admin/system`. Keep going.

## 2. Picker mechanics — web

- [ ] As `free@` on a Politics article, type `@expert`. Picker opens with a green "Ask all experts in Politics" broadcast button at the top + a directed list. Expert rows show `@expert_<username>` + the Expert pill on the right.
- [ ] Type `@expert_e` — list filters to experts whose username starts with `e`.
- [ ] Use ↑/↓ arrows to walk the list. Enter or Tab inserts the active item. Esc closes the picker.
- [ ] Click the broadcast row — composer body now contains `@expert ` (with trailing space, no underscore).
- [ ] Click an expert row — composer body now contains `@expert_<username> `.
- [ ] Try to insert `@expert_<same-username>` twice in one draft. Composer shows: `you've already @'d this expert in this comment.`
- [ ] In the same composer, mash `@expert` to reopen the picker 11 times within a minute. After the 11th open the picker fails to populate AND a `pickerNotice` toast renders: `easy on the search — try again in a sec`. (Server raises `rate_limited` from `list_active_experts_for_category`; spec §2 picker rate-limit.)
- [ ] Wait 65 seconds, reopen picker — populates again (60-sec client cache invalidates with the picker's own server cooldown).

## 3. Picker mechanics — iOS adult

- [ ] Repeat steps 2.1, 2.2, 2.4, 2.5 on iOS. Verify the broadcast row label reads `Ask all experts in Politics`. Tapping it inserts `@expert ` into the body.
- [ ] Verify the rate-limit toast appears (same exact lowercase copy) when the iOS picker is hammered 11+ times in a minute.

## 4. Asker rate caps + cap-hit copy

- [ ] As `free@` (cap 5/day, 2/hr per `plan_features` defaults), post 5 comments today each containing `@expert_<expertUsername>` (or one broadcast = 3 + 1 directed = 4 + 1 more directed = 5 — broadcast costs 3x). The 6th post attempt MUST fail with composer error: `you reached your mentions for today.` (lowercase, no period at end is wrong — it's "today.")
- [ ] Repeat that on iOS adult — same lowercase server `composer_message` surfaces verbatim. (No re-wording client-side.)
- [ ] As `pro@` (10/hr, 30/day), confirm caps tracked separately and 30 directed mentions per UTC day are allowed. Above 30: same cap-hit copy.
- [ ] Edit-swap: post a comment with `@expert_a`, edit to remove that token and add `@expert_b`. Net = 1, day counter unchanged. Confirm by re-posting more mentions until cap hits — count should match 5 (free) including the swap.

## 5. Broadcast cost = 3 mentions

- [ ] As `free@` (cap 5/day), post 1 comment with `@expert` (broadcast). Day counter ticks +3. Post one more `@expert_<directed>` — counter ticks +1, total 4. Post one more directed — total 5. Next attempt → cap-hit.

## 6. Expert active-set filtering

- [ ] As `expert@`, open `/profile` → Expert section → Pause my queue → Until I turn it back on. Save.
- [ ] As `free@`, type `@expert` on a Politics article. `expert@` MUST NOT appear in the directed list.
- [ ] BUT post a comment with `@expert` (broadcast). The queue at `/expert-queue` for `expert@` MUST still receive an item (paused = mentionability OFF, queue scope is shared by category).
- [ ] Un-pause `expert@`. Set Quiet hours 00:00 → 23:59 across all 7 days. Verify directed list excludes `expert@` (in quiet hours).
- [ ] Clear Quiet hours. Set Mention caps per-day to 1. As `free@`, post `@expert_<expert>` once → succeeds. Type `@expert` again — `expert@` MUST NOT appear (at-quota). Inert manual `@expert_<expert>` typed in body still posts as a comment but DOES NOT tick the per-day counter for the expert (per spec §2 Inert mentions).

## 7. Distinctive expert chrome (author-attribute-driven)

- [ ] As `expert@` (Politics expert), reply to any comment on a **Politics** article. The reply renders with `Verified Expert` (or `Verified Expert · <title>`) chip + green left border + green-tinted background.
- [ ] Same `expert@` replies on a **Tech** article (where they are NOT a verified expert). The reply MUST render WITHOUT distinctive chrome — chrome attaches to in-category authorship, not thread mode (spec §2).
- [ ] As `expert2@` (Politics + Tech), reply on either category. Chrome appears on both.
- [ ] iOS parity — repeat above three on iOS adult.

## 8. Thread mode — close + cooldown

- [ ] As `free@`, post a top-level comment containing `@expert_<expert>` on a Politics article. This is the expert thread root (`is_expert_thread_root = true`).
- [ ] Confirm a "Close thread" button appears on that root for `free@` (originator).
- [ ] Click "Close thread" before any expert reply has landed → succeeds immediately (no cooldown applies before any expert has replied — `last_expert_reply_at` is NULL).
- [ ] As `mod@`, click "Reopen (mod)" on the now-closed root. Thread reopens.
- [ ] As `expert@`, reply to the root with a substantive answer.
- [ ] As `free@`, immediately try to "Close thread" again. MUST fail with HTTP 429 + the button shows a countdown like `Close thread (60s)`. After 60 seconds it re-enables.
- [ ] Click "Close thread" again — thread closes. The asker sees a "Thread closed" pill (when no reopen is available to them).
- [ ] As `mod@`, reopen the closed thread. As `free@`, try to immediately re-close → 429 cooldown again (mod-reopen reset of cooldown per spec §2 mitigation #13).
- [ ] iOS parity — repeat the close → cooldown → reopen → re-close-blocked sequence on iOS adult.

## 9. Asker chain caps + Allow-another-reply

- [ ] As `free@`, on a fresh expert thread (root contains `@expert_<expert>`):
  - reply once to the root → chain `(asker=free, expert=<expert>)` count = 1. Below the asker's reply, "1 reply left" affordance.
  - reply twice (chain count = 2). Reply button on the expert's reply now disabled with hover tooltip "Conversation complete with @<expert> — they can grant another reply if you have a follow-up." Inline pill below shows the same copy.
- [ ] As `expert@`, view the same thread. On their own reply they see "Allow another reply" button. Click → POST `/api/expert/threads/<root>/grant`. Free pass granted.
- [ ] As `free@`, refresh. Reply button re-enabled. Free-pass-granted chain accepts more asker replies.
- [ ] iOS parity — same flow on iOS adult.

## 10. Cross-expert collaboration

- [ ] As `free@`, post root with `@expert` (broadcast) on a Politics article. Both `expert@` and `expert2@` are notified (assuming both opted in to broadcast push or are in active-set).
- [ ] As `expert@`, reply.
- [ ] As `expert2@`, also reply to the root. Both expert chrome rows render. Both can post unlimited.
- [ ] As `free@`, "Reply" buttons gated PER (asker, expert) chain — exhausting the chain with `expert@` doesn't gate `free@` from replying to `expert2@`.

## 11. Duplicate-@ rejection — server

- [ ] In a draft, paste `Hi @expert_<u> some text @expert_<u>` (same expert twice). Submit. Server returns 400 with composer message: `you've already @'d this expert in this comment.` Composer surfaces it verbatim.

## 12. Inert mention rendering

- [ ] In `/admin/system`, set `expert.inert_mention.visual_giveaway = false` (default). Post a comment with `@expert_<paused-expert>`. Token renders normally (green-tinted accent, bold) like any expert mention.
- [ ] Flip `expert.inert_mention.visual_giveaway = true`. Reload the article. Same comment's `@expert_<paused-expert>` token renders dim + struck-through with hover title "Expert mention may be inert (paused / quiet hours / at-quota)." (Per spec §2 Inert mentions; visual_giveaway is a coarse signal, not per-token live/inert.)
- [ ] Flip back to `false` for normal launch.

## 13. Edit-swap nets correctly

- [ ] As `pro@` (cap 30/day), use up 28. Post a comment containing `@expert_a`. Counter at 29.
- [ ] Edit that comment to remove `@expert_a` and add `@expert_b @expert_c`. Net = +1 (removed 1, added 2). Counter at 30.
- [ ] Post one more directed `@expert_<x>`. Counter at 31 → cap-hit. Confirm the cap-hit composer copy.

## 14. Deleted reply still counts

- [ ] In an active expert thread chain at count 2, asker deletes one of their replies. Refresh. Chain `asker_reply_count` MUST still read 2 — Reply button stays disabled. The asker's Reply button area shows the deleted-still-counts copy (or simply remains disabled with the cap-hit affordance) per spec §2 "Delete-reply behavior."

## 15. Cache version-bump invalidation

- [ ] Change `expert.default_per_day_quota` in `/admin/system` (e.g., 25 → 30). Save. The save handler bumps `expert.config.version`.
- [ ] On a different Vercel instance (or kill the local Next dev process and restart), trigger a request that reads expert config. Within ~5s the new value is live. (Single-row version probe in `expertConfig.ts`.)

## 16. Picker rate-limit burst (server)

- [ ] As `free@`, hammer `/api/expert/picker?article_id=<x>` 11 times in 60 seconds (eleven separate fetches). The 11th MUST return 429 with `{ error: 'rate_limited', composer_message: 'easy on the search — try again in a sec' }`.

## 17. Deadlock prevention under concurrent reply load

- [ ] In two browser tabs as the same `free@`, on the SAME expert thread (count = 1) click Reply at the same time on the expert's reply, post short bodies simultaneously. ONE succeeds (count → 2), the other fails cleanly with cap-hit (no deadlock, no 500). The chain row's `SELECT … FOR UPDATE` with deterministic ORDER BY (asker, expert) lock acquisition handles the race per spec §2 mitigation #8.

## 18. Quiet-hours-end digest

- [ ] As `expert@`, set Quiet hours so that they end ~5 minutes from now. Save.
- [ ] As `free@`, post a comment with `@expert_<expert>` while still in quiet hours. The directed mention does NOT fire push (deferred). Notification row written.
- [ ] When quiet hours end and the cron runs (every 5 min), `expert@` receives ONE summary push: `You have N new mentions from quiet hours.` Then `last_quiet_hours_digest_at` is updated.

## 19. Owner-mode bypass — sanity

- [ ] As `admin@` (owner-mode), post a comment with `@expert_<expert>`. Cap counters do NOT increment. Chain caps don't fire even on cross-expert chains in the same thread. (Per spec §2 mitigation #3 + Lock #10.)
- [ ] In `expert_thread_chains` audit log path, owner-mode grants are stamped `via=owner_mode` (verify by triggering a grant as `admin@` and checking server logs / audit table).

## 20. Web push prefs visibility

- [ ] As an expert with iOS push prefs set (use TestFlight to flip both `notify_push_on_mention` and `notify_push_on_category_arrival` to true), open the same account on web → `/profile` → Expert section. The Push block is visible as a read-only "Push managed in iOS app" panel.
- [ ] As an expert with NO iOS push prefs set, open web → `/profile` → Expert section. The Push block is hidden entirely.

---

## Final gate

When all 20 sections pass on web AND iOS adult (where applicable), flip `features.expert_threads_enabled` to true in `/admin/system`. The save handler bumps `expert.config.version` automatically — within ~5s the production tree honours the flip on every Vercel instance.

**Rollback** is a single SQL update: `UPDATE settings SET value='false' WHERE key='features.expert_threads_enabled'`. The cache version bump pushes the rollback live within ~5s as well. Settings persist across the flip — pause / quiet hours / quotas the experts have already configured do not get cleared.

If anything breaks during owner testing, spin up a new fix session with a clear repro from the relevant section above. Wave 4b/5 implementation files to start with:

- Web composer / picker: `web/src/components/CommentComposer.tsx`, `web/src/app/api/expert/picker/route.js`
- Web thread UI: `web/src/components/CommentThread.tsx`, `web/src/components/CommentRow.tsx`
- Web thread state load: `web/src/app/api/comments/expert-thread-state/route.js`
- Inert flag exposure: `web/src/app/api/settings/public/route.ts`
- Close / reopen / grant: `web/src/app/api/comments/[id]/close/route.js`, `web/src/app/api/expert/threads/[root_id]/grant/route.js`
- iOS settings: `VerityPost/VerityPost/SettingsView.swift` (`ExpertProfileView`)
- iOS composer + thread: `VerityPost/VerityPost/StoryDetailView.swift`
- iOS models: `VerityPost/VerityPost/Models.swift` (`ExpertApplication`, `VPComment` thread-mode fields)
- iOS push prefs handoff: `web/src/app/api/expert/availability/route.js` (also accepts the two iOS-EXCLUSIVE push fields)
