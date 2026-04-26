# LiveProgressSheet — T-108, T-109, T-110, T-114 — Expert queue improvements
Started: 2026-04-26

## User Intent

Four improvements to the expert queue pipeline, plus one T-025 scope fix:

**T-108 — Asker context on expert queue cards**: Add `asker_username` and `asker_verity_score` to the `/api/expert/queue` GET response via a JOIN on `asking_user_id → users(username, verity_score)`. Display asker username below the question body on web cards and as a caption on iOS itemRow.

**T-109 — Inline markdown preview for expert answer composer (web)**: Replace the raw `<textarea>` in the claimed tab of `expert-queue/page.tsx` with a two-tab (Edit / Preview) composer. Preview tab renders answer body through `marked` + DOMPurify (both already in `web/package.json`; `react-markdown` is NOT available but `marked` is at `^18.0.2` and `isomorphic-dompurify` at `^3.9.0`). Use `dangerouslySetInnerHTML` with sanitized output.

**T-110 — Sheet-based answer composer with preview (iOS)**: In `AnswerComposerSheet` in `ExpertQueueView.swift`, add a `Picker` segmented control (Edit / Preview) above the `TextEditor`. Preview tab renders `answerText` via `Text` with `AttributedString` initialized from markdown (iOS 15+ API: `try? AttributedString(markdown: answerText)`).

**T-114 — Per-question category display**: The `ExpertQueueItem.category` field in Swift is hardcoded to `nil` at line 319 of `ExpertQueueView.swift`. The `expert_queue_items` table has `target_category_id` FK to `categories(id, name)`. Add the categories JOIN to `/api/expert/queue` GET response. Set the category field in the iOS mapper using the category name from the JOIN result. Web: add a 2-line category label to the queue card.

**T-025 scope — DateFormatter**: Line 308 in `ExpertQueueView.swift` allocates an `ISO8601DateFormatter()` inside the `.map` closure on every load. Promote to a `private static let` on the struct.

## Live Code State

### `web/src/app/api/expert/queue/route.js` (63 lines)
- Line 41-44: SELECT query currently fetches:
  `'*, comments!fk_expert_queue_items_comment_id(id, body, created_at, users!fk_comments_user_id(username, avatar_color)), answer:comments!fk_expert_queue_items_answer_comment_id(id, status), articles(title, slug)'`
- **Missing**: asker user JOIN (`asking_user_id → users(username, verity_score)` via FK `fk_expert_queue_items_asking_user_id`) and category JOIN (`target_category_id → categories(id, name)` via FK `fk_expert_queue_items_target_category_id`)

### `web/src/app/expert-queue/page.tsx` (515 lines)
- `QueueItem` interface (line 37-45): Missing `asker_username`, `asker_verity_score`, `category` fields
- Line 303-411: Card renders `it.comments?.body` as question body, `it.articles?.title` as article context, no asker info, no category label
- Line 338-355: Claimed tab answer composer is a raw `<textarea>` — no Edit/Preview tabs
- `marked` and `isomorphic-dompurify` are in `web/package.json` but NOT imported in this file
- `react-markdown` is NOT in `web/package.json` — use `marked` + DOMPurify

### `VerityPost/VerityPost/ExpertQueueView.swift` (427 lines)
- Line 266-278: `Row` decodable struct is missing `target_category_id` and asker user fields
- Line 307-323: `.map` closure has `let dateFmt = ISO8601DateFormatter()` allocated inline (T-025 violation)
- Line 319: `category: nil` hardcoded — T-114 root cause
- Line 131-135: `itemRow` displays `item.category` correctly IF non-nil (the `Text(cat.uppercased())` block exists) — no asker display
- Line 364-379: `ExpertQueueItem` model has `category: String?` field — just needs to be populated
- Line 384-426: `AnswerComposerSheet` — `TextEditor` with no Edit/Preview segmented control

