# 15 — Performance Budget

**Owner:** Rauch (primary — Vercel / Next.js performance posture), Abramov (React runtime), Harris (progressive enhancement).
**Depends on:** `00_CHARTER.md`.
**Affects:** every web page. Render strategy, data fetching, image handling, ad loading, bundle sizes, deployment config.

---

## The rule

Verity's competition is Instagram on a commute. If Verity is slower than Instagram, Verity loses the reader. Period.

Rauch in the panel: "Sub-second or bust. The news category has trained readers that sites are slow and bloated. Don't meet that expectation. Smash it. A fast site is a trust signal — 'these people care enough to ship fast code.'"

Harris: "Progressive enhancement means if JavaScript fails, the site still reads. For a news site, that's not a nice-to-have — it's the bar. Readers on phones in basements read news."

## The budgets

### Home page (`/`)

- **First contentful paint:** < 600ms on 4G simulated, < 300ms on cable.
- **Largest contentful paint:** < 1000ms on 4G.
- **Total blocking time:** < 100ms.
- **Cumulative layout shift:** 0. Not "near zero." Zero.
- **Time to interactive:** < 1200ms.
- **Total payload (gzipped):** < 120KB. Preferably < 80KB.
- **JavaScript delivered:** < 60KB gzipped. Preferably < 40KB.
- **Cached at edge:** yes, with a 30-second TTL for public request shape; auth-specific variations bypass cache.

### Story detail page (`/story/[slug]`)

- **First contentful paint:** < 700ms on 4G.
- **Largest contentful paint:** < 1100ms.
- **CLS:** 0.
- **Time to interactive:** < 1500ms.
- **Total payload:** < 180KB (allows for article images).
- **JavaScript:** < 80KB.

### Quiz + comment thread interactions

- **Quiz submit → grading response:** < 500ms P90.
- **Quiz unlock animation:** completes in < 1800ms (per `13_QUIZ_UNLOCK_MOMENT.md`).
- **Comment thread render on open:** < 300ms for first 20 comments.
- **Comment post → visible:** < 400ms P90 (optimistic update, then server confirm).

### Profile / settings / admin

- **First contentful paint:** < 900ms.
- **Time to interactive:** < 1800ms.
- Admin can be slower (lower-traffic, internal). Budget < 2500ms TTI.

### iOS app equivalent

- **App cold start to Home interactive:** < 1500ms on iPhone SE 2020, < 900ms on iPhone 15 Pro.
- **Story detail open from Home tap:** < 400ms perceived (prefetch article body on tap-down, not tap-up).
- **Quiz submit → result:** same 500ms P90 bar.

## The architecture that makes this possible

### Server components first

Next.js 15 App Router supports React Server Components. The home page, story detail, and most reader surfaces should be RSC by default. Only hydrate components that need interactivity (comment composer, quiz, bookmark button).

Currently the codebase uses a mix. The pass should be:

- `app/page.tsx` (home) — RSC. Static masthead, streaming article list.
- `app/story/[slug]/page.tsx` — RSC for body, sources, byline. Client components for quiz, comments, bookmark.
- Auth-gated elements — handle via `Suspense` boundaries so the initial HTML streams.

### Edge-cached data

- `front_page_state` (the 8 slots) is cached at the edge for 30 seconds.
- Article bodies are cached for 1 hour (edited articles bust the cache via a webhook on publish).
- User-specific data (subscription status, bookmarks, permissions) is client-fetched after the shell renders.

### Image strategy

- Articles often have no hero image (per `09_HOME_FEED_REBUILD.md` — restraint). When they do, images are:
  - Served via `next/image`.
  - WebP with AVIF fallback.
  - `priority={true}` only on the hero-slot article.
  - Lazy-loaded for everything else via `loading="lazy"`.
  - Aspect ratio specified in HTML to prevent CLS.

### Ad loading

The free tier carries ads. But ads are the primary performance poison on news sites. Rules:

