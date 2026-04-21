# Round D plan — public-surface hardening

Scope: everything a logged-out reviewer or crawler can touch without auth. No migrations; code-only. Read-only planning — changes are designed, not applied.

Source of truth:
- `05-Working/_prelaunch_attack_plan.md` (Round D section)
- `05-Working/_prelaunch_master_issues.md` (C-01, H-06, H-11, H-12, H-14, H-18, H-19, L-01)

Canonical rules observed: no emojis anywhere, no launch-blocking framing, plain prose.

---

## C-01 — delete the fabricated `/status` page

### Target files
- `site/src/app/status/page.tsx` (delete entire file + parent directory)
- `site/src/app/NavWrapper.tsx:263` (footer link row)

### Current state

`site/src/app/status/page.tsx:25-37` ships two hard-coded arrays:

```tsx
const services: ServiceRow[] = [
  { name: 'Website', status: 'operational', uptime: '99.99%' },
  { name: 'API', status: 'operational', uptime: '99.98%' },
  { name: 'Database', status: 'operational', uptime: '99.99%' },
  { name: 'Push Notifications', status: 'degraded', uptime: '99.82%' },
  { name: 'Email', status: 'operational', uptime: '99.95%' },
  { name: 'RSS Ingestion', status: 'operational', uptime: '99.91%' },
];

const incidents: IncidentRow[] = [
  { date: 'Apr 9, 2026', title: 'Push notification delays', severity: 'minor', description: '…', resolved: true },
  { date: 'Apr 6, 2026', title: 'Elevated API response times', severity: 'minor', description: '…', resolved: true },
];
```

Footer link in `NavWrapper.tsx:259-273`:

```tsx
{[
  { label: 'Help', href: '/help' },
  { label: 'Contact', href: '/profile/contact' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Status', href: '/status' },
  { label: 'Privacy', href: '/privacy' },
  …
]}
```

### Proposed change

Delete `site/src/app/status/` directory entirely. Remove the `{ label: 'Status', href: '/status' }` row from the footer array. After deletion, `/status` returns the app's 404 page (already present at `site/src/app/not-found.js`).

```tsx
// NavWrapper.tsx — new footer array
{[
  { label: 'Help', href: '/help' },
  { label: 'Contact', href: '/contact' },        // see H-11
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'Accessibility', href: '/accessibility' },
  { label: 'DMCA', href: '/dmca' },
]}
```

### Why

Publishing invented uptime + fabricated incidents is a compliance and trust hazard. Gating the page to admins still leaves the bundle shipped; deletion is strictly smaller and zero-risk.

---

## H-06 — drop client-supplied Stripe URLs

### Target file
- `site/src/app/api/stripe/checkout/route.js:14, 38-39`

### Current code

```js
const { plan_name, success_url, cancel_url } = await request.json().catch(() => ({}));
…
const origin = new URL(request.url).origin;
try {
  const session = await createCheckoutSession({
    userId: user.id,
    customerId: me?.stripe_customer_id || undefined,
    priceId: plan.stripe_price_id,
    planName: plan_name,
    successUrl: success_url || `${origin}/profile/settings/billing?success=1`,
    cancelUrl: cancel_url || `${origin}/profile/settings/billing?canceled=1`,
  });
```

### Proposed code

```js
const { plan_name } = await request.json().catch(() => ({}));
…
const origin = request.nextUrl.origin;
try {
  const session = await createCheckoutSession({
    userId: user.id,
    customerId: me?.stripe_customer_id || undefined,
    priceId: plan.stripe_price_id,
    planName: plan_name,
    successUrl: `${origin}/profile/settings/billing?success=1`,
    cancelUrl: `${origin}/profile/settings/billing?canceled=1`,
  });
```

Also update the header comment on line 8 so the body shape matches:

```js
// POST /api/stripe/checkout — body: { plan_name }
```

### Why

