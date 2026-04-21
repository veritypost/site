# Round 6 iOS-GATES — Paid-tier bypass fixes

Audit of Charlie's 2 HIGH findings plus 2 MEDIUM adjacent items on iOS direct
table writes that duck server-side paid-tier / rate-limit / gate enforcement.
Validated by reading the actual iOS files, web API routes, Supabase RPC
bodies, and RLS policies.

Scope: MessagesView.swift, PublicProfileView.swift.
OUT OF SCOPE: iOS-DATA writes (alert_preferences, expert_applications,
support_tickets, kid_profiles, data_requests) — no paid gates on those
tables, handled by iOS-DATA track.

---

## Validated direct writes

All iOS writes touching messaging / follow tables — ground truth from a
`client.from(...)` grep across VerityPost/:

| File:Line | Table | Op | Fields set | Paid-gate bypass? | Fix |
|---|---|---|---|---|---|
| MessagesView.swift:854 | messages | insert | conversation_id, sender_id, body | **YES** — messages_insert RLS only enforces participant + not-blocked. Missing: paid-tier, rate-limit (30/min), length-cap (4000), frozen/grace | Route through POST /api/messages (post_message RPC). Delete direct insert. |
| MessagesView.swift:864 | conversations | update | last_message_preview, last_message_at | Redundant after fix 1 — post_message RPC already patches these columns server-side (confirmed: `UPDATE conversations SET last_message_preview=..., last_message_at=now(), updated_at=now()`) | **Delete.** Server does it. |
| MessagesView.swift:387-388 | conversation_participants | update | last_read_at | Not a paid bypass. RLS scopes to `user_id = auth.uid()`. No web equivalent / no DM-mute / read-state enforcement planned in-flight. | **Leave.** Document it stays iOS-side. |
| MessagesView.swift:437-438 | conversations | insert | created_by, type | Not a paid bypass per se — `conversations_insert` RLS is `created_by = auth.uid()` only. But: paired with participants.insert at 445 it creates an orphan convo because the other-party participant row will be rejected by RLS (`user_id = auth.uid()` only). This path is **already broken for the other party**. | **Leave for Round 7** (not a paid bypass; flag as functional bug). |
| MessagesView.swift:445-450 | conversation_participants | insert (2 rows) | conversation_id, user_id, role | Not a paid bypass. Other-party insert row is rejected by RLS today (see above). | **Leave for Round 7.** |
| MessagesView.swift:791-793 | message_receipts | upsert | message_id, user_id, read_at | Not a paid bypass. RLS insert `with_check (user_id = auth.uid())` — client can only mark their own. OK iOS-side. | **Leave.** |
| PublicProfileView.swift:191-195 | follows | delete | filter: follower_id=me, following_id=target | Not a paid bypass — unfollow doesn't need paid. But inconsistent with web (`toggle_follow` RPC). | Route through POST /api/follows for consistency + future-proof. |
| PublicProfileView.swift:199-201 | follows | insert | follower_id, following_id | **YES** — follows_insert RLS calls `is_premium()` which only checks `plan_status IN ('active','trialing')`. Does NOT check frozen_at, plan_grace_period_ends_at, or the `profile.follow` permission (D28 permission-system fencing). | Route through POST /api/follows (toggle_follow RPC). Delete direct insert/delete. |

---

## Blocking issue before any iOS -> web-API route migration

**`/api/messages` and `/api/follows` are COOKIE-authenticated only today.**

- `site/src/app/api/messages/route.js:13` — `requirePermission('messages.dm.compose')`
- `site/src/app/api/follows/route.js:11` — `requirePermission('profile.follow')`

Both go through `site/src/lib/auth.js::requireAuth` → `supabase.auth.getUser()`
on a client built by `createClient()` in `site/src/lib/supabase/server.ts:26`,
which is cookie-scoped (`createServerClient` configured with
`cookies.get/set/remove` only, no Authorization-header fallback).

