# Apple-Review Nav Changes — Revert Guide

**Date of change:** 2026-04-21
**Branch:** main
**Author:** Claude (Opus 4.7) on session with owner
**Status:** ACTIVE — test changes in place until Apple Developer verification completes
**Revert target:** flip the three launch-gate flags back on, unhide the RecapCard

---

## Why these changes exist

The owner is in the process of getting Apple Developer Program verification
("prove I'm real") and wants the site to look like a functional real brand
without exposing the full public nav menu or pushing paid sign-ups yet.

To accomplish this, four interrelated changes were made:

1. Hide the bottom nav menu (Home / Notifications / Leaderboard / Profile)
   everywhere, globally, via a single flag.
2. Keep the top `verity post` wordmark visible on home + content pages so
   Apple sees a real brand when they visit.
3. Keep the footer (Help / Contact / Privacy / Terms / Cookies / Accessibility
   / DMCA) visible for the same reason — legal + support links matter to
   reviewers.
4. Hide the `RecapCard` on home, which would otherwise push anon users to a
   paid plan signup ("See what you missed this week") — owner isn't ready
   to convert traffic.

Plus two already-normal preferences carried over:
- Article pages (`/story/*`) get no global chrome (clean reading experience).
- Lowercased wordmark ("verity post") to match owner's brand preference.

---

## Files changed

Six files were modified in this session:

1. `web/src/app/NavWrapper.tsx`
2. `web/src/app/page.tsx`
3. `web/src/app/recap/page.tsx`              (launch-hide added)
4. `web/src/app/recap/[id]/page.tsx`         (launch-hide added)
5. `web/src/app/notifications/page.tsx`      (copy edit)
6. `web/src/app/story/[slug]/page.tsx`       (launch-hide signup interstitial)

Nothing else. No DB changes, no config changes, no new dependencies.

---

## Change 1 — Three global launch-gate flags added

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** top-of-file constants that globally veto each piece of nav chrome.

### Current state (deployed)

Near the top of the file, above `const AUTH_HIDE = ...`:

```ts
// ============================================================
// LAUNCH GATES — one-line kill switches for the global chrome.
// Flip any of these to hide that surface site-wide while the site
// is pre-launch / under review (e.g. Apple Developer Program
// verification). Per-route hiding still applies on top; these just
// add a global veto.
//
// Quick presets:
//   Fully cloaked (brand-only landing):  TOP=true, NAV=false, FOOT=true
//   Fully public:                        TOP=true, NAV=true,  FOOT=true
//   Dark mode (hide everything):         TOP=false, NAV=false, FOOT=false
// ============================================================
const SHOW_TOP_BAR = true;      // "verity post" wordmark + search icon
const SHOW_BOTTOM_NAV = false;  // Home / Notifications / Leaderboard / Profile
const SHOW_FOOTER = true;       // Help / Contact / Privacy / Terms / etc.
```

### How to revert

When Apple verification clears and you want the full public nav back,
flip a single value:

```ts
const SHOW_BOTTOM_NAV = true;   // was false
```

That is the only line you need to change. Nothing else in this block or
anywhere else in the codebase needs to be touched for the bottom nav to
re-appear.

If you want to completely remove the flag system and return to the pre-2026-04-21
behaviour of "nav is always shown where the route allows," delete the entire
LAUNCH GATES block and also revert the per-surface gate changes described
in Change 3 below.

---

## Change 2 — Route list renamed and article reader added

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** splits the old single `HIDE_NAV` list into clearer concerns.

### Before

```ts
const HIDE_NAV = ['/', '/login', '/signup', '/signup/pick-username', '/signup/expert', '/forgot-password', '/reset-password', '/verify-email', '/api/auth/callback', '/logout', '/welcome'];
const isAdmin = (p: string) => p.startsWith('/admin');
const isIdeasPreview = (p: string) => p.startsWith('/ideas');
```

### After (current)

```ts
// Auth / onboarding routes that run fullscreen without any global chrome.
// Separate from '/' — home now shows the top bar + footer (no bottom nav),
// so it's handled with its own gate below instead of living in this list.
const AUTH_HIDE = ['/login', '/signup', '/signup/pick-username', '/signup/expert', '/forgot-password', '/reset-password', '/verify-email', '/api/auth/callback', '/logout', '/welcome'];
const isAdmin = (p: string) => p.startsWith('/admin');
const isIdeasPreview = (p: string) => p.startsWith('/ideas');
// Article reader owns the viewport — no global nav, no footer. Reading
// experience is kept clean on both /story/<slug> and any deeper /story
// route (e.g. /story/<slug>/something future).
const isStory = (p: string) => p.startsWith('/story');
```