Accepting user-supplied `success_url` / `cancel_url` lets an attacker craft a Stripe session whose post-checkout referrer goes to an attacker domain carrying the victim's Stripe session id. Deriving both URLs from `request.nextUrl.origin` + hard-coded paths removes the parameter entirely, so there is nothing to validate.

Note: `request.nextUrl.origin` is preferred over `new URL(request.url).origin` because Next.js normalizes it against `x-forwarded-host` / `x-forwarded-proto` behind Vercel's edge, matching what `middleware.js` already uses.

---

## H-11 — public `/contact` route (replaces footer `/profile/contact` link)

Two options were weighed. Recommendation: create a dedicated public `/contact` page and point the footer there, rather than adding `/profile/contact` to the middleware allowlist. Rationale: `/profile/contact` sits inside the authenticated profile tree and expects a logged-in context (uses `var(--dark)` theming, links back to `/profile`, posts to `/api/support` which itself requires auth). Shimming middleware to let anon reach it keeps those incorrect assumptions alive and carries App Store review risk. A separate anon-friendly `/contact` page is the cleaner shape.

### Target files
- `site/src/app/NavWrapper.tsx:261` (footer link)
- New file `site/src/app/contact/page.tsx` (public contact form)
- New file `site/src/app/api/support/public/route.js` (anon-friendly support intake, rate-limited by IP)

### Current behaviour

Footer link `/profile/contact` hits `site/src/middleware.js:12-17` `PROTECTED_PREFIXES = ['/admin','/profile','/messages','/bookmarks']` and 302s to `/login?next=/profile/contact`.

### Proposed footer edit

```tsx
// NavWrapper.tsx:261
{ label: 'Contact', href: '/contact' },
```

### Proposed `site/src/app/contact/page.tsx`

A slim public copy of `/profile/contact/page.js`: same topic list, same subject + body fields, but:
- No `/profile` back link. Back link goes to `/`.
- Posts to `/api/support/public` (not `/api/support`).
- When a signed-in user visits, show a one-line banner linking to `/profile/contact` so their ticket is attributed to their account.

### Proposed `site/src/app/api/support/public/route.js`

```js
import { NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { truncateIpV4 } from '@/lib/apiErrors';

// Public contact intake. Accepts anon submissions; uses service client
// because logged-out users cannot satisfy any row-level auth binding.
// Rate-limited per IP (5 submissions per hour) to keep the mailbox sane.
export async function POST(request) {
  const ip = await getClientIp();
  const service = createServiceClient();

  const rl = await checkRateLimit(service, {
    key: `support_public:ip:${ip}`,
    max: 5,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many submissions. Try again later.' }, { status: 429 });
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const category = typeof body?.category === 'string' ? body.category.slice(0, 40) : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 4000) : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';

  if (!category || !subject || !description || !email || !email.includes('@')) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // If the caller happens to be logged in, attribute. Otherwise anon.
  let userId = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {}

  await service.from('support_tickets').insert({
    user_id: userId,
    category,
    subject,
    description,
    contact_email: email,
    ip_address: truncateIpV4(ip),
    source: 'public_contact',
  });

  return NextResponse.json({ ok: true });
}
```

Column-name fields (`contact_email`, `source`) are placeholders — the existing `/api/support` route should be referenced for the canonical insert shape, and this draft adjusted to match. If `support_tickets` has no `contact_email` column, stash it in `metadata` instead.

### Why

Public support contact must be reachable without login for App Store review compliance and basic trust. A separate `/contact` route keeps the authenticated `/profile/contact` flow unchanged while unblocking anon contact.

---

## H-12 + L-01 — sitemap coverage

### Target file
- `site/src/app/sitemap.js` (existing; needs category enumeration added)

### Current code

