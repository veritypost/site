# Q1 Plan v2 — Card fully public, `/u/[username]` gated for anon

Supersedes `_q1_card_plan.md` (which assumed the card stays gated — we reversed that). Decision summary:

1. `/card/[username]` becomes **fully public**. Anon can view the page and the OG image. Target-side checks (user exists, not `profile_visibility='private'`, not deleted) stay.
2. `/u/[username]` **stays gated for anon**. Today it LEAKS — anon sees the full public profile. Add an in-page anon CTA matching the `/notifications` R13 pattern (no redirect).
3. `/profile/[id]` already gated by middleware (`PROTECTED_PREFIXES` includes `/profile`). Nothing to do except confirm.
4. `<meta robots="noindex,nofollow">` on `/card/[username]` so Google doesn't rank a card above our articles.
5. Card-page "View full profile" link becomes auth-aware: for anon, route to `/signup?next=/u/<username>` (option **b** from scope — friction-minimal, post-signup context preserved). For authed users, link stays as-is.

## Current state (verified)

### `site/src/app/card/[username]/page.js`
- Client component. Fetches target, then `hasPermission('profile.card.view')`; if denied OR anon, renders the `no_card` upsell (lines 85–97). This is the viewer gate we're removing.
- Per migration 077, `profile.card.view` is held by the `free` set (`01-Schema/077_fix_permission_set_hygiene_2026_04_18.sql:134`), so every signed-in user has it. The `no_card` branch is effectively anon-only today. After this change, nobody hits it — delete the branch.
- Line 168: `<a href={`/u/${target.username}`}>View full profile</a>` — unconditional link. For anon this leads to the leaky `/u/[username]` page. Needs to become auth-aware.

### `site/src/app/card/[username]/layout.js`
- `generateMetadata` calls `hasPermissionServer('profile.card.view', supabase)` and returns a 404-ish title `{ title: 'Profile card not available — Verity Post', robots: { index: false, follow: false } }` when anon (line 17–19). We're removing the gate; metadata must always produce a real title, and `robots: { index: false, follow: false }` applies to ALL states (new item per decision #4).

### `site/src/app/card/[username]/opengraph-image.js`
- Same viewer gate: `hasPermissionServer('profile.card.view', supabase)` returns false for anon (crawlers are anon), so every social share currently renders as a black "Verity Post" brand plate. Remove the viewer gate entirely; keep the target-side fallback (`!target || profile_visibility === 'private'`).

### `site/src/app/u/[username]/page.tsx` — **LEAKS TODAY**
- Client component. Calls `supabase.auth.getUser()` on line 78; `if (user) {…}` block hydrates `me` + permission flags. If anon, that block is skipped.
- Lines 95–124: target is fetched and rendered REGARDLESS of auth state. Anon sees display name, bio, avatar, banner, followers/following counts, and (when `canSeeVerityScore` is false, which it is for anon) no score. Followers/following lists on lines 252–253 also render to anon.
- This is the leak: a random visitor gets the full profile by username. Gate with an in-page anon CTA (no redirect).

### `site/src/app/u/[username]/layout.js`
- Server metadata. Reads the target, builds a proper `<title>`, `description`, and OG image pointing at `/card/<username>/opengraph-image`. No auth gate here and that's fine — metadata can reflect the real person even when we then gate the page body. DO NOT change `<meta robots>` here. `/u/<username>` is a canonical public person-URL for social preview. Let it be indexable; only the card page gets `noindex`.

### `site/src/app/profile/[id]/page.tsx`
- Client component. BUT the route is `/profile/*`, which matches `PROTECTED_PREFIXES` in `site/src/middleware.js:12-17`. Anon is 302'd to `/login?next=/profile/<id>` before the page renders. No code-level gate needed.
- Verified by reading middleware: `isProtected('/profile/abc')` returns true since `pathname.startsWith('/profile/')`. Confirmed gated. No changes required.

### `site/src/app/profile/card/page.js`
- Same `/profile` prefix → gated by middleware. No changes.

