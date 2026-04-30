# Slice 04 — Discussion & Comments

**Status:** locked
**Locked:** 2026-04-30 (Session 6)
**Files in scope:** `CommentThread.tsx`, `CommentComposer.tsx`, `CommentRow.tsx`, `ArticleEngagementZone.tsx`, `web/src/app/api/comments/route.js`, `web/src/app/api/comments/[id]/route.js`, `web/src/app/api/cron/score-comments/route.ts`

---

## Carry-ins from Slice 03 (do not re-investigate)

- **Carry-in 1 (implemented):** `CommentComposer` locked state copy is "Complete the quiz above to comment." (Slice 03 F2 fix). Current file still reads "Pass the quiz to join the discussion." — the F2 fix ships this.
- **Carry-in 2 (planned, not yet implemented):** `ArticleEngagementZone.tsx:56` is `quizPassed={hasQuiz ? hasPassed : false}` — the Slice 03 F3 fix changes `false` → `true`. Until shipped, signed-in users on no-quiz articles see a locked composer.

---

## FK hint check

- `CommentThread.tsx` GET path: `select('*')` + separate `public_profiles_v` query — no `!fk` hints.
- `POST /api/comments/` re-fetch at `route.js:185`: `users!fk_comments_user_id` — correct `fk_` prefix. ✓
- No other `!fk` hints in Slice 04 files. Rule satisfied.

---

## Findings

### F1 — Empty thread state copy wrong for anon and quiz-not-passed users

**Status:** decided
**Priority:** HIGH

**What a reader experiences:** `CommentThread.tsx:1073` renders one hardcoded string regardless of user state: "No comments yet. You passed the quiz — start the conversation." Anon readers (no quiz taken, cannot post) and signed-in quiz-not-passed readers both see this. The quiz claim is false for both groups.

**Root cause:** Single static string inside the `tops.length === 0` block. A code comment at lines 1056–1059 claims the component is only mounted for quiz-passed readers — this is incorrect. `ArticleEngagementZone.tsx:30–37` mounts `CommentThread` for anon users with `quizPassed={false}`.

**Design decision:** Branch the empty-state on `currentUserId` and `quizPassed`:

| User state | Copy |
|---|---|
| Anon, empty thread | "No comments yet." |
| Signed-in, not passed, empty thread | "Take the knowledge check above to unlock comments." |
| Signed-in, passed, empty thread | "No comments yet. Start the discussion." |

Anon state is copy-only — no inline sign-in button. The Slice 02 F2 anon CTA block (above the thread) handles conversion. **Implementation dependency:** F1 and Slice 02 F2 must ship together or Slice 02 F2 first. Without the CTA block, anon readers on non-empty threads have no sign-up path.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: lines 1065–1077 (the `tops.length === 0` block)
- Replace the hardcoded string with a ternary: `if (!currentUserId)` → anon copy; `else if (!quizPassed)` → not-passed copy; `else` → passed copy
- `emptyStateExtra` editorial follow-up renders only for the passed case (existing behavior)
- No new props needed — `currentUserId` and `quizPassed` are already on `CommentThreadProps`

---

### F2 — No visual indicator when new comments arrive via realtime

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentThread.tsx:258–290` (T300 realtime INSERT handler) silently appends new comments to state with no visual signal. A reader engaged mid-thread during a breaking news story has no way to know the conversation is growing.

**Root cause:** INSERT handler calls `setComments()` directly with the enriched comment — no pending state, no count, no indicator.

**Design decision:** "N new comment(s) — click to load" bar, sticky at the bottom of the thread container. Appears when realtime INSERTs arrive and reader is not scrolled to the bottom. Click scrolls to the first new comment and clears the count. No auto-scroll. No toast. Plain text, monochrome.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Add `pendingCount` state and `pendingQueue` ref
- In the INSERT handler: if reader is at the bottom of the thread, append directly (existing behavior). If not at the bottom, push to `pendingQueue` and increment `pendingCount`.
- Render the bar when `pendingCount > 0`: `"{pendingCount} new comment{pendingCount === 1 ? '' : 's'} — click to load"`, positioned sticky at the bottom of the thread container (`position: sticky; bottom: 16px` inside the thread wrapper)
- On bar click: flush `pendingQueue` into `setComments`, scroll to the first new comment's DOM node via ref, reset `pendingCount` to 0
- Adversarial clarification: flushed pending comments do NOT get the `justRevealed` stagger animation — that animation fires only on mount for the initial quiz-unlock batch. Stagger targets are stable because pending comments are held outside state until flushed.

---

### F3 — Reply composer shows no reply context

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentComposer.tsx:253` — when replying, placeholder "Write a reply…" with no parent username, no excerpt. Reader loses the conversational thread between clicking Reply and typing.

