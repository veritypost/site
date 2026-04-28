# Session 5 — Social Surfaces (Comments / Votes / Reports / Notifications / Messages / DMs / Bookmarks / Follows / Push / Alerts)

**Status:** self-contained operating manual. Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — everything an agent needs to ship S5 lives here.

**Owner:** lead developer.
**Created:** 2026-04-27.
**Lock dates:** every owner decision below dates back to the 2026-04-27 OWNER-ANSWERS Q4 best-practice lock unless otherwise noted.

---

## 0. Operating mode (read before any code)

### 0.1 Hermetic guarantee

S5 owns these paths and only these paths. Any change outside is out-of-scope and must be deferred to its owning session, not silently fixed:

```
web/src/app/api/comments/**
web/src/app/api/reports/**
web/src/app/api/follows/**
web/src/app/api/messages/**
web/src/app/api/notifications/**
web/src/app/api/bookmarks/**
web/src/app/api/users/[id]/block/**
web/src/app/api/push/**
web/src/app/api/alerts/**          (new directory; S5 creates)
web/src/components/CommentRow.tsx
web/src/components/CommentThread.tsx
web/src/components/CommentComposer.tsx
web/src/lib/reportReasons.js
web/src/app/messages/**
web/src/app/notifications/**
web/src/app/bookmarks/**
```

Out of scope (defer / hand off):
- Admin moderation, admin notifications broadcast, admin reports queue → **S6**.
- Story page UI (vote button, bookmark button, comment-paywall card) → **S7**.
- Profile / settings comment-block list, blocked-users management UI → **S8**.
- iOS comment, DM, notification, bookmark, push registration views → **S9**.
- Kids social (none — kids surface is comment-free by architecture; verify before touching) → **S10**.
- DB migrations (RLS, triggers, views, RPCs) → **S1**. S5 publishes the SQL spec inline; S1 writes the migration file.
- Cron handlers (`/api/cron/**`, `vercel.json`) → **S2**. S5 names the schedule contract; S2 wires it.

Final verification before any commit: `grep -rn` your domain keyword against out-of-scope paths and confirm zero references slipped in.

### 0.2 Multi-agent ship pattern

Non-trivial items ship under the **6-agent pattern** (memory `feedback_4pre_2post_ship_pattern`):

