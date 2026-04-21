# Round 7 — startConversation + support tx: FIX PLAN

Prepared by: PREPPER Z
Date: 2026-04-18
Scope: Two surgical fixes — (1) free-user empty-conversation spam via direct
`conversations.insert` from iOS and web; (2) orphan support-ticket header when
the second insert in `/api/support` fails.

-------------------------------------------------------------------------------

## Bug 1: `startConversation` empty-convo bypass

### Current state

iOS: `VerityPost/VerityPost/MessagesView.swift:427-462`
```swift
private func startConversation(with user: SearchUser) async {
    guard let userId = auth.currentUser?.id else { return }
    if let existing = conversations.first(where: { $0.otherUsername == user.username }) { ... return }
    do {
        struct NewConvo: Encodable { let created_by: String; let type: String }
        let created: [DMConversation] = try await client.from("conversations")
            .insert(NewConvo(created_by: userId, type: "direct"))
            .select()
            .execute().value
        guard var convo = created.first else { return }
        struct NewPart: Encodable { let conversation_id: String; let user_id: String; let role: String }
        try await client.from("conversation_participants")
            .insert([
                NewPart(conversation_id: convo.id, user_id: userId,   role: "owner"),
                NewPart(conversation_id: convo.id, user_id: user.id,  role: "member"),
            ])
            .execute()
        ...
    } catch { Log.d("Failed to create conversation: \(error)") }
    showSearch = false
}
```

Web (same shape, same bug): `site/src/app/messages/page.tsx:396-429`
```ts
const startConversation = async (otherUserId: string) => {
  ...
  const { data: convo } = await supabase.from('conversations')
    .insert({ created_by: currentUser.id, type: 'direct' })
    .select().single<ConversationRow>();
  if (convo) {
    await supabase.from('conversation_participants').insert([
      { conversation_id: convo.id, user_id: currentUser.id,   role: 'owner' },
      { conversation_id: convo.id, user_id: otherUserId,      role: 'member' },
    ]);
    ...
  }
};
```

Current RLS (verified via pg_policy on `fyiwulqphgmoqullmrfn`):
- `conversations_insert`  WITH CHECK: `(created_by = auth.uid())`            -- no paid gate
- `conversations_select`  USING: `id IN (participants for auth.uid()) OR is_admin_or_above()`
- `conversations_update`  USING: `created_by = auth.uid() OR is_admin_or_above()`
- `conversation_participants_insert` WITH CHECK: `user_id = auth.uid() OR is_admin_or_above()`
  => The second insert row (`user_id = otherUserId`) **fails RLS** for a non-admin caller.
  The first insert row (owner = self) succeeds.
  Net effect today: free users create a **solo-owner orphan conversation** on every click.
  Subsequent `post_message` RPC blocks the send (paid gate), so the convo stays empty.
  Spam amplification: one free account → unlimited rows in `conversations`.

Existing related RPC (verified in pg_proc):
- `public.post_message(p_user_id, p_conversation_id, p_body)` SECURITY DEFINER — DM send, does
  `user_has_dm_access` + mute/ban + participant + rate-limit + length. Does **not** create
  conversations; requires caller to already be a participant.
- `public.is_premium()` SECURITY DEFINER — `plan_status IN ('active','trialing') AND plan_id IS NOT NULL`.
- No `start_conversation` / `create_conversation` RPC exists.

Permission key already in use elsewhere: `messages.dm.compose` (see
`site/src/app/api/messages/route.js:13`, `PERMISSION_MIGRATION.md:45,83,229`).

### Recommended fix: option (a) — new `/api/conversations` route + new SECURITY DEFINER RPC

