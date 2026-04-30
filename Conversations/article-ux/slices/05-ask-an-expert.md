# Slice 05 — Ask-an-Expert

**Status:** locked
**Locked:** 2026-04-30 (Session 7)
**Files in scope:** `web/src/components/CommentThread.tsx`, `web/src/components/CommentRow.tsx`, `web/src/app/api/expert/ask/route.js`, `web/src/app/api/expert/answers/[id]/route.js`, `web/src/app/expert-queue/page.tsx`, `web/src/components/ExpertApplyForm.tsx`

---

## Entry point and flow

- Reader entry: `CommentThread.tsx:719–722` — `{currentUserId && canAskExpert && !expertDialogOpen && <button>+ Ask an Expert</button>}`. `canAskExpert` = `permsLoaded ? hasPermission('expert.ask') : false` (line 109). Anon users and users without `expert.ask` permission see no button.
- Expert dialog: `CommentThread.tsx:725–789` — full-screen modal overlay; textarea; "Send to queue" button.
- Submission: `CommentThread.tsx:540–574` — `submitExpertQuestion` calls `POST /api/expert/ask`; on success, closes dialog. Expert question is written to `comments` table with `is_expert_question: true`.
- API: `web/src/app/api/expert/ask/route.js` — `v2LiveGuard` kill-switch (line 7/13-14), 5/min rate limit (lines 31–42), 1000-char server-side body limit (lines 51–58), calls `ask_expert` RPC (lines 59–65). Returns `{ comment_id, queue_item_id }`.
- Expert sees question in `expert-queue/page.tsx`; posts answer via `POST /api/expert/queue/[id]/answer` — separate route, not public comments API.
- Expert answer: written to `comments` table with `is_expert_reply: true`. Rendered in `CommentRow.tsx:195–256` with green background and "Expert" badge.
- Expert filter: `CommentThread.tsx:612–614` — `expertFilter` state filters `displayComments` to only `is_expert_question || is_expert_reply` rows.

## FK hint check

- `POST /api/expert/ask` calls `ask_expert` RPC — no `.select()` with `!fk` hints. Rule satisfied.
- F2 follow-up fetch (planned fix) must use `users!fk_comments_user_id` — correct `fk_` prefix per database.ts.

---

## Findings

### F1 — No feedback after submitting an expert question

**Status:** decided
**Priority:** HIGH

**What a reader experiences:** `CommentThread.tsx:567–568` — on success, `submitExpertQuestion` calls `setExpertDialogOpen(false)` and nothing else. The dialog closes. No confirmation copy, no flash message, no indicator that anything was received. A reader who submits a question has no signal the request went through.

**Root cause:** Success path is a no-op beyond closing the dialog. `flashMessage` state already exists at `CommentThread.tsx:410–415` with a render zone at `793–807`.

**Design decision:** Flash message: "Your question has been received. An expert in this area will answer in the thread." — 4s, using existing `flashMessage` state and render zone. No change to dialog close behavior.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: `submitExpertQuestion` success path, lines 567–568
- After `setExpertDialogOpen(false)`, add:
  ```tsx
  setFlashMessage('Your question has been received. An expert in this area will answer in the thread.');
  setTimeout(() => setFlashMessage(null), 4000);
  ```
- `flashMessage` state and render zone (lines 793–807) already exist — no new state needed.

---

### F2 — Expert question not injected into thread after submission

**Status:** decided
**Priority:** HIGH

**What a reader experiences:** `CommentThread.tsx:567–568` — success path closes dialog and shows flash (F1 fix), but the submitted expert question never appears in the thread. Reader sees the thread unchanged. If they scroll looking for their question, they find nothing.

**Root cause:** `submitExpertQuestion` success path has no call to `setComments`. The `ask_expert` RPC writes the comment to the DB but the component state is not updated.

**Adversarial clarification (resolved):** `ask_expert` RPC returns `{ comment_id: uuid, queue_item_id: uuid }` — not the full comment object. A follow-up fetch by `comment_id` is required before injecting into state. Route.js confirms: `return NextResponse.json(data)` at line 68 forwards the RPC result directly, so client receives `{ comment_id, queue_item_id }`. The button stays visible after submission — only the dialog closes.

**Design decision:** Follow-up fetch after success; inject returned comment into `setComments`; button remains visible.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: `submitExpertQuestion` success path, after getting `data` from `/api/expert/ask`
- Add follow-up fetch:
  ```tsx
  const { data: newComment } = await supabase
    .from('comments')
    .select('*, users!fk_comments_user_id(username, avatar_url, expert_title, is_verified)')
    .eq('id', data.comment_id)
    .single();
  if (newComment) setComments(prev => [...prev, newComment as CommentWithAuthor]);
  ```