### `site/src/middleware.js`
- Already imports and uses `createServerClient` with RLS cookies. Protected prefixes: `/admin`, `/profile`, `/messages`, `/bookmarks`. No change needed for this plan — we are NOT adding `/u` to this list because the R13 pattern (anon CTA in-page) is the chosen UX.

### Tone anchor — `/notifications` anon pattern (R13)
`site/src/app/notifications/page.tsx:117-158`. 520px hero, 64px glyph circle in `C.card`, H1 22px/800, body 14px/dim with 1.55 line-height, primary `/signup` button 11×22 padding `C.accent` bg radius 9, secondary "Already have an account? Sign in" → `/login`, underlined. ASCII glyph, no emoji.

### Inbound links to `/u/<username>` (grep verified)
- `site/src/components/CommentRow.tsx:77` — @mention chip in comment bodies. Anon reading an article sees @mentions; click leads to the gated profile (post-fix: CTA page). Acceptable; the gate fires there, not in CommentRow.
- `site/src/app/card/[username]/page.js:168` — "View full profile" CTA. Needs auth-aware rewrite (see change below).
- `site/src/app/u/[username]/page.tsx:268` — followers/following list. Anon wouldn't see this list after the gate lands; downstream clicks only happen for authed users, so no additional work.
- `site/src/app/admin/users/[id]/permissions/page.tsx:480` — admin only, under `/admin` prefix → gated by middleware. No change.

### `/search`, `/leaderboard` (anon user-row exposure audit)
- `site/src/app/search/page.tsx` returns article hits only. No user rows in results. No anon-clickable user links. No change.
- `site/src/app/leaderboard/page.tsx` has an anon branch (lines 364–396) that renders the top 8 **blurred with pointer-events:none** behind a "Sign up" overlay. Anon cannot click through to `/u/<username>`. No leak, no change.

### iOS
- `VerityPost/VerityPost/PublicProfileView.swift` and `ProfileView.swift` both construct `https://veritypost.com/card/<username>` URLs for `ShareLink` (lines 124 and 73). iOS does not render `/card/` or `/u/` on the web — it hands the URL to the share sheet. When an anon recipient opens it in Safari, they land on the now-public card page (the point of the change).
- iOS's native `PublicProfileView` requires auth to reach (`@EnvironmentObject var auth`); anon iOS state is "logged out of the app" and can't navigate to it. No iOS code changes.
- No iOS source grep matches for `veritypost.com/u/` — the app uses native navigation to `PublicProfileView(username:)`, not web URLs. So iOS never deep-links to the web `/u/` gate.

## Changes

### File: `site/src/app/card/[username]/page.js`

**Change 1 — remove the viewer-side permission gate.**

Lines 7–8, current:
```js
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import { assertNotKidMode } from '@/lib/guards';
```
Replace with:
```js
import { assertNotKidMode } from '@/lib/guards';
import { createClient as createBrowserClient } from '../../../lib/supabase/client';
```
(drop the `hasPermission, refreshAllPermissions` import — not needed once the gate goes).

Lines 33–46, current:
```js
  useEffect(() => {
    if (assertNotKidMode(router)) return;
    (async () => {
      await refreshAllPermissions();
      const { data: targetRow } = await supabase
        .from('users')
        .select('id, username, display_name, bio, avatar_url, avatar_color, verity_score, streak_current, is_expert, expert_title, expert_organization, profile_visibility')
        .eq('username', username)
        .maybeSingle();

      if (!targetRow) { setState('not_found'); return; }
      if (targetRow.profile_visibility === 'private') { setState('private'); return; }
      if (!hasPermission('profile.card.view')) { setState('no_card'); return; }
```
Replace with:
```js
  useEffect(() => {
    if (assertNotKidMode(router)) return;
    (async () => {
      // Card is fully public. We still check auth so the "View full profile"
      // CTA can point somewhere sensible (signed-in → /u/<username>, anon →
      // /signup?next=/u/<username>). No permission check — the decision was
      // to remove profile.card.view as a viewer-side gate. Target-side
      // checks (user exists, not private) remain.
      const { data: { user } } = await supabase.auth.getUser();
      setViewerIsAuthed(!!user);

      const { data: targetRow } = await supabase
        .from('users')
        .select('id, username, display_name, bio, avatar_url, avatar_color, verity_score, streak_current, is_expert, expert_title, expert_organization, profile_visibility')
        .eq('username', username)
        .maybeSingle();

      if (!targetRow) { setState('not_found'); return; }
      if (targetRow.profile_visibility === 'private') { setState('private'); return; }
```
Also add a new state near existing `useState`s (around line 27–31):
```js
  const [viewerIsAuthed, setViewerIsAuthed] = useState(false);
```