### Two differences

1. `HIDE_NAV` renamed to `AUTH_HIDE` and the `/` entry removed.
2. New predicate `isStory(p)` added to hide chrome on `/story/*` routes.

### How to revert

If the owner later wants nav to come back on article pages, delete the
`isStory` predicate and remove `isStory(path)` from the `chromeHidden`
expression in Change 3.

If the owner wants home to revert to "no chrome at all" (old behaviour),
add `'/'` back into `AUTH_HIDE` and optionally rename it back to
`HIDE_NAV` for continuity.

---

## Change 3 — Nav visibility rules reworked into three gates

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** separates top bar, bottom nav, and footer into independent
gates so each can be controlled on its own.

### Before (single gate)

```tsx
const showNav = mounted && !HIDE_NAV.includes(path) && !isAdmin(path) && !isIdeasPreview(path);
const onAdminPage = mounted && isAdmin(path);
```

Then later in the file:

```tsx
const showTopBar = showNav;  // top bar followed bottom nav exactly
```

### After (three gates, current)

```tsx
// Chrome visibility gates. Three surfaces, three rules:
//   showTopBar  — "verity post" wordmark + search icon. Shown on home
//                 AND on all standard content pages. Hidden on auth,
//                 admin, ideas preview, and story reader.
//   showNav     — bottom 4-item nav bar. Hidden on home (no sign-up
//                 push pre-launch), plus all the same surfaces the
//                 top bar is hidden on.
//   showFooter  — Help/Contact/Privacy strip. Follows showTopBar so
//                 the legal + support links are reachable wherever
//                 the brand is visible, including home.
const isAuthRoute = AUTH_HIDE.includes(path);
const chromeHidden = isAuthRoute || isAdmin(path) || isIdeasPreview(path) || isStory(path);
// Each surface ANDs its launch-gate flag with the route rule. Route-level
// hiding always wins (auth/admin/ideas/story stay clean regardless of flags).
const showTopBar = mounted && SHOW_TOP_BAR && !chromeHidden;
const showNav = mounted && SHOW_BOTTOM_NAV && !chromeHidden && path !== '/';
const showFooter = mounted && SHOW_FOOTER && !chromeHidden;
const onAdminPage = mounted && isAdmin(path);
```

The stale line `const showTopBar = showNav;` that appeared further down
near the `TOP_BAR_HEIGHT` declaration was also removed (it would have
duplicated the variable).

### How to revert

To fully return to the original single-gate pre-launch behaviour, replace
the whole `chromeHidden` / `showTopBar` / `showNav` / `showFooter` block
with the original one-liner and restore the `showTopBar = showNav` line
lower in the file:

```tsx
const showNav = mounted && !HIDE_NAV.includes(path) && !isAdmin(path) && !isIdeasPreview(path);
const onAdminPage = mounted && isAdmin(path);
```

Then later:

```tsx
const showTopBar = showNav;
```

Remember to rename `AUTH_HIDE` back to `HIDE_NAV` (or add `'/'` back to
the list and rename) if you fully revert.

**Lighter revert (recommended):** to just restore the public site without
undoing the nicer gate structure, use the flag flip in Change 1.

---

## Change 4 — Wordmark lowercased in two places

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** changed the brand text from "Verity Post" (title case) to
"verity post" (all lowercase) in the top bar and the footer.

### Before (both locations)

```tsx
Verity Post
```

### After (current, both locations)

```tsx
verity post
```

Two occurrences:

1. Inside the `<header>` with the `topBarStyle` — the top-left wordmark
   that links to `/`.
2. Inside the `<footer>` — the centered brand line under the legal link row.

### How to revert

Find both occurrences of `verity post` inside `NavWrapper.tsx` and
replace with `Verity Post`. There are exactly two.

Quick one-liner from repo root:

```bash
sed -i '' 's/verity post/Verity Post/g' web/src/app/NavWrapper.tsx
```

Note: if the top bar font was intentionally lowercased as a brand choice
rather than a pre-launch decision, the owner may want to keep this even
after Apple approves. Confirm with owner before reverting.

---

## Change 5 — Footer moved out of the bottom-nav gate

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** lets the footer render independently of the bottom nav.

### Before

Footer was wrapped in `{showNav && (...)}`, so it only appeared where the
bottom nav appeared.