- Ads never block the initial render.
- Ads render client-side after the article is interactive.
- Ads are confined to designated slots with fixed dimensions (no layout shift).
- Ad script loading is deferred via `next/script strategy="afterInteractive"`.
- House ads (Verity's own upsell cards — see `09_HOME_FEED_REBUILD.md`) are pre-rendered and don't count toward the ad budget.
- Third-party ad scripts are time-budgeted — if an ad hasn't rendered in 3 seconds, the slot is given up as empty.

### Font loading

- System fonts preferred.
- If a custom serif is used for the masthead or body, `font-display: swap` and subsetting to Latin-1 only.
- Font file < 40KB preferably. Variable fonts for weight variation rather than multiple font files.

### Bundle splitting

- Per-route splitting (Next.js default).
- Vendor chunks for React, shared libs.
- Third-party SDKs (Sentry, analytics, Stripe.js) lazy-loaded only on surfaces that need them.
- Quiz component code-split — loaded only when article is opened.
- Admin routes completely split from public routes.

### Service worker (considered, deferred)

Reading offline is a natural fit for a news product. But service workers are complex and bug-prone. Year 1: skip. Year 2: evaluate offline-read for paid tier as a differentiator.

## Accessibility as a performance concern

Dynamic Type on iOS is partly a performance concern — a slow font-scaling pass feels like jank. Use `UIFontMetrics` correctly (kids app does this; adult iOS should too — see `16_ACCESSIBILITY.md`). Performance + accessibility compound.

## Instrumentation

### Core Web Vitals in production

- Real User Monitoring (RUM) via `web-vitals` library reports FCP, LCP, CLS, INP, TTFB to analytics.
- Sentry Performance monitoring.
- Percentile-based — P50 is nice, P90 is the contract.

### Synthetic monitoring

- Lighthouse CI runs on every deploy against the 3 key pages (home, story, profile).
- Fails the build if any metric regresses more than 10% from baseline.

### Budget violations

- PR template requires a performance check for any route-level change.
- Monthly review of P90 metrics across all surfaces. Anything missed becomes a task.

## What to kill

Per recon, a few perf-costly patterns are in the current codebase:

- **`HomePage` imports all categories, subcategories, articles in one go.** Post-home-feed-rebuild (`09_HOME_FEED_REBUILD.md`), home only reads 8 articles from `front_page_state`. Eliminates a big query.
- **Client-side permission polling.** The current `PermissionsProvider` + `refreshAllPermissions` pattern adds to TTFB on authed routes. Look at moving permission data to an HTTP-only cookie with a version hash — client checks version on load, only re-fetches if stale. Reduces an API round-trip on most nav.
- **Sentry DSN required at build time.** `next.config.js` fails the build if SENTRY_DSN missing. Keep for production, but make it optional for dev builds. Already flagged.
- **Large CommentThread.tsx (24.7KB).** Review. Can it be split into `CommentList` + `CommentRow` + `CommentComposer`? (They exist separately per recon. Verify the 24.7KB is actually the thread *integration* and extract further if possible.)
- **Analytics event batch endpoint (`/api/events/batch`).** Fine as-is, but every request should be a sendBeacon so it doesn't block navigation.

## Mobile-specific

- Touch targets ≥ 44pt iOS / 48dp web. (Per CLAUDE.md memory: 13 sub-44pt tap targets, one-day sweep.)
- Interactive elements have `:active` styles for visual tap feedback.
- iOS viewport meta tag correctly set to avoid 300ms tap delay.
- Safari-specific fixes: `-webkit-tap-highlight-color: transparent` applied, and custom active state.

## Acceptance criteria

- [ ] Lighthouse score ≥ 95 on home, story, and profile routes.
- [ ] Home page total payload < 120KB gzipped.
- [ ] LCP P90 < 1000ms on home (measured in real user monitoring over a 7-day window).
- [ ] CLS = 0 on home and story pages.
- [ ] iOS home interactive < 1500ms on iPhone SE 2020.
- [ ] Third-party ad scripts time-budgeted to 3 seconds.
- [ ] Service worker intentionally absent (Year 1 decision logged).
- [ ] Lighthouse CI fails the build on >10% regression from baseline.
- [ ] RUM dashboard exists and is reviewed monthly.

## Risk register

- **Hitting the budgets requires re-architecting a currently-working page.** Mitigation: incremental. Don't rewrite; profile first, fix the biggest regressions, then iterate. The current codebase is not far from these budgets for the static routes.
- **Ad integration breaks CLS target.** Known industry problem. Mitigation: fixed-dimension ad slots with skeleton placeholder. Don't reflow.
- **AdSense loads slow and pushes LCP out.** Mitigation: AdSense on free tier only; lazy-load; never block render; give up slot after 3s.
- **A third-party library (Sentry, Stripe.js) blows the bundle.** Mitigation: bundle analyzer on every PR. Cutline enforced.

## Dependencies

Ship before: the viral moment, if it comes. A fast site is the reason a viral moment converts.
Ship after: token collapse (`08_DESIGN_TOKENS.md`) — consolidated tokens reduce CSS size.
Pairs with: `16_ACCESSIBILITY.md` — A11y and perf compound.

## What this doesn't include

- Backend query performance. `check_rate_limit` and `compute_effective_perms` are fast enough at current scale. Flag for re-evaluation at 100K MAU.
- Supabase connection pooling. Default config assumed. Revisit if we see DB-connection errors.
- CDN choice. Vercel's edge network is the assumption. Reevaluation is out-of-scope here.
