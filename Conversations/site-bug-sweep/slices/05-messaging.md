# Slice 05 — Messaging

**Status:** shipped
**Investigation session:** 9 (2026-04-30)
**Adversarial review:** complete (pre-session — issues confirmed by owner before implementation)

---

## Surfaces covered

- `web/src/app/messages/page.tsx`
- `web/src/app/api/messages/route.js`
- `web/src/app/api/messages/search/route.js`
- `web/src/app/api/conversations/route.js`

---

## Issues

### 05-01 (P2) — Send button double-fire

**Status:** shipped (`0a52580`)

**Files:**
- `web/src/app/messages/page.tsx:498-540` — `sendMessage` handler
- `web/src/app/messages/page.tsx:1598-1615` — Send button

**What's broken:** `setInput('')` is called synchronously at line 502 before the `await fetch(...)` at line 504. React 18 batches the state update; a rapid second click before the re-render fires can see the old `input` value in the handler's closure and submit a duplicate POST. The button is only gated on `disabled={!input.trim() || !!dmLocked}` — no `sending` guard.

**Fix plan:**
1. Add `const [sending, setSending] = useState<boolean>(false)`.
2. At the top of `sendMessage`: if `sending`, return early.
3. Set `setSending(true)` before the `fetch`; call `setSending(false)` in a `finally` block wrapping the entire fetch-and-process block.
4. Update `disabled` on the Send button: `disabled={!input.trim() || !!dmLocked || sending}`.
5. Update the button background/cursor conditionals to include `sending`.

---

### 05-02 (P2) — blockOtherUser double-click + race condition

**Status:** shipped (`0a52580`)

**Files:**
- `web/src/app/messages/page.tsx:672-704` — `blockOtherUser` handler
- `web/src/app/messages/page.tsx:1293-1307` — Block/Unblock button

**What's broken:** The handler has a try/catch wrapping the fetch but no `blocking` state. The button at line 1293 has no `disabled` prop. Rapid clicks can fire block then unblock while the first request is still in-flight, leaving unknown final state.

**Fix plan:**
1. Add `const [blocking, setBlocking] = useState<boolean>(false)`.
2. At the top of `blockOtherUser`: if `blocking`, return early.
3. Set `setBlocking(true)` before the `fetch`; call `setBlocking(false)` in a `finally` block.
4. Add `disabled={blocking}` to the Block/Unblock button at line 1293.

---

### 05-03 (P2) — submitReport double-click

**Status:** shipped (`0a52580`)

**Files:**
- `web/src/app/messages/page.tsx:709-741` — `submitReport` handler
- `web/src/app/messages/page.tsx:1424-1439` — Submit button

**What's broken:** The Report Submit button at line 1424 is gated only on `disabled={!reportReason.trim()}`, not during the in-flight fetch. A second click before the fetch resolves fires a duplicate POST to `/api/reports`.

**Fix plan:**
1. Add `const [submittingReport, setSubmittingReport] = useState<boolean>(false)`.
2. At the top of `submitReport`: if `submittingReport`, return early.
3. Set `setSubmittingReport(true)` before the `fetch`; call `setSubmittingReport(false)` in a `finally` block.
4. Update `disabled` on the Submit button: `disabled={!reportReason.trim() || submittingReport}`.
5. Update the button background/cursor conditionals to include `submittingReport`.

---

### 05-04 (P2) — startConversation: two silent failure modes + no loading gate

**Status:** shipped (`541dc90`)

**Files:**
- `web/src/app/messages/page.tsx:570-643` — `startConversation` handler
- `web/src/app/messages/page.tsx:1759` — search result item `onClick`

**What's broken:** Three problems:
- (a) Lines 597-604: `if (!res.ok)` logs and closes the modal silently — no error toast.
- (b) Lines 624-627: if Supabase `.single()` re-fetch returns null after a successful POST, function exits silently — conversation was created but user sees nothing.
- (c) Search result `<div onClick={() => startConversation(u.id)}>` at line 1759 has no disabled/loading state; double-clicking fires the full RPC flow twice.