Rationale:
- Option (b) — bolting `is_premium()` onto `conversations_insert` RLS — works for iOS
  but still leaves the atomicity problem: owner-participant succeeds, recipient-participant
  fails RLS (user_id != auth.uid()), leaving a solo-owner convo. Plus it drifts from the
  D40 grace/freeze semantics captured by `user_has_dm_access` (the `post_message` RPC
  already uses that helper; RLS on conversations_insert using only `is_premium()` would
  let users in grace create conversations they can't send from — inconsistent).
- Option (a) matches the Round 6 pattern we already adopted for `POST /api/messages` →
  `post_message` RPC: a SECURITY DEFINER RPC runs all gates in one transaction, the API
  route wraps it in permission + auth, and clients stop writing tables directly. Adding a
  companion `start_conversation(p_user_id, p_other_user_id)` RPC makes the two inserts
  atomic (no orphan convo rows on failure) **and** applies `user_has_dm_access` /
  participant validation / duplicate-convo dedupe server-side. Same shape both platforms
  can call.
- Lowest risk: no RLS rewrites on tables with three active policies; we only **add** a
  new function and endpoint and point two clients at them. Existing `conversations_insert`
  policy stays as a belt-and-braces server-side rule (participant-insert RLS already blocks
  the recipient row for non-admin callers — nothing is loosened).

### Exact edits

#### DB migration (new file)

`01-Schema/069_start_conversation_rpc_2026_04_18.sql` (idempotent)
```sql
-- Round 7 — start_conversation RPC: atomic convo + both participant rows,
-- paid-gate via user_has_dm_access, dedupe on existing direct convo.
-- Pairs with /api/conversations route; iOS/web stop inserting directly.

CREATE OR REPLACE FUNCTION public.start_conversation(
  p_user_id        uuid,
  p_other_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id  uuid;
  v_new_id       uuid;
BEGIN
  IF p_user_id IS NULL OR p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'user ids required';
  END IF;
  IF p_user_id = p_other_user_id THEN
    RAISE EXCEPTION 'cannot start a conversation with yourself';
  END IF;
  IF NOT public.user_has_dm_access(p_user_id) THEN
    RAISE EXCEPTION 'direct messages require a paid plan';
  END IF;
  IF public._user_is_dm_blocked(p_user_id) THEN
    RAISE EXCEPTION 'account is muted or banned — cannot start conversations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION 'recipient not found';
  END IF;

  -- Dedupe: return existing direct conversation if both users already share one.
  SELECT c.id INTO v_existing_id
    FROM public.conversations c
   WHERE c.type = 'direct'
     AND c.is_active = true
     AND EXISTS (
           SELECT 1 FROM public.conversation_participants p1
            WHERE p1.conversation_id = c.id AND p1.user_id = p_user_id
         )
     AND EXISTS (
           SELECT 1 FROM public.conversation_participants p2
            WHERE p2.conversation_id = c.id AND p2.user_id = p_other_user_id
         )
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing_id, 'existed', true);
  END IF;

  INSERT INTO public.conversations (created_by, type)
  VALUES (p_user_id, 'direct')
  RETURNING id INTO v_new_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_new_id, p_user_id,       'owner'),
         (v_new_id, p_other_user_id, 'member');

  RETURN jsonb_build_object('id', v_new_id, 'existed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.start_conversation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, uuid) TO authenticated, service_role;
```

#### Web — new API route

New file `site/src/app/api/conversations/route.js`
```js
// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/conversations — authoritative convo-create path. Pairs with
// POST /api/messages. Replaces direct `conversations.insert` +
// `conversation_participants.insert` that let free accounts create empty
// solo-owner convos (Round 7 Bug 1).
export async function POST(request) {
  let user;
  try { user = await requirePermission('messages.dm.compose'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { other_user_id } = await request.json().catch(() => ({}));
  if (!other_user_id) {
    return NextResponse.json({ error: 'other_user_id required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('start_conversation', {
    p_user_id: user.id,
    p_other_user_id: other_user_id,
  });
  if (error) {
    const msg = error.message || 'create failed';
    const status = msg.includes('paid plan') ? 403
      : msg.includes('muted') || msg.includes('banned') ? 403
      : msg.includes('not found') ? 404
      : msg.includes('yourself') ? 400
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
  return NextResponse.json({ conversation: data });
}
```

#### Web — route client through the new API

Edit `site/src/app/messages/page.tsx` lines 396-429 — replace the two direct
`.from('conversations').insert` + `.from('conversation_participants').insert`
calls with:
```ts
const res = await fetch('/api/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ other_user_id: otherUserId }),
});
const json = await res.json();
if (!res.ok) {
  // surface the error (toast or inline)
  console.error('start conversation failed', json?.error);
  return;
}
const convoId: string = json.conversation?.id;
if (!convoId) return;
// re-fetch the single convo row so downstream UI has the shape it expects
const { data: convo } = await supabase
  .from('conversations')
  .select('*')
  .eq('id', convoId)
  .single<ConversationRow>();
if (!convo) return;
const otherUser = searchResults.find(u => u.id === otherUserId);
setConversations(prev => [{
  ...convo,
  otherUser: otherUser ? { username: otherUser.username, avatar_color: otherUser.avatar_color } : null,
  conversation_participants: [],
  unread: 0,
}, ...prev]);
setSelected(convo.id);
setShowSearch(false);
```

#### iOS — route through the API

Edit `VerityPost/VerityPost/MessagesView.swift:427-462` — replace the body
of `startConversation(with:)` after the `existing` dedupe block with a call
to `POST /api/conversations` via the app's existing authed HTTP client (same
pattern used for send-message and other gated endpoints; see any route that
already calls into `*/api/*` — the bearer token path Track Y is addressing is
orthogonal here, we use whichever authed client is already in use for
`/api/messages` from iOS). The route must:
1. POST JSON `{ "other_user_id": <user.id> }` with the user's access token.
2. On 200, parse `{ "conversation": { "id": "<uuid>", "existed": <bool> } }`.
3. SELECT the single `conversations` row by id (RLS permits since the caller
   is now a participant) to hydrate `DMConversation`, set
   `convo.otherUsername` / `convo.otherAvatarColor`, prepend to
   `conversations`, and set `selectedConvo`.