**Change 2 — delete the `no_card` branch.** Lines 85–97 (the anon upsell block) are unreachable once the permission gate is removed. Delete the whole `if (state === 'no_card') {…}` block.

**Change 3 — make the "View full profile" link auth-aware.**

Line 168, current:
```js
          <a href={`/u/${target.username}`} style={{
```
Replace with:
```js
          <a
            href={
              viewerIsAuthed
                ? `/u/${target.username}`
                : `/signup?next=${encodeURIComponent(`/u/${target.username}`)}`
            }
            style={{
```
(body of the `<a>` stays; the closing `>View full profile</a>` stays.)

**Rationale.** Anon clicking "View full profile" gets bounced to `/signup` with the profile URL in `next`, so post-signup they land on the intended profile. Authed users see normal link behavior. This is option (b) from scope #3 — minimal friction, context preserved. Option (a) "in-page modal" adds UX weight for a single link. Option (c) "hide the link for anon" loses the conversion nudge — anon cards should still guide to sign-up.

### File: `site/src/app/card/[username]/layout.js`

Lines 15–47, current:
```js
  const canView = await hasPermissionServer('profile.card.view', supabase);
  if (!target || target.profile_visibility === 'private' || !canView) {
    return { title: 'Profile card not available — Verity Post', robots: { index: false, follow: false } };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const name = target.display_name || target.username;
  const title = `${name} — Verity Post`;
  …
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { … },
    twitter: { … },
  };
```