### After (current)

Footer is wrapped in `{showFooter && (...)}`. The footer can now show on
home even though the bottom nav doesn't.

### How to revert

Change the opening line back from:

```tsx
{showFooter && (
  <footer style={{...
```

to:

```tsx
{showNav && (
  <footer style={{...
```

---

## Change 6 — RecapCard hidden on home

**File:** `web/src/app/page.tsx`
**What it does:** stops the "See what you missed this week" paid-plan push
from rendering on the home feed. Paid-plan signups aren't wanted yet.

### Before

```tsx
{!loading && feedVisible.length > 0 && <RecapCard />}
```

### After (current)

```tsx
{/* LAUNCH: RecapCard hidden pre-launch — the anon variant pushes
    paid sign-ups ("See what you missed this week"), and we're not
    ready to convert traffic yet. Flip back to
    `{!loading && feedVisible.length > 0 && <RecapCard />}`
    when sign-ups are open. Component, queries, and types stay
    live — see web/src/components/RecapCard.tsx. */}
{false && !loading && feedVisible.length > 0 && <RecapCard />}
```

### How to revert

Delete the `{false && ` prefix (and the closing `}` that matches it
— actually just remove the leading `{false && ` and keep one closing
brace). End state should match the "Before" block above.

Quick one-liner from repo root:

```bash
# Revert RecapCard render on home page
sed -i '' '/LAUNCH: RecapCard hidden pre-launch/,/^[[:space:]]*{false && !loading/c\
          {!loading && feedVisible.length > 0 && <RecapCard />}
' web/src/app/page.tsx
```

Or just open `web/src/app/page.tsx`, search for `LAUNCH: RecapCard`,
and delete the comment + replace `{false && ...}` with `{...}`.

The `RecapCard` component itself in `web/src/components/RecapCard.tsx`
was NOT changed. No code, queries, or permissions need to be touched
to bring it back.

---

## Change 7 — Weekly recap pages hidden

**Files:**
- `web/src/app/recap/page.tsx` (list page)
- `web/src/app/recap/[id]/page.tsx` (player page)

**What it does:** both pages early-return `null` when a top-of-file
`LAUNCH_HIDE_RECAP` flag is true. Component body, state, queries, and
types are untouched beyond that single guard.

### Current state (deployed)

At the top of each page file, above `export default function ...`:

```ts
// LAUNCH: weekly recap hidden pre-launch. Flip to false when sign-ups
// and paid plans open. Component + queries + types stay alive — see
// companion revert guide in Sessions/04-21-2026.
const LAUNCH_HIDE_RECAP = true;
```

And the first line inside each component is:

```tsx
if (LAUNCH_HIDE_RECAP) return null;
```

### How to revert

Flip the const to `false` in both files:

```ts
const LAUNCH_HIDE_RECAP = false;
```

That is it. The `if (LAUNCH_HIDE_RECAP) return null;` line can stay
(it becomes a no-op) or be deleted entirely. Both files hook order
is preserved because the const never changes at runtime, so React's
rules-of-hooks stay satisfied regardless.

### Defensive note

The recap API routes under `web/src/app/api/recap/**` were NOT
changed. Permissions (`recap.list.view`) were NOT changed. This is
purely a user-facing page hide so direct URL hits during review
don't surface the paid recap experience.

---

## Change 8 — Notifications signup push edited

**File:** `web/src/app/notifications/page.tsx`
**What it does:** the anonymous-user sign-up prompt no longer mentions
weekly recaps.

### Before

```tsx
Sign up to get notified when your favorite authors post, when your
comments get replies, and when weekly recaps are ready.
```

### After (current)

```tsx
Sign up to get notified when your favorite authors post and when your
comments get replies.
```

### How to revert

Restore the original sentence verbatim, re-adding the `when weekly
recaps are ready` clause after the comments clause.

---

## Change 9 — "Keep reading, free" signup interstitial hidden