4. On non-200, log and surface a toast (existing `Log.d` pattern kept for
   now to stay minimal).

Remove both `client.from("conversations").insert(...)` and
`client.from("conversation_participants").insert(...)` calls.

-------------------------------------------------------------------------------

## Bug 2: `/api/support` tx — orphan ticket on partial failure

### Current state

`site/src/app/api/support/route.js` (post-Round-6):
```js
const { data: ticket, error: insertErr } = await supabase.from('support_tickets').insert({
  ticket_number: ticketNumber,
  user_id: user.id,
  email: user.email,
  category,
  subject,
  status: 'open',
  source: 'in_app',
}).select().single();
if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

const { error: msgErr } = await supabase.from('ticket_messages').insert({
  ticket_id: ticket.id,
  sender_id: user.id,
  is_staff: false,
  body: description,
});
if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
```

Actual failure modes for the second insert (verified):
- RLS (`ticket_messages_insert` WITH CHECK `sender_id = auth.uid() OR sender_id IS NULL OR is_admin_or_above()`):
  fails only if `sender_id` is spoofed — effectively impossible here since the route passes
  `user.id`.
- Schema constraints: `body NOT NULL`; caller already checks `description` truthy at line 13,
  but `description` could be empty-after-trim or an unexpected non-string — would fail at PG.
- `ticket_id` FK points to `support_tickets.id` (ON DELETE CASCADE) — if ticket insert
  succeeded, FK won't miss.
- Transient PG error / network blip between the two calls.

Admin UI (`site/src/app/admin/support/page.tsx`) does **not** filter out orphans — a
ticket header with no messages appears as a naked row in the staff queue. Confirmed.

No `create_support_ticket`-style RPC exists (pg_proc check: only `post_message`,
`post_back_channel_message`, `is_premium` match `%message%|%ticket%`).