`@supabase/ssr`'s `createServerClient` does NOT auto-read the
`Authorization` header — confirmed by reading
`node_modules/@supabase/ssr/dist/main/createServerClient.js`: it builds the
auth client with a storage adapter wired to cookies, and GoTrue picks up
the session from that storage. Bearer tokens on the request are ignored.

So if iOS (which authenticates via bearer tokens, pattern established in
`site/src/app/api/ios/subscriptions/sync/route.js` using
`createClientFromToken`) POSTs to `/api/messages` or `/api/follows`, it
will get `401 Unauthenticated` every time.

**Implementer has two options; pick ONE:**

### Option A (preferred — smaller blast radius, no route duplication)

Add a bearer-fallback branch inside `requirePermission` / `requireAuth`
in `site/src/lib/auth.js`. Proposed patch:

```js
// site/src/lib/auth.js  — add above requireAuth
async function resolveAuthedClient(client) {
  if (client) return client;
  // Check for bearer header first (iOS / non-browser callers)
  try {
    const { headers } = await import('next/headers');
    const authHeader = headers().get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();
      const mod = await import('./supabase/server');
      return mod.createClientFromToken(token);
    }
  } catch {}
  // Fall back to cookie-scoped client
  const mod = await import('./supabase/server');
  return mod.createClient();
}
```

Then swap `resolveClient` → `resolveAuthedClient` inside `requireAuth` and
`requirePermission`. Every existing cookie-based caller still works (cookies
fallback), and bearer-bearing callers now resolve too. One touch point.

**Verify**: `cd site && npx tsc --noEmit` exit 0; hit `/api/messages` from
a logged-in browser (still 200); hit same endpoint from curl with
`Authorization: Bearer <access_token>` (now 200 instead of 401).

### Option B (explicit iOS-scoped routes — more code, stricter separation)

Create `site/src/app/api/ios/messages/route.js` and
`site/src/app/api/ios/follows/route.js` that parrot the existing routes
but read bearer + use `createClientFromToken` + re-run the permission
check via `hasPermissionServer`. Duplicates two files. NOT recommended —
divergence risk.

**Decision**: go with Option A. It is the fix the iOS bookmarks / stories-read
flows silently depend on anyway (those iOS calls currently work in prod only
because the user happens to also have a cookie when testing from a
cookie-sharing browser; they would 401 from pure iOS). Flag: a separate
audit of `/api/bookmarks` and `/api/stories/read` is warranted — but out of
scope for this round. Single `requireAuth` patch fixes both the Round-6 DM/follow migrations AND those existing silent bearer holes at once.

---

## Fix plan (after Option A is in place)

### Fix 1 — DM send (MessagesView.swift:841-871)

Delete the direct `messages.insert` AND the direct `conversations.update`
(post_message RPC already does both, confirmed in pg_proc body: inserts
the message then `UPDATE conversations SET last_message_preview=...,
last_message_at=now(), updated_at=now() WHERE id = p_conversation_id`).

Replace the body of `send()` in `DMThreadView` with:

```swift
private func send() async {
    guard let userId = auth.currentUser?.id else { return }
    let text = input.trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty else { return }
    input = ""
    sending = true
    defer { sending = false }

    do {
        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/messages")

        struct Body: Encodable {
            let conversation_id: String
            let body: String
        }
        struct Envelope: Decodable {
            let message: Msg
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(Body(
            conversation_id: conversation.id,
            body: text
        ))

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            // 403 = paid/muted/banned/not-participant, 429 = rate-limit
            // Restore draft so user can see what happened.
            await MainActor.run { input = text }
            return
        }
        let env = try JSONDecoder.vpDefault.decode(Envelope.self, from: data)
        await MainActor.run {
            if !messages.contains(where: { $0.id == env.message.id }) {
                messages.append(env.message)
            }
        }
    } catch {
        Log.d("Failed to send: \(error)")
        await MainActor.run { input = text }
    }
}
```

Notes for Implementer:
- `JSONDecoder.vpDefault` — reuse whichever decoder the codebase already
  configures for ISO8601 dates + snake_case. If no shared decoder exists,
  use `JSONDecoder()` + the `Msg` `CodingKeys` as they are (already
  snake_case mapping defined on `Msg`).