- Note: FK hint `users!fk_comments_user_id` matches `fk_` prefix convention per database.ts. ✓

---

### F3 — Expert question comments have no visual label

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentRow.tsx` — `is_expert_reply` comments get green background styling (lines 195–202) and an "Expert" badge (lines 243–256). `is_expert_question` comments render identically to regular comments — no label, no visual distinction, no author context about why this comment looks like a question.

**Root cause:** No `is_expert_question` branch exists in `CommentRow.tsx`. Expert reply has styling; expert question has none.

**Adversarial clarification (resolved):** Label position — use a separate `<div>` above the flex row, matching the "Pinned as Article Context" pattern at `CommentRow.tsx:205–210`. This is cleaner than adding a 4th flex item in the header row. `isOwner` check is already at line 149 (`const isOwner = !!currentUserId && comment.user_id === currentUserId`) — reuse it.

**Design decision:** Separate `<div>` above the flex row with label text. "Question for an expert" (all readers) / "Your question for an expert" (isOwner). Neutral left-border styling, no fill, no status. Matching editorial register.

**Fix plan:**
- File: `web/src/components/CommentRow.tsx`
- Location: after line 211 (after `is_context_pinned` block closes), inside the comment wrapper div
- Add:
  ```tsx
  {comment.is_expert_question && (
    <div style={{ fontSize: 11, color: 'var(--dim, #888)', marginBottom: 6, borderLeft: '2px solid var(--border, #e5e5e5)', paddingLeft: 8 }}>
      {isOwner ? 'Your question for an expert' : 'Question for an expert'}
    </div>
  )}
  ```
- `isOwner` at line 149 is already in scope — no new prop needed.

---

### F4 — Expert dialog header and button copy uses internal jargon

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentThread.tsx:725–789` — dialog header reads "Ask an Expert — routes to the category queue." Button reads "Send to queue." A reader sees "routes to the category queue" and "Send to queue" — internal product vocabulary that is meaningless to the public and implies backstage routing rather than a direct expert connection.

**Root cause:** Developer-authored copy left in production JSX.

**Design decision:** Header → "Ask an Expert" (trim the routing annotation). Placeholder text unchanged (describes the kind of question to ask). Button → "Submit question". Loading state → "Submitting…".

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: expert dialog JSX, lines 725–789
- Change header text from `"Ask an Expert — routes to the category queue"` → `"Ask an Expert"`
- Change button text from `"Send to queue"` → `"Submit question"`
- Change loading text (if present) → `"Submitting…"` (add if not present)

---

### F5 — No expert recruitment prompt when expert replies are visible

**Status:** decided
**Priority:** LOW

**What a reader experiences:** A signed-in reader sees expert answers in the thread (green-bordered expert reply rows). There is no affordance to apply as an expert. The only path is navigating independently to `/profile/settings/expert`. A knowledgeable reader who would make a good expert has no discovery path.

**Root cause:** No recruitment line exists in `CommentThread.tsx`. `ExpertApplyForm.tsx` lives in the profile/settings section with no in-thread link.

**Adversarial clarification (resolved):** Expert status is not available as a variable in `CommentThread.tsx` — cannot gate this on "user is not already an expert." Gate on `!!currentUserId` only. The `/api/expert/apply` route handles duplicate applications gracefully; the profile page shows current status if already applied.

**Design decision:** Single line of text below the comment list, gated on `visible.some(c => c.is_expert_reply) && !!currentUserId`. Copy: "Are you an expert in this area? Apply to answer reader questions." Links to `/profile/settings/expert`. Dim styling, not a CTA button.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: after line 1115 (end of the empty-state / comment-list conditional), before the closing `</div>` at line 1116
- Add:
  ```tsx
  {visible.some(c => c.is_expert_reply) && !!currentUserId && (
    <div style={{ fontSize: 12, color: 'var(--dim, #888)', marginTop: 16, textAlign: 'center' }}>
      Are you an expert in this area?{' '}
      <a href="/profile/settings/expert" style={{ color: 'var(--dim, #888)', textDecoration: 'underline' }}>
        Apply to answer reader questions.
      </a>
    </div>
  )}
  ```

---