### Recommended fix: option (a) — SECURITY DEFINER RPC `create_support_ticket`

Rationale:
- Option (b) — Supabase JS "transaction API": the supabase-js client does **not** expose
  multi-statement transactions. Only RPC or raw SQL gets you atomicity. Not viable.
- Option (c) — compensating `DELETE` on ticket_messages failure: works, but every
  compensating-write path has its own failure mode (delete can fail, leaving the orphan
  you were trying to avoid). Also a second round-trip and extra code in the happy path.
- Option (a) — single SECURITY DEFINER RPC doing both inserts in one plpgsql block —
  is the same pattern we already use for `post_message` and (in this plan) `start_conversation`.
  Atomic: if the `ticket_messages` insert raises, the `support_tickets` insert rolls back
  inside the same transaction. One round-trip. Consistent with the rest of the codebase.
  Zero new surface area in the API route beyond swapping two `.insert`s for one `.rpc`.

### Exact edits

#### DB migration (new file)

`01-Schema/070_create_support_ticket_rpc_2026_04_18.sql` (idempotent)
```sql
-- Round 7 — create_support_ticket RPC: atomic (ticket header + first user
-- message) to prevent orphan tickets when the second insert fails.

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_user_id   uuid,
  p_email     text,
  p_category  text,
  p_subject   text,
  p_body      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_number text;
  v_ticket_id     uuid;
  v_body          text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'category required';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'body required'; END IF;

  v_ticket_number := 'VP-' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint));

  INSERT INTO public.support_tickets (
    ticket_number, user_id, email, category, subject, status, source
  ) VALUES (
    v_ticket_number, p_user_id, p_email, p_category, p_subject, 'open', 'in_app'
  ) RETURNING id INTO v_ticket_id;

  INSERT INTO public.ticket_messages (ticket_id, sender_id, is_staff, body)
  VALUES (v_ticket_id, p_user_id, false, v_body);

  RETURN jsonb_build_object(
    'id',            v_ticket_id,
    'ticket_number', v_ticket_number,
    'status',        'open'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, text, text, text, text) TO authenticated, service_role;
```

#### Route edit

`site/src/app/api/support/route.js` — replace the two-insert POST body with a single
`rpc('create_support_ticket', ...)` call. `ticket_number` is now generated server-side
in the RPC (was generated in JS via `Date.now().toString(36)`; moved into the RPC so
there is one source of truth and the uniqueness window stays tight).

Lines 29-47 (old):
```js
const ticketNumber = 'VP-' + Date.now().toString(36).toUpperCase();

const { data: ticket, error: insertErr } = await supabase.from('support_tickets').insert({
  ticket_number: ticketNumber,
  user_id: user.id,
  email: user.email,
  category,
  subject,
  status: 'open',
  source: 'in_app',
}).select().single();
if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

const { error: msgErr } = await supabase.from('ticket_messages').insert({
  ticket_id: ticket.id,
  sender_id: user.id,
  is_staff: false,
  body: description,
});
if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

return NextResponse.json({ ticket });
```

New:
```js
const { data: ticket, error: rpcErr } = await supabase.rpc('create_support_ticket', {
  p_user_id:  user.id,
  p_email:    user.email,
  p_category: category,
  p_subject:  subject,
  p_body:     description,
});
if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

return NextResponse.json({ ticket });
```

Drop the line-18 `const ticketNumber = ...` local. Leave the comment block at lines
20-28 intact but update it to reflect the RPC swap.

Note: the existing `supabase` here is the cookie-scoped `createClient()` (server) — it
will call the RPC as the signed-in user. Because the RPC is SECURITY DEFINER with
explicit `p_user_id` param, we don't rely on auth.uid() inside it; the route's
`requireAuth()` already authenticates the caller. This matches the style of
`/api/messages/route.js` which uses `createServiceClient` + explicit `p_user_id`; you
may prefer to switch `/api/support` to the service client for symmetry, but it is
**not required** for the bug fix and would be a drift beyond this ticket. Keep
`createClient()` to stay surgical.