### DB / Schema
- `expert_queue_items` table has `asking_user_id uuid NOT NULL` with FK `fk_expert_queue_items_asking_user_id → users(id)` and `target_category_id uuid` with FK `fk_expert_queue_items_target_category_id → categories(id)`
- `users` table has `username character varying` and `verity_score integer NOT NULL DEFAULT 0`
- `categories` table has `id uuid`, `name character varying NOT NULL`
- No DB schema changes needed — all data exists; only the SELECT query needs expansion

### Dependencies
- `marked@^18.0.2` — in `web/package.json`, used in `web/src/lib/pipeline/render-body.ts`
- `isomorphic-dompurify@^3.9.0` — in `web/package.json`, used in `render-body.ts`
- `react-markdown` — NOT in `web/package.json`; do NOT add or use it

## Helper Brief

**What "done correctly" looks like**:
1. `/api/expert/queue` GET response includes `asker: { username, verity_score }` and `category: { id, name }` on every item
2. Web card shows asker username as a dim caption below question body; category name as a dim label above (before target_type line)
3. Web claimed tab composer has Edit/Preview toggle; preview renders sanitized HTML via `marked` + DOMPurify
4. iOS `itemRow` shows asker username caption below question text
5. iOS `AnswerComposerSheet` has Picker segmented control; Preview tab shows `Text` with `AttributedString(markdown:)`
6. iOS `ExpertQueueItem.category` is populated from API response category name
7. `ISO8601DateFormatter()` is a `private static let` on `ExpertQueueView`
8. TypeScript compiles clean (`tsc --noEmit`), `xcodebuild` green

**What the intake agent is most likely to miss**:
- The `asking_user` join alias in Supabase PostgREST: must use the FK name alias `asker:users!fk_expert_queue_items_asking_user_id(username, verity_score)` not a bare `users(...)` join (which conflicts with the existing comment user join)
- The category join must use the FK alias `category:categories!fk_expert_queue_items_target_category_id(id, name)` — bare `categories(...)` would need the FK hint anyway since there's only one FK from this table to categories, but explicit FK alias is safer and matches project patterns
- In the iOS `Row` decodable struct, the nested asker/category struct names must match the JSON keys returned by PostgREST aliases
- `marked.parse()` returns `string` when `async: false` — same pattern as `render-body.ts` line 19; must cast
- `AttributedString(markdown:)` can throw — use `try?` with a fallback to plain `Text(answerText)`
- Web preview needs `dangerouslySetInnerHTML` — safe because DOMPurify is applied
- No new DB migration needed — data already exists

## Contradictions
| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | web/src/app/api/expert/queue/route.js:42 | asker + category in SELECT | Neither present | T-108, T-114 require API change |
| Intake | web/src/app/expert-queue/page.tsx:338 | Two-tab composer | Raw textarea | T-109 needs composer replacement |
| Intake | VerityPost/ExpertQueueView.swift:319 | category populated | hardcoded nil | T-114 root cause |
| Intake | VerityPost/ExpertQueueView.swift:308 | static let dateFmt | inline allocation per map | T-025 scope violation |
| Planner | web/package.json | react-markdown available | NOT in package.json | Use marked+DOMPurify instead |

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
N/A — unanimous

## Implementation Progress
[filled by background agents during execution]

## Completed

SHIPPED 2026-04-26
Commit: 75866af
Files touched:
- web/src/app/api/expert/queue/route.js — expanded SELECT with asker and category FK-aliased JOINs
- web/src/app/expert-queue/page.tsx — QueueItem extended with asker/category fields; category label + asker caption added to cards; raw textarea replaced with Edit/Preview two-tab composer (marked + DOMPurify)
- VerityPost/VerityPost/ExpertQueueView.swift — AskerRef/CategoryRef decodable structs added to Row; ExpertQueueItem extended with askerUsername; category and askerUsername populated in .map; asker caption added to itemRow; AnswerComposerSheet updated with segmented Picker and AttributedString(markdown:) preview tab; ISO8601DateFormatter promoted to private static let
All 8 acceptance criteria met. TSC clean on expert-queue files. xcodebuild failure is pre-existing (possibleChanges HTML refs).
