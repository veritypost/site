# Round C — Money-path UX fix plan

Detailed implementation plan for the 6 Round C items (C-02, H-09, H-10, H-15, H-17, M-20). Read-only — this document designs the edits; no code is written here.

Canonical auth copy: Sign in / Sign up / Sign out / Create free account. Never "Login / Log in".

No emojis anywhere — code, UI, or copy.

---

## C-02 — `/billing` is a 404

Create a new file that acts as a server-side redirect shim. Every existing CTA that currently points at `/billing` (AccountStateBanner x2, kids/page.tsx, AskAGrownUp defaults, any other) resolves in a single hop — direct URL visits, share links, and in-app clicks all behave identically.

### Target file (new)
`/Users/veritypost/Desktop/verity-post/site/src/app/billing/page.tsx`

### Current state
File does not exist. `curl -I http://localhost:3000/billing` returns 404. Existing `/Users/veritypost/Desktop/verity-post/site/src/app/profile/milestones/page.js` demonstrates the server-redirect pattern the app already uses.

### Proposed new file contents
```tsx
// @feature-verified billing_redirect 2026-04-19
import { redirect } from 'next/navigation';

// Root-level /billing is preserved as a stable shim. Every money-path CTA
// that wants to send the viewer to the billing settings section should
// link /profile/settings#billing directly, but direct-URL visits, emails,
// and any stale links continue to resolve via this redirect. Server-side
// so there is no mount flash (vs. the old client-side stub at
// /profile/settings/billing covered in H-10).
export default function BillingRedirect(): never {
  redirect('/profile/settings#billing');
}
```

### Why
Closes a 404 on the money path in one file; every stale `/billing` caller (including the two `AccountStateBanner` CTAs and the kids/page.tsx "View family plans" link) resolves without a per-caller edit.

---

## H-09 — `/messages` silent redirect to billing

Replace the `router.replace('/profile/settings/billing')` bounce (and the separate in-page `Subscribe` screen that renders when `!canCompose && dmLocked === false`) with a regwall-style overlay that mirrors the `/story/[slug]` pattern: a centered dialog over a dimmed shell, with "Upgrade" primary and no silent auto-bounce.

### Target file
`/Users/veritypost/Desktop/verity-post/site/src/app/messages/page.tsx`

### Current code (two sites)

Line 162 — the silent redirect in `loadMessages`:
```tsx
        const allowed = hasPermission('messages.dm.compose');
        setCanCompose(allowed);
        if (!allowed) {
          router.replace('/profile/settings/billing');
          return;
        }
        setDmLocked(false);
```

Lines 564-574 — the full-page replacement rendered when compose is denied:
```tsx
  if (!canCompose && dmLocked === false) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Direct messages</h1>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 18px', lineHeight: 1.5 }}>
          Direct messages are available on paid plans. Upgrade to Verity or above to start conversations with other readers.
        </p>
        <a href="/profile/settings/billing" style={{ display: 'inline-block', padding: '11px 22px', background: '#111', color: '#fff', borderRadius: 9, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Subscribe</a>
      </div>
    );
  }
```

### Proposed new code

**Step 1:** remove the `router.replace` — just set the flag, do NOT bounce:
```tsx
        const allowed = hasPermission('messages.dm.compose');
        setCanCompose(allowed);
        setDmLocked(false);
```

**Step 2:** replace the full-page return at 564-574 with an overlay rendered on top of the disabled chat shell. Structure mirrors `/story/[slug]/page.tsx:606-650` (fixed full-viewport backdrop + centered dialog). Exact replacement:
```tsx
  // Viewer is signed in and clear of account-state locks, but lacks the
  // messages.dm.compose permission. Render the standard chat shell so the
  // page layout matches the signed-in experience, then layer an overlay
  // dialog that mirrors the /story/[slug] regwall pattern. No auto-
  // redirect — the user sees context, explanation, and both Upgrade and
  // Back to home actions. Pattern source: story/[slug]/page.tsx:606-650.
  const showDmPaywall = !canCompose && dmLocked === false;
```