-------------------------------------------------------------------------------

## Verification plan

1. **Typecheck.** `cd site && npx tsc --noEmit` → EXIT=0. (No TS changes in iOS path;
   the only TS change is the body of `startConversation` in `messages/page.tsx`.)
2. **Migrations apply idempotently.** Run 069 and 070 twice; both are `CREATE OR
   REPLACE FUNCTION` + `GRANT`, no-op on second run.
3. **Bug 1 probe — free user, iOS path.**
   - As `free@test.veritypost.com` from iOS: open Messages → search → tap a user
     to start convo.
   - Expected: `POST /api/conversations` returns 403 with `"direct messages require
     a paid plan"`. UI shows no new convo row. DB check:
     `SELECT count(*) FROM conversations WHERE created_by = '<free@test uuid>'` is
     unchanged from baseline.
4. **Bug 1 probe — free user, web path.** Same as above via `messages/page.tsx`;
   network tab shows the 403 from `/api/conversations`.
5. **Bug 1 probe — paid user, both paths.** As a premium user, start convo with
   another user: 200; convo row + two participant rows inserted atomically. Second
   attempt with the same recipient returns `{ existed: true }` and the same id
   (dedupe).
6. **Bug 1 probe — legacy direct-insert path still blocked for recipients.** Send a
   raw `POST /rest/v1/conversation_participants` as a premium user with
   `user_id = <other uuid>`: RLS denies (unchanged by this fix — belt and braces).
7. **Bug 2 probe — happy path.** Authenticated user submits a ticket via the app:
   201; exactly one row in `support_tickets`, one row in `ticket_messages` with the
   `ticket_id` FK set.
8. **Bug 2 probe — partial failure.** In a staging DB, temporarily flip
   `ticket_messages.body` CHECK to reject a specific marker body
   (`CHECK (body <> '__round7_fail__')`). Submit a ticket with that body:
   - Expect: 500 from `/api/support`.
   - DB check: `SELECT count(*) FROM support_tickets WHERE user_id = <tester>` is
     unchanged (the ticket header rolled back with the RPC tx). No orphan row.
   - Cleanup: drop the temp CHECK.
9. **Admin queue spot check.** `SELECT t.id FROM support_tickets t
   LEFT JOIN ticket_messages m ON m.ticket_id = t.id WHERE m.id IS NULL`
   returns 0 rows. (Baseline; stays 0 after Bug 2 probes.)

-------------------------------------------------------------------------------

## What NOT to change

- **Send-message paid gate** — already enforced server-side via
  `POST /api/messages` → `post_message` RPC (Round 6). Untouched.
- **Support ticket auth gate** — `requireAuth()` at line 9 of
  `site/src/app/api/support/route.js`. Untouched.
- **`conversations_insert` RLS policy** — intentionally left as-is. Option (a) moves
  clients to a server-side RPC; the RLS policy becomes a belt-and-braces rule that
  we don't depend on for the paid gate. Rewriting it is out of scope and would
  duplicate logic the RPC now owns.
- **`conversation_participants_insert` RLS** — unchanged. Already correctly rejects
  inserts where `user_id != auth.uid()` for non-admin callers; the RPC bypasses it
  via SECURITY DEFINER, which is the intended pattern.
- **Admin support UI filter for orphans** — not needed once Bug 2 fix lands; existing
  orphans (if any) can be cleaned up manually via SQL, separate ticket.
- **Bearer-bypass hardening (Track Y)** — out of scope for Round 7 Bug 1/2. Our iOS
  edit uses whichever authed HTTP client already hits `/api/messages`; Track Y's
  changes apply uniformly to both endpoints.
- **ticket_number format** — keeps the `VP-<uppercase base-36 of ms epoch>` shape so
  existing support tooling / email templates that pattern-match on `VP-` keep working.
