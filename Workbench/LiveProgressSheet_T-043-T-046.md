# LiveProgressSheet — T-043 / T-046
Started: 2026-04-26

## User Intent

**T-043** — Add toast on success and failure to the two specific high-stakes mutation flows in messages/page.tsx:
- `sendMessage()` — currently restores draft on failure (line 495), but shows no user-visible feedback for either success or failure
- `blockOtherUser()` + `submitReport()` — currently use an inline `actionToast` state (local banner strip in header area, lines 1169-1182), NOT the global Toast system

The owner-scope says "check which await fetch calls lack success/failure toasts" and to use the proper Toast component from Toast.tsx.

Quiz submit path: ArticleQuiz.tsx (`submitAttempt`) — on failure sets `setError()` inline. On success shows result panel, no toast needed (the result stage IS the feedback). No toast change needed for quiz submit (feedback is the result UI).

**T-046** — Create `web/src/lib/dates.ts` with:
- `formatDate(iso)`: "April 26, 2026" — Intl.DateTimeFormat, explicit en-US
- `formatDateTime(iso)`: "Apr 26, 2026, 2:34 PM"
- `timeAgo(iso)`: extracted from CommentRow.tsx lines 63-73

Update CommentRow.tsx to import timeAgo from dates.ts.

Sweep 15 raw toLocaleDateString/toLocaleString call sites in web/src/app/ — replace with formatDate/formatDateTime. Scope: non-admin, non-story/[slug] pages.

## Live Code State

### T-043 — messages/page.tsx

**sendMessage() (lines 481-515):**
- On failure (line 493-496): sets `setInput(body)` to restore draft. No toast. No user feedback. Silent failure.
- On success (line 500-514): updates local state, scrolls. No toast. No user feedback.
- `sendMessage` is NOT currently imported or using Toast system at all.

**blockOtherUser() (lines 620-658):**
- On failure (line 637-645): sets `actionToast` string
- On success (line 649-650): sets `actionToast` string
- `actionToast` is rendered as an inline banner (lines 1169-1182) inside the chat header area — custom local state, not the global Toast system
- `setTimeout(() => setActionToast(''), 3000/3500)` pattern used for auto-clear

**submitReport() (lines 663-697):**
- On failure (line 681-684): sets `actionToast`
- On success (line 686-687): sets `actionToast`
- Same inline banner pattern

**State:** `actionToast` (string) at line 149. Rendered at lines 1169-1182 as inline `role="status"` strip.

**Toast.tsx is available** at web/src/components/Toast.tsx with:
- `ToastProvider` wrapping the root layout (layout.js lines 203-210)
- `useToast()` hook returning `.success()`, `.error()`, `.info()`
- Error defaults to 6000ms duration; success/info to 4000ms

**Quiz submit (ArticleQuiz.tsx lines 131-171):**
- On success: sets `setResult(data)` + `setStage('result')` — result card IS the UI feedback
- On failure: sets `setError()` inline in the component
- No toast required — the result stage panel is the correct UX here per the quiz brand spec

### T-046 — Current state of files

**CommentRow.tsx lines 63-73:**
```
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}
```

**web/src/lib/dates.ts:** Does NOT exist yet.

**story/[slug]/page.tsx** has its own local `formatDate()` at lines 91-98 (with en-US locale) — task says DO NOT touch this file.