```js
import { createClient } from '../lib/supabase/server';

export default async function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';

  const staticRoutes = [
    '', '/browse', '/search', '/kids', '/how-it-works',
    '/privacy', '/terms', '/cookies', '/dmca', '/accessibility',
    '/login', '/signup',
  ].map((path) => ({ … }));

  let storyRoutes = [];
  try {
    const supabase = createClient();
    const { data: stories } = await supabase
      .from('articles')
      .select('slug, published_at, created_at')
      .eq('status', 'published')
      .not('slug', 'like', 'kids-%')
      .order('published_at', { ascending: false })
      .limit(5000);

    storyRoutes = (stories || []).map((s) => ({
      url: `${base}/story/${s.slug}`,
      lastModified: s.published_at || s.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));
  } catch (err) { … }

  return [...staticRoutes, ...storyRoutes];
}
```

Note: the master-list concern "sitemap enumerates only `/` and `/browse`" is partly stale — articles are already enumerated. The live gap is categories + `/contact` (new) and stale `/profile/settings` / other anon-dead paths. Also `/search` and `/login` / `/signup` don't belong in a sitemap (robots.txt already marks `/login` off, and `/search` is content-less without a query).

### Proposed code

```js
import { createClient } from '../lib/supabase/server';

export default async function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';

  // Public-facing, index-worthy anon routes only. `/search`, `/login`,
  // `/signup` removed — they hold no indexable content. `/contact` added
  // (Round D H-11). `/kids` kept — it is the marketing entry for Kids
  // Mode even though the app routes live under it.
  const staticRoutes = [
    '', '/browse', '/kids', '/how-it-works', '/contact',
    '/privacy', '/terms', '/cookies', '/dmca', '/accessibility',
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '' ? 'hourly' : 'weekly',
    priority: path === '' ? 1.0 : 0.6,
  }));

  let storyRoutes = [];
  let categoryRoutes = [];
  try {
    const supabase = createClient();

    const [{ data: stories }, { data: categories }] = await Promise.all([
      supabase
        .from('articles')
        .select('slug, published_at, updated_at, created_at')
        .eq('status', 'published')
        .not('slug', 'like', 'kids-%')
        .order('published_at', { ascending: false })
        .limit(5000),
      supabase
        .from('categories')
        .select('slug, updated_at, created_at')
        .eq('is_active', true)
        .not('slug', 'like', 'kids-%')
        .order('slug', { ascending: true }),
    ]);

    storyRoutes = (stories || []).map((s) => ({
      url: `${base}/story/${s.slug}`,
      // Prefer updated_at when set — story edits should nudge crawlers.
      lastModified: s.updated_at || s.published_at || s.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    categoryRoutes = (categories || []).map((c) => ({
      url: `${base}/category/${c.slug}`,
      lastModified: c.updated_at || c.created_at || new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    }));
  } catch (err) {
    console.error('[sitemap] failed to fetch dynamic routes:', err?.message || err);
  }

  return [...staticRoutes, ...storyRoutes, ...categoryRoutes];
}
```

Owner-side: confirm `NEXT_PUBLIC_SITE_URL` is set on Vercel prod (flagged in attack plan). A curl of `/sitemap.xml` on the staging host pre-cutover is the verification step.

### Why

Google + App Store SEO both need article + category URLs enumerated for discovery. Adding category pages and removing non-indexable routes (login/signup/search) lifts crawl coverage without leaking admin surfaces. Preferring `updated_at` over `published_at` means edit passes show up in search indexes.

---

## H-14 — delete home search banner + widen top-nav search gate

### Target files
- `site/src/app/page.tsx:220, 457, 491-525` (delete dead `searchVerifyPrompt` state + banner)
- `site/src/app/NavWrapper.tsx:307` (widen gate)

### Current code

`page.tsx:220`:

```tsx
const [searchVerifyPrompt, setSearchVerifyPrompt] = useState<boolean>(false);
```

`page.tsx:457`:

```tsx
if (!loggedIn) { window.location.href = '/login'; return; }
if (!canSearch) { setSearchVerifyPrompt(true); return; }
setSearchOpen(true);
```

