# Pre-launch audit — 2026-04-20

Eight-pass sweep of the web repo before going live with the trimmed launch
surface (home + story + auth flows + legal; everything else hidden).

Source agents:
1. Broken internal links on visible surfaces
2. Env var usage vs `.env.example`
3. `tsc --noEmit`
4. Dev leftovers (console / TODO / placeholders / secrets)
5. API routes called from visible pages
6. Error states on the reader hot path
7. SEO / metadata / sitemap / robots
8. Middleware redirect-chain walkthrough

## The one launch blocker (owner action)

**`NEXT_PUBLIC_SUPABASE_URL` in Vercel is truncated to `.supabase.c` (missing
the trailing `o`).** Every supabase-js call in the browser bundle hits a DNS
lookup that never resolves, so sign-in silently fails after an ~8-second
stall and surfaces as "Invalid credentials". Nothing else works until this
is fixed.

- Vercel → Project → Settings → Environment Variables → `NEXT_PUBLIC_SUPABASE_URL`
- Current: `https://fyiwulqphgmoqullmrfn.supabase.c`
- Correct: `https://fyiwulqphgmoqullmrfn.supabase.co`
- After save: Deployments → latest → ⋯ → **Redeploy** → **uncheck "Use existing Build Cache"**

`NEXT_PUBLIC_*` vars are baked into the bundle at BUILD time — editing the
value without a fresh build still serves the old truncated value.

## Fixes applied in this session (autonomous)

- **`web/.env.example`** — rewritten. Added 12 env vars the code reads
  but the template didn't document (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`,
  `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`,
  `PREVIEW_BYPASS_TOKEN`, `HEALTH_CHECK_SECRET`, `NEXT_PUBLIC_SITE_MODE`,
  `APPLE_ROOT_CA_DER_BASE64`, `APNS_TOPIC`). Commented-out the 8 unused
  Stripe price IDs (DB is source of truth via `plans.stripe_price_id`).
- **`web/src/app/login/page.tsx`** — login now distinguishes a network
  / DNS error from a credentials error. Network errors surface
  "Network error. Check your connection and try again." and DO NOT
  record against the lockout counter. Credentials errors keep the
  original behaviour. Fixes the ambiguity that made the Supabase URL
  typo look like a password bug.
- **`web/src/app/robots.js`** — added `/logout` and `/preview` to the
  disallow list. `/preview` is a bypass route that shouldn't be indexed;
  `/logout` is a session-mutation route with no indexable content.

## Clean passes — nothing to do

- **`tsc --noEmit`** — exit 0, no errors.
- **Broken internal links** — every `href`, `router.push`, and
  `redirect()` on the visible surfaces resolves to an existing route
  or a documented middleware redirect. No loops, no orphans.
- **Middleware redirect chains** — traced 10 scenarios (anon → `/`,
  anon → `/profile`, anon → `/kids`, authed → `/kids`, authed
  non-admin → `/admin`, coming_soon gate, `/preview?token=…`, session
  expiry, `/api/auth/login` POST). No loops. Every redirect target
  exists.
- **API routes called from visible pages** — 13 distinct routes
  checked. Agent flagged two issues (`/api/account/onboarding` missing
  await, `/api/notifications` non-array ids) — BOTH verified as false
  positives. `createClient()` is synchronous in Next 14.2; the
  notifications route already has `Array.isArray(ids)` guard on line 54.
- **Dev leftovers** — no `debugger`, no Stripe test-key fallbacks, no
  hardcoded secrets, no placeholder emails, no localhost URLs outside
  intentional CORS allow-lists. Three `console.log` calls in
  `components/Toast.tsx:110-112` live in the `useToast()` no-provider
  fallback path, which is dead code at runtime (ToastProvider is
  mounted in `layout.js:116`). Not shipping to real users.

## Remaining — owner decision

Items below are real but not launch-blocking. Each lists what, where,
and why it's waiting.

### Env var template polish (low effort)

Now that `.env.example` has been refreshed, verify Vercel Production
has each of the added entries set to real values:

- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — you told me to park Sentry
  as "post-launch," so these can stay unset for now. `next.config.js`
  DOES refuse to build without `@sentry/nextjs` installed in
  production — that dependency exists; it's the DSN that can stay
  blank in env. Build still succeeds.
- `PREVIEW_BYPASS_TOKEN` — set if you ever flip
  `NEXT_PUBLIC_SITE_MODE=coming_soon` again. Unset now = fine.
- `HEALTH_CHECK_SECRET` — optional. Without it `/api/health` only
  returns shallow status; with it, the authenticated call returns
  DB + queue detail.