Then directly above the main `return (<div style={{ minHeight: '100vh' ...`) at line 581, keep the existing chat shell render, and inject the overlay as a sibling inside the outer wrapper. Concrete insertion (new block, placed as the first child inside the `minHeight:'100vh'` wrapper):
```tsx
      {showDmPaywall && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.92)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-paywall-title"
            style={{
              background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16,
              padding: '32px 28px', maxWidth: 420, textAlign: 'center',
              margin: '0 16px',
            }}
          >
            <div id="dm-paywall-title" style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, color: '#111' }}>
              Direct messages are a paid feature
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
              Upgrade to Verity or above to start conversations with experts, authors, and other readers.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href="/profile/settings#billing" style={{
                display: 'inline-block', padding: '12px 24px', borderRadius: 10,
                background: '#111', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>Upgrade</a>
              <a href="/" style={{
                display: 'inline-block', padding: '10px 20px',
                color: '#666', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}>Back to home</a>
            </div>
          </div>
        </div>
      )}
```

Delete the full-page return at 564-574 — the overlay replaces it.

### Why
Eliminates the silent bounce; gives the user context, an Upgrade CTA, and an explicit escape. Matches the `/story/[slug]` regwall pattern (structurally, not copy). No new `hasPermission` hook required — the existing permission key `messages.dm.compose` already drives `canCompose`; we just stop redirecting on it.

---

## H-10 — `/profile/settings/billing` client-side redirect stub causes flash

Convert the client-side `useEffect` + `router.replace` stub to a server component that calls `redirect()`. One render, no hydration flash.

### Target file
`/Users/veritypost/Desktop/verity-post/site/src/app/profile/settings/billing/page.tsx`

### Current code (entire file, 12 lines)
```tsx
// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsBillingRedirect(): null {
  const router = useRouter();
  useEffect(() => { router.replace('/profile/settings#billing'); }, [router]);
  return null;
}
```

### Proposed new code (full file replacement)
```tsx
// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-19
import { redirect } from 'next/navigation';

// Server-side redirect to the billing anchor inside the single-page
// settings view. Was a client-side useEffect stub; that produced a visible
// mount flash between login gate and destination (H-10). Next.js App
// Router redirect() fires during render, before any HTML is streamed.
export default function SettingsBillingRedirect(): never {
  redirect('/profile/settings#billing');
}
```

### Why
Kills the flash. Also simplifies the contract: Stripe `success_url` / `cancel_url` (currently `/profile/settings/billing?success=1`) now hit one server redirect — the query string survives the `redirect()` call (Next.js preserves it by default).

Note for downstream callers: Stripe checkout route (`/Users/veritypost/Desktop/verity-post/site/src/app/api/stripe/checkout/route.js:38-39`) still points at `/profile/settings/billing?success=1`. This plan does NOT change that URL — the redirect now lives server-side, so the flash is gone but the path is preserved. Round D (H-06) will drop the success_url from the client body anyway, so leaving the path is fine.

---

## H-15 — Quiz "View plans" CTA has no alternate path after 2nd failure

Add a secondary "Try another article" link alongside the "View plans" CTA so the user who failed both attempts understands quizzes are per-article.

### Target file
`/Users/veritypost/Desktop/verity-post/site/src/components/ArticleQuiz.tsx`

### Current code (lines 313-323)
```tsx
        {outOfAttempts && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
              You\u2019ve used both free attempts. Unlimited retakes are available on paid plans.
            </div>
            <a href="/profile/settings/billing" style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 9,
              background: C.accent, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}>View plans</a>
          </div>
        )}
```

### Proposed new code
```tsx
        {outOfAttempts && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
              You\u2019ve used both free attempts on this article. Quizzes are per-article — try another one, or unlock unlimited retakes on a paid plan.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/profile/settings#billing" style={{
                display: 'inline-block', padding: '10px 20px', borderRadius: 9,
                background: C.accent, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>View plans</a>
              <a href="/" style={{
                display: 'inline-block', padding: '10px 20px', borderRadius: 9,
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.text, fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}>Try another article</a>
            </div>
          </div>
        )}
```

