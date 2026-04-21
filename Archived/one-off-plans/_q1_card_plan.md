# Q1 Plan — /card/[username] gated copy rewrite

## Decision context (carry-over)

`/card/[username]` stays gated to signed-in users (Round 8 backfilled `profile.card.view` to the `free` set; anon sets do not hold it). The current anon fallback copy ("Profile card not available" title and "No card available. / Shareable profile cards are a paid feature. / Learn more → billing") is wrong: it implies the visitor is a free user who could upgrade, when in fact they are not signed in at all. Rewrite reframes the state as "sign up to see @<username>'s Verity Post card" and matches the tone of Round 13's `/notifications` anon CTA (primary Sign up, secondary Sign in).

## Current state (verified)

### `site/src/app/card/[username]/page.js` (client component)
- Renders the card. Four pre-ready states: `loading`, `not_found`, `private`, `no_card`, `ready`.
- `no_card` state fires when `hasPermission('profile.card.view')` is false. For anon users the permission cache is an empty Map (see `site/src/lib/permissions.js:99-103`), so they always hit `no_card`. For signed-in users, `profile.card.view` is granted via the `free` set per migration 077 (`01-Schema/077_fix_permission_set_hygiene_2026_04_18.sql:134`), which is inherited by every authenticated role — so the authed-but-denied path is effectively unreachable absent an explicit user override.
- Lines 85–97 render the anon branch:
  ```
  <div style={{ padding: '48px 20px', maxWidth: 420, margin: '0 auto', textAlign: 'center', color: C.dim }}>
    <div style={{ fontSize: 15, marginBottom: 8 }}>No card available.</div>
    <div style={{ fontSize: 13 }}>Shareable profile cards are a paid feature.</div>
    <a href="/profile/settings/billing" ...>Learn more</a>
  </div>
  ```
- Other anon-reachable branches on this file worth flagging (not in scope for the rewrite but affected by the tone decision): `not_found` (line 80: "No user found.") and `private` (line 83: "This profile is private.") — both terse and not anon-aware. Owner should decide separately whether these need a sign-up nudge; for now we leave them alone.

### `site/src/app/card/[username]/layout.js` (server component)
- `generateMetadata` calls `hasPermissionServer('profile.card.view', supabase)`. For anon users this returns `false` (`site/src/lib/auth.js:184-196`), so the branch at line 17 fires, producing metadata `{ title: 'Profile card not available — Verity Post', robots: { index: false, follow: false } }`.
- `robots: { index: false, follow: false }` is correct and stays.

### `site/src/app/card/[username]/opengraph-image.js`
- Renders the 1200×630 OG card. Calls `hasPermissionServer('profile.card.view', supabase)` at line 29. If anon or denied, returns the brand plate (white "Verity Post" on black) at lines 31–44.
- Note: most OG crawlers (Facebook, LinkedIn, Twitter, iMessage, Slack) hit this route unauthenticated, so currently every shared link previews as a black "Verity Post" brand plate — the actual card never appears on any social share. That defeats the whole point of the route for signed-in paid users using iOS ShareLink (`VerityPost/VerityPost/PublicProfileView.swift:124`, `ProfileView.swift:73`) to post the URL on socials.

### `site/src/app/profile/card/page.js` (signed-in user's own card entry)
- Redirects authed paid users to `/card/<their-username>`. Has its own `locked` / `no_username` states for the signed-in-but-lacking-share-permission case. Not affected by this rewrite; the copy is accurate for its audience (signed-in user).