**Fix plan:**
1. Add `const [starting, setStarting] = useState<boolean>(false)`.
2. At the top of `startConversation`, after the `existing` check: if `starting`, return early.
3. Set `setStarting(true)` before the `fetch`; call `setStarting(false)` in a `finally` wrapping the fetch + re-fetch block.
4. (a) Replace `console.error + setShowSearch(false) + return` with `toast.error(errMsg || 'Could not start conversation. Try again.')` before `setShowSearch(false)`.
5. (b) Replace `setShowSearch(false) + return` (null convo) with `toast.error('Could not open conversation. Try again.')` before `setShowSearch(false)`.
6. Add `style={{ pointerEvents: starting ? 'none' : 'auto', opacity: starting ? 0.5 : 1 }}` (or equivalent `cursor: 'default'`) to the search result items while `starting` is true.

---

### 05-05 (P2) — getUnreadCounts() RPC error silently zeros unread pills

**Status:** shipped (`e6b13b5`)

**File:** `web/src/app/messages/page.tsx:266`

**What's broken:** `const { data: counts } = await supabase.rpc('get_unread_counts')` discards the `error` return. RPC failure silently produces `null` data, making every conversation show 0 unread. Non-critical path, but should not fail silently.

**Fix plan:**
1. Destructure both values: `const { data: counts, error: countsErr } = await supabase.rpc('get_unread_counts')`.
2. If `countsErr` is non-null: `console.error('[messages] get_unread_counts', countsErr)` and continue with `counts` as null (the existing `|| []` fallback handles it).
3. Do not throw or fail the overall load.

---

### 05-06 (P3) — searchUsers: silent network error clears results with no message

**Status:** shipped (`4e9d0cf`)

**File:** `web/src/app/messages/page.tsx:542-559`

**What's broken:** Line 558: `setSearchResults(res.ok ? users : [])` — on a non-2xx response, results are cleared with no feedback. The user sees "No users found." which is indistinguishable from a genuine empty search.

**Fix plan:**
1. Add `const [searchError, setSearchError] = useState<string>('')` to state declarations.
2. In `searchUsers`: clear `setSearchError('')` at the top.
3. After `const res = await fetch(...)`: if `!res.ok`, call `setSearchError('Search failed. Try again.')` and return (leave `searchResults` as-is or empty).
4. Render the error string under the search input in the modal: only when `searchError` is non-empty, show it above the results list in red/muted text.

---

### 05-07 (P3) — request.text().catch(() => '') swallows body-read errors

**Status:** shipped (`b78eb3a`)

**File:** `web/src/app/api/messages/route.js:35`

**What's broken:** `const text = await request.text().catch(() => '')` — body-read failures are discarded with no log. The request silently falls through as if an empty body were sent.

**Fix plan:**
Replace line 35 with:
```js
const text = await request.text().catch((e) => { console.error('[messages.post] body-read failed', e); return ''; });
```

---

### 05-08 (P3) — request.json().catch(() => ({})) swallows parse errors

**Status:** shipped (`b78eb3a`)

**File:** `web/src/app/api/conversations/route.js:34`

**What's broken:** `const { other_user_id } = await request.json().catch(() => ({}))` — parse failures produce a silent empty object. Server continues with `other_user_id` undefined and returns a 400, but the root cause (malformed JSON) is never logged.

**Fix plan:**
Replace line 34 with:
```js
const { other_user_id } = await request.json().catch((e) => { console.error('[conversations.post] json-parse failed', e); return {}; });
```

---

## Won't-fix

### No API-level idempotency on message send

**File:** `web/src/app/api/messages/route.js`

**Why wont-fix:** The route delegates insertion to the `post_message` RPC, which is the sole DB write path. The UI fix in 05-01 (adding `sending` state) closes the primary double-fire path at the source. RPC-level dedup behavior is not verifiable from route code alone, and adding a client-side idempotency key would require schema changes. Named reason: UI fix covers the primary path; RPC-level dedup is architectural scope outside this sweep.

---

## Clean surfaces (no bugs found)

- **messages/search/route.js:** auth-gated; returns `{ users: [...] }` on success; handles empty query gracefully.
- **FK hints:** no `!hint` syntax found in any messaging query; all joins use implicit FK resolution or RPCs.
- **Realtime subscriptions:** `INSERT` channel on `messages` table correctly scoped to `conversation_id`; `removeChannel` cleanup in useEffect return.
- **DM paywall:** `canCompose` + `dmLocked` guard renders upgrade overlay; escape/dismiss via `dmPaywallDismissed` state + focus trap.
- **Read receipts:** opt-out controlled by `dm_read_receipts_enabled` column; `sendBeacon` path fires correctly.
- **`/api/conversations` rate limit:** H27 throttle (10/min per caller) present at the route level.