- `Msg` has `createdAt: Date?` — the RPC returns `created_at` as
  `now()::text` which serializes as ISO8601. If the decoder lacks date
  strategy, coerce or hold it as String. Match the existing realtime
  decode pattern at MessagesView.swift:719-726.
- DO NOT re-run the optimistic `messages.append` before the response —
  the realtime channel already dedups inserts at line 708-733, so the
  server-returned row will arrive via both the POST response AND the
  realtime channel; the dedup at line 710 (`if messages.contains...`) handles it.
- Also **delete lines 864-867** (the `conversations.update`) — server handles.

### Fix 2 — Follow / unfollow (PublicProfileView.swift:185-207)

Delete both branches of the direct follow insert/delete. Replace with a
single POST to `/api/follows`; the `toggle_follow` RPC handles the
insert-or-delete decision server-side AND returns `{following: bool}`:

```swift
private func toggleFollow(target: String) async {
    guard let _ = auth.currentUser?.id else { return }
    followBusy = true
    defer { followBusy = false }
    do {
        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/follows")

        struct Body: Encodable { let target_user_id: String }
        struct Resp: Decodable { let following: Bool; let target_id: String? }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(Body(target_user_id: target))

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            // 403 = not paid / not permitted; keep UI state unchanged.
            return
        }
        let resp = try JSONDecoder().decode(Resp.self, from: data)
        await MainActor.run { isFollowing = resp.following }
    } catch {
        Log.d("follow toggle failed: \(error)")
    }
}
```

This collapses the previous if/else into a single call. The RPC
authoritatively decides insert-vs-delete from current state, so no
pre-check needed. `isFollowing` is updated from the server's truth.

### Fix 3 — Conversation creation side-effects (MessagesView.swift:437-450)

**Leave as-is for this round.** The `conversations.insert` is not a paid
bypass — it's gated on `created_by = auth.uid()` and, given the paired
`conversation_participants.insert` for the OTHER user will be rejected by
RLS (`with_check (user_id = auth.uid())`), the flow is already functionally
broken for anything except creating an empty convo. Not security-urgent.

Flag for **Round 7 / iOS-DATA**: introduce a `start_conversation` SECURITY
DEFINER RPC (or POST `/api/conversations`) that creates the convo and
inserts both participant rows atomically, and route iOS + web through
that. Until then iOS's conversation-create flow for new DMs is the same
as web's (which also uses direct inserts — see Code search: web has NO
`conversations.insert` call in routes; new DM flow on web is…
not exercised anywhere in /api, so web has the same bug. Both clients
are broken symmetrically on new-convo creation; messaging from an
already-existing convo is the only proven path).

### Fix 4 — message_receipts upsert (MessagesView.swift:791-793)

**Leave as-is.** RLS is `(user_id = auth.uid())` — iOS can only upsert
receipt rows for itself. No bypass. Matches web behavior (web also
upserts receipts client-side via direct Supabase client; see Task 46
context comment at MessagesView.swift:376-379).

### Fix 5 — conversation_participants last_read_at update (MessagesView.swift:381-392)

**Leave as-is.** RLS `(user_id = auth.uid())` enforces scope. No web
equivalent to bypass. Charlie's MEDIUM flag is forward-looking ("if web
later adds DM mute/read-state validation") — a note in the file is enough.
Suggested one-line comment addition at line 381:

```swift
// Kept client-side (RLS: user_id = auth.uid()). If future DM read-state
// rules land server-side, route this through an API in that track.
func markConversationRead(_ convoId: String) async {
```

---

## Verification

1. **`cd site && npx tsc --noEmit`** — must exit 0 after the auth.js bearer
   fallback patch.
2. **iOS DM as free-tier user** — build the app, sign in as a free-plan
   user, open an existing convo (created by admin seed), tap Send.
   Expected: message does not append; `http` status in logs shows 403
   with body `{"error":"direct messages require a paid plan"}`.