### F6 — Expert textarea has no character limit or counter

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentThread.tsx:725–789` — expert dialog textarea has no `maxLength` attribute and no character counter. The server enforces a 1000-character limit at `web/src/app/api/expert/ask/route.js:51–58`. A reader who types a long question has no warning until the server rejects it.

**Root cause:** Server-side limit at `route.js:51–58`; no client-side enforcement or feedback.

**Design decision:** `maxLength={1000}` on textarea. Character counter appears at 800+ characters. Counter turns red at 950+.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: expert dialog textarea, lines 725–789
- Add `maxLength={1000}` to the `<textarea>` element
- Add character counter below the textarea:
  ```tsx
  {expertBody.length >= 800 && (
    <div style={{ fontSize: 11, color: expertBody.length >= 950 ? '#dc2626' : 'var(--dim, #888)', textAlign: 'right', marginTop: 4 }}>
      {expertBody.length}/1000
    </div>
  )}
  ```
- `expertBody` is the existing controlled state for the textarea — no new state needed.

---

### F7 — Expert dialog uses yellow styling

**Status:** decided
**Priority:** LOW

**What a reader experiences:** `CommentThread.tsx:725–789` — expert dialog background is `#fffbeb` (pale yellow), border is `#fde68a` (amber). Yellow reads as "caution" or "notification" — neither is the right register for an editorial Q&A form. It also breaks the monochrome visual language of the rest of the site.

**Root cause:** Hardcoded yellow values in dialog JSX.

**Adversarial clarification (resolved):** Three values require substitution: background `#fffbeb`, border color `#fde68a`, and header text color (if hardcoded — verify at implementation). Replace with theme tokens.

**Design decision:** Three substitutions: `#fffbeb` → `var(--card, #fff)`, `#fde68a` → `var(--border, #e5e5e5)`, header text → `var(--accent, #111)`.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Location: expert dialog JSX, lines 725–789
- Replace `background: '#fffbeb'` → `background: 'var(--card, #fff)'`
- Replace `'#fde68a'` (border) → `'var(--border, #e5e5e5)'`
- Replace any hardcoded header text color → `'var(--accent, #111)'`
- (Verify at implementation — adversary flagged header text may also be hardcoded)

---

### F8 — Expert dialog missing focus trap

**Status:** decided
**Priority:** MEDIUM

**What a reader experiences:** `CommentThread.tsx:725–789` — expert dialog is a full-screen modal overlay. Keyboard users can tab out of the dialog into background content. Pressing Escape does not close the dialog. The report modal at `CommentThread.tsx:536` uses `useFocusTrap({ onEscape: () => setReportTarget(null) })` — expert dialog has no equivalent.

**Root cause:** `useFocusTrap` was not applied to the expert dialog.

**Adversarial confirmation:** Focus trap completely absent from expert dialog; report modal pattern at line 536 is the exact model to follow.

**Design decision:** Add `useFocusTrap` matching report modal pattern exactly. Escape closes dialog.

**Fix plan:**
- File: `web/src/components/CommentThread.tsx`
- Add near expert dialog JSX:
  ```tsx
  const expertFocusTrap = useFocusTrap({ onEscape: () => setExpertDialogOpen(false) });
  ```
- Spread `{...expertFocusTrap}` on the dialog's root `<div>` (the inner dialog container, not the overlay)
- Pattern matches report modal at line 536 exactly

---

## Files with locked fix plans

| File | Findings |
|---|---|
| `web/src/components/CommentThread.tsx` | F1 (flash on submit), F2 (inject question), F4 (copy), F5 (recruitment line), F6 (char limit/counter), F7 (dialog styling), F8 (focus trap) |
| `web/src/components/CommentRow.tsx` | F3 (expert question label) |

---

## Adversarial review — 2026-04-30

Adversary read: `CommentThread.tsx` (full expert dialog + submit handler + flashMessage zone), `CommentRow.tsx` (expert reply styling + isOwner), `web/src/app/api/expert/ask/route.js` (RPC call + return), `supabase/database.ts` (ask_expert RPC signature). Findings:

- **F2 blocker resolved:** `ask_expert` returns `{ comment_id, queue_item_id }` (jsonb), not the full comment. Follow-up fetch by `comment_id` required. Fix plan updated to include follow-up fetch with `users!fk_comments_user_id` hint.
- **F1 confirmed:** `flashMessage` state and render zone already exist. F1 fix is additive-only — no new state.
- **F3 label position resolved:** "Pinned as Article Context" pattern at line 205–210 is the correct model — separate `<div>` above flex row, not inline in header. `isOwner` at line 149 is in scope.
- **F5 expert status gate:** Expert status not available in `CommentThread` — gate on `!!currentUserId` only. Apply page handles duplicates.
- **F6 confirmed:** Report modal textarea at line 907 has `maxLength={1000}` — expert textarea does not. Consistent fix.
- **F7 three substitutions confirmed:** background, border, and header text color require update.
- **F8 confirmed:** `useFocusTrap` completely absent from expert dialog; report modal at line 536 is the exact pattern.
- **Anon path confirmed:** Anon users never see the `+ Ask an Expert` button (gated on `currentUserId && canAskExpert`). No anon state to handle for F1–F8.

No new owner decisions required from adversarial pass.