**15 toLocaleDateString/toLocaleString call sites to replace** (non-admin, non-story/[slug]):
1. recap/page.tsx:126 — `new Date(r.week_start).toLocaleDateString()` → formatDate
2. recap/[id]/page.tsx:172 — `new Date(recap.week_start).toLocaleDateString()` → formatDate
3. category/[id]/page.js:428 — `new Date(story.published_at).toLocaleDateString()` → formatDate
4. search/page.tsx:265 — `new Date(a.published_at).toLocaleDateString()` → formatDate
5. bookmarks/page.tsx:486 — `new Date(b.created_at).toLocaleDateString()` → formatDate
6. expert-queue/page.tsx:318 — `new Date(it.created_at).toLocaleDateString()` → formatDate
7. expert-queue/page.tsx:378 — `new Date(it.answered_at).toLocaleString()` → formatDateTime
8. expert-queue/page.tsx:456 — `new Date(m.created_at).toLocaleString()` → formatDateTime
9. profile/settings/expert/page.tsx:245 — `new Date(application.created_at).toLocaleDateString()` → formatDate
10. profile/settings/expert/page.tsx:253 — `new Date(application.probation_ends_at).toLocaleDateString()` → formatDate
11. profile/family/page.tsx:203 — `new Date(report.week_ending).toLocaleDateString()` → formatDate
12. profile/family/page.tsx:278 — `new Date(a.earned_at).toLocaleDateString()` → formatDate
13. notifications/page.tsx:370 — `new Date(n.created_at).toLocaleString()` → formatDateTime
14. profile/kids/[id]/page.tsx:76+563 — `new Date(iso).toLocaleDateString()` → formatDate
15. profile/kids/[id]/page.tsx:532 — `new Date(s.scheduled_at).toLocaleString()` → formatDateTime
16. appeal/page.tsx:176 — `new Date(w.created_at).toLocaleString()` → formatDateTime

Also profile/page.tsx has date (not numeric) toLocaleDateString calls:
- line 116: custom format `{ month: 'short', day: 'numeric' }` — skip (custom format)
- line 619: custom format `{ month: 'long', year: 'numeric' }` — skip (custom format)
- line 735: bare `toLocaleDateString()` on frozen_at — replace with formatDate

**Helper Brief:**
- `timeAgo` in CommentRow.tsx is a private function — after extraction to dates.ts, the import replaces it
- `formatDate` needs to produce "April 26, 2026" — use `{ year: 'numeric', month: 'long', day: 'numeric' }`
- `formatDateTime` needs to produce "Apr 26, 2026, 2:34 PM" — use `{ year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }`
- All Intl.DateTimeFormat calls must specify `'en-US'` locale explicitly
- category/[id]/page.js is a .js file — must add the import and use the helper without type annotation
- profile/kids/[id]/page.tsx:76 is inside a local helper function — replace the body, keep the helper
- The `actionToast` state in messages/page.tsx can be REMOVED entirely once replaced with Toast system
- messages/page.tsx does NOT currently import useToast — need to add the import

## Contradictions
| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | messages/page.tsx:481-515 | sendMessage shows success toast | No toast on success OR failure — draft restore only | User can't tell if message sent |
| Intake | messages/page.tsx:149,1169-1182 | Uses global Toast | Uses local `actionToast` string state + inline banner | Inconsistent UX pattern |
| Intake | ArticleQuiz.tsx submit | May need toast | Result stage UI is the feedback — no toast needed | No change required for quiz |

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
N/A

## Implementation Progress
[x] Create web/src/lib/dates.ts
[x] Update CommentRow.tsx — replace timeAgo with import
[x] Update messages/page.tsx — add useToast, replace actionToast + add send toast
[x] Sweep 16 toLocaleDateString/toLocaleString call sites across 11 pages

## Completed
SHIPPED 2026-04-26 · 9ec6eac

Files touched:
- web/src/lib/dates.ts (new)
- web/src/components/CommentRow.tsx
- web/src/app/messages/page.tsx
- web/src/app/appeal/page.tsx
- web/src/app/bookmarks/page.tsx
- web/src/app/category/[id]/page.js
- web/src/app/expert-queue/page.tsx
- web/src/app/notifications/page.tsx
- web/src/app/profile/family/page.tsx
- web/src/app/profile/kids/[id]/page.tsx
- web/src/app/profile/page.tsx
- web/src/app/profile/settings/expert/page.tsx
- web/src/app/recap/[id]/page.tsx
- web/src/app/recap/page.tsx
- web/src/app/search/page.tsx
- Workbench/LiveProgressSheet_T-043-T-046.md
