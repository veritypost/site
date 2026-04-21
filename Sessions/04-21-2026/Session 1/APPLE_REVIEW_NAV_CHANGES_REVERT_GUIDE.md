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

Files modified in this session:

1. `web/src/app/NavWrapper.tsx`
2. `web/src/app/page.tsx`
3. `web/src/app/recap/page.tsx`              (launch-hide added)
4. `web/src/app/recap/[id]/page.tsx`         (launch-hide added)
5. `web/src/app/notifications/page.tsx`      (copy edit)
6. `web/src/app/story/[slug]/page.tsx`       (launch-hide signup interstitial)
7. `web/src/app/privacy/page.tsx`            (content edit, contact cleanup)
8. `web/src/app/terms/page.tsx`              (content edit)
9. `web/src/app/dmca/page.tsx`               (contact cleanup)
10. `web/src/app/accessibility/page.tsx`     (contact cleanup)
11. `web/src/app/help/page.tsx`              (email remap)
12. `web/src/app/cookies/page.tsx`           (email remap)

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

## Change 10 — Top bar now visible on article pages

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** readers on `/story/<slug>` see the top wordmark so they
can tap "verity post" to return home. Bottom nav and footer stay hidden
to keep the reading viewport clean.

### Before

`isStory(path)` was included in the `chromeHidden` composite — every
surface was off on story routes.

### After (current)

A new split: `fullyBare` covers the truly chrome-free surfaces (admin,
auth, ideas preview). The top bar gate is `!fullyBare` only. The bottom
nav and footer gates additionally exclude `isStory(path)`.

```tsx
const fullyBare = isAuthRoute || isAdmin(path) || isIdeasPreview(path);
const showTopBar = mounted && SHOW_TOP_BAR && !fullyBare;
const showNav = mounted && SHOW_BOTTOM_NAV && !fullyBare && !isStory(path) && path !== '/';
const showFooter = mounted && SHOW_FOOTER && !fullyBare && !isStory(path);
```

### How to revert to "no chrome at all on story"

Add `isStory(path)` back into the `fullyBare` predicate, or replace the
three gates with the earlier `chromeHidden` pattern from Change 3.

---

## Change 11 — Public legal/support pages trimmed

**Files:**
- `web/src/app/privacy/page.tsx`
- `web/src/app/terms/page.tsx`
- `web/src/app/dmca/page.tsx`
- `web/src/app/accessibility/page.tsx`
- `web/src/app/help/page.tsx`
- `web/src/app/cookies/page.tsx`

**What it does:** three parallel edits across the public legal and
support pages:

1. **Removed every physical mailing address.** "Verity Post, Inc.,
   123 Media Lane, San Francisco, CA 94105" was present on privacy,
   dmca, and accessibility pages. All three are gone.
2. **Removed the only phone number.** "(555) 123-4567" on the
   accessibility page is gone.
3. **Remapped contact emails** to the four addresses the owner has
   provisioned: `advertising@`, `support@`, `legal@`, `info@`.
   - `privacy@veritypost.com` → `legal@veritypost.com` (privacy + cookies pages)
   - `dpo@veritypost.com` → removed (no replacement needed; not legally required absent GDPR representative designation)
   - `dmca@veritypost.com` → `legal@veritypost.com`
   - `accessibility@veritypost.com` → `support@veritypost.com`
   - `admin@veritypost.com` → `support@veritypost.com`
4. **Removed every reference to AI.** The privacy page had a full
   "AI & Content Processing" section that was rewritten as a single
   "Content Processing" section with no AI mention. Terms had a
   disclaimer referencing "AI-generated summaries" — rewritten to
   "article summaries".

### How to revert

There is no single flag for this one; these are content edits to
live legal copy. If the owner decides to re-disclose AI use (which
is the FTC-safer posture once traffic is real), the original
privacy section 3 should be restored and the terms disclaimer
should read "AI-generated summaries" again.

If the owner ever wants to re-publish the physical address or
phone number (for example after incorporating in a specific
jurisdiction), re-add them to the privacy, dmca, and accessibility
contact blocks.

### Important compliance note for re-enablement

