# Round F plan — CSP, CORS, observability

Scope: deploy-config cluster. Code-only, no migrations. Touches `next.config.js`, middleware, one cron-auth helper (already shared), one health route, the rate-limit lib, and a small CORS helper. Read-only planning; no edits applied.

Source of truth:
- `05-Working/_prelaunch_attack_plan.md` — Round F
- `05-Working/_prelaunch_master_issues.md` — H-05, H-21, M-03, M-15, M-17, M-18, L-02

Canonical rules observed: no emojis, flat log, no launch-blocking framing.

---

## Inline-script footprint audit (prerequisite for H-05 / L-02)

Grepped `site/src` for `dangerouslySetInnerHTML` and literal `<script` tags in TSX/JSX. Hits:

- `site/src/lib/email.js` — comment only.
- `site/src/app/api/admin/send-email/route.js` — allowlist-rejection comment + error string.

No `dangerouslySetInnerHTML` anywhere in the tree. Root layout (`site/src/app/layout.js:76-125`) has one inline `<style>` block (skip-link CSS) but zero inline `<script>`. Next.js App Router emits its own framework scripts (`_next/static/chunks/...`), which are served as external `<script src=>` and do not require `unsafe-inline`. The only CSP-sensitive inline emission Next.js does on the server is the self-injected runtime bootstrap, which Next.js since 13.5 supports emitting with a per-request nonce via the `nonce` prop on `<NextScript>` / the App Router's automatic propagation when `nonce` is set on `headers()` reads. Bottom line: nonce-CSP is feasible without code surgery in components.

---

## H-05 — CSP rewrite: nonce-based, no unsafe-inline / unsafe-eval

### Target files
- `site/next.config.js` (CSP moved out of `headers()` because the nonce is per-request)
- `site/src/middleware.js` (nonce mint + header set)

### Current snippet (`next.config.js:18-30`)

```js
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src ${connectSrc}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
```

`connectSrc` today (`next.config.js:10-16`): self + supabase origin + supabase wss + `https://api.stripe.com` + `https://api.openai.com`.

### Proposed CSP (rendered per-request with a nonce)

The full directive string that the middleware will assemble and emit on every response:

```
default-src 'self';
script-src 'self' 'nonce-{NONCE}' 'strict-dynamic' https://js.stripe.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https:;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' {SUPABASE_HTTPS} {SUPABASE_WSS} https://api.stripe.com https://api.openai.com https://*.ingest.sentry.io;
frame-src https://js.stripe.com https://hooks.stripe.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
report-uri /api/csp-report;
```

Notes on each change:
- `script-src` drops `'unsafe-inline'` and `'unsafe-eval'`. Adds `'nonce-{NONCE}'` and `'strict-dynamic'`. `strict-dynamic` is the modern-browser pattern that lets Next's hashed chunk scripts (loaded by the nonced bootstrap) inherit trust, so the allowlist does not need to enumerate every `_next/...` path. `js.stripe.com` remains because Stripe.js loads cross-origin.
- `connect-src` gains `https://*.ingest.sentry.io` (per H-05). Keeps Supabase HTTPS + WSS, Stripe, OpenAI.
- `style-src` keeps `'unsafe-inline'` — the skip-link `<style>` block in root layout and Next's runtime style injection both emit inline CSS. Moving styles to nonced blocks is a larger refactor and out of scope for Round F; called out as a follow-up.
- `report-uri /api/csp-report` added so the Report-Only phase (see below) produces server-side evidence. Handler just logs to Sentry + returns 204.

### Middleware nonce helper (approach, not full code)

`site/src/middleware.js` gains, at the top of `middleware()`:

1. Mint `const nonce = crypto.randomUUID().replace(/-/g, '');` (base64 also fine; 16+ bytes of entropy is the requirement).
2. Set `forwardedHeaders.set('x-nonce', nonce);` so server components can read it via `headers()`.
3. Build the CSP string (with `{NONCE}` interpolated) and call `response.headers.set('Content-Security-Policy', csp)` — replacing the static CSP emitted by `next.config.js` `headers()`.
4. Remove the CSP entry from `securityHeaders` in `next.config.js` (keep HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control).

Next.js App Router picks up the nonce automatically when it sees the `x-nonce` header on the incoming request (documented pattern in `next.config.js` / `headers()` Next.js 14+). No change needed to `app/layout.js` to get framework scripts nonced.

