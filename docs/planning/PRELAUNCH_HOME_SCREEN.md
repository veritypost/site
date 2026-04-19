# Pre-launch Home Screen Setup

Plan for a temporary "coming soon" holding page that shows while you're still building. Any path a public visitor types funnels back to the holding page. You and the team keep full access.

Not yet implemented — this doc is the blueprint.

---

## Goal

- Public visitors see ONE page: the holding screen at `/`.
- Every other public route (`/story/X`, `/leaderboard`, `/login`, etc.) redirects to `/`.
- The owner + iOS testers + API still work normally.
- One env var toggles the whole thing on or off. No code deploy to flip.

---

## Files to create / modify

### 1. `site/src/middleware.ts` (new, ~40 lines)

Next.js middleware runs before any route decision. This is the one hook that can intercept every request.

Pseudo-logic:

```
export function middleware(request) {
  if (process.env.NEXT_PUBLIC_SITE_MODE !== 'coming_soon') return // live mode, no-op

  const path = request.nextUrl.pathname

  // exceptions — always let through
  if (path.startsWith('/api/')) return            // iOS + admin tools still work
  if (path.startsWith('/admin/')) return          // you keep editing content
  if (path.startsWith('/_next/')) return          // Next.js internals
  if (path === '/favicon.ico') return
  if (path === '/robots.txt' || path === '/sitemap.xml') return
  if (path === '/') return                        // the holding page itself
  if (path === '/preview') return                 // bypass setter (see below)

  // bypass cookie — lets team members + you see real site while logged out
  if (request.cookies.get('vp_preview')?.value === 'ok') return

  // everything else: send to /
  const url = request.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  return NextResponse.redirect(url, 307)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### 2. `site/src/app/page.tsx` (modify)

Branch on the env flag. When in coming-soon mode, render a minimal `<ComingSoon />` component instead of the real home feed.

```
// @ts-check
const isComingSoon = process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon'
// ... in component:
if (isComingSoon) return <ComingSoon />
// else the real home
```

`<ComingSoon />` is a new component with:
- VP logo
- One-line tagline ("News you can trust — launching soon")
- Optional email-capture (writes to a `waitlist` table — low-risk, anon-writable)
- `<meta name="robots" content="noindex,nofollow" />` so Google doesn't index "coming soon" as your canonical content

### 3. `site/src/app/preview/route.ts` (new, ~15 lines)

Owner escape hatch. Visit `/preview?token=<secret>` while in coming-soon mode. If token matches `PREVIEW_BYPASS_TOKEN` env var, sets a long-lived `vp_preview=ok` cookie and redirects to `/`. You now see the real site from that browser until you clear cookies or we rotate the token.

```
export async function GET(request) {
  const token = request.nextUrl.searchParams.get('token')
  if (token !== process.env.PREVIEW_BYPASS_TOKEN) {
    return Response.redirect(new URL('/', request.url))
  }
  const res = NextResponse.redirect(new URL('/', request.url))
  res.cookies.set('vp_preview', 'ok', {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
```

### 4. Env vars

Add to `.env.local` (and Vercel):

```
NEXT_PUBLIC_SITE_MODE=coming_soon      # toggle: omit or set to "live" to disable
PREVIEW_BYPASS_TOKEN=<long-random-string>
```

---

## How you flip it on / off

**Turn ON (pre-launch):**
- Set `NEXT_PUBLIC_SITE_MODE=coming_soon` in Vercel → redeploy
- Public visitors now see the holding page
- You visit `https://veritypost.com/preview?token=<PREVIEW_BYPASS_TOKEN>` → gets the bypass cookie → you see the real site

**Turn OFF (launch day):**
- Remove the env var (or set to anything else) in Vercel → redeploy
- Middleware becomes a no-op
- Real site shows for everyone

**Ephemeral maintenance later:**
- Same toggle. Flip back on for a few hours if you need a quiet window.

---

## Redirect vs rewrite — why redirect

- **Redirect (307)**: URL bar changes to `/`. User clearly sees "we're not live yet" via the URL.
- **Rewrite**: URL bar keeps `/story/X` but content is `/`. Confusing — users wonder why the link "didn't work."

Go with redirect unless you have a strong reason to preserve deep-link URLs for later resume.

---

## What stays accessible

- **`/api/**`** — iOS app keeps working against production, any scheduled crons still run.
- **`/admin/**`** — you log in at `/admin` (which middleware waves through), manage content, approve experts, publish articles.
- **Anyone with the bypass cookie** — team members can see the real site by visiting the `/preview?token=...` URL once.

---

## SEO

- Set `<meta name="robots" content="noindex,nofollow" />` on the holding page.
- Consider returning HTTP 503 with `Retry-After` header for search-engine user-agents (tells Google "come back later, don't index this"). Identify bots via `user-agent` header in middleware.
- When you go live, Google re-indexes within hours to days.

---

## Gotchas to avoid

- **Don't forget `/api` exception** — otherwise iOS breaks.
- **Don't forget `/_next` exception** — otherwise CSS/JS assets 404 and the holding page itself breaks.
- **Don't hardcode the bypass token in client code** — only server-side.
- **Cookie has `httpOnly`** — prevents JS from reading it, only middleware sees it. Safer.
- **Test the toggle locally before shipping** — set `NEXT_PUBLIC_SITE_MODE=coming_soon` in `.env.local`, restart dev server, verify redirects work and preview URL sets the bypass.

---

## When to implement

Post-migration audits are still landing. Once those are resolved and you're in pre-launch prep mode, this is a 30-minute task. The whole thing is 2 new files + 2 env vars + one tweak to `app/page.tsx`.

To revert: delete middleware.ts, delete preview route, unset env vars. Clean rollback.