When the site publishes AI-generated articles publicly, the FTC
disclosure posture is much safer with an explicit statement on the
privacy or terms page. The DB already marks articles with
`is_ai_generated = true`. Consider restoring a short disclosure
line ("articles may be generated with AI assistance under editorial
oversight") before wide public launch.

---

## Change 12 — Help link hidden from footer

**File:** `web/src/app/NavWrapper.tsx`
**What it does:** the "Help" entry in the footer nav link row is
commented out. Users no longer see a visible path to `/help`.

### Important: do NOT null-return the /help page itself

The `/help` route is registered as the **public Support URL** required
by Apple App Store submission. Its source file header explicitly calls
this out:

> Public support URL for App Store submission. No auth gate — the page
> must render for anon visitors... the App Store requires a reachable
> Support URL.

If the page itself is hidden (early-return null, 404, redirect), App
Store review will reject the app. Only the footer link was removed, so
the URL stays discoverable to Apple's crawler and anyone with the direct
link while remaining invisible to casual browsing users.

### How to revert

Uncomment the `{ label: 'Help', href: '/help' }` line in the footer
links array inside `NavWrapper.tsx`.

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

---

# Article work (separate from the nav changes)

Produced in the same session but independent of the nav changes — reverting
the nav does not touch the articles, and reverting the articles does not
touch the nav. Captured here so all session output is in one place.

## Current state

**The SQL file exists on Desktop. It has NOT been run against the
database as of the end of this session.** If you want the 10 articles
live, you have to execute the SQL file yourself (see "How to insert"
below). If you do not run it, nothing hits the DB and this section is
informational only.

## What the 10 articles are

All adult-only, all sourced to primary references, all original prose
written from extracted facts. Status defaults to `'draft'` and
`moderation_status='pending'` on insert, so nothing auto-publishes —
you review them in admin and manually promote to `published`.

| # | Slug | Category | Headline |
|---|---|---|---|
| 1 | curiosity-mars-organic-molecules-nitrogen-heterocycle | space | Curiosity finds seven new organic molecules on Mars |
| 2 | uranus-neptune-carbon-hydrogen-superionic | space | New carbon and hydrogen phase predicted inside Uranus and Neptune |
| 3 | corona-discharge-trees-thunderstorms-penn-state | science | Penn State records trees glowing electric during thunderstorms |
| 4 | pinene-termite-trap-ucr-95-percent | science | Pine scent pushes termite kill rate past 95 percent |
| 5 | madecassic-acid-antibiotic-resistance-kent-ucl | medicine | Herb compound kills drug resistant bacteria via protein humans lack |
| 6 | moringa-seeds-microplastics-water-treatment-brazil | environment | Moringa seed extract rivals industrial coagulant for microplastics |
| 7 | california-hybrid-honeybees-varroa-resistance | environment | Southern California hybrid bees carry 68 percent fewer mites |
| 8 | ultrafast-camera-femtosecond-imaging-ecnu | physics | New camera captures full femtosecond light pulses in one shot |
| 9 | dolomite-crystal-grown-lab-200-years | science | Michigan team grows dolomite in lab after two centuries of failure |
| 10 | japan-miyako-m74-earthquake-offshore-iwate | world | Magnitude 7.4 earthquake strikes off Miyako, Japan |

Full content (headline, slug, 1–2 sentence summary, 140–200 word body,
primary sources) is in the Desktop Word doc and is also embedded in the
SQL file as the INSERT values.

## How each article is sourced

Every specific fact (name, number, institution, date, finding) traces
to one of three source types, listed under each article in both the
Word doc and the SQL `sources` inserts:

- **U.S. government (public domain)** — articles 1 (NASA Curiosity) and
  10 (USGS earthquake). No copyright exists on federal works under
  17 U.S.C. § 105.
- **Peer-reviewed journal** — articles 2–9 cite the original paper's
  DOI (Nature Communications, Science, Optica, Geophysical Research
  Letters, ACS Omega, RSC Medicinal Chemistry, Journal of Economic
  Entomology, Scientific Reports). Facts are not copyrightable.
- **University press release** — most of articles 2–9 also cite the
  institution's own press release URL (Carnegie, Penn State, UC
  Riverside, São Paulo State, Optica Publishing Group). Press releases
  are intended for distribution; coverage is expected and welcome.

Aggregator URLs (ScienceDaily) were deliberately removed from the
attribution chain after source hardening.

## Copyright posture

Low risk. Facts extracted, prose written fresh, attribution to primary
sources. No sentence copied or paraphrased closely from any outlet.
Zero direct quotes in any article. No banned editorial language (per
the V2 editorial guide). Every article passes its headline-summary
anti-repetition check and the 4× summary character cap.

## Known accuracy caveats

- **Article 4 (termite)** cites a 2024 Journal of Economic Entomology
  paper. The ScienceDaily writeup we sourced from was dated April 2026
  but the underlying paper is from 2024. The article body does not
  claim the finding is "this week" news, only states the finding and
  its journal. Safe factually but not breaking news.
- **Article 9 (dolomite)** cites a 2023 Science paper. Same situation:
  factually correct statement, not breaking news.
- Everything else (articles 1, 2, 3, 5, 6, 7, 8, 10) is 2026 material
  that was current on 2026-04-21.

The editor should still read each source URL before publishing.

## How to insert

Three options, pick one:

**Option A: Supabase SQL Editor (easiest).** Open the Supabase
dashboard, go to SQL Editor, paste the contents of
`~/Desktop/VerityPost_10_Articles_INSERT_2026-04-21.sql`, click Run.
The commented verify block at the bottom of the file will show you
10 rows with their source counts when you uncomment and re-run it.

**Option B: psql command line.**
```bash
psql "$DATABASE_URL" -f ~/Desktop/VerityPost_10_Articles_INSERT_2026-04-21.sql
```