`page.tsx:500-525`: the "Verify your email to search articles." yellow banner + resend-verification button, plus the dismiss x-button.

`NavWrapper.tsx:307`:

```tsx
{loggedIn && canSearch && path === '/' && (
  <a href="/search" aria-label="Search" …>
```

### Proposed code

Delete unused state + banner in `page.tsx`:

```tsx
// Remove from the useState block at line 220:
// const [searchVerifyPrompt, setSearchVerifyPrompt] = useState<boolean>(false);
// const [verifyResendBusy, setVerifyResendBusy] = useState<boolean>(false);
// const [verifyResendMsg, setVerifyResendMsg] = useState<string>('');

// Simplify the search-open handler (line 457):
if (!loggedIn) { window.location.href = '/login'; return; }
if (!canSearch) { window.location.href = '/verify-email'; return; }
setSearchOpen(true);
setTimeout(() => searchInputRef.current?.focus(), 100);

// Delete the entire `{searchVerifyPrompt && !canSearch && ( … )}` block
// spanning lines 500-525.
```

Widen top-nav gate in `NavWrapper.tsx:307`:

```tsx
{loggedIn && canSearch && (
  <a href="/search" aria-label="Search" …>
```

(removes the `&& path === '/'` clause — icon now shows on every non-kid route.)

### Decision on H-14 direction

**Allow search on all pages for verified signed-in users.** The home-only gate was a layout leftover from when the home page owned its own sticky search bar; once the search entry point moved into NavWrapper's global top bar, restricting it to `/` just means verified users on `/story/[slug]`, `/browse`, `/category/[id]`, etc. have no quick path back into search. Permission-level gating (`search.basic`) already handles who can search; path-level gating adds nothing beyond friction.

Kid-mode is already handled because `showTopBar` is false on `/kids/*` routes (confirmed at NavWrapper.tsx comments around line 290). Admin routes likewise set their own chrome; the global top bar does not appear there either.

### Why

The yellow home banner is dead UI per the code comment at `page.tsx:491-498` confirming the sticky search moved to NavWrapper. The state + banner remain wired but no path surfaces them to users on first paint, and the ones that do (resend-verification) belong on `/verify-email` rather than inline on the home feed. Ungating the top-nav icon matches user expectation that the search magnifier is always present when the user has permission.

---

## H-18 — story page `<title>` updates

### Target file
- `site/src/app/story/[slug]/layout.js` (already has `generateMetadata`)

### Current state

`layout.js` **already exports** `generateMetadata({ params })` and resolves the story title, description, canonical, OG image, Twitter card — verified in file read. Sample:

```js
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const supabase = createClient();

  const { data: story } = await supabase
    .from('articles')
    .select('title, excerpt, published_at, cover_image_url, cover_image_alt')
    .eq('slug', slug)
    .maybeSingle();

  if (!story) return { title: 'Article not found — Verity Post' };

  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  const title = `${story.title} — Verity Post`;
  …
  return { title, description, alternates: { canonical: path }, openGraph: { … }, twitter: { … } };
}
```

### Proposed action

**No code change required for H-18.** The master-list entry cites "reviewer tested and tab title stayed at root." Verify on live once C-01 + H-06 + H-14 land: hit `/story/<slug>` on prod, open a second tab to a published story, check document title and `<meta name="description">` in head. If the title still shows the root default, the issue is that the story page is a client component (`'use client'` at `page.tsx:4`) and Next might be short-circuiting the layout's metadata — but based on App Router semantics, `generateMetadata` on a parent `layout.js` applies to all descendants whether the child is a server or client component.

If verification fails after other Round D items land: add `generateMetadata` directly inside `page.tsx` is **not possible** because the page is `'use client'`. Instead, split the page — move the fetch + header rendering into a new server component and push the interactive body into a client child component. That is a larger refactor outside Round D scope and should be logged as a follow-up, not blended in here.

### Why