**Root cause:** `CommentComposer` receives `parentId` (line 16) but no parent content. The `CommentRow:523` mount site has the parent comment's `body` and `users?.username` in scope but does not pass them through.

**Design decision:** Add parent context strip above the textarea when replying: author username + first 120 chars of parent body, truncated with ellipsis, in a left-border quote block.

**Fix plan:**
- File: `web/src/components/CommentComposer.tsx`
  - Add to interface: `parentAuthorUsername?: string` and `parentBodyExcerpt?: string`
  - When both are present, render above the textarea:
    ```
    Replying to @{parentAuthorUsername}
    "{parentBodyExcerpt}…"
    ```
    Styling: `borderLeft: '2px solid var(--border, #e5e5e5)', paddingLeft: 8, marginBottom: 8, fontSize: 12, color: 'var(--dim, #888)'`
- File: `web/src/components/CommentRow.tsx`
  - At the `CommentComposer` mount at line 523, pass:
    - `parentAuthorUsername={comment.users?.username}`
    - `parentBodyExcerpt={comment.body?.replace(/\s+/g, ' ').slice(0, 120)}`
    (strip newlines, truncate to 120 chars)

---

### F4 — Reply button disappears silently at max depth

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentRow.tsx:390` — at max depth (default 2, admin-configurable), the Reply button simply does not render. No explanation.

**Root cause:** `{canReply && commentDepth < commentMaxDepth && (<button>Reply</button>)}` — no else branch.

**Adversarial finding absorbed:** `CommentRow.tsx:111–141` fetches `commentMaxDepth` from `/api/settings/public` independently per row instance. On a 50-comment thread this fires 50 identical requests. Fix: lift to a shared hook or React context, fetched once per thread render.

**Design decision:** Non-interactive `<span>` "Max reply depth reached." at dim color in place of the missing button. Depth limit itself remains admin-configurable.

**Fix plan:**
- File: `web/src/components/CommentRow.tsx`
  - At line 390, add else branch: `{canReply && commentDepth >= commentMaxDepth && (<span style={{ fontSize: 11, color: 'var(--dim, #888)' }}>Max reply depth reached.</span>)}`
  - Lift `commentMaxDepth` fetch out of individual CommentRow into a shared context or a single `useEffect` in `CommentThread.tsx` passed down as a prop. Removes the N-fetch anti-pattern.

---

### F5 — Muted/banned composer copy cross-references off-screen banner

**Status:** decided
**Priority:** LOW

**What a reader experiences:** `CommentComposer.tsx:216` — both muted and banned states show "Posting is disabled while the account notice at the top of the page applies." By the time a reader scrolls to the composer on a long article, the `AccountStateBanner` in `NavWrapper.tsx:428` may be off-screen. The composer gives no inline state summary and no mute expiry.

**Root cause:** Generic placeholder copy. `muteState` at line 44 already has `banned: boolean` and `muted_until: string | null` — the data to branch on is present.

**Adversarial finding absorbed:** `muted_until` is a raw ISO string from the database. Must be formatted before display.

**Design decision:** Replace generic copy with inline state-specific copy drawn from `muteState`:

| State | Copy |
|---|---|
| Banned | "Your account is banned. Posting is disabled." |
| Muted with `muted_until` | "You are muted until [formatted datetime]. You can read but not post until then." |
| Muted, no expiry | "You are muted. Posting is disabled." |

Banned copy matches `AccountStateBanner.tsx:47–50` exactly for consistency.

**Fix plan:**
- File: `web/src/components/CommentComposer.tsx`
- Replace the static string at line 216 with conditional:
  ```tsx
  const muteMsg = muteState.banned
    ? 'Your account is banned. Posting is disabled.'
    : muteState.muted_until
      ? `You are muted until ${new Date(muteState.muted_until).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        })}. You can read but not post until then.`
      : 'You are muted. Posting is disabled.';
  ```
- Render `{muteMsg}` in the existing `muteBannerStyle` div.

---

### F6 — Vote counts are not optimistic

**Status:** decided
**Priority:** LOW

**What a reader experiences:** `CommentRow.tsx:357/365` — vote counts (`comment.upvote_count`, `comment.downvote_count`) read directly from props. After clicking, count stays stale until parent's `handleVote` callback resolves (network round-trip). Brief lag on every vote.

**Root cause:** `handleVote` in `CommentThread.tsx` calls `setComments()` only after the server responds, not before.

**Adversarial clarification:** Optimistic update should live in `CommentThread.handleVote`, not in CommentRow — no architecture change or new props needed.

**Design decision:** Optimistic update with rollback in `CommentThread.handleVote`.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- In `handleVote`: snapshot current counts, call `setComments()` optimistically with expected new counts before `await fetch(...)`, revert to snapshot in the error path.
- Server response reconciles the authoritative counts after success.

---

### F7 — `comments.story_id` FK uses ON DELETE CASCADE

**Status:** decided
**Priority:** HIGH (compliance risk)

**What a reader experiences (UX surface):** Deleting a story permanently and silently destroys all comment history — including `moderation_actions` audit records. For a surface with an active NCMEC-reporting path (§ 2258A), losing the audit trail on story deletion is both a UX gap and a compliance concern.

**Root cause:** `supabase/migrations/2026-04-29_slice05_stories_as_containers.sql` — `ADD COLUMN story_id uuid NULL REFERENCES public.stories(id) ON DELETE CASCADE`. Spec required `ON DELETE SET NULL`.

**Adversarial clarification:** `reports` table uses polymorphic `target_id/target_type` — no direct FK to `comments`, no cascade chain risk. `moderation_actions.comment_id` references `comments.id` (not `comments.story_id`) — unaffected by this migration. Migration is clean.

**Design decision:** Change constraint to `ON DELETE SET NULL`.

**Fix plan:**
- New migration file in `supabase/migrations/`
- Drop the existing CASCADE FK constraint on `comments.story_id`
- Re-add: `ALTER TABLE comments ADD CONSTRAINT fk_comments_story_id FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL`
- Apply via MCP `apply_migration` before any implementation session for this slice

---

### F8 — `score-comments` cron hardcodes model string

**Status:** deferred (site-bug-sweep)
**Priority:** LOW (indirect UX)

**What a reader experiences:** `web/src/app/api/cron/score-comments/route.ts:60` — `model: 'claude-haiku-4-5-20251001'` hardcoded literal. Cannot upgrade moderation model without a code deploy. Indirect UX impact: lower moderation quality → more toxic comments surface before human review.

**Named reason for defer:** This is a code hygiene / ops issue, not a UX design decision. Fix: `process.env.SCORE_MODEL ?? 'claude-haiku-4-5-20251001'`. Belongs in site-bug-sweep, not in this program's implementation session.

---

## Files with locked fix plans

| File | Findings |
|---|---|
| `web/src/components/CommentThread.tsx` | F1 (empty state), F2 (realtime indicator), F6 (optimistic votes) |
| `web/src/components/CommentComposer.tsx` | F3 (reply context — new props), F5 (muted/banned copy) |
| `web/src/components/CommentRow.tsx` | F3 (reply context — pass props), F4 (max depth affordance + lift settings fetch) |
| `supabase/migrations/` | F7 (SET NULL migration) — apply before implementation session |

**Implementation dependency:** F1 (anon empty-state copy) and Slice 02 F2 (anon CTA block) must ship together or Slice 02 F2 first.

---

## Adversarial review — 2026-04-30

Adversary read: `CommentThread.tsx`, `CommentComposer.tsx`, `CommentRow.tsx`, `ArticleEngagementZone.tsx`, `web/src/app/api/comments/route.js`. Findings:

- Confirmed F1 scope (T142 code comment is wrong; anon users do reach the empty state)
- Confirmed F2 pending-queue not yet in code (expected — not implemented yet)
- Confirmed F3 fields available at CommentRow:523 (no lookup needed)
- Flagged F4 settings over-fetch (N requests per thread) — absorbed into fix plan
- Flagged F5 ISO string formatting — absorbed into fix plan
- Clarified F6 vote ownership (CommentThread, not CommentRow) — absorbed
- Cleared F7 cascade chain (reports table unaffected; moderation_actions unaffected)
- Flagged F1 + Slice 02 F2 ordering dependency — absorbed

No new owner decisions required from adversarial pass.