3. **iOS DM as paid user, 31st message in 60s** — expected 429 with
   body `{"error":"rate limit: too many messages; slow down"}`.
4. **iOS follow as free-tier user** — open another user's public profile,
   tap Follow. Expected: `isFollowing` remains false; log shows 403 with
   `{"error":"PERMISSION_DENIED:profile.follow"}`.
5. **iOS follow as paid user** — expected 200 with `{following: true, ...}`,
   `isFollowing` toggles to true.
6. **Bearer fallback regression test** — browser session still works end-
   to-end (cookie path): log in via `/login`, open `/messages`, send a
   DM. Must still be 200.

---

## What NOT to change in this round

- iOS-DATA writes: alert_preferences, expert_applications, support_tickets,
  kid_profiles, data_requests — those are data-shape bugs, not paid-bypass.
  Separate track.
- Admin RPC lockdown — SECURITY track.
- `conversations.insert` + `conversation_participants.insert` on new-DM
  creation (MessagesView.swift:437, 445). Broken symmetrically on web +
  iOS, not a paid-bypass in the Round-6 sense. Flagged for Round 7.
- `message_receipts.upsert` and `conversation_participants.update
  last_read_at`. RLS already scopes; no bypass.
- Any other iOS `URLRequest` to `/api/...` — those are out of this
  track's scope even though they may silently 401 pre-Option-A fix
  (/api/bookmarks, /api/stories/read). The Option A patch to `requireAuth`
  transparently un-breaks them. No behavior change otherwise.

---

## Files touched by this plan (Implementer checklist)

1. `site/src/lib/auth.js` — add `resolveAuthedClient` with bearer
   fallback, swap `resolveClient` → `resolveAuthedClient` in
   `requireAuth` + `requirePermission`.
2. `VerityPost/VerityPost/MessagesView.swift` — rewrite
   `DMThreadView.send()` (lines 840-872); delete
   `conversations.update` at 864-867; add one-line comment at 381.
3. `VerityPost/VerityPost/PublicProfileView.swift` — rewrite
   `toggleFollow()` (lines 185-207).

Three files. No migrations. No new API routes. No DB changes.

---

## Summary counts

- iOS write sites Charlie flagged: 2 HIGH + 2 MEDIUM = 4.
- iOS write sites to migrate in this round: **2** (DM send, follow toggle).
- iOS write sites kept iOS-side with rationale: 4
  (last_read_at, receipts, conversations.insert, participants.insert).
- Existing API endpoints reusable: **2** (/api/messages, /api/follows)
  but **blocked by cookie-only auth** — requires one 20-line patch to
  `site/src/lib/auth.js` to accept bearer tokens.
- New API endpoints needed: **0** (after Option A).
- DB migrations needed: **0**.
- `post_message` RPC handles conversation bookkeeping: **YES**
  (last_message_preview, last_message_at, updated_at — verified via
  `pg_proc` body).
- `toggle_follow` RPC handles follower/following counts: **YES**
  (verified).

## Adjacent findings (not in this round's scope, logged for triage)

- `/api/bookmarks` and `/api/stories/read` also use `requirePermission`
  and therefore cookie-only auth. iOS hits both of these with bearer
  tokens in `StoryDetailView.swift:1384/1398/1458` and
  `BookmarksView.swift:278`. These calls have been silently 401'ing
  from pure-iOS sessions unless the user also had a cookie. Option A
  fixes them transparently, no code change in the iOS callers.
- `follows_insert` RLS's `is_premium()` does NOT check `frozen_at` or
  `plan_grace_period_ends_at`, unlike `user_has_dm_access`. Routing
  follows through `toggle_follow` RPC + `requirePermission('profile.follow')`
  (which resolves via `compute_effective_perms`) closes this gap
  because the permission layer considers frozen/grace.
- The 2-participant insert in `startConversation` (MessagesView.swift:445)
  RLS-rejects the 2nd row. iOS's new-DM flow leaves orphan conversations
  with only the creator as participant. Not a bypass; functional bug.
  Same on web (web has no `/api/conversations` or equivalent RPC).