**File:** `web/src/app/story/[slug]/page.tsx`
**What it does:** the modal that would pop up on an anonymous user's
second article view (eyebrow "Keep reading, free", CTA "Sign up to pass
quizzes and post comments") is fully suppressed pre-launch.

### Current state (deployed)

Near the top of the file, above `const REPORT_CATEGORIES`:

```ts
// LAUNCH: anonymous "Keep reading, free" signup interstitial hidden
// pre-launch. Flip to false when sign-ups open. Trigger logic and
// component stay alive — see companion revert guide in
// Sessions/04-21-2026.
const LAUNCH_HIDE_ANON_INTERSTITIAL = true;
```

Two sites were gated. The trigger line inside the anonymous-user branch:

```ts
if (views >= 2 && !LAUNCH_HIDE_ANON_INTERSTITIAL) setShowAnonInterstitial(true);
```

And the render site:

```tsx
<Interstitial open={showAnonInterstitial && !LAUNCH_HIDE_ANON_INTERSTITIAL} onClose={() => setShowAnonInterstitial(false)} variant="signup" />
```

### How to revert

Flip the flag:

```ts
const LAUNCH_HIDE_ANON_INTERSTITIAL = false;
```

Both `&& !LAUNCH_HIDE_ANON_INTERSTITIAL` clauses become no-ops — the
interstitial fires exactly as it did pre-change. The clauses can stay
for future pre-launch toggles or be removed on a full revert.

### Unchanged

The `Interstitial` component itself (`web/src/components/Interstitial.tsx`),
the `bumpArticleViewCount` session helper, and the registration wall
that kicks in at `free_article_limit` views are all untouched.

---

## Verification after revert

After reverting any combination of the above, run these checks before
pushing:

1. **Typecheck:**
   ```bash
   cd web && npx tsc --noEmit
   ```
   Should exit 0 with no output.

2. **Start dev server:**
   ```bash
   cd web && npm run dev
   ```

3. **Click through the matrix:**

   | Route | Expected state after full revert to public |
   |---|---|
   | `/` | Top bar + bottom nav + footer visible. RecapCard shows if user has `recap.list.view` permission. |
   | `/story/<slug>` | No top bar, no bottom nav, no footer. |
   | `/login` | No chrome. |
   | `/admin/anything` | No global nav. Admin chrome owns the viewport. Admin banner still shows. |
   | `/ideas/feed/ranked` | No global chrome (preview route). |
   | `/browse`, `/leaderboard`, `/profile`, `/bookmarks` | Top bar + bottom nav + footer visible. |

4. **Check the admin banner** — unchanged throughout these changes; it
   renders everywhere for users with `admin.dashboard.view`.

---

## Current matrix (what's actually deployed right now)

For reference while the changes are active:

| Route | Top bar | Bottom nav | Footer | RecapCard on home |
|---|---|---|---|---|
| `/` (home) | SHOW (`verity post`) | HIDE (pre-launch) | SHOW | HIDE (pre-launch) |
| `/story/*` | HIDE | HIDE | HIDE | n/a |
| `/login`, `/signup`, etc. | HIDE | HIDE | HIDE | n/a |
| `/admin/*` | HIDE | HIDE | HIDE | n/a |
| `/ideas/*` | HIDE | HIDE | HIDE | n/a |
| `/browse`, `/leaderboard`, `/profile`, etc. | SHOW | HIDE (pre-launch) | SHOW | n/a |

The only reason the bottom nav is hidden anywhere other than home/story
is the global `SHOW_BOTTOM_NAV = false` flag. Flip it to `true` and the
bottom nav comes back on every content route. Home intentionally stays
nav-free even after the flag flips (that was the pre-flag design decision).

---

## Minimum revert (recommended path)

When Apple clears the Developer Program verification, the simplest
possible revert is:

1. Open `web/src/app/NavWrapper.tsx`.
2. Change `const SHOW_BOTTOM_NAV = false;` to `const SHOW_BOTTOM_NAV = true;`.
3. Open `web/src/app/page.tsx`.
4. Find the `LAUNCH: RecapCard hidden pre-launch` comment block.
5. Replace `{false && !loading && feedVisible.length > 0 && <RecapCard />}`
   with `{!loading && feedVisible.length > 0 && <RecapCard />}`.
6. `cd web && npx tsc --noEmit` — confirm clean.
7. Commit with a message like:
   `revert: re-enable bottom nav + RecapCard after Apple verification`.

That's the full public-launch flip. Two files, three lines, one commit.

---

## Files for this revert guide

- This document: `Sessions/04-21-2026/Session 1/APPLE_REVIEW_NAV_CHANGES_REVERT_GUIDE.md`
- Related article doc on Desktop: `~/Desktop/VerityPost_10_Sourced_Articles_2026-04-21.docx`
- Related SQL for article inserts: `~/Desktop/VerityPost_10_Articles_INSERT_2026-04-21.sql`

All three were produced in the same session. The article work is unrelated
to the nav changes — if you revert the nav, nothing about the articles
or the SQL changes.