Replace with:
```js
  // Card is a public share surface. Target-side checks still short-circuit
  // (deleted, private) to a neutral title so a shared link to a deleted
  // user doesn't leak display name. noindex always — cards should never
  // outrank real articles in search.
  if (!target || target.profile_visibility === 'private') {
    return {
      title: 'Profile card — Verity Post',
      robots: { index: false, follow: false },
    };
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const name = target.display_name || target.username;
  const title = `${name}'s card — Verity Post`;
  const description = target.bio?.slice(0, 160)
    || `${name} on Verity Post. Verity Score ${target.verity_score ?? 0}.`;
  const path = `/card/${username}`;
  const ogImage = `${base}${path}/opengraph-image`;

  return {
    title,
    description,
    // Cards are not canonical article content. Share-friendly OG stays,
    // but Google shouldn't rank a card page for anyone's name.
    robots: { index: false, follow: false },
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'profile',
      siteName: 'Verity Post',
      images: [{ url: ogImage, alt: `${name} profile card` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
```

Also remove the unused import on line 4:
```js
import { hasPermissionServer } from '@/lib/auth';
```
Delete that line entirely.

**Rationale.**
- Title is user-specific (`Jordan Smith's card — Verity Post`) per scope #4.
- `robots: { index: false, follow: false }` applies to every branch, not just the gated fallback. Scope #4 calls this out explicitly.
- Neutral title on missing/private target so a scraper can't grab the display name via metadata while the page body shows "profile is private."

### File: `site/src/app/card/[username]/opengraph-image.js`

Line 5 (import), current:
```js
import { hasPermissionServer } from '@/lib/auth';
```
Delete this line entirely.

Lines 29, 42–44, current:
```js
  const canView = await hasPermissionServer('profile.card.view', supabase);

  const brandPlate = (
    <div style={{ … }}>
      Verity Post
    </div>
  );

  if (!target || target.profile_visibility === 'private' || !canView) {
    return new ImageResponse(brandPlate, { ...size });
  }
```

Replace with:
```js
  // OG is the social preview for a public share surface. No viewer auth —
  // crawlers (Facebook, Twitter, LinkedIn, iMessage, Slack) request this
  // unauthenticated, so gating on a permission key meant every share
  // rendered as the brand plate. Target-side fallbacks stay so a deleted
  // or explicitly-private user never leaks via OG.
  const brandPlate = (
    <div style={{ … }}>
      Verity Post
    </div>
  );

  if (!target || target.profile_visibility === 'private') {
    return new ImageResponse(brandPlate, { ...size });
  }
```

(JSX body of `brandPlate` is unchanged.)

**Rationale.** Matches the card decision — public means public for the preview too. Private users fall back to brand plate. Deleted users (no row) fall back to brand plate.

### File: `site/src/app/u/[username]/page.tsx`

Add the anon CTA. The cleanest surgical change: after the `useEffect` hydrates state, if viewer is unauthenticated, render a dedicated anon block instead of `target ? …real body… : notFound()`.

Add near the top imports (after line 12):
```tsx
// (no new imports needed — we reuse existing colors inline via the palette)
```
Actually — this file doesn't have a `C` palette constant. Add one near the top of the component (after line 72's last `useState`) so styles match `/notifications`:
```tsx
  const C = {
    bg: '#ffffff', card: '#f7f7f7', border: '#e5e5e5',
    text: '#111111', dim: '#666666', accent: '#111111',
  } as const;
```

Add a new state for anon-aware rendering. Lines 60–72 currently have a block of `useState` calls. Add after line 72:
```tsx
  const [isAnon, setIsAnon] = useState<boolean>(false);
  const [checkedAuth, setCheckedAuth] = useState<boolean>(false);
```

Inside the effect on lines 74–124, modify the auth check so we track the anon case:

Lines 78–93, current:
```tsx
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: meRow } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle<MeRow>();
        setMe(meRow || null);
        await refreshAllPermissions();
        await refreshIfStale();
        setCanFollow(hasPermission('profile.follow'));
        setCanSendDm(hasPermission('messages.dm.compose'));
        setCanSeeVerityScore(hasPermission('profile.score.view.other.total'));
        setCanShareCard(hasPermission('profile.card_share'));
        setCanSeeExpert(hasPermission('profile.expert.badge.view'));
      }
```
Replace with:
```tsx
      const { data: { user } } = await supabase.auth.getUser();
      setIsAnon(!user);
      setCheckedAuth(true);
      if (user) {
        const { data: meRow } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle<MeRow>();
        setMe(meRow || null);
        await refreshAllPermissions();
        await refreshIfStale();
        setCanFollow(hasPermission('profile.follow'));
        setCanSendDm(hasPermission('messages.dm.compose'));
        setCanSeeVerityScore(hasPermission('profile.score.view.other.total'));
        setCanShareCard(hasPermission('profile.card_share'));
        setCanSeeExpert(hasPermission('profile.expert.badge.view'));
      } else {
        // Anon: skip the target fetch AND the follows joins. We render
        // the in-page "Sign up to see this profile" CTA instead. Short-
        // circuit so we don't leak display name / bio / avatar via the
        // users RLS read.
        setLoading(false);
        return;
      }
```

Then, directly after `if (loading) return <div …>Loading…</div>;` on line 151, insert the anon block:
```tsx
  if (checkedAuth && isAnon) {
    // R13 pattern — in-page sign-up CTA. No redirect (matches /notifications).
    // Profiles are gated for anon because a random visitor shouldn't see
    // a stranger's full profile via guessed username. The card remains
    // public (see /card/[username]) so sharing still works — anon who
    // wants the deep profile gets a friction-minimal sign-up nudge with
    // the intended URL preserved in `next`.
    const next = encodeURIComponent(`/u/${username}`);
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 64, height: 64, margin: '0 auto 18px',
            borderRadius: '50%', background: C.card,
            border: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: C.accent,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          [@]
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px', color: C.text }}>
          Sign up to see @{username}&apos;s profile
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px', lineHeight: 1.55 }}>
          Profiles show reading history, Verity Score, streak, comments, and more. Join free to view this profile and build your own.
        </p>
        <a
          href={`/signup?next=${next}`}
          style={{
            display: 'inline-block', padding: '11px 22px',
            background: C.accent, color: '#fff',
            borderRadius: 9, fontSize: 14, fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign up
        </a>
        <div style={{ marginTop: 14, fontSize: 13, color: C.dim }}>
          Already have an account?{' '}
          <a href={`/login?next=${next}`} style={{ color: C.accent, fontWeight: 600, textDecoration: 'underline' }}>Sign in</a>
        </div>
      </div>
    );
  }
```

**Rationale.**
- Short-circuits the target fetch for anon so we don't hit the `users` table with an anon RLS read and leak fields into the network tab.
- Matches R13 `/notifications` layout beat-for-beat: 520px hero, 64px glyph, H1 22/800, body 14/dim/1.55, primary Sign up → `C.accent`, secondary Sign in, ASCII glyph `[@]` (mirrors `[!]` on notifications).
- Preserves `next=/u/<username>` so post-signup/post-signin they land back on the profile.
- Active voice ("Sign up to see @…'s profile"), no emoji, names the value prop in the body.
- `<meta robots>` is NOT added to `/u/<username>` metadata — this page is the canonical person-URL and we want it indexable for real traffic (e.g., someone searching for a journalist by name). The anon CTA shows in-page but the real profile body renders server-side via the metadata only; Googlebot executes JS and will also render the anon CTA, so indexing picks up a thin page. This is acceptable for launch; if it becomes a SEO problem we can SSR the profile body separately later.

### File: `site/src/app/u/[username]/layout.js`
**No changes.** Metadata already builds a canonical `<title>` and OG image. The page gate is at the body level.

### File: `site/src/app/profile/[id]/page.tsx`
**No changes.** Protected by middleware (`/profile/*` prefix).

### File: `site/src/app/profile/card/page.js`
**No changes.** Protected by middleware (`/profile/*` prefix).

### File: `site/src/middleware.js`
**No changes.** The R13 decision is anon CTA in-page, not middleware redirect.

### File: `site/src/components/CommentRow.tsx`
**No changes.** @mention chips link to `/u/<name>`; anon clicking one hits the new anon CTA. Correct outcome.

### iOS
**No code changes.** iOS ships `/card/<username>` URLs to the share sheet; those URLs now work for anon recipients (the change). `PublicProfileView.swift` is native SwiftUI and only reachable by authed users inside the app. No deep-links to web `/u/` exist.

## New copy (canonical)

### Card page (all states, public)
- No new copy. Deleting the anon upsell; the `ready` body already works for both anon and authed.
- "View full profile" link: copy unchanged. Behavior now auth-aware.

### Card page metadata
- **Title (target exists, public):** `{display_name}'s card — Verity Post` (e.g., `Jordan Smith's card — Verity Post`)
- **Title (target missing or private):** `Profile card — Verity Post`
- **Description:** uses target bio first 160 chars, else `{name} on Verity Post. Verity Score {n}.`
- **Robots:** `index: false, follow: false` — always.

### `/u/[username]` anon CTA
- **Headline:** `Sign up to see @<username>'s profile`
- **Body:** `Profiles show reading history, Verity Score, streak, comments, and more. Join free to view this profile and build your own.`
- **Primary CTA:** `Sign up` → `/signup?next=/u/<username>`
- **Secondary:** `Already have an account? Sign in` → `/login?next=/u/<username>`
- **Glyph:** `[@]` in monospace, matches `[!]` on /notifications.

## Metadata / robots decisions

- `/card/[username]`: `robots: index=false, follow=false` always. Descriptive title + OG stay so social shares preview correctly. The scope #4 ask.
- `/u/[username]`: robots untouched (indexable). Canonical person-URL for discovery; anon in-page CTA doesn't need noindex because the URL is real content, just gated for visitors without an account.
- `/profile/[id]`: already behind middleware redirect, so crawlers get 302 to /login. No index pressure.

## Permission-key cleanup

Two permission-key observations flagged for follow-up (NOT in scope for this change, but Agent B should leave a comment):

1. `profile.card.view` becomes an unreferenced permission key once the client-side gate and the layout/OG checks are removed. Consider deprecating in migration 0XX — not blocking.
2. iOS `PublicProfileView.swift:52` checks `profile.card.share_link` while web `u/[username]/page.tsx:91` checks `profile.card_share`. Two keys, one intent. Pre-existing naming drift — flagged in the previous plan too, still flagged, still not in scope.

## File count

4 files modified:
- `site/src/app/card/[username]/page.js` (remove viewer gate, delete no_card branch, auth-aware profile link, track viewer auth)
- `site/src/app/card/[username]/layout.js` (drop permission gate, user-specific title, always-on noindex)
- `site/src/app/card/[username]/opengraph-image.js` (drop permission gate, keep target-side fallback)
- `site/src/app/u/[username]/page.tsx` (add anon CTA block, short-circuit target fetch for anon)

0 iOS changes. 0 middleware changes. 0 other web surface changes.

## Verification plan

1. **TypeScript / lint.** `cd site && npx tsc --noEmit` and `npm run lint`. Expect zero new errors.
2. **Build.** `cd site && npm run build`. Card + u routes compile; `hasPermissionServer` import removals take.
3. **Anon flow — card public.** Private window, navigate to `/card/<known-public-username>`:
   - Real card renders (avatar, name, bio, score, streak, top categories).
   - "View full profile" button href = `/signup?next=%2Fu%2F<username>`.
   - "Copy card link" works.
   - Browser tab title: `<Display Name>'s card — Verity Post`.
   - View source: `<meta name="robots" content="noindex,nofollow">` present.
4. **Anon flow — OG crawler.** `curl -s -A 'facebookexternalhit/1.1' -o /tmp/og.png https://<host>/card/<username>/opengraph-image` → opens to real card PNG, not brand plate.
5. **Anon flow — profile gated.** Private window, navigate to `/u/<known-public-username>`:
   - Anon CTA renders with username in headline.
   - Primary button href = `/signup?next=%2Fu%2F<username>`.
   - Network tab: NO `users` table fetch for the target (we short-circuited).
6. **Authed flow — card reachable.** Signed in, navigate to `/card/<someone-else>`:
   - Real card.
   - "View full profile" button href = `/u/<username>` (no redirect to signup).
7. **Authed flow — profile reachable.** Signed in, `/u/<someone-else>` → full profile with follow/message controls as today.
8. **Private target.** `/card/<private-user-username>` → "This profile is private." body (existing copy, untouched); OG returns brand plate; title `Profile card — Verity Post`; robots noindex.
9. **Missing target.** `/card/<nonexistent>` → "No user found." body; OG brand plate; title `Profile card — Verity Post`.
10. **Preserve-next.** Anon clicks "View full profile" on a card → `/signup?next=…` → completes signup → lands on `/u/<username>` with the real profile. Same path via "Sign in" secondary link.
11. **Middleware sanity.** Anon to `/profile/abc` still 302s to `/login?next=/profile/abc`. Untouched.
12. **Deep-link from iOS share.** iOS user posts a `/card/<username>` URL to Messages → anon recipient taps in Safari → real card renders (the change landed). Previously would have seen the "No card available" upsell.

## Out of scope (flagged, not fixed)

1. **SSR-ing `/u/[username]` for better SEO.** The page is a client component; search crawlers see a mostly-empty shell. Metadata is fine for now. Migrate to server component later.
2. **Deduping the anon CTA.** Now 2 instances (`/notifications`, `/u/<username>`). Once a 3rd appears, extract `<AnonSignUpHero>`.
3. **`profile.card.view` permission key deprecation.** Unused after this change.
4. **`profile.card.share_link` vs `profile.card_share` naming drift** between iOS and web. Pre-existing.
5. **`/u/[username]` indexability.** Leaving indexable for canonical-name SEO. Monitor after launch.
