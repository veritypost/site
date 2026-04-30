# Slice 05 — First-Login UX

**Status:** not-started
**Depends on:** Slice 04 (session must be established before first-login flag is readable)
**Blocks:** nothing

---

## What this slice is

The moment between "session just established" and "feed loads." On a user's first login only, they see a single line of copy held briefly before the feed appears. No modal. No tour. No button to dismiss. Just the line, then the feed.

This replaces the current `WelcomeModal` username picker for users arriving via this flow. (The username picker is already gated; don't remove it — it handles edge cases. This slice adds a layer before it for first-time arrivals.)

---

## Trigger condition

**First login** = `onboarding_completed_at IS NULL` on the `public.users` row.

After the attribution moment plays, set `onboarding_completed_at = NOW()` so it never shows again. This write happens client-side after the moment completes.

Do not use `localStorage` as the gate — the DB column is the source of truth. Local flags can be cleared or transferred across browsers.

---

## Two variants

### Variant A — Referred user

A referrer is present when `public.users.referred_by_user_id IS NOT NULL`.

**Copy:** `[Referrer's display name] reads this every morning.`

- Pull referrer's `display_name` (or `username` if no display name) from a join on `public.users` via `referred_by_user_id`.
- If the referrer row can't be fetched (deleted account, null name), fall back to Variant B silently.
- Hold for **1.2 seconds**, then let the feed load underneath.

### Variant B — Waitlisted user (no referrer)

**Copy:** `you've been on the list [N] days.`

- `N` = `Math.floor((Date.now() - new Date(access_requests.created_at)) / 86400000)` where `created_at` is the earliest approved `access_requests` row for this email.
- If `N < 1` (approved same day as join): show `you made it.` — don't show "0 days."
- If `N` can't be computed (no access_requests row, query error): show `you made it.`
- Hold for **1.2 seconds**.

---

## Visual treatment

- Full-width, vertically centered on the viewport. Feed is behind it at opacity 0.
- Copy: same weight/size as body. Lowercase. No animation beyond fade-in/fade-out.
- Fade in over 200ms → hold → fade out over 200ms → feed fades in simultaneously.
- Total time perceived: 1.2s + fade transitions (~1.6s wall time).
- No background overlay. No card. No border. Just the line on the page background.

---

## Implementation location

**Client component on the home page** — not in NavWrapper.

NavWrapper is server-rendered and runs on every page. The attribution moment is home-specific. Mount it inside `web/src/app/(main)/page.tsx` or as a named client component imported there.

The component:
1. On mount, checks `onboarding_completed_at` from the session user object (already in auth context) or fetches from `public.users`.
2. If null: fetch referrer name (if `referred_by_user_id` exists) and `access_requests.created_at` in parallel. Show the appropriate variant.
3. After 1.2s + fade: PATCH `public.users SET onboarding_completed_at = NOW()` via the Supabase client. Feed becomes visible.
4. If `onboarding_completed_at` is already set: render nothing, feed loads immediately.

The PATCH must happen regardless of whether the user closes the tab mid-fade. Use `keepalive: true` on the fetch or accept that a tiny fraction will see it twice (on same device, different session before the write lands — acceptable).

---

## What this slice does NOT include

**Story snippet in email** — deferred. No real editorial content exists.

**Edition drop on first login** ("today's edition: ...") — deferred. Same reason.

**Reader question** ("what do you read already?") — deferred to day-3 in-feed prompt. Not first login.

**Referrer profile card** — just the name line. No avatar, no link to their profile. Kept minimal.

**Welcome modal changes** — `WelcomeModal` (username picker) is untouched. It has its own gate (`username === null`). If a new user has no username, that modal will still trigger after this moment clears. Both can coexist.

---

## API calls needed

```ts
// On mount — parallel
const [userRow, referrerRow, accessRow] = await Promise.all([
  supabase.from('users').select('onboarding_completed_at, referred_by_user_id').eq('id', userId).single(),
  referredByUserId
    ? supabase.from('users').select('display_name, username').eq('id', referredByUserId).single()
    : Promise.resolve(null),
  supabase.from('access_requests').select('created_at').eq('email', userEmail).eq('status', 'approved').order('created_at').limit(1).maybeSingle(),
]);

// After moment completes
await supabase.from('users').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', userId);
```

The `referred_by_user_id` and `onboarding_completed_at` fields must be accessible on the client — confirm RLS allows the authenticated user to read their own row (should already be the case).

---

## Testing

1. New referred user: confirm Variant A copy appears with correct referrer name, holds ~1.2s, then feed loads. Confirm `onboarding_completed_at` is set after. Refresh — moment does not appear again.
2. New waitlisted user (no referrer): confirm Variant B with correct day count. Edge: same-day approval → "you made it."
3. Referrer account deleted or name null: confirm Variant B fallback, no error shown.
4. Existing user (returning login): confirm no moment, feed loads immediately.
5. Slow network: confirm the feed is not partially visible during the hold (opacity 0 enforced).