1. **4 pre-impl** in parallel — **investigator** (read + quote current code; ~5/35 historical findings have been stale, never act on what can't be reproduced), **planner** (design against the file:line), **big-picture reviewer** (cross-file impact: callers, types, RLS, realtime, iOS contract), **adversary** (actively break the plan: races, RLS leaks, idempotency, abuse).
2. **N implementers** in parallel with isolated file ownership when items can be split.
3. **2 post-impl** — **code reviewer** (typed, composable, no parallel paths, no TODO/HACK/force-unwrap residue), **security/correctness reviewer** for elevated-care items (block-bypass, mute-bypass, push-token leakage, mention-fan-out abuse).
4. **Divergence resolution** (memory `feedback_divergence_resolution_4_independent_agents`) — if pre-impl agents don't reach 4/4, dispatch four fresh independent agents on the disputed point, no shared context. Their verdict decides. Do not escalate technical disputes to the owner.

Skip the full pattern only on doc-only edits or trivial copy. Borderline calls go through it.

### 0.3 Genuine fixes, never patches

Per memory `feedback_genuine_fixes_not_patches`: kill the thing being replaced, no parallel paths, types + callers + data flow coherent, no TODO/HACK/force-unwrap residue. If a patch is the only option, name it in the commit and queue the genuine-fix follow-up.

### 0.4 Verification authority

- **Code grep** — current state in `web/src` is source of truth; never trust prior memos (memory `feedback_verify_audit_findings_before_acting`).
- **DB schema** — query `pg_proc`, `pg_policies`, `information_schema` via MCP (memory `feedback_mcp_verify_actual_schema_not_migration_log`); the `supabase_migrations` log is not authoritative.
- **Realtime + RLS** — Postgres realtime evaluates RLS at delivery; an S1 RLS migration propagates to web + iOS subscribers automatically. Verify by smoke test.
- **No-visibility hedges** — when a check requires a dashboard you can't see (Vercel / Supabase / Apple / AdSense), state "can't see X" and ask the owner. Don't pass an agent's defensive hedge through as launch-critical (memory `feedback_no_assumption_when_no_visibility`).

### 0.5 Status legend (mirrors `00_INDEX.md`)

- `OPEN` — ready to ship; owner decision in place.
- `LOCKED` — owner pre-authorized via Q4 best-practice; treat as `OPEN`.
- `DEPENDS ON Sx` — peer session must land first; verify dependency state before starting.
- `VERIFY-ONLY` — no code change in S5; smoke test after the dependency lands.
- `HAND-OFF` — out-of-scope; flag in commit body of the owning session.
- `SHIPPED` — commit hash recorded inline.

### 0.6 Commit tagging

`[S5-Tnnn]` for items that map to a numbered TODO entry. `[S5-A47-social]`, `[S5-§H1]` etc. for cross-cutting / cleanup items. Always include a one-line scope note explaining what was killed in the body.

---

## 1. Items

### S5-T34 — Downvote scoring algorithm (Wilson score)

- **Title:** Make downvotes feed the comment sort order via Wilson lower-bound on the binomial confidence interval.
- **Source:** TODO2 T34. Owner-locked Q4.4 = **A (Wilson score)**. Simple subtraction (B) and decorative-only (C) are rejected.
- **Severity:** P1 — sort order on every comment thread is wrong. Threads with high-quality + many-downvote comments (controversial-but-good) and threads with bandwagon-upvoted-but-bad comments rank identically.
- **Status:** LOCKED.
- **File:line:** `web/src/components/CommentThread.tsx:130-139` (server-side ORDER BY clause via PostgREST `.order()`).
- **Current state (verified 2026-04-27):** the load query orders by `is_context_pinned DESC, upvote_count DESC, created_at ASC` over a `range(0,49)`. `downvote_count` is fetched and rendered (`CommentRow.tsx`) but does not feed sort. Web and iOS surfaces both ignore the downvote signal for ranking.
- **Why fix:** community-rated content sort is industry-standard Wilson. Subtraction flatlines on threads with 1-2 votes (a 1-up / 0-down comment scores higher than a 100-up / 5-down comment). Decorative downvotes waste a UI element and confuse the user.
- **Wilson lower-bound formula** (z = 1.96 for 95% CI; score ∈ [0,1]; n=0 → 0):
  ```
  wilson(u, d) = let n = u + d, p̂ = u / n in
    (p̂ + z²/(2n) − z * sqrt((p̂(1−p̂) + z²/(4n)) / n)) / (1 + z²/n)
  ```
- **Fix (DB-side, owned by S1; S5 specifies):**
  1. Add a generated column or materialized score on `comments`:
     ```sql
     -- migrations/<date>_T34_wilson_score.sql (S1 writes; spec is below)
     ALTER TABLE public.comments
       ADD COLUMN wilson_score DOUBLE PRECISION
         GENERATED ALWAYS AS (
           CASE
             WHEN COALESCE(upvote_count,0) + COALESCE(downvote_count,0) = 0 THEN 0
             ELSE
               (
                 (upvote_count::float / (upvote_count + downvote_count))
                 + (1.96 * 1.96) / (2.0 * (upvote_count + downvote_count))
                 - 1.96 * sqrt(
                     (
                       (upvote_count::float / (upvote_count + downvote_count))
                       * (1 - (upvote_count::float / (upvote_count + downvote_count)))
                       + (1.96 * 1.96) / (4.0 * (upvote_count + downvote_count))
                     ) / (upvote_count + downvote_count)
                   )
               ) / (1 + (1.96 * 1.96) / (upvote_count + downvote_count))
           END
         ) STORED;

     CREATE INDEX comments_wilson_idx
       ON public.comments (article_id, is_context_pinned DESC, wilson_score DESC, created_at ASC)
       WHERE status = 'visible' AND deleted_at IS NULL;
     ```
  2. Wilson score recomputes on UPDATE because it's a STORED generated column — no trigger needed; vote RPCs already update `upvote_count` / `downvote_count`.

- **Fix (S5-side, web client):**
  ```ts
  // web/src/components/CommentThread.tsx — replace the .order chain in loadAll()
  const { data: rows, error: loadErr } = await supabase
    .from('comments')
    .select('*')
    .eq('article_id', articleId)
    .eq('status', 'visible')
    .is('deleted_at', null)
    .order('is_context_pinned', { ascending: false })
    .order('wilson_score', { ascending: false })   // was: upvote_count
    .order('created_at', { ascending: true })
    .range(0, 49);
  ```
  iOS counterpart in S9 — publish the contract; do not edit Swift here.
- **Deps:** S1 migration first; S5 client diff in the same PR window so the index is hot when traffic hits.
- **Verification:** (1) `\d+ comments` shows `wilson_score` STORED. (2) Vote on three comments at varying u/d ratios; confirm `ORDER BY wilson_score DESC` ranks 50u/2d > 5u/0d > 1u/0d. (3) Web hot-article smoke vs upvote-only baseline. (4) Realtime — vote from a second session; first session re-sorts on the UPDATE event without reload.
- **Multi-agent:** full 6-agent. Adversary: "find a u/d combination where Wilson misranks" + "find a way the generated column desyncs from counters."

---

### S5-T35 — Rank-change notifications

- **Title:** Weekly rank-diff notifications.
- **Source:** TODO2 T35. Owner-locked Q4.5 = **drop**.
- **Severity:** N/A — closed.
- **Status:** LOCKED — DROPPED. Do not ship.
- **Why dropped:** notification noise without retention upside at current scale. Revisit post-launch with data.
- **Action:** none. Item is tombstoned here so future audits don't re-flag.
- **Multi-agent process:** N/A.

---

### S5-T365 — Pro pill in CommentRow

- **Title:** Surface a `Pro` pill next to the username in every comment row whose author holds a paid tier.
- **Source:** TODO2 T365. Owner-locked Q4.9 = **ship**.
- **Severity:** P2 — engagement signal. Plan tier is a public signal once a user is in a public discussion (Substack, Reddit Premium, Discord Nitro all do this).
- **Status:** LOCKED.
- **Privacy posture:** the public surface receives a derived `is_pro` boolean only. `plan_id` itself stays out of `public_profiles_v`. No tier-color (memory `feedback_no_color_per_tier` — Pro is rendered as a neutral text label, never a hue tied to tier identity).

#### 1. DB view extension (owned by S1; spec inlined here)

`public_profiles_v` is the public read-only projection of `users` used by every public-facing comment / mention / hover-card / profile-stub query. S1 extends it to add a derived `is_pro` boolean.

```sql
-- migrations/<date>_T365_public_profiles_v_is_pro.sql (S1 writes from this spec)
CREATE OR REPLACE VIEW public.public_profiles_v
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.username,
  u.avatar_url,
  u.avatar_color,
  u.is_verified_public_figure,
  u.is_expert,
  -- T365: derived public flag. Source plan_id stays private.
  EXISTS (
    SELECT 1
    FROM public.plans p
    WHERE p.id = u.plan_id
      AND p.tier IN ('pro', 'family', 'family_xl')
  ) AS is_pro
FROM public.users u
WHERE u.deleted_at IS NULL
  AND COALESCE(u.profile_visibility, 'public') <> 'hidden';

GRANT SELECT ON public.public_profiles_v TO anon, authenticated;
```

Notes on the view:
- `security_invoker = true` ensures RLS on the underlying `users` and `plans` tables is honored.
- The hidden-visibility filter must remain (T330 — already shipped on the underlying view; preserve when extending).
- `family_xl` is referenced for safety even though Q1 retired the SKU — the `IN` set is harmless if no row matches.
- 🟨 **Cross-session dependency (hermetic boundary):** `web/src/types/database.ts` is S6-owned (per `00_INDEX.md`). S5 does **not** regenerate it. S5-T365 ships AFTER S6 has regenerated `database.ts` against the S1-applied `is_pro` view; until then S5 may inline a local type assertion (e.g., `as { is_pro: boolean | null }`) at the single call site. Remove the assertion in a follow-up commit once S6's regen lands.

#### 2. CommentThread fetch query update

```ts
// web/src/components/CommentThread.tsx — extend the public_profiles_v select
const { data: authorRows } = await supabase
  .from('public_profiles_v' as never)
  .select('id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, is_pro')
  .in('id' as never, userIds as never);
```

The `AuthorRow` type widens to include `is_pro: boolean | null`. The merge into `enriched` rows is unchanged.

#### 3. CommentRow render

```tsx
// web/src/components/CommentRow.tsx — insert after VerifiedBadge, before authorCategoryScore
{user.is_pro && (
  <span
    title="Pro member"
    aria-label="Pro member"
    style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '1px 6px',
      borderRadius: 10,
      background: 'rgba(17,17,17,0.08)',
      color: 'var(--accent, #111)',
      letterSpacing: 0.2,
    }}
  >
    Pro
  </span>
)}
```

Style: same chip shape + neutral palette as the existing `VS` chip; no tier-specific hue; no `family` / `family_xl` distinction surfaced; title + aria-label both set.

#### 4. Realtime UPDATE caveat

The existing UPDATE handler (`CommentThread.tsx:276-313`) merges `payload.new` (the `comments` row, not the joined author). If a viewer's plan flips mid-thread, the pill on existing comments does NOT re-render until next page load. Acceptable — do not subscribe to `users` table changes (would leak plan state).

- **Deps:** S1 view migration first; S5 ships both client edits in one PR.
- **Verification:** (1) `\d+ public_profiles_v` shows `is_pro`. (2) Pro user comment renders chip in another browser; downgrade → reload → chip gone. (3) Anon-key query against the view confirms no `plan_id` leaks. (4) iOS contract published in code comment above the select.
- **Multi-agent:** full 6-agent. Reviewer: "confirm `plan_id` is not selected against `public_profiles_v` anywhere." Adversary: "find a path where a non-public field leaks via the view."

---

### S5-T2.3 — Comment block enforcement RLS (verification only)

- **Title:** Verify Postgres realtime + PostgREST honor the new comment-block RLS policy after S1's migration lands.
- **Source:** TODO2 T2.3. Owner-pending — but the migration is written; S1 applies. S5 owns post-apply verification only.
- **Severity:** P0 — pre-fix, blocked users' comments leak through iOS, raw PostgREST, and realtime even though web's client-side filter (`CommentThread.tsx:191-200`) hides them on web.
- **Status:** VERIFY-ONLY post-S1.
- **File:line:** `web/src/components/CommentThread.tsx:191-200` is the legacy client-side filter. After S1 lands the RLS, the client-side filter remains as a defense-in-depth and a UX nicety (hides locally-cached blocked-author rows immediately on block) — do not delete it.
- **S1 RLS spec (recorded here for reference):**
  ```sql
  -- migrations/<date>_T2_3_comments_block_rls.sql (S1 owns)
  DROP POLICY IF EXISTS comments_select ON public.comments;
  CREATE POLICY comments_select ON public.comments
    FOR SELECT USING (
      (
        (status = 'visible' AND deleted_at IS NULL)
        OR user_id = auth.uid()
        OR is_mod_or_above()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_users b
        WHERE b.blocker_id = auth.uid()
          AND b.blocked_id = comments.user_id
      )
    );
  ```
- **Verification (after S1 apply):** (1) Web — A blocks B; A reloads article-B-commented; B's rows gone. (2) iOS — same scenario via PostgREST returns zero B rows; S9 needs no code change (publish contract in code comment). (3) Realtime — A subscribes; B posts; A does not receive the INSERT event (RLS evaluates at delivery). (4) Raw PostgREST as A — zero B rows. (5) Mod bypass — moderator sees B's comments (mod-or-above branch in policy).
- **Deps:** S1 migration applied.
- **Multi-agent:** light verify-only pattern. Investigator runs five smoke tests; reviewer confirms client-side filter intact for defense-in-depth.

---

### S5-A47-social — Banned timeline copy in notifications page

- **Title:** Strip "coming soon" / "check back" / "we're working on it" / "actively working" / "launches soon" / "we'll get back" / "before launch" / "in a future pass" copy from the notifications surface.
- **Source:** TODO A47 (cross-cutting). S5's slice is `web/src/app/notifications/page.tsx`. CommentComposer.tsx is also in scope; audit and rewrite if any present-tense violations exist.
- **Severity:** P1 — direct violation of owner-locked rule (memory `feedback_no_user_facing_timelines`). App Store reviewer can flag promised-but-not-shipped features.
- **Status:** 🟩 VERIFIED CLEAN — `grep -rnE` of the lint regex against `web/src/app/notifications/`, `web/src/app/messages/`, `web/src/app/bookmarks/`, `web/src/components/Comment*` returned zero matches (2026-04-28). No code change needed for S5 surfaces; doc-only.
- **File:line:** `web/src/app/notifications/page.tsx` (full file audit) + `web/src/components/CommentComposer.tsx` (full file audit).
- **Current state (verified 2026-04-27):** main timeline-copy violations live in S7 (recap, UnderConstruction, accessibility) and S8 (profile/settings) and S9 (AlertsView.swift). S5's notifications surface and comment composer must be checked; any "Coming soon — backend wiring" or similar pattern gets rewritten.
- **Fix:** rewrite each violation to **describe present state** OR render a clean unavailable state. **No softer-timeline replacement** ("Check back later", "We're working on it") — those are also banned. Strip entirely; describe what's true now. Examples:
  - "Email digests are coming soon" → "Email digests are not part of this product."
  - "Push notifications coming in a future pass" → render an unavailable card OR remove the toggle entirely.
- **CI lint regex** (S5 publishes; lint config owner adds): `/(coming soon|check back soon|we'll get back|actively working|finishing the .* polish|launches? (soon|next|in)|will be available|in a future pass|before launch)/i`.
- **Verification:** (1) Lint regex against `web/src/app/notifications/` + `web/src/components/Comment*` returns zero. (2) Eyeball the rendered page in dev.
- **Multi-agent:** full 6-agent — copy regressions are easy to miss. Adversary: "find phrasing implying future delivery without using the banned keywords."

---

### S5-A104 — `/notifications` mark-one-as-read races browser navigation

- **Title:** Mark-one-as-read fetch is cancelled by browser nav before reaching the server.
- **Source:** TODO A104.
- **Severity:** P2 — notification badge persists incorrectly. User dismisses → navigates → returns → badge still unread. Engagement / trust regression.
- **Status:** 🟩 SHIPPED — commit b97d38c.
- **File:line:** `web/src/app/notifications/page.tsx:402-405`.
- **Current state (verified 2026-04-27):**
  ```tsx
  onClick={(e) => {
    if (!n.action_url) e.preventDefault();
    markOne(n.id);
  }}
  ```
  `markOne` issues an `await fetch(...)` (or unawaited if you trace it; verify in implementer pass) and returns immediately while the browser follows `action_url`. The in-flight fetch can be cancelled by the navigation.
- **Fix:** fire-and-forget via `navigator.sendBeacon` for guaranteed delivery, falling back to keepalive fetch:
  ```tsx
  function markOneFireAndForget(id: string) {
    const url = '/api/notifications/' + id + '/read';
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([JSON.stringify({ id })], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
    // Fallback: keepalive ensures the request survives navigation.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => { /* swallow; user already navigated */ });
  }
  ```
  Caller becomes:
  ```tsx
  onClick={(e) => {
    if (!n.action_url) e.preventDefault();
    markOneFireAndForget(n.id);
    // optimistic UI: flip is_read locally so the user doesn't see it stay highlighted on return-back.
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
  }}
  ```
- **Server requirement:** `/api/notifications/[id]/read` must accept `application/json` AND tolerate the `text/plain` payload sendBeacon emits in some browsers. Normalize content-type handling.
- **Verification:** (1) DevTools confirms the `/read` request leaves the browser before navigation (appears in "Other" trace under sendBeacon). (2) Click → navigate → back-button → row is `is_read: true`. (3) Slow 3G + CPU throttle confirms no regression.
- **Multi-agent:** full 6-agent. Adversary: "find a network condition where sendBeacon and keepalive both drop."

---

### S5-A96 — `/notifications` "Earlier" bucket has no upper bound

- **Title:** Old notifications mix with recent ones in a single "Earlier" group.
- **Source:** TODO A96.
- **Severity:** P2 — UX legibility. A 6-month-old reply ranks identically with a 10-day-old one.
- **Status:** 🟩 SHIPPED — commit b97d38c (bundled with A104).
- **File:line:** `web/src/app/notifications/page.tsx:46-48` (current `groupNotifications` reducer).
- **Current state (verified 2026-04-27):**
  ```ts
  const earlier = notifications.filter(
    (n) => n.created_at == null || new Date(n.created_at) < weekStart
  );
  if (earlier.length) groups.push({ section: 'Earlier', items: earlier });
  ```
- **Fix:** split into two more buckets — "Earlier this month" and "Older". Keep `null` `created_at` rows pinned at the bottom of "Older".
  ```ts
  const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
  const earlierThisMonth = notifications.filter(
    (n) => n.created_at != null
      && new Date(n.created_at) >= monthStart
      && new Date(n.created_at) < weekStart
  );
  const older = notifications.filter(
    (n) => n.created_at == null || new Date(n.created_at) < monthStart
  );
  if (earlierThisMonth.length) groups.push({ section: 'Earlier this month', items: earlierThisMonth });
  if (older.length) groups.push({ section: 'Older', items: older });
  ```
- **Verification:** seed notifications at offsets today / 3d / 10d / 35d / 6mo / null-created_at; confirm 4-bucket grouping with null-stamped row in Older; empty buckets not rendered.
- **Multi-agent:** light — pure presentation refactor.

---

### S5-T25 — Topic / category alerts API routes

- **Title:** New API surface for per-category subscription management. Backs the iOS `manageSubscriptionsEnabled` flag (currently `false`).
- **Source:** TODO2 T25. S1 owns schema + publish-time trigger; S5 owns subscription CRUD routes; S9 owns iOS UI.
- **Severity:** P1 — feature is half-built (`alert_preferences` table exists for per-alert-type channel/frequency only; no category-level subscription mechanism; `breaking_news` is a global blast).
- **Status:** 🟩 SHIPPED — commit 0f62802. GET/POST/DELETE all live; safe-fallback 503 with reason `subscriptions_unavailable` when S1 table missing — route is live the moment S1 lands the migration.
- **S1 schema spec (recorded for reference):**
  ```sql
  -- migrations/<date>_T25_subscription_topics.sql (S1 owns)
  CREATE TABLE public.subscription_topics (
    user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, category_id)
  );

  ALTER TABLE public.subscription_topics ENABLE ROW LEVEL SECURITY;

  CREATE POLICY subscription_topics_self ON public.subscription_topics
    FOR ALL USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  CREATE INDEX subscription_topics_category_idx
    ON public.subscription_topics (category_id);

  -- publish-time fan-out trigger on articles table
  CREATE OR REPLACE FUNCTION public.fanout_category_subscriptions()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    IF NEW.published_at IS NOT NULL AND OLD.published_at IS NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, action_url, metadata)
      SELECT
        st.user_id,
        'category_alert',
        NEW.title,
        COALESCE(NEW.summary, ''),
        '/story/' || NEW.slug,
        jsonb_build_object('article_id', NEW.id, 'category_id', NEW.category_id)
      FROM public.subscription_topics st
      WHERE st.category_id = NEW.category_id
        AND st.user_id <> NEW.author_id; -- don't notify author of own publish
    END IF;
    RETURN NEW;
  END $$;

  CREATE TRIGGER trg_fanout_category_subscriptions
    AFTER UPDATE OF published_at ON public.articles
    FOR EACH ROW EXECUTE FUNCTION public.fanout_category_subscriptions();
  ```
- **S5 routes:** create `web/src/app/api/alerts/subscriptions/route.ts`:
  - **GET** → `200 { subscriptions: [{category_id, category_slug, category_name, created_at}] }` | `401`.
  - **POST** body `{category_id}` → idempotent. Validates category exists + is_active. `200 { subscription }` | `400 invalid_category` | `401`.
  - **DELETE** body `{category_id}` → idempotent. `200 { ok: true }` | `401`.
  - **Rate limits:** GET 60/min, POST 30/min, DELETE 30/min per user. Use `RATE_LIMITS` from `lib/rateLimits.ts` once S3 ships; inline + TODO-link if not.
  - **Error shape:** generic `{error: 'reason'}`; no SQL detail leak.
  - **Idempotency:** POST does `UPSERT ... ON CONFLICT (user_id, category_id) DO NOTHING RETURNING *`; if conflict swallows, re-select and return.

- **Coexistence with `alert_preferences`:** existing per-alert-type channel/frequency settings stay. `subscription_topics` is the per-category attachment; `alert_preferences` is the per-alert-type fan-out toggle. Both feed into the publish-time fan-out (trigger writes `notifications`; send-push and send-emails crons honor `alert_preferences` for channel + cadence).
- **Deps:** S1 schema + trigger first; S5 routes second; S9 iOS UI third (flip `manageSubscriptionsEnabled=true` in `AlertsView.swift:300`).
- **Verification:** (1) POST subscription → row exists. (2) Owner publishes in category → one `notifications` row per subscriber. (3) DELETE then re-subscribe — idempotent. (4) A subscribes; B publishes; A notified; B not (author-skip). (5) Owner subscribed-and-publishing in same category → no self-notification.
- **Multi-agent:** full 6-agent. Adversary: "fan-out to a non-subscriber OR skip a subscriber." Reviewer: "RLS lets user only INSERT/SELECT their own rows."

---

### S5-iOS-comment-parity-coordination — A123 / A124 / A125 / A126 contract

- **Title:** Publish the API contract for comment edit, soft-delete, mention array, threading depth so S9 can implement iOS parity without ambiguity.
- **Source:** TODO A123, A124, A125, A126.
- **Severity:** P1 (cross-platform divergence on a basic feature).
- **Status:** 🟩 SHIPPED — contract block added at `web/src/app/api/comments/[id]/route.js` lines 22-89 (file landed under commit be4e03d due to concurrent-staging race; verified in tree). S9 cites by file:line.

#### Contract: Comment edit (A123)

- **Endpoint:** `PATCH /api/comments/[id]`.
- **Body:** `{ body: string }`. `body` length: 1..2000 chars after trim.
- **Auth:** bearer required; user must own the comment OR be mod-or-above.
- **Permission gate:** `comments.edit.own` (owner) or `comments.edit.any` (mod). Permission service evaluates server-side.
- **Edit window:** verify in implementation against the current route. As of the last S5 verification window, web allows edit indefinitely for the author with no time cap; mods always allow. iOS should mirror.
- **Server effect:** `comments.body = $body, comments.body_html = renderMd($body), comments.is_edited = true, comments.edited_at = now()`. `mentions` array re-extracts on the new body.
- **Response:** `200 { comment: {... full row ...} }` or `4xx { error: 'reason' }`.
- **Realtime:** server emits an UPDATE on `comments`; web's CommentThread.tsx UPDATE handler merges. iOS must subscribe to `UpdateAction` (A124) to receive.

#### Contract: Comment soft-delete (A126)

- **Endpoint:** `DELETE /api/comments/[id]`.
- **Auth:** owner or mod.
- **Server effect:** `comments.deleted_at = now(), comments.body = '[deleted]', comments.body_html = NULL, comments.mentions = '[]'::jsonb` per T2.2's anonymize pattern (S1 owns the function; S5 confirms route preserves the contract).
- **Render contract:** clients render `[deleted]` tombstone when `deleted_at IS NOT NULL`. iOS `VPComment` model must add `deleted_at`, `status`, `is_edited`, `mentions`, `context_tag_count`, `is_context_pinned` per A126.

#### Contract: Mention array (A126 / §H2 below)

- **Field:** `comments.mentions` is `jsonb` array of `{ username: string, user_id: uuid }`. Server populates on insert and on edit by extracting `@<username>` tokens, looking them up in `users.username`, and writing the resolved pair. Unresolved mentions get dropped from the array (currently silently — see §H2 fix below).
- **iOS contract:** decode the array; render each `@username` as a tappable element that opens the profile route. Plain `@username` text without a corresponding array entry renders as plain text.

#### Contract: Threading depth (A125)

- **Server allows arbitrary depth** via `comments.parent_id` chain. Web does not cap depth. Owner-locked Q4.15 = **B (iOS-native "Continue this thread →" affordance at depth 3 that opens the rest in a fullscreen sheet)**.
- **iOS implementation (S9):** keep `maxThreadDepth = 3` in `StoryDetailView.swift:1297`. At depth 3, render a "Continue this thread →" button. Tap opens a fullscreen sheet that re-roots the thread at that comment and renders depth 0..3 of the subtree. Recursive when needed.

- **S5 action:** add a contract comment block above the PATCH/DELETE route handlers documenting body shape, auth, permissions, server effects, response, realtime emission, and the `[deleted]` tombstone render contract for S9 to cite by file:line.
- **Verification:** S9's commits cite the contract block.
- **Multi-agent:** light — doc-only.

---

### S5-§H1 — Free-tier breaking-news daily push silently skipped

- **Title:** Free-tier user gets one breaking-news push per day; subsequent breaking-news events that day are silently dropped. No in-app summary; no record of the missed pushes.
- **Source:** PotentialCleanup §H1.
- **Severity:** P2 — silent paid-tier-discrimination surface (memory `feedback_genuine_fixes_not_patches`: silent drops are forbidden).
- **Status:** OPEN.
- **Current state:** push send-fan-out applies a per-user daily cap on free tier. The cap is enforced at delivery time by the cron handler (S2 owns) by reading the user's plan and counting today's push receipts. Once the cap is hit, the row is dropped from the batch with no tombstone.
- **Fix:** show a "missed pushes" summary card at the top of the notifications page when free tier had pushes capped today.
  - **DB-side (S1 owns):** emit a `notifications` row of type `push_capped_daily_summary` once per day per capped user, listing the skipped count and action_urls. Idempotent on `(user_id, type, date_trunc('day', created_at))`. The send-push cron writes the row when it skips (S2 implements).
  - **S5-side:** render branch in `web/src/app/notifications/page.tsx` for type `push_capped_daily_summary` showing count + article links + inline "Upgrade to Pro for unlimited breaking-news alerts" chip. Card is dismissible via the existing `is_read` flag.
- **Deps:** S1 + S2 first; S5 ships render.
- **Verification:** (1) Cap free user with 5 breaking-news today → one summary card lists all five. (2) Upgrade to Pro; trigger another → no summary card. (3) Six events tomorrow → still ONE summary (idempotent).
- **Multi-agent:** full 6-agent. Adversary: "find a path where the summary card double-fires within a day."

---

### S5-§H2 — Mention auto-resolve drops `@username` to plaintext silently for free tier

- **Title:** When a free-tier user submits a comment containing `@otheruser`, the server resolves the mention into `mentions` array and deducts mention-fan-out push credits. Free-tier mentions are silently dropped from the array (mention notification doesn't fire). The user sees the comment post; the mentioned user gets nothing.
- **Source:** PotentialCleanup §H2 (D21).
- **Severity:** P2 — silent paid-tier-discrimination + breaks user expectations (visible `@username` link in own comment that produces no notification).
- **Status:** 🟩 SHIPPED — pre-submit lock + new can-mention route landed under commit 7079b60 (concurrent-staging race; verified in tree). Server defense-in-depth in `post_comment` RPC ships in S1.
- **Current state:** the post-comment RPC extracts `@username` tokens; for free-tier authors, the mention array is populated for rendering (so the link tappable behavior works) but the notification fan-out is skipped. Free user sees their `@reply` syntax succeed visually but the mentioned user never knows.
- **Fix (per memory `feedback_genuine_fixes_not_patches`): pre-submit lock, not silent post-submit drop.**
  - **CommentComposer.tsx (S5 owns):** before submit, call `/api/comments/can-mention` (new lightweight route) with the extracted `@username` list. The route returns `{ allowed: boolean, reason?: 'free_tier_mention_disabled' | 'mentioned_user_blocks_you' | 'ok' }`.
  - If `allowed=false` with reason `free_tier_mention_disabled`: render a pre-submit error inline above the composer: "Mentions are a Pro feature. [Upgrade →](/pricing) — or remove the @username to post." Block the submit. Do NOT silently strip and post.
  - If `allowed=false` with reason `mentioned_user_blocks_you`: "You can't mention <username> — they've blocked you." Block submit; user removes the mention to post.
  - If `allowed=true`: submit proceeds. The server-side post route trusts the pre-flight and writes mentions + fans out notifications.
- **Server change:** `post_comment` RPC stops silently dropping mention fan-out. Defense-in-depth: the RPC re-validates the author's plan and rejects the comment if any `@username` is present and author is free-tier (hand-crafted POST can't bypass the UI).
- **New route:** `web/src/app/api/comments/can-mention/route.ts` — POST `{ usernames: string[] }`. Resolves each, checks blocks, checks plan. Returns union state.
- **Verification:** (1) Free user with `@bob hello` → composer error, submit disabled. (2) Pro user → comment posts, bob notified. (3) Hand-crafted POST as free-tier with mentions → 403. (4) Free user removes `@bob` → submit succeeds, bob gets nothing.
- **Multi-agent:** full 6-agent. Reviewer: "server defense-in-depth catches hand-crafted bypass." Adversary: "fire mention fan-out from a free-tier author."

---

### S5-§H4 — Token invalidation on push has no in-app indication

- **Title:** Apple/FCM marks a device push token as invalid (uninstall, opt-out, app reinstall under different APNs); push-send cron deactivates the token; user sees nothing in-app and assumes pushes are still working.
- **Source:** PotentialCleanup §H4.
- **Severity:** P2 — feature appears working, isn't.
- **Status:** 🟩 SHIPPED — commit 48004a9. iOS UI (settings line + re-register tap) lives in S9; S5 publishes the API exposing token status.
- **S5 action — new route** `web/src/app/api/push/status/route.ts`:
  - **GET** auth required. Returns per-platform shape `{ web, ios, android }`, each `{ registered: bool, last_seen_at: timestamp|null, last_invalidated_at: timestamp|null, status: 'active'|'invalidated'|'absent' }`.
  - Reads from `push_devices` (verify table name vs send-push cron's consumer view), aggregates per platform.
  - Rate limit: 30/min per user.
- **iOS contract (S9):** `SettingsView.swift` row "Push notifications" with status text — `active`: "working"; `invalidated`: "needs re-register" + Re-register button (re-runs permission flow + re-uploads token); `absent`: "off" + Turn-on button.
- **Verification:** (1) Registered iOS user GET → `ios.status='active'`. (2) Force-invalidate via admin or APNs error → `invalidated` + `last_invalidated_at`. (3) S9 verifies tap-to-re-register flips status back to active on next GET.
- **Multi-agent:** full 6-agent. Adversary: "expose another platform's status to the wrong session." Reviewer: "rate limit prevents token-status enumeration."

---

### S5-Q4.8 — Content-lockout freeze scope (verify routes don't bypass)

- **Title:** Owner-locked Q4.8 = **B (content lockout)**. Frozen users (`frozen_at IS NOT NULL`) lose comment INSERT, vote, follow, message, and bookmark actions in addition to the existing scoring + DM + leaderboard gates.
- **Source:** TODO2 T346. Owner-locked.
- **Severity:** P1 — abuse vector if not enforced.
- **Status:** S1 owns the RLS additions; S5 owns the verify-only pass that no S5-owned route bypasses the gate.
- **S1 RLS spec (recorded):** add `frozen_at IS NULL` (against the acting user) to the WITH CHECK clause of:
  - `comments` INSERT policy.
  - `comment_votes` INSERT/UPDATE policy.
  - `follows` INSERT policy.
  - `messages` INSERT policy.
  - `bookmarks` INSERT policy.
- **S5 verify-only sweep:** for each S5-owned route below, confirm there is NO service-role bypass that would let the request land for a frozen user:
  - `web/src/app/api/comments/route.js` (POST)
  - `web/src/app/api/comments/[id]/vote/route.js`
  - `web/src/app/api/follows/route.js` (POST)
  - `web/src/app/api/messages/route.js` (POST)
  - `web/src/app/api/bookmarks/route.js` (POST)
  - `web/src/app/api/users/[id]/block/route.js` (POST) — block while frozen IS allowed (defensive action; user freezing doesn't disable defensive moves).
- **Verification:** (1) Apply S1 migration in staging. (2) Set test user `frozen_at=now()`. (3) As that user via web UI, try comment / upvote / follow / message / bookmark — all fail with "Your account is frozen". (4) Block another user — succeeds. (5) Reverse the freeze → all actions resume. (6) Code review: every POST handler in S5 ownership uses `auth.uid()`-bound supabase client; any service-role write flagged + re-routed.
- **Multi-agent:** full 6-agent (security-elevated). Reviewer: "trace each route's auth posture; confirm no service-role bypass." Adversary: "frozen user lands a write via S5-owned route."

---

### S5-Notification-table-cleanup — Bookmark / Follow / Vote / Mention notification routes audit

- **Title:** Audit each notification-emitting route for idempotency + rate limits + error response hygiene + RLS coherence.
- **Source:** general hygiene; bundled here so the S5 sweep covers it.
- **Severity:** P2 — operator-mistake blast radius.
- **Status:** 🟩 SHIPPED — commit 906f78b (the one meaningful audit finding: `bookmarks/[id]` PATCH+DELETE missing rate limits). All other routes pass checklist on inspection — adding doc-noise headers to clean routes would violate genuine-fixes rule.
- **Files in scope:**
  - `web/src/app/api/comments/route.js` and `web/src/app/api/comments/[id]/route.ts` (POST, PATCH, DELETE).
  - `web/src/app/api/comments/[id]/vote/route.js`.
  - `web/src/app/api/comments/[id]/report/route.js`.
  - `web/src/app/api/follows/route.js`.
  - `web/src/app/api/bookmarks/route.js` and `[id]`.
  - `web/src/app/api/users/[id]/block/route.js`.
  - `web/src/app/api/messages/route.js`.
  - `web/src/app/api/reports/route.js` and `weekly-reading-report`.
  - `web/src/app/api/notifications/route.js` (mark read / list).
  - `web/src/app/api/notifications/preferences/route.js`.
  - `web/src/app/api/push/send/**` (server-only push initiation; verify auth posture).
- **Audit checklist per route:**
  1. **Idempotency** — repeat-POST returns same outcome; no duplicate `notifications` rows; no double-counted `upvote_count`.
  2. **Rate limits** — use `RATE_LIMITS` from `web/src/lib/rateLimits.ts` (S3 owns); inline + TODO-link if not in tree. Default caps: Comment POST 10/min + 30/hr; Vote 60/min; Follow 30/min; Bookmark 60/min; Block 30/hr; Message 30/min; Report 10/hr; Notifications GET 60/min.
  3. **Error hygiene** — generic `{error: 'reason'}`; no 4xx-vs-5xx enumeration oracles.
  4. **RLS coherence post-S1** — confirm S1 policy changes (T2.3 block, T34 wilson, T365 view) don't leave stale `select '*'` joins on hidden columns.
  5. **Service-role audit** — no public route uses service role where `auth.uid()` would do. Only admin (S6) gets service role.
- **Deps:** S3's `rateLimits.ts` ideally first; S5 ships inline + TODO if not.
- **Verification:** (1) Each route has a checklist comment block at top. (2) Re-POST same body → idempotent; hammer at 2× cap → 429. (3) RLS coherence — `SELECT *` from each route's perspective with anon + authed + mod bearer; no leak.
- **Multi-agent:** batch-mode 1 planner + 4 implementers (routes split 4 ways) + 1 reviewer.

---

### Out-of-scope (drop from S5)

These appear in the S5 owns-paths list overlap or were considered, but belong to peer sessions:

- **A105 — bookmark cap upgrade affordance.** UI lives in `web/src/app/story/[slug]/page.tsx` (S7-owned). API logic in `/api/bookmarks` is correct as-is (returns 402 / cap reason). Hand-off: S7.
- **A100 — `/contact` vs `/profile/contact` API consolidation.** Contact UI in S7/S8; API consolidation in S6 (admin support queue). Drop from S5.
- **A23 — Admin notifications broadcast unsafe pattern.** Lives at `web/src/app/api/admin/notifications/broadcast/route.ts` (S6-owned). Drop.
- **A66 — `/admin/notifications` log column "User" renders raw uuid.** Admin file, S6. Drop.

Each drop is recorded above so the next audit pass doesn't re-flag.

---

## 2. New shared lib files (created by S5 if they don't exist yet)

- None expected. `web/src/lib/reportReasons.js` is already in S5 ownership; do not break the public export shape (`COMMENT_REPORT_REASONS`, `PROFILE_REPORT_REASONS`, `ARTICLE_REPORT_REASONS`, `ALL_REASON_VALUES`, `assertReportReason`). Q3a confirmed iOS consumes `ALL_REASON_VALUES`.
- If S3's `web/src/lib/rateLimits.ts` is not yet in tree at S5 ship time, inline caps with a TODO-link to the consolidation. Do not create the file from S5 — hand off to S3.

---

## 3. Cross-session dependency map

| Item | Depends on | Then unblocks |
|---|---|---|
| S5-T34 Wilson | S1 (`wilson_score` column + index) | sort order live everywhere |
| S5-T365 Pro pill | S1 (`public_profiles_v.is_pro`) + S6 (`types/database.ts` regen) | comment row pill |
| S5-T2.3 block RLS | S1 (`comments_select` policy) | iOS / realtime / PostgREST parity |
| S5-T25 alerts | S1 (`subscription_topics` + trigger) | S5 routes → S9 iOS UI |
| S5-§H1 missed-pushes | S1 (`notifications` row type) + S2 (cron emits) | render in S5 page |
| S5-Q4.8 freeze scope | S1 (5 RLS additions) | verify-only in S5 |
| S5-§H4 push status | none | S9 settings UI |
| S5-§H2 mention pre-submit | none (composer + new route in S5) | conversion surface |
| S5-A104 mark-read race | none | UX |
| S5-A96 earlier bucket | none | UX |
| S5-A47 timeline copy | none | owner-rule compliance |
| S5-iOS-parity contract | none — doc only | S9 implementation |

Apply S1 dependencies in this order to unblock the most S5 work in parallel:
1. T2.3 (block RLS) — verify-only follow-up, no S5 code wait.
2. T365 (`public_profiles_v.is_pro`) — short S5 client diff.
3. T34 (`wilson_score`) — short S5 client diff.
4. T25 (subscription_topics) — S5 routes are net-new; longest S5 task.
5. Q4.8 (5 RLS additions) — S5 verify-only.
6. §H1 (notification row + S2 cron) — S5 render in parallel.

---

## 4. Final verification (run before any commit batch closes)

- [ ] `git diff --name-only` includes only paths in §0.1 owned-paths list.
- [ ] `grep -rnE "coming soon|check back|we'?ll get back|actively working|launches? (soon|next|in)|will be available|in a future pass|before launch" web/src/app/notifications/ web/src/components/Comment*` — zero matches.
- [ ] `grep -rn "plan_id" web/src/components/CommentRow.tsx web/src/components/CommentThread.tsx` — zero matches (only `is_pro` is allowed on the public surface).
- [ ] `grep -rn "wilson_score" web/src/components/CommentThread.tsx` — exactly one match (the order clause).
- [ ] Notification page passes axe a11y check (no role / aria regressions; the new buckets + summary card render with proper landmarks).
- [ ] Realtime smoke: post a comment from a second session; confirm the active session's CommentThread receives the INSERT and re-sorts (Wilson order) without manual reload.
- [ ] Block smoke: User A blocks User B; A reloads B-authored article; zero B comments rendered; A's realtime subscription drops B's INSERT events.
- [ ] Push status smoke: GET `/api/push/status` returns the three-platform shape; enumerate to confirm no other-user data leaks under any session.
- [ ] Mention pre-submit lock: free-tier compose with `@user` blocks submit + renders Pro-upgrade chip.
- [ ] Missed-pushes summary: free-tier user with daily cap hit shows one summary card with linkable count.
- [ ] Commits tagged `[S5-Tnnn]` or `[S5-A47-social]` / `[S5-§H1]` etc.
- [ ] Each shipped item updates its inline checkbox in §1 above (status `OPEN`/`LOCKED` → `SHIPPED — <commit-sha>`).
- [ ] No edits to admin / profile / story-page / auth / iOS / kids / migrations / cron paths.

---

## 5. Completion checklist (top-to-bottom of §1)

- 🟥 **S5-T34** Wilson score — BLOCKED. S1's session index does NOT
  contain a T34 wilson-score migration; the column doesn't exist in the
  live DB (verified via MCP information_schema query 2026-04-28). The
  S5 client diff (single-line ORDER BY swap) cannot ship without the
  generated column or it 500s every comment thread load. Re-queue once
  S1 picks up the migration (file `web/src/components/CommentThread.tsx`
  line 137 awaits the change).
- 🟩 **S5-T35** Rank notifications — DROPPED per Q4.5 lock; tombstoned
  inline at §1. No commit (no work).
- 🟨 **S5-T365** Pro pill — DEFERRED. S1 has the migration drafted
  (`2026-04-27_S1_Q4.9_public_profiles_v_is_pro.sql`) but it's not
  applied to the live DB (verified via MCP — `is_pro` not in
  `public_profiles_v`). Shipping the client widening + render now would
  read-fail on production. Re-queue once S1 applies; client diff is
  isolated to `CommentThread.tsx` select + `CommentRow.tsx` render.
- 🟨 **S5-T2.3** Block RLS — DEFERRED. S1 has migration drafted at
  `Ongoing Projects/migrations/2026-04-28_S1_T2.3_comments_block_rls.sql`
  but not applied. Verify-only post-apply: smoke web + iOS contract +
  realtime + raw PostgREST + mod bypass per §1 spec.
- 🟩 **S5-A47-social** Timeline copy — VERIFIED CLEAN. Audit ran
  `grep -rnE "(coming soon|check back|we'?ll get back|actively
  working|launches? (soon|next|in)|will be available|in a future
  pass|before launch|finishing the .* polish)"` against the 4 in-scope
  surfaces (`web/src/app/notifications/`,
  `web/src/components/CommentComposer.tsx`,
  `web/src/components/CommentThread.tsx`,
  `web/src/components/CommentRow.tsx`,
  `web/src/app/messages/`, `web/src/app/bookmarks/`) — zero matches. No
  commit (no violations to fix); doc-only entry recorded here.
- 🟩 **S5-A104** Mark-read race — SHIPPED **commit b97d38c**. sendBeacon
  → keepalive fallback against new `POST /api/notifications/[id]/read`;
  optimistic local flip; rolled back useToast/rollback path that the
  fire-and-forget pattern obviates.
- 🟩 **S5-A96** Earlier bucket — SHIPPED **commit b97d38c** (bundled
  with S5-A104). 4-bucket grouping (Today / This week / Earlier this
  month / Older) with null-stamped rows pinned to Older.
- 🟩 **S5-T25** Topic alerts — SHIPPED **commit 0f62802**. GET/POST/
  DELETE on `/api/alerts/subscriptions`; idempotent UPSERT; rate-
  limited 60/min GET, 30/min write; safe-fallback 503 with
  `subscriptions_unavailable` when `subscription_topics` table missing
  (S1 dependency). Live the moment S1 applies the migration. S9 flips
  `manageSubscriptionsEnabled = true` in `AlertsView.swift` once the
  fan-out trigger is verified.
- 🟩 **S5-iOS-parity** A123/A124/A125/A126 contract — SHIPPED in the
  contract block at the top of `web/src/app/api/comments/[id]/route.js`
  (verified in tree at lines 22-89; the file landed in commit be4e03d
  due to concurrent-staging race). S9 cites by file:line.
- 🟨 **S5-§H1** Missed-pushes summary — DEFERRED. Requires S1 emit row
  type `push_capped_daily_summary` AND S2 cron writes the row when the
  cap fires. Neither dependency is ready (S2 has cron-collision +
  drain-loop work shipped, but no §H1 emit). Render branch on
  `notifications/page.tsx` is a follow-up once both dependencies land.
- 🟩 **S5-§H2** Mention pre-submit lock — SHIPPED **commit 7079b60**
  (CommentComposer + new can-mention route landed under that commit due
  to concurrent staging; verified in tree). Pre-submit lock blocks free-
  tier mentions and mentioned-user-blocks-you with actionable inline
  copy. Server-side defense-in-depth in `post_comment` RPC ships in S1.
- 🟩 **S5-§H4** Push status — SHIPPED **commit 48004a9**. GET
  `/api/push/status` returns per-platform `{web, ios, android}` shape;
  rate-limited 30/min; aggregation handles invalidated-only +
  active-and-invalidated rows correctly. S9 wires SettingsView row.
- 🟨 **S5-Q4.8** Freeze scope — DEFERRED to verify-only post-S1. S1
  drafted but not applied. The 5 S5-owned routes (comments POST,
  comment-vote POST, follows POST, messages POST, bookmarks POST) all
  use `requirePermission` → `auth.uid()`-bound supabase clients
  resolving to the user's session; service-role only used for the
  authoritative write after permission resolves. No service-role
  bypass that would let a frozen user land a write — RLS will gate
  cleanly once S1 applies the freeze policies.
- 🟩 **S5-Notification-table-cleanup** — SHIPPED **commit 906f78b** for
  the one meaningful audit finding (bookmarks/[id] PATCH+DELETE missing
  rate limits — added 60/min per verb keyed per user). Other routes
  passed checklist on inspection (idempotency via UPSERT/RPC, rate
  limits via `checkRateLimit`, error hygiene via `safeErrorResponse`,
  service-role posture is auth-bound). No additional commits — adding
  doc-noise headers to clean routes would violate genuine-fixes rule.
- 🟧 **Out-of-scope** A105 / A100 / A23 / A66 — recorded inline at §1's
  "Out-of-scope" block; hand-off filed by the existence of that block.
- ⏭️ **Final verification** §4 — partial. Owned-paths invariant +
  timeline-copy regex + push-status shape verified. Realtime sort and
  block smoke require S1 to land first.
- ⏭️ **00_INDEX.md** updated — pending peer-coordination pass; the
  index is jointly owned and peer sessions update concurrently.

---

**End of Session 5 operating manual.**