- `APPLE_ROOT_CA_DER_BASE64` — blocked on Apple dev account anyway.
  Not needed for web launch.

### Error-state polish (moderate effort, several sites)

The reader hot path has systematic "silent failure on Supabase error"
patterns. None of them break the page — they just don't tell the user
when something went wrong. Fix later; not launch-blocking.

- **`src/app/page.tsx:225-226`** — `storiesRes.error` / `allCatsRes.error`
  are logged but feed renders with whatever partial data came back.
  Empty feed + silent error looks identical to "no articles." Post-launch
  improvement: show a retry banner when `error` is set.
- **`src/app/page.tsx:345, 350-353, 363-366`** — `runSearch()` and
  sub-queries destructure `{ data }` only. Network error → silent
  zero-results UI.
- **`src/app/story/[slug]/page.tsx:326`** — `storyErr` logged but code
  only checks `!storyData`. Unlikely to matter but fragile.
- **`src/app/story/[slug]/page.tsx:396`** — `user_passed_article_quiz`
  RPC failure silently locks the (currently-hidden) discussion. Safe
  while quiz+comments are behind `{false && …}`.
- **`src/app/story/[slug]/page.tsx:409-411, 417-429`** — timeline /
  sources / bookmark / plan queries drop the error field. Silent
  fallback to defaults.
- **`src/app/signup/page.tsx:104-106`** — if the auth user is created
  but `/api/auth/signup` then 500s, user sees "Failed to create
  account. Please try again." Retry creates a duplicate auth user.
  Post-launch: detect `error.status === 409` or email-already-exists
  and surface "Try signing in instead?".
- **`src/app/welcome/page.tsx:95`** — network error on initial users
  query redirects to `/verify-email` even if the cause is transient.
  Could loop the user.
- **`src/components/PermissionsProvider.tsx`** — all
  `refreshAllPermissions` failures swallow the error and leave the
  cache stale. `hasPermission(key)` then resolves to `false`, which
  reads as "feature not granted" instead of "resolver down." Gated
  surfaces silently disappear. Worth tightening later; currently
  hidden surfaces soak the impact.
- **`src/app/error.js:9-19`** and **`src/app/global-error.js:10-20`**
  — error-boundary POST to `/api/errors` with `.catch(() => {})`.
  If the endpoint is down, the crash is never logged. Fine for now
  because Sentry is the real telemetry target and Sentry is parked.

### SEO + metadata polish (moderate effort)

- **Home page (`/`) has no dynamic OG image.** `src/app/page.tsx` is
  a client component, so it can't export `metadata`. Social shares
  of the home page inherit the root layout's generic OG (which
  itself has no `images:` entry — only title/description). Fix: add
  a server component layout at `src/app/layout-server.tsx` or wrap
  the feed so a static OG image renders. Story pages DO have
  dynamic OG (`src/app/story/[slug]/opengraph-image.js`) — they're fine.
- **Category pages (`/category/[id]`) same issue.** Client
  component, no per-category OG. Not launch-critical because
  category browse is via the home feed right now.
- **Legal pages (`/privacy`, `/terms`, `/cookies`, `/dmca`,
  `/accessibility`) all client components with no per-page title.**
  Browser tab says "Verity Post — Read. Prove it. Discuss." on
  every legal page. Cosmetic, not blocking.
- **Favicon + apple-touch-icon + PWA icons all missing.** `layout.js`
  + `manifest.js` no longer reference them (cleaned up in
  `434aba5`). When you drop PNGs in `web/public/`, restore the
  `icons` metadata block + manifest `icons: []`.
- **`metadataBase` fallback uses `https://veritypost.com`** in
  layout.js:30. Fine — matches the prod site.

### Stale `.env.example` unused-var note (low effort, cosmetic)

Left the 8 Stripe price ID entries commented-out rather than
deleted, in case the source-of-truth migrates back to env later.
If you're confident DB stays canonical, delete them outright later.
Same for `APNS_BUNDLE_ID` (hardcoded `com.veritypost.app` in
`lib/apns.js`) — currently still in `.env.example` because the
default value is what you want anyway; harmless.

### Post-launch bigger rocks (separate work)

- Flip CSP from Report-Only back to enforce mode. Needs either
  `export const dynamic = 'force-dynamic'` at root layout, or the
  nonce read via `headers().get('x-nonce')` somewhere in the layout
  tree. Current state (Report-Only) still reports violations to
  `/api/csp-report` without blocking. See `434aba5`.
- Sentry activation (env vars above). Parked per owner.
- Stripe live-mode audit + webhook smoke test. Parked per owner.
- Full Vercel config audit (crons, regions, build step). Parked.