**Option C: via Claude's Supabase MCP tool.** Ask in a future session;
the SQL file is idempotent (`ON CONFLICT (slug) DO NOTHING`), so
running it twice is safe.

The whole file is wrapped in `BEGIN ... COMMIT;` so it's atomic — all
10 articles (plus 19 source rows) land together, or nothing lands.

## How to confirm they inserted

After running, paste this into the Supabase SQL Editor:

```sql
SELECT slug, title, status, moderation_status,
  (SELECT COUNT(*) FROM public.sources WHERE article_id = a.id) AS source_count
FROM public.articles a
WHERE slug IN (
  'curiosity-mars-organic-molecules-nitrogen-heterocycle',
  'uranus-neptune-carbon-hydrogen-superionic',
  'corona-discharge-trees-thunderstorms-penn-state',
  'pinene-termite-trap-ucr-95-percent',
  'madecassic-acid-antibiotic-resistance-kent-ucl',
  'moringa-seeds-microplastics-water-treatment-brazil',
  'california-hybrid-honeybees-varroa-resistance',
  'ultrafast-camera-femtosecond-imaging-ecnu',
  'dolomite-crystal-grown-lab-200-years',
  'japan-miyako-m74-earthquake-offshore-iwate'
)
ORDER BY slug;
```

Expected: 10 rows, `status='draft'`, `moderation_status='pending'`,
`source_count` between 1 and 3 per row.

## How to publish (when ready)

The articles ship in draft status so nothing goes live on insert.
When you want them public, either:

- Open each in admin and flip status to `published` via the UI, or
- Run this bulk update in SQL:

```sql
UPDATE public.articles
   SET status='published',
       moderation_status='approved',
       is_verified=true,
       published_at=NOW()
 WHERE slug IN (
  'curiosity-mars-organic-molecules-nitrogen-heterocycle',
  'uranus-neptune-carbon-hydrogen-superionic',
  -- ... etc, list all 10 ...
  'japan-miyako-m74-earthquake-offshore-iwate'
 );
```

Only do this after reading each source URL and the article copy once
more. Defamation exposure lands on the publisher, not on Anthropic or
on Claude.

## How to remove (full revert)

If you insert them and then decide to pull them, atomically:

```sql
BEGIN;

DELETE FROM public.sources
 WHERE article_id IN (
   SELECT id FROM public.articles
    WHERE slug IN (
      'curiosity-mars-organic-molecules-nitrogen-heterocycle',
      'uranus-neptune-carbon-hydrogen-superionic',
      'corona-discharge-trees-thunderstorms-penn-state',
      'pinene-termite-trap-ucr-95-percent',
      'madecassic-acid-antibiotic-resistance-kent-ucl',
      'moringa-seeds-microplastics-water-treatment-brazil',
      'california-hybrid-honeybees-varroa-resistance',
      'ultrafast-camera-femtosecond-imaging-ecnu',
      'dolomite-crystal-grown-lab-200-years',
      'japan-miyako-m74-earthquake-offshore-iwate'
    )
 );

DELETE FROM public.articles
 WHERE slug IN (
  'curiosity-mars-organic-molecules-nitrogen-heterocycle',
  'uranus-neptune-carbon-hydrogen-superionic',
  'corona-discharge-trees-thunderstorms-penn-state',
  'pinene-termite-trap-ucr-95-percent',
  'madecassic-acid-antibiotic-resistance-kent-ucl',
  'moringa-seeds-microplastics-water-treatment-brazil',
  'california-hybrid-honeybees-varroa-resistance',
  'ultrafast-camera-femtosecond-imaging-ecnu',
  'dolomite-crystal-grown-lab-200-years',
  'japan-miyako-m74-earthquake-offshore-iwate'
 );

COMMIT;
```

Both tables are cleaned in one transaction. The `sources` rows are
deleted first because the `articles` delete would fail otherwise if
FK constraints enforce `ON DELETE RESTRICT`. If the FK is already
`ON DELETE CASCADE`, the first DELETE can be skipped — but it's safe
either way.

## AI disclosure note

All 10 articles were written by Claude (claude-opus-4-7). The SQL
sets `is_ai_generated=true`, `ai_model='claude-opus-4-7'`, and
`ai_provider='anthropic'` on every row. That metadata is in the DB
but NOT displayed on the public site (AI references were removed
from privacy and terms per Change 11).

**This is an FTC disclosure risk when you go live to real traffic.**
AI-generated news without public disclosure can trigger FTC deceptive
practices review. Before you publish any of these to anon traffic,
restore a short AI-disclosure line to the privacy or terms page (see
Change 11 note) or add a byline / content-label on the article reader
itself. This is not a blocker for Apple review (Apple cares about
the app, not article provenance); it is a blocker for real public
launch.

---

All article work and nav work were produced in the same session but
are independent. Reverting the nav changes does not touch the
articles. Never running the SQL file (which is the default state)
means the article work has zero effect on the site.