The metadata export already exists. Flagging as "done pending live verification" matches the owner-sequences-work rule (don't re-fix something that reads as fixed; verify and move on).

---

## H-19 — rate-limit the access-request insert

### Target files
- New file `site/src/app/api/access-request/route.js` (POST handler with IP rate limit)
- Caller surface: whatever signup / waitlist form currently writes directly to `access_requests` — grepping `site/src` turns up no client-side writer, which suggests this is either unwired today (form exists but no submit path) or the write was going through a raw PostgREST call. Either way, shipping the API route is harmless; existing RLS stays permissive so any direct-PostgREST caller keeps working during the transition.

### Current state

RLS policy on `access_requests` is intentionally `with_check = true` for anon (confirmed via advisor and the attack plan). Table-level INSERT is held by anon so the anon client can write directly. No rate-limit layer exists between anon and the insert.

Supabase advisor flags `rls_policy_always_true` on `access_requests_insert` as High.

### Proposed code

```js
// site/src/app/api/access-request/route.js
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { truncateIpV4 } from '@/lib/apiErrors';

// Anon waitlist / access-request intake. The underlying RLS policy is
// intentionally permissive (anon writes are the product), so the
// defence-in-depth layer is this route: per-IP rate limit + field
// validation + truncated IP logging for abuse correlation.
export async function POST(request) {
  const ip = await getClientIp();
  const service = createServiceClient();

  // 3 submissions per IP per hour. Legitimate signup-flow retries (typos,
  // network errors) comfortably fit; bulk enumeration does not.
  const rl = await checkRateLimit(service, {
    key: `access_request:ip:${ip}`,
    max: 3,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in an hour.' },
      { status: 429 },
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : null;
  const referral = typeof body?.referral_source === 'string' ? body.referral_source.trim().slice(0, 80) : null;
  const type = typeof body?.type === 'string' ? body.type.trim().slice(0, 40) : 'general';

  if (!email || !email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const { error } = await service.from('access_requests').insert({
    email,
    name,
    reason,
    referral_source: referral,
    type,
    status: 'pending',
    ip_address: truncateIpV4(ip),
    user_agent: request.headers.get('user-agent')?.slice(0, 1000) || null,
  });

  if (error) {
    console.error('[api/access-request] insert failed:', error.message);
    return NextResponse.json({ error: 'Could not submit. Try again later.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

### Why

The RLS `with_check = true` is load-bearing — anon writes are the product feature. Rate-limiting in front of the insert is the right defence layer. Using the existing `checkRateLimit` helper keeps the route consistent with `/api/errors`, `/api/auth/check-email`, `/api/ads/impression`, and the 10 other anon-facing rate-limited routes already in the codebase.

No RLS change is required. The `rls_policy_always_true` advisor warning will remain — it is a deliberate policy choice documented in the attack plan. A comment on the policy explaining "rate-limit enforced in /api/access-request" is worth adding when the migration round touches that table.

Follow-up worth noting (not in Round D scope): if a client-side form exists and writes directly via the anon Supabase client, that caller should be flipped to POST to this route. Ship the route first; do the caller flip in a follow-up commit so the route is verified in isolation.

---

## sitemap.ts structure proposal (summary)

Filename note: `sitemap.js` is the actual on-disk name. The planner prompt said `sitemap.ts` — confirmed not present; keeping `.js` preserves existing module resolution without a rename-and-redeploy dance.

Queries (one DB round-trip via `Promise.all`):

1. `articles` — `slug, published_at, updated_at, created_at` where `status='published'` and `slug NOT LIKE 'kids-%'`, ordered by `published_at DESC`, limit 5000.
2. `categories` — `slug, updated_at, created_at` where `is_active=true` and `slug NOT LIKE 'kids-%'`, ordered by `slug`.

Output shape (per entry): `{ url, lastModified, changeFrequency, priority }`.

Static routes trimmed: drop `/search`, `/login`, `/signup` (not indexable / off-limits per `robots.js`). Add `/contact` after H-11 lands.

Owner-side verification (not code): curl `https://veritypost.com/sitemap.xml` post-deploy, confirm host is prod and entry count matches `published AND NOT kids-% AND active categories`.

---

## Middleware allowlist diff for H-11

**No middleware change is proposed.** The recommendation is the public `/contact` route, which is outside `PROTECTED_PREFIXES` by default and therefore needs no allowlist entry.

For reference, if the other direction were taken (allowlist `/profile/contact`), the minimal patch would look like this — included only so the trade-off is explicit, not because it is the recommended path:

```js
// site/src/middleware.js
const PROTECTED_PREFIXES = [
  '/admin',
  '/profile',
  '/messages',
  '/bookmarks',
];

// Paths inside PROTECTED_PREFIXES that are publicly accessible.
const PUBLIC_ALLOWLIST = [
  '/profile/contact',
];

function isProtected(pathname) {
  if (PUBLIC_ALLOWLIST.includes(pathname)) return false;
  return PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(prefix + '/')
  );
}
```

Why rejected: `/profile/contact/page.js` posts to `/api/support` which itself requires auth, the UI chrome matches the authenticated profile tree, and punching holes in `PROTECTED_PREFIXES` invites more of the same. The new-page path is stricter about keeping anon-surface small.

---

## Decision on H-14 — allow search on all pages for verified signed-in users

Recommendation: **allow on all pages.**

Justification:
- Permission layer (`search.basic`) already gates who can search. Adding a path-level gate is redundant.
- The home-only gate was a layout artifact from when `/` had its own sticky search row; the `page === '/'` check became stale the moment NavWrapper took over the entry point.
- Retention: verified users reading a story are exactly the users most likely to want to search next. Friction here is worse than the alternative (one more icon in the nav on routes that used to hide it).
- Kid routes are already excluded because `showTopBar` is false under `/kids/*`. Admin routes render their own chrome. No additional route-specific suppression needed.
- Risk: the icon will appear on `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` for users already logged in but on those pages for email-change flows. Acceptable — if they are logged in, the search icon working is not confusing. If the team wants to cleanly hide it on auth routes, that is a one-line `path.startsWith('/login')`-style guard and can be done post-launch.

---

## Verification checklist (for whoever implements)

- `curl /status` returns 404 (or whatever `not-found.js` returns).
- Footer renders without a Status link; Contact link goes to `/contact`.
- `curl /contact` as anon returns 200.
- POST `/api/stripe/checkout` with `success_url=https://evil.com` — inspect the returned Stripe session; confirm success URL is the app origin, not the attacker URL.
- Load `/story/<any-published-slug>` — document title + OG tags reflect the article.
- `curl /sitemap.xml` — entry count > (articles + categories + 10 static).
- POST `/api/access-request` four times in a minute from the same IP — fourth returns 429.
- Signed-in verified user on `/story/<slug>` — search icon visible in top bar; clicking lands on `/search`.
- Home page no longer renders the yellow verify-to-search banner in any state.

---

## Files touched (count)

- Delete: `site/src/app/status/page.tsx` (and parent dir).
- Edit: `site/src/app/NavWrapper.tsx` (footer link array + top-bar search gate).
- Edit: `site/src/app/api/stripe/checkout/route.js` (drop body-sourced URLs).
- Edit: `site/src/app/sitemap.js` (add category query, trim non-indexable static routes, add `/contact`).
- Edit: `site/src/app/page.tsx` (delete `searchVerifyPrompt` state + banner).
- New: `site/src/app/contact/page.tsx`.
- New: `site/src/app/api/support/public/route.js` (or re-use `/api/support` if its auth gate can be softened without regressing `/profile/contact`).
- New: `site/src/app/api/access-request/route.js`.
- Touch-free: `site/src/app/story/[slug]/layout.js` (already has `generateMetadata` — verify-only).

Count: 5 edits, 3 new files, 1 deletion, 1 verify-only. Total surface: 10 files.