### Inbound links to `/card/` (grep results)
- `site/src/app/u/[username]/page.tsx:216` — "Copy shareable profile card link" on the owner's own public profile. Gated by `canShareCard` (their own view). Copy stays accurate.
- `site/src/app/u/[username]/layout.js:35` — uses `/card/${username}/opengraph-image` as the OG image for `/u/<username>` pages. OG decision below affects this too.
- `site/src/app/profile/page.tsx:702,711` — "View public card" and "Share" buttons on the user's own `/profile`. Gated to the signed-in user. Copy stays accurate.
- iOS: `VerityPost/VerityPost/PublicProfileView.swift:124` and `ProfileView.swift:73` build `https://veritypost.com/card/<username>` URLs and hand them to `ShareLink`. iOS itself does not render `/card/`; it hands the URL to the share sheet, which opens Safari (or the receiving app's in-app browser) on the web route. Anon recipients land on the web anon state we are rewriting — no iOS-side change needed.

### Tone anchor — Round 13 `/notifications` anon CTA
`site/src/app/notifications/page.tsx:123-158`:
- Centered 520px-wide hero, 60px top margin.
- 64px circular glyph (`[!]` in monospace) inside `C.card`-bg circle with `C.border`.
- `<h1>` at 22px/800: "Keep track of what matters".
- Body at 14px/`C.dim`, `lineHeight: 1.55`, 22px bottom margin.
- Primary CTA `<a href="/signup">` — 11px/22px padding, `C.accent` bg, 9px radius, 14px/700.
- Secondary line "Already have an account? [Sign in]" → `/login`, underlined, `C.accent`.
- No emoji; glyph is ASCII/box-drawing.

This is the pattern to match.

## Changes

### File: `site/src/app/card/[username]/page.js`

**Replace the `no_card` branch (lines 85–97):**

**Lines 85–97, current:**
```js
  if (state === 'no_card') {
    return (
      <div style={{ padding: '48px 20px', maxWidth: 420, margin: '0 auto', textAlign: 'center', color: C.dim }}>
        <div style={{ fontSize: 15, marginBottom: 8 }}>No card available.</div>
        <div style={{ fontSize: 13 }}>Shareable profile cards are a paid feature.</div>
        <a href="/profile/settings/billing" style={{
          display: 'inline-block', marginTop: 16, padding: '10px 18px',
          background: C.accent, color: '#fff', borderRadius: 8,
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
        }}>Learn more</a>
      </div>
    );
  }
```

**Replace with:**
```js
  if (state === 'no_card') {
    // Anon visitor landed on a shared card link. profile.card.view is held
    // by the `free` set (migration 077), so every signed-in user has it;
    // this branch is effectively the anon-only fallback. Copy + layout
    // mirror the R13 /notifications anon CTA so the invite feels
    // consistent across gated surfaces. Preserves the `next` param so the
    // user lands back on this card after signup/signin.
    const next = typeof window !== 'undefined'
      ? encodeURIComponent(window.location.pathname)
      : `/card/${username}`;
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
          See @{username}&apos;s Verity Post card
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px', lineHeight: 1.55 }}>
          Profile cards show a reader&apos;s Verity Score, top categories, and daily streak. Sign up free to view this card and build your own.
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

**Rationale:**
- Copy reframes the state: the visitor is not denied, they are not signed in. Headline uses the username (from `useParams()`, already in scope on line 24) so the page explains whose card they were invited to see.
- Body explains what a card is ("Verity Score, top categories, and daily streak") before asking them to convert — anchoring the ask in value.
- Primary CTA "Sign up" to `/signup`, secondary "Sign in" to `/login`, matching Round 13 and the existing sign-up pattern. Both preserve `next=/card/<username>` so the user returns to the card post-auth.
- Active voice, no emoji, ASCII glyph.
- Layout container dimensions (`maxWidth: 520, margin: '60px auto'`) match `/notifications` exactly so the two gated surfaces feel like one system.
- Uses the existing `C` color tokens on the file (no new imports).

### File: `site/src/app/card/[username]/layout.js`

**Line 18, current:**
```js
    return { title: 'Profile card not available — Verity Post', robots: { index: false, follow: false } };
```

**Replace with:**
```js
    return {
      title: `Sign up to see @${username} on Verity Post`,
      description: 'View this reader\u2019s Verity Score, top categories, and streak. Free to join.',
      robots: { index: false, follow: false },
    };
```

**Rationale:**
- Browser tab + share-sheet title now advertises the value prop instead of sounding like a 404.
- Description added so that if the tab is `robots: { index: false }` but still shared via a chat app that reads `<meta name="description">` (many do), the preview is meaningful.
- `robots: { index: false, follow: false }` stays — the gated state should not be indexed.
- Unicode `\u2019` (right single quote) avoids a JSX escape in what's a server-side metadata string literal.

### File: `site/src/app/card/[username]/opengraph-image.js`

**Decision: render the full card for OG crawlers regardless of viewer auth.**

**Lines 29, 42–44, current:**
```js
  const canView = await hasPermissionServer('profile.card.view', supabase);

  const brandPlate = (
    <div style={{ ... }}>
      Verity Post
    </div>
  );

  if (!target || target.profile_visibility === 'private' || !canView) {
    return new ImageResponse(brandPlate, { ...size });
  }
```

**Replace with:**
```js
  // OG crawlers (Facebook, LinkedIn, Twitter, iMessage, Slack) request this
  // endpoint unauthenticated. The card *page* is gated to signed-in users,
  // but the OG image is a public teaser — the whole point of sharing a card
  // URL is that the social preview shows the card. No viewer-auth check here.
  // Target-side checks (user exists, profile not private) still apply so we
  // don't leak private profiles via OG. Falls back to the brand plate for
  // those cases so crawlers never 500.

  const brandPlate = (
    <div style={{ ... }}>
      Verity Post
    </div>
  );

  if (!target || target.profile_visibility === 'private') {
    return new ImageResponse(brandPlate, { ...size });
  }
```

(Drop the `canView` const and remove it from the guard condition. Keep everything else — JSX body, imports, etc. — as-is. `hasPermissionServer` import becomes unused and should be removed from the import line at the top of the file.)

**Top-of-file import change:**

**Line 5, current:**
```js
import { hasPermissionServer } from '@/lib/auth';
```

**Replace with:**
(remove the line entirely; it's no longer referenced)

**Rationale:**
- OG crawlers identify by user-agent and arrive without cookies, so `hasPermissionServer` returns `false` for them — every social-share preview currently renders as a black "Verity Post" brand plate, which makes the route useless for its primary job (social sharing).
- The page itself remains gated (visitor clicks the preview, lands on the sign-up CTA), so removing the OG gate does not leak card access — it leaks card *preview*, which is what a share is for.
- Target-side protections (target user exists, profile is not private) stay. A user who sets their profile to `private` has an explicit privacy signal and should not have their OG rendered.
- Alternative considered and rejected: gate OG on a per-crawler user-agent allowlist. Too brittle (new crawlers, spoofed UAs), and the privacy argument for gating is weak since the card is already designed for public sharing.

### File: `site/src/app/profile/card/page.js`

**No changes.** This route is for signed-in users viewing their own card. Anon visitors never land here (middleware redirects `/profile/*` to `/login?next=…` — `site/src/middleware.js:12-17`).

### File: `site/src/app/u/[username]/page.tsx`

**No changes.** The "Copy shareable profile card link" element is gated to the viewing user's own profile (`me && me.id === target.id && canShareCard`). The link text stays accurate.

### File: `site/src/app/profile/page.tsx`

**No changes.** "View public card" / "Share" buttons (lines 702, 711) are on the user's own `/profile` (anon can't reach — middleware redirect). Copy stays accurate.

### File: iOS `VerityPost/VerityPost/{PublicProfileView,ProfileView}.swift`

**No changes.** iOS only constructs the share URL; it does not render the page. Anon share recipients open the URL in Safari and hit the new web anon CTA.

## New copy (canonical)

- **Anon page headline:** `See @<username>'s Verity Post card`
- **Anon page body:** `Profile cards show a reader's Verity Score, top categories, and daily streak. Sign up free to view this card and build your own.`
- **Primary CTA:** `Sign up` → `/signup?next=/card/<username>`
- **Secondary:** `Already have an account?` `Sign in` → `/login?next=/card/<username>`
- **Browser tab title (anon):** `Sign up to see @<username> on Verity Post`
- **Meta description (anon):** `View this reader's Verity Score, top categories, and streak. Free to join.`

## Metadata decisions

- **Page `<title>` (anon):** `Sign up to see @<username> on Verity Post` — active voice, names the value. Beats the generic `Verity Post` (users share the URL in chat where the tab title often isn't visible, but the title *is* surfaced by some crawlers and by browser history).
- **`robots: { index: false, follow: false }`:** kept. The anon state should never be indexed — it's a CTA, not content.
- **OG image for anon/crawler requests:** render the real card (target user's card). See opengraph-image.js change above. Justification: social crawlers are functionally "anon"; gating OG defeats the purpose of the shareable-card feature. The page behind the preview still requires sign-up.

## Authed-but-denied users — does this path exist?

Confirmed essentially unreachable in the current schema:

- `profile.card.view` is bound to the `free` permission set in migration 077 (`01-Schema/077_fix_permission_set_hygiene_2026_04_18.sql:134`).
- Per the migration's header comment (lines 10–11): "all signed-in users inherit anon+unverified+free via role bindings, so `free` covers the whole authenticated population."
- The only way a signed-in user could fail `profile.card.view` is via an explicit per-user override (`user_permission_overrides` or similar with `granted=false`). No code writes such an override for this key.

So in practice, the `no_card` branch = anon. The rewritten copy is correctly targeted at anon. If an owner ever ships a per-user revocation, the messaging will be slightly off for that user — acceptable edge case; a dedicated denied-state copy can be added when/if that happens (and Agent B can leave a short comment in the branch to signal this).

## SEO / crawler consideration

- Card page is a client component (`'use client';`), so the HTML document shipped to crawlers doesn't contain the rendered card body — it contains the React shell + the metadata from `layout.js`. What a non-JS-executing crawler sees for an anon request is effectively the metadata (now: "Sign up to see @<username> on Verity Post"), the meta description, and the OG image.
- Google does execute JS and will render the anon CTA. The `robots: { index: false, follow: false }` tag prevents it from being indexed as a thin "please sign up" page. Desired behavior.
- Social crawlers (Facebook, Twitter, LinkedIn, iMessage, Slack) do not execute JS; they read the meta tags and OG image. With the opengraph-image.js change, they now get a proper card preview. The page-level anon CTA only shows up once the user clicks through.

## Out of scope (flagged, not fixed)

1. **`not_found` and `private` branch copy** (page.js lines 79–84). Both are terse and also anon-blind. Owner may want sign-up nudges here too, but that's a separate decision — not what Q1 asked.
2. **`profile.card.share_link` vs `profile.card_share` key naming.** Both appear in the codebase. Not a blocker for this change; flagged for Agent B to not confuse them (we only touch `profile.card.view`).
3. **Server-rendered SEO upgrade.** Moving the card page from client to server component would let social crawlers read the actual card in the HTML. Meaningful, but well beyond the scope of a copy fix.
4. **Deduping the anon CTA pattern.** Both `/notifications` and now `/card/[username]` have hand-rolled nearly-identical "sign up" hero blocks. A shared `<AnonSignUpHero>` component would be cleaner. Defer; two instances isn't enough to justify extraction yet. When a third appears, pull it out.

## Verification plan

1. **TypeScript / lint:** `cd site && npx tsc --noEmit` and `npm run lint` — the only JS edits are in `.js` files, so `tsc` mostly covers inbound .tsx consumers. Expect zero new errors.
2. **Next dev build:** `cd site && npm run build` — confirm the `/card/[username]` route compiles (OG route imports were changed).
3. **Anon render check:** start dev server; in a private window (no session cookies), hit `/card/<a-known-username>` and confirm:
   - Tab title: `Sign up to see @<username> on Verity Post`
   - Visible headline: `See @<username>'s Verity Post card`
   - Primary button: `Sign up` — href `/signup?next=%2Fcard%2F<username>`
   - Secondary link: `Already have an account? Sign in` — href `/login?next=%2Fcard%2F<username>`
   - No "Profile card not available" string anywhere in the document.
4. **curl HTML check:** `curl -s https://<dev-host>/card/<username> | grep -i "Sign up to see"` — confirms the metadata title is in the shipped HTML for non-JS crawlers.
5. **OG image check:** `curl -s -o /tmp/og.png https://<dev-host>/card/<username>/opengraph-image` (no auth cookies) — open the PNG and confirm it's the actual card, not the black brand plate. Also verify for a deleted / private-profile username that the brand plate still renders (fallback integrity).
6. **Flip-test:** sign in as a non-private test user; hit `/card/<own-username>`; confirm the real card still renders (the `ready` branch is untouched, but worth a sanity pass). Repeat with a paid-tier test account to be thorough.
7. **Preserve-next test:** click `Sign up` from the anon state; complete sign-up on a scratch account; confirm the post-signup redirect lands back on `/card/<username>` and now shows the card.

## File count

3 files modified:
- `site/src/app/card/[username]/page.js`
- `site/src/app/card/[username]/layout.js`
- `site/src/app/card/[username]/opengraph-image.js`

0 files with text changes in iOS or other web surfaces.