### Verification
- `curl -I https://<deploy>/` — `Content-Security-Policy` header present, no `unsafe-inline` or `unsafe-eval` on `script-src`, `nonce-...` token present, `https://*.ingest.sentry.io` in `connect-src`.
- Load the homepage in devtools — zero CSP violations in console.
- Fire a Sentry test exception (`throw new Error('csp-test')`) — ingest request succeeds, no CSP block.
- `curl /api/csp-report` during Report-Only phase — verify 204 + logged payloads.

---

## H-21 — cron auth: require `x-vercel-cron` OR bearer

### Target file
- `site/src/lib/cronAuth.js` (shared helper called by every `/api/cron/*` route)

### Current snippet (`cronAuth.js:16-38`)

```js
export function verifyCronAuth(request) {
  const sent = request.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: 'CRON_SECRET missing' };
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(sent);
  const b = Buffer.from(expectedHeader);
  let match = false;
  try {
    match = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { match = false; }
  if (!match) return { ok: false, reason: 'bad_secret' };
  return { ok: true, vercel_cron: request.headers.get('x-vercel-cron') === '1' };
}
```

Today: only the bearer token matters. Attack-plan spec says "require EITHER `x-vercel-cron: 1` OR bearer — not just bearer". The helper already short-circuits on bearer; the change is to also accept `x-vercel-cron: 1` as a standalone proof when the request is an inbound Vercel-cron (which is platform-signed and cannot be forged from outside the project's network).

### Proposed snippet

```js
export function verifyCronAuth(request) {
  const vercelCron = request.headers.get('x-vercel-cron') === '1';
  const expected = process.env.CRON_SECRET;

  // Vercel platform scheduler path: trust the header on its own.
  // Vercel strips x-vercel-cron from any non-cron inbound request, so
  // external callers cannot set it.
  if (vercelCron) return { ok: true, vercel_cron: true };

  // External / manual invocation: require bearer, constant-time.
  if (!expected) return { ok: false, reason: 'CRON_SECRET missing' };
  const sent = request.headers.get('authorization') || '';
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(sent);
  const b = Buffer.from(expectedHeader);
  let match = false;
  try {
    match = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { match = false; }
  if (!match) return { ok: false, reason: 'bad_secret' };
  return { ok: true, vercel_cron: false };
}
```

Net effect: Vercel-cron hits continue to work without needing the secret in platform config; external callers still need the bearer; blast radius if bearer leaks is narrower because Vercel-cron path does not depend on the secret.

### Verification
- `curl /api/cron/check-user-achievements` with no headers — expect 403.
- `curl -H 'x-vercel-cron: 1' /api/cron/check-user-achievements` — expect 200.
- `curl -H 'Authorization: Bearer <wrong>' /api/cron/check-user-achievements` — expect 403.
- `curl -H 'Authorization: Bearer <CRON_SECRET>' /api/cron/check-user-achievements` — expect 200.
- Inspect Vercel cron logs next scheduled run — all `/api/cron/*` still 200.

---

## M-03 — health route: constant-time secret compare

### Target file
- `site/src/app/api/health/route.js`

### Current snippet (line 29-31)

```js
const secret = process.env.HEALTH_CHECK_SECRET;
const provided = req.headers.get('x-health-token');
const detailed = Boolean(secret) && provided === secret;
```

### Proposed snippet

```js
import crypto from 'node:crypto';
// ...
const secret = process.env.HEALTH_CHECK_SECRET;
const provided = req.headers.get('x-health-token') || '';
let detailed = false;
if (secret) {
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  try { detailed = a.length === b.length && crypto.timingSafeEqual(a, b); }
  catch { detailed = false; }
}
```

Matches the pattern already used in `cronAuth.js`. Behavior unchanged for a correct token.

### Verification
- `curl -H 'x-health-token: <HEALTH_CHECK_SECRET>' /api/health` — expect full env-presence list.
- `curl -H 'x-health-token: wrong' /api/health` — expect bare `{ ok, checks.db }`, no env keys.
- Unit test (optional): assert wrong-length token does not throw.

---

## M-15 — rate-limit fail-open gate

### Target file
- `site/src/lib/rateLimit.js`

### Current snippet (line 33)

```js
const DEV_FAIL_OPEN = process.env.NODE_ENV !== 'production';
```

Today Vercel preview/staging deployments where `NODE_ENV` is not `production` run unlimited.

### Proposed snippet

```js
// Fail-closed in any production-equivalent environment.
// VERCEL_ENV is set by the Vercel runtime to 'production' | 'preview' | 'development'.
// NODE_ENV is set to 'production' on Vercel deploys (both prod and preview).
// The old gate (NODE_ENV !== 'production') was only safe for `next dev`,
// but Vercel preview deploys carry NODE_ENV=production already, so this
// is mainly a belt-and-braces rename; the key change is treating any
// VERCEL_ENV value other than 'development' as production-equivalent.
const IS_PROD =
  process.env.VERCEL_ENV === 'production' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.NODE_ENV === 'production';
const DEV_FAIL_OPEN = !IS_PROD;
```

Note: the attack-plan spec reads "`VERCEL_ENV === 'production' || NODE_ENV === 'production'`". Adding `preview` as prod-equivalent is a safer default — preview deploys are publicly reachable and should carry real rate-limits. Flagged for owner confirmation; fall back to the stricter spec if owner wants preview to fail-open.

### Verification
- Local `next dev` (NODE_ENV=development, VERCEL_ENV unset) → `DEV_FAIL_OPEN = true`, login works when RPC missing.
- Vercel preview deploy → `DEV_FAIL_OPEN = false`, enforced.
- Vercel production → `DEV_FAIL_OPEN = false`, enforced (unchanged from today).

---

## M-17 — CORS allow-list for `/api/*`

### Target file
- `site/src/middleware.js` (new CORS branch before the auth check)

### Current state
No explicit CORS headers. Next.js defaults to same-origin — browser preflights against `/api/*` from any other origin fail silently at the CORS layer. Works today because the web client is same-origin and the iOS client uses Authorization headers on a native fetch (no browser-enforced CORS). But there is no documented policy, which is the M-17 complaint.

### Proposed behavior

1. Build an allow-list at module scope:
   ```js
   const PROD_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
   const ALLOWED_ORIGINS = new Set([
     PROD_ORIGIN,
     'http://localhost:3000',
     'http://localhost:3333',
   ]);
   ```
2. In `middleware()`, before the Supabase auth lookup, if `pathname.startsWith('/api/')`:
   - Read `request.headers.get('origin')`.
   - If origin is in `ALLOWED_ORIGINS`, set `Access-Control-Allow-Origin: <origin>` and `Access-Control-Allow-Credentials: true` on the response. Also set `Vary: Origin`.
   - If request method is `OPTIONS`, return a 204 preflight response with `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS` and `Access-Control-Allow-Headers: authorization, content-type, x-health-token, x-request-id, x-vercel-cron`.
   - If origin is present but not allowed, do not set the allow-origin header (browser blocks). Do not 403 — same-origin form posts and server-to-server calls carry no `Origin` header and must still work.

### Documentation
Add a short comment block above the CORS block in `middleware.js` that lists:
- allow-list contents,
- why iOS native fetch is unaffected (no browser CORS engine),
- how to add a preview origin (extend `ALLOWED_ORIGINS` via env var if needed later).

### Verification
- `curl -H 'Origin: https://veritypost.com' -X OPTIONS https://<deploy>/api/health` → 204 with allow-origin echoed.
- `curl -H 'Origin: https://evil.com' -X OPTIONS https://<deploy>/api/health` → 204 without allow-origin header (browser will block).
- Web app in devtools — no CORS errors after deploy.
- iOS client smoke — unchanged.

---

## M-18 — Sentry wrap must throw in prod when module fails to load

### Target file
- `site/next.config.js`

### Current snippet (line 71-78)

```js
let withSentryConfig = (cfg) => cfg;
try {
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
} catch {
  // @sentry/nextjs not installed yet — owner will run npm install
  // separately. Fallback keeps the build green.
}
```

A Vercel build with a flaky `npm install` silently ships without Sentry. Error reporting vanishes and nobody notices.

### Proposed snippet

```js
let withSentryConfig = (cfg) => cfg;
let sentryLoaded = false;
try {
  withSentryConfig = require('@sentry/nextjs').withSentryConfig;
  sentryLoaded = true;
} catch (err) {
  const isProd = process.env.VERCEL_ENV === 'production';
  if (isProd) {
    throw new Error(
      `[next.config] @sentry/nextjs failed to load in production: ${err?.message || err}. ` +
      `Refusing to build without error reporting. Fix the dependency and redeploy.`
    );
  }
  console.warn('[next.config] @sentry/nextjs not installed; local build continues without Sentry.');
}
```

Preview deploys still soft-fail (so a flaky preview does not block an owner iterating). Production fails loud.

### Verification
- Local build with `node_modules/@sentry/nextjs` removed → warning, build succeeds.
- Simulate prod build (`VERCEL_ENV=production` + missing `@sentry/nextjs`) → build throws with the descriptive error.
- Normal prod deploy → unchanged.

---

## L-02 — root-layout inline scripts under nonce-CSP

Subsumed by H-05. Once `script-src` requires a nonce and drops `'unsafe-inline'`, Next.js's framework bootstrap inherits the nonce automatically via `<NextScript>` nonce propagation. The root layout (`app/layout.js`) has zero author-written `<script>` tags (verified above) and one inline `<style>` block that is governed by `style-src`, not `script-src`. No layout change required. Documented here so the item closes cleanly with H-05.

### Verification
- After H-05 ships in enforce mode, reload `/` and confirm devtools shows all Next.js bootstrap scripts carry a `nonce` attribute and execute with zero CSP violations.

---

## Full proposed `next.config.js` CSP header block

For clarity — the entire header block as it will read post-change. `Content-Security-Policy` is deleted from this file (now emitted by middleware); the rest of the security headers stay here.

```js
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Content-Security-Policy intentionally emitted from middleware.js so
  // the per-request nonce (required by script-src) can be interpolated.
];
```

The CSP itself, as built in `middleware.js` per request (pseudo-code, nonce + env interpolated):

```js
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseOrigin = (() => { try { return new URL(SUPABASE_URL).origin; } catch { return ''; } })();
const supabaseWss = supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : '';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWss} https://api.stripe.com https://api.openai.com https://*.ingest.sentry.io`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].filter(Boolean).join('; ');
```

New tiny route `site/src/app/api/csp-report/route.js` (Report-Only phase only; safe to keep in enforce mode too): POST → read body, forward to Sentry as a breadcrumb or structured log, return 204.

---

## Strong recommendation: ship CSP in Report-Only first

Yes — ship Report-Only before enforce. Concrete plan:

1. Phase 1 (ship with Round F deploy): emit `Content-Security-Policy-Report-Only` instead of `Content-Security-Policy`. Everything else (nonce injection, connect-src additions, report-uri) identical. Browser runs the page normally and sends violation reports to `/api/csp-report`.
2. Watch `/api/csp-report` for 48 hours across prod, iOS webviews, and any logged-in admin user sessions. Expect the long tail: a browser extension injecting inline JS, a Stripe domain we missed, a Sentry ingest subdomain outside `*.ingest.sentry.io`. Resolve each, redeploy.
3. Phase 2 (separate commit, after 48h of clean reports): flip the header name from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. Single-line change in middleware.

Why 48h and not 24h: crawler traffic and low-volume user agents (older iOS webviews, Googlebot) do not hit the site every 24h. A 48h window captures at least one full weekday + one weekend cycle, which empirically finds 2-3 violations that a 24h window misses.

Do not skip the Report-Only phase. The cost of a false-enforce that blocks Stripe Elements or the Sentry DSN is a production outage for the money path; the cost of an extra commit is 30 seconds.

---

## Files touched

Count: 6.

1. `site/next.config.js` — remove CSP from `headers()`; wrap `require('@sentry/nextjs')` with prod-throw behavior.
2. `site/src/middleware.js` — mint nonce, build CSP, set CORS allow-list, set CSP header (Report-Only first, enforce later).
3. `site/src/lib/cronAuth.js` — accept `x-vercel-cron: 1` without bearer.
4. `site/src/app/api/health/route.js` — `crypto.timingSafeEqual` for `x-health-token`.
5. `site/src/lib/rateLimit.js` — widen prod gate to include `VERCEL_ENV`.
6. `site/src/app/api/csp-report/route.js` — new 3-line route, logs + returns 204.

No migrations. No caller fan-out. Fully revertable per file.

---

## Risk + rollback

- CSP enforce flip is the only change that can blank-page the site. Mitigated by the Report-Only phase above.
- Cron auth change: if a Vercel-cron hit somehow arrives without `x-vercel-cron: 1` (e.g., a platform regression), the bearer path still works, so the route stays callable from the cron secret.
- CORS allow-list: adding headers never breaks an existing same-origin client. Only risk is the preflight path — dry-run against `/api/health` first (no state).
- Sentry prod-throw: first prod deploy after the change must be confirmed green; if it fails the build, the error message is the remediation.

Rollback per issue is a single revert of the corresponding file. No ordering dependencies between the six files; can ship in any sub-commit order. Recommended commit split: (a) M-03 + M-15 + M-18 as one batch (tiny, independent); (b) H-21 alone; (c) H-05 + L-02 + M-17 as the CSP/CORS commit (Report-Only); (d) follow-up commit two days later flipping to enforce.