### Why
Removes the dead-end. The user now has an on-ramp (paid plan) and a sideways path (another article's quiz). Also fixes the `/profile/settings/billing` link target to the direct anchor `/profile/settings#billing` (eliminates the H-10 hop even before the H-10 fix ships).

---

## H-17 — `#billing` anchor fragile (stop-gap)

The settings page already has a mount-time hash scroll (`/Users/veritypost/Desktop/verity-post/site/src/app/profile/settings/page.tsx:503-509`). It calls `scrollTo(hash)` inside `setTimeout(..., 300)`. The stop-gap: guarantee the scroll-into-view fires on mount when hash is present. Full fix (split billing into its own page) is deferred to a later round.

### Target file
`/Users/veritypost/Desktop/verity-post/site/src/app/profile/settings/page.tsx`

### Current code (lines 502-509)
```tsx
  // On first mount if URL has a hash, scroll to it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const t = window.setTimeout(() => scrollTo(hash), 300);
    return () => window.clearTimeout(t);
  }, [scrollTo]);
```

### Proposed new code
```tsx
  // On first mount if URL has a hash, scroll to it. H-17 stop-gap: the
  // 300ms delay covers the initial gated-section render, but if the
  // target element mounts late (permission-gated subsection), the scroll
  // silently no-ops. Retry up to 5 times over 1500ms, then fall back to a
  // direct getElementById().scrollIntoView. Full fix is to split /billing
  // into its own route — deferred.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    let attempts = 0;
    const tick = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        scrollTo(hash);
        return;
      }
      if (attempts++ < 5) window.setTimeout(tick, 300);
    };
    const t = window.setTimeout(tick, 150);
    return () => window.clearTimeout(t);
  }, [scrollTo]);
```

### Why
Current code calls `scrollTo` once at 300ms — if the `id="billing"` element hasn't rendered yet (perm-gated subsection still loading its permission check), the scroll no-ops silently. Retry-on-miss is defensive and cheap. Full page split still the right fix; flagged as a follow-up.

---

## M-20 — `AskAGrownUp` component default href

Fix the default href pattern on `AskAGrownUp` so every caller that doesn't explicitly override `action` still lands on a working URL. Also fix the two current explicit callers that hardcode `/billing`.

### Target files
- `/Users/veritypost/Desktop/verity-post/site/src/components/kids/AskAGrownUp.tsx`
- `/Users/veritypost/Desktop/verity-post/site/src/app/kids/page.tsx` (explicit override that points at `/billing`)

### Current code — `AskAGrownUp.tsx`

The component has no default `action` — it's optional, and if absent, no CTA renders (line 78: `{action && (...)}`). The bug in M-20 is that **callers** hardcode `/billing`. The component itself does not inject a default. Two callers affected — both in the attack plan:
1. `/Users/veritypost/Desktop/verity-post/site/src/app/kids/page.tsx:97` — `action={{ href: '/billing', label: 'View family plans' }}`
2. (No other `action={{...href: '/billing'...}}` call sites found — see the grep table below. The master-list reference to "two call sites" maps to `/kids/page.tsx` and any implied follow-on from the `AccountStateBanner` narrative, but AccountStateBanner does not use AskAGrownUp.)

The safest fix is to:
(a) add a `DEFAULT_ACTION` on the component keyed by reason (so `reason="upgrade"` without an explicit `action` still renders a CTA that points to `/profile/settings#billing`), and
(b) correct the one explicit call site in `/kids/page.tsx` to use the canonical path directly.

### Proposed new code — `AskAGrownUp.tsx`

Add a DEFAULT_ACTION table (mirrors DEFAULT_COPY) and resolve it if `action` is not provided:
```tsx
const DEFAULT_ACTION: Partial<Record<AskAGrownUpReason, AskAGrownUpAction>> = {
  upgrade: { href: '/profile/settings#billing', label: 'View plans' },
  'sign-in': { href: '/login', label: 'Sign in' },
};

const AskAGrownUp: FC<AskAGrownUpProps> = ({
  reason = 'locked',
  title,
  body,
  action,
  icon = 'lock',
}) => {
  const copy = DEFAULT_COPY[reason] || DEFAULT_COPY.locked;
  const resolvedTitle = title ?? copy.title;
  const resolvedBody = body ?? copy.body;
  const resolvedAction = action ?? DEFAULT_ACTION[reason];
  // ...
  {resolvedAction && (
    <a href={resolvedAction.href} ...>{resolvedAction.label}</a>
  )}
```

Replace the existing `{action && (<a href={action.href} ...>{action.label}</a>)}` with the `resolvedAction` variant.

### Proposed new code — `/Users/veritypost/Desktop/verity-post/site/src/app/kids/page.tsx` line 97

Current:
```tsx
action={{ href: '/billing', label: 'View family plans' }}
```

New:
```tsx
action={{ href: '/profile/settings#billing', label: 'View family plans' }}
```

### Why
Two-layer defence: if any future caller of `AskAGrownUp reason="upgrade"` forgets to pass `action`, the component still renders a working CTA. Meanwhile the one hardcoded `/billing` callsite is directly fixed. Once C-02's `/billing` shim lands, hardcoded `/billing` links stop being 404s, but hardcoding a path that then redirects wastes a hop — direct-link to the canonical.

---

## All other `/billing` references (grep audit)

Grep target: `/Users/veritypost/Desktop/verity-post/site/src` for the literal string `/billing`. Below each is classified as:
- **A** — already points to canonical `/profile/settings/billing` (works today). After H-10 lands, becomes a single server redirect. Safe.
- **B** — points to `/billing` (the former 404). After C-02, becomes a single server redirect. Listed with recommended direct-link rewrite.
- **C** — API path containing the substring `billing` (not a frontend route). Unaffected.
- **D** — backend/admin or webhook path (not user-clickable). Unaffected or already correct.

| File | Line | String | Class | Action |
|---|---|---|---|---|
| `site/src/lib/stripe.js` | 80 | `'/billing_portal/sessions'` | C | Stripe API path. Unchanged. |
| `site/src/app/recap/page.tsx` | 80 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` to avoid the H-10 hop (optional polish — works either way once H-10 lands). |
| `site/src/app/messages/page.tsx` | 162 | `router.replace('/profile/settings/billing')` | A | Deleted as part of H-09. |
| `site/src/app/messages/page.tsx` | 571 | `<a href="/profile/settings/billing">` | A | Deleted as part of H-09. |
| `site/src/app/profile/kids/page.tsx` | 221, 346, 372 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/components/ArticleQuiz.tsx` | 318 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` — covered in H-15. |
| `site/src/app/profile/kids/[id]/page.tsx` | 255 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/story/[slug]/page.tsx` | 737 | `"/profile/settings/billing"` (bookmark-cap hint) | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/story/[slug]/page.tsx` | 769 | `"/profile/settings/billing"` (upgrade to read) | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/profile/settings/page.tsx` | 15 (comment), 2978 | `/api/billing/cancel` | C | API path. Unchanged. |
| `site/src/app/bookmarks/page.tsx` | 217 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/profile/family/page.tsx` | 100 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/components/RecapCard.tsx` | 48 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/search/page.tsx` | 158 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/profile/card/page.js` | 57 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/api/stripe/checkout/route.js` | 38, 39 | `${origin}/profile/settings/billing?success=1` / `?canceled=1` | A | Leave as-is — query params survive the server redirect. (Round D's H-06 addresses the `success_url` / `cancel_url` trust issue separately.) |
| `site/src/app/kids/page.tsx` | 97 | `'/billing'` | B | **Rewrite to `/profile/settings#billing`** (covered in M-20). |
| `site/src/app/api/stripe/portal/route.js` | 24 | `${origin}/profile/settings/billing` | A | Return URL for Stripe portal. After H-10, this lands on the server redirect instead of the client stub. Safe. |
| `site/src/components/AccountStateBanner.tsx` | 81 | `ctaHref: '/billing'` | B | Decide between two options: (i) **leave as `/billing`** — C-02 redirects correctly, zero caller edits. (ii) **rewrite to `/profile/settings#billing`** to eliminate the hop. Recommend option (i) as the launch fix — C-02 already exists as the shim, and the banner is a minority CTA. Flag as a polish follow-up. |
| `site/src/components/AccountStateBanner.tsx` | 93 | `ctaHref: '/billing'` | B | Same as above. |
| `site/src/app/api/stripe/webhook/route.js` | 298 | regex `/billing_uncancel_subscription/i` | D | String match against an RPC error message. Unrelated. |
| `site/src/app/api/stripe/webhook/route.js` | 408, 442 | `p_action_url: '/profile/settings/billing'` | A | Notification action URL. After H-10 server redirect, the tap still lands on the billing anchor. |
| `site/src/components/CommentRow.tsx` | 229 | `"/profile/settings/billing"` | A | Rewrite to `/profile/settings#billing` (optional polish). |
| `site/src/app/admin/subscriptions/page.tsx` | 230, 249, 266 | `'/api/admin/billing/*'` | C | Admin API paths. Unchanged. |

### Recommendation for the full fix vs. minimal fix

**Minimal (ship)** — land just the 6 Round C deliverables above. The C-02 shim + H-10 server redirect make every `/billing` and every `/profile/settings/billing` call site resolve correctly in at most one redirect. No other callers have to change.

**Polish follow-up (post-round)** — rewrite the 12 Class-A `/profile/settings/billing` string literals to `/profile/settings#billing` to eliminate the extra hop. Pure search-and-replace across ~12 files. Not launch-blocking; can be a single commit.

---

## Verification steps

### curl — server redirects

Run dev server (`npm run dev` in `/site`), then:

```bash
# C-02: /billing shim — expect 307 (Next.js default for redirect())
curl -I -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
  http://localhost:3000/billing
# Expected: 307 -> /profile/settings#billing  (or 308 on production cache)

# H-10: /profile/settings/billing server redirect (no more client mount)
curl -I -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
  http://localhost:3000/profile/settings/billing
# Expected: 307 -> /profile/settings#billing  (and the response body should
# NOT contain the '<script>' shell of the old client stub)

# H-10 + Stripe success/cancel param preservation
curl -I -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' \
  'http://localhost:3000/profile/settings/billing?success=1'
# Expected: 307 -> /profile/settings?success=1#billing  (query preserved
# by Next.js redirect() — verify; if not preserved, add it explicitly in
# the page.tsx body)
```

Note on the 307 check: Next.js App Router's `redirect()` emits a 307 in development and may emit a 308 behind Vercel's edge cache. Both are fine. Beware 308 is cacheable — if the shim is ever removed, a cached 308 sticks. Document the intent in the file comment (already done in the proposed new code).

### Manual — click-through flows

1. **C-02 direct URL.** Sign in as any user → navigate to `/billing` → observe instant redirect to the Billing section of Settings (no flash, no 404).
2. **H-09 regwall.** Sign up a fresh free account (no paid plan) → tap Messages in the nav → observe the overlay dialog, NOT a redirect to billing. Confirm two CTAs present: Upgrade, Back to home. Confirm no `router.replace` fires (check devtools Network for no auto-nav).
3. **H-09 paid path.** Upgrade the test account → tap Messages → overlay is absent; chat shell renders normally.
4. **H-10 flash test.** Sign in → paste `/profile/settings/billing` into the URL bar → observe the redirect land directly on the Billing section. Expected: no blank/flash frame between login gate and destination. (Repeat with slow 3G in devtools throttle to surface a flash if one remains.)
5. **H-10 Stripe return.** Trigger `/api/stripe/checkout` in sandbox mode → complete checkout → confirm the Stripe return URL (`/profile/settings/billing?success=1`) redirects to `/profile/settings#billing` with the `success=1` param preserved, and that the success banner inside the settings page still fires.
6. **H-15 quiz dead-end.** Sign in as a free user → find an article with an active quiz → fail twice deliberately → observe BOTH "View plans" and "Try another article" buttons. Click "Try another article" → lands on `/`.
7. **H-17 anchor.** From the feed, click any `/profile/settings#billing` link → confirm the page scrolls to the Billing section. Test in a cold-cache tab (devtools disable cache) where the gated section mounts asynchronously — the scroll should still land correctly thanks to the retry loop.
8. **M-20 kids.** Sign in as a non-Family user with kid-mode intent → navigate to `/kids` → tap "View family plans" on the AskAGrownUp card → lands on `/profile/settings#billing` (no `/billing` hop).
9. **M-20 component default.** (Requires inspection but no live site verification.) Grep `AskAGrownUp reason="upgrade"` call sites and confirm none pass a non-billing `action` that would now be overridden. Only the `/kids/page.tsx` site passes an explicit action today, and it's being rewritten.

### Route-map smoke

After all 6 changes, every `/billing*` route should:
- `/billing` → 307 → `/profile/settings#billing`
- `/profile/settings/billing` → 307 → `/profile/settings#billing`
- `/profile/settings/billing?success=1` → 307 → `/profile/settings#billing` (with `?success=1` preserved)
- `/profile/settings#billing` (canonical) → 200

No 404 on any `/billing` spelling. No client-side `router.replace` to billing anywhere outside of H-09's (removed) bounce.

---

## Risk + rollback

- **Next.js redirect cache.** If Vercel edge caches a 308 for `/billing`, a future change of the shim target won't flush without a redeploy. Mitigation: ship with 307 (Next.js App Router default for `redirect()` is 307; verify).
- **Overlay z-index.** H-09 overlay uses `zIndex: 9999`. The search modal on the same page uses `zIndex: 10000`. Intentional — the search modal is opened by the user from the paywalled shell and should layer above the paywall. Safe.
- **Scroll retry loop.** H-17's 5-attempt retry at 300ms intervals is bounded; max spend is ~1.5s of silent work on pages without the hash target. Negligible.
- **Rollback.** All changes are file-level and independent: H-09 and H-10 can be reverted per-file without any DB impact. C-02's shim file can be deleted to return to 404 behavior (not recommended but possible).
