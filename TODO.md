# TODO — outstanding work (web + cross-platform)

iOS-specific work lives in [`TODO-IOS.md`](./TODO-IOS.md). Items here are web-only or cross-platform-with-an-iOS-touch (in which case the iOS sub-bullet is noted but the whole item stays here).

## ‼️ README — rules of engagement (read before touching anything)

**This file is a scratch tracker, NOT the source of truth.** It drifts. The code never does.

Before making ANY decision, recommendation, or question, you must:

1. **Read the actual code.** Open the files. Quote verbatim. Do not infer from this doc, from memory, from prior agent reports, or from a previous session. Re-grep, re-read, re-verify.

2. **Look at every surface that might be touched, not just the obvious one.** Minimum sweep:
   - **Local web code** — `web/src/` (app routes, components, lib, types, middleware, next.config.js, package.json, globals.css)
   - **iOS adult** — `VerityPost/VerityPost/` (Swift sources, `.xcodeproj/project.pbxproj`, `Info.plist`, `*.entitlements`)
   - **iOS kids** — `VerityPostKids/VerityPostKids/` (separate target, separate decisions)
   - **Supabase** — `web/supabase/migrations/` for schema, the live DB via MCP for actual state (CHECK constraints, row counts, RPC bodies, RLS policies, triggers)
   - **Vercel** — env vars, build settings, edge config, deployment status, runtime logs when debugging
   - **Git** — local `git status` / `git diff` / `git log` to understand uncommitted state + recent intent
   - **Tests** — `web/tests/e2e/` Playwright specs; any selector / route assertion that could silently break
   - **Cross-cutting infra** — `apple-app-site-association`, sitemap.xml, robots.txt, JSON-LD emitters, OG/Twitter metadata, push payload generators, notification.action_url DB writes, email templates, audit log shapes

3. **Trace downstream effects exhaustively.** For every symbol/file/route/column being touched, ask: who imports it? Who reads it? Who writes it? Who persists it? Who shares it externally? Who'll have cached/bookmarked/indexed it? What runs at the edge, what runs at the request, what runs in cron? Where do iOS, web, and the DB diverge today?

4. **Verify the premise before acting.** If this doc claims a callsite is at `file.ts:42`, the agent flagged behavior X, or a prior session shipped Y — re-confirm by opening the file. Doc claims rot; code is current.

5. **Verify named-entity claims before surfacing them to the owner.** Whenever an agent's report (or this doc, or your own draft) personalizes an impact — "user X is affected," "your account," "your test account," "the owner's plan," "the live row at row_id=…," "the function at file.ts:42" — RUN THE LOOKUP first. A single MCP / grep / git-blame query takes seconds. Owner-facing claims about identity are the easiest class of error and the most embarrassing one to surface.

   **Example (2026-05-13):** an adversary agent claimed `pro@veritypost.com` was "the owner's test account" and would silently gain perks from a permission-set migration. Two checks would have caught it: (a) locked memory `user_admin_account.md` says owner's admin email is `admin@veritypost.com` — already in context; (b) a single SQL join (`auth.users` + `user_roles` + `user_permission_sets`) would have shown `pro@veritypost.com` was a seed account with `last_sign_in` = creation day only AND already had direct `{free, pro}` permission_set grants, so the migration's plan-map attach was a no-op for it. Real behavior change: zero. The owner had to point this out because the claim was passed through unverified. **Don't do this. Run the lookup before sending the report.**

6. **Confirm cross-platform applicability explicitly.** Every change must state web ✓/N-A + iOS ✓/N-A + kids iOS ✓/N-A. State "not applicable" with the reason, not silence.

7. **Only ask the owner a question after steps 1–6 are done.** If you can resolve it by reading code, reading the DB, or running a grep — do that first. The owner's time is the most expensive resource; questions are the last resort, not the first.

**Hard rules:**
- Never delete / force-push / drop DB constraints / skip hooks without explicit owner authorization for that exact action.
- Never trust a previous agent's summary as fact — verify against current code before acting on it. This applies double for personalized claims (rule 5).
- If you discover unfamiliar state (a file, a branch, a row, a config), investigate before deleting or overwriting — it may be in-progress work.
- A locked decision in this doc still requires re-reading the affected code before the implementation pass — the decision locks the design, not the surface area.

---

## ⏱ Session resumption — read this on new session start

**Last write: 2026-05-13.**

**Mid-flight (web side, awaiting owner decision before next agent action):**
- **A4 parked 2026-05-13** — owner not ready to decide nav placement. Whole `/directory` ship blocks until nav home decided (or owner says ship as deep-link-only).
- iOS mid-flight item (Ad-Placement Landmine) lives in `TODO-IOS.md` Section B — owner picks revive vs remap vs hybrid.

**Locked decisions (verify with `git log` if unsure):**
- Canonical wordmark = "verity post" (lowercase, space) for visual chrome; "Verity Post LLC" only in legal/copyright contexts.
- Canonical article URL = `/{slug}`. Stage 1 web shipped. Stage 2 iOS pending next iOS release — see `TODO-IOS.md` Section C.
- Desktop nav ≥1280px (G1.1) — parked by owner, will revisit alongside mobile nav redesign.
- iOS = 1:1 view of web for editorial — owner-locked 2026-05-13. Scope (full slot port vs Lead+Cluster only) panel-reviewed and pending owner answer. See `TODO-IOS.md` Section D.

**Where to start a code-pickup session:**
1. Read the README block above (rules of engagement) — every decision passes through the 7 steps.
2. For "what's next to action" on web/cross-platform: Section A (directory ship, A4 owner blocker is the only thing holding it) → G2 → G3. For iOS, switch to `TODO-IOS.md`.
3. Per the rules above, verify line numbers + premise against current code before acting on any item. This doc drifts; code doesn't. `git log --since="2026-05-13"` is authoritative.

---

## Tracker conventions

Marker key:
- `[Owner]` — only you can do (credential-gated, real device, judgment call)
- `[Code]` — I can do once you say go
- `[Verify]` — test / observation step

---

## A — Ship `/directory` (web)

A1 (4 migrations), A2 (types regen), A3 (drop `as any` casts) shipped 2026-05-13. Remaining steps depend on A4.

### A4 — Decide where `/directory` lives in nav `[Owner decision → Code, PARKED 2026-05-13]`

Owner is not ready to decide nav placement. Until this gets answered, `/directory` has no entry point in production — only typing the URL works. Whole A5/A6/A7 sequence stays blocked.

Options for when revisited:
- Header nav link (text: "Directory" or "Browse")
- Home page card row near top
- Hamburger / sections menu item
- No global entry (deep-link from category cards only)

Once you tell me which, I wire it.

### A5 — Local web verification `[Owner, after A4]`

```sh
cd web && npm run dev
```

Hit each surface, confirm renders + tap-through works:

1. `/directory` — pane 1, full categories list
2. `/directory/politics` — deep category, panes 2 + 3
3. `/directory/culture` — flat category, pane 2 collapses gracefully
4. `/admin/editors-edge` — sign in as `admin@veritypost.com`, create an Edge pick, confirm it appears at the top of `/directory/<that-cat>` and disappears after `valid_to`.

The admin nav link is already wired at `web/src/app/admin/page.tsx`.

### A6 — iOS Browse tab verification `[Owner]`

iOS-side verification for the `/directory` ship. Owner runs Xcode build for iPhone simulator. Confirm Browse tab → Categories → Subcategories → Articles tap-through works, Editor's Edge renders at top of articles pane, pull-to-refresh works, iPad landscape uses `NavigationSplitView` 3-column, iPad portrait falls back to `NavigationStack`.

Note: spec said `BrowseRouter.swift`; actual code uses `BrowseState.swift` for the same role. Not a bug — just naming drift.

### A7 — Push commits `[Owner approval → Code]`

After A5 + A6 pass:

```sh
git push origin main
```

This pushes the accumulated commits including the `/directory` build commits + unrelated theme/chrome fixes that have piled up locally. Spot-check before pushing.

---

## B — TestFlight gate for auth commit `e4cad79d`

Moved to `TODO-IOS.md` Section A. Entirely iOS work.

---

## C — Doc drift fixes (small, no risk)

### C1 — Resolve Item 14 mismatch `[Owner decision → Code]`

Outstanding.md says the web mobile search magnifier was shipped. Code shows it was **removed** per your feedback (`NavWrapper.tsx:196–197` comments confirm). Pick one:

- (a) Strike the SHIPPED block from Outstanding.md to match reality
- (b) Re-add the magnifier per the original spec

---

## D — Owner action items, not coding tasks

### D1 — Mint Verity Monthly Stripe price `[Owner]`

`plans.verity_monthly.stripe_price_id IS NULL`. Until you click Mint at `/admin/plans`, the pricing page shows "Subscribe via iOS App" for that tier instead of a Stripe checkout. Credential-gated — I can't shortcut from CLI.

After mint: smoke-test a Stripe checkout in test mode end-to-end.

### D2 — iOS expert-coverage tooltip

Moved to `TODO-IOS.md` Section D.

### D3 — Admin POST auto-expire RPC lift `[Code, defensive — only if needed]`

The admin Editor's Edge POST handler auto-expires the prior pick best-effort with a DB UNIQUE constraint as backstop. If concurrent admin writes collide under real load, lift the auto-expire into a `SECURITY DEFINER` RPC for atomicity. Not needed until you see it break.

---

## E — Owner-paused, do NOT start without explicit go

Per memories `project_admin_rate_limit_cleanup_deferred.md` and `project_unified_search_session_pending.md`:

- **Item 18** — Admin rate-limit cleanup. 10 admin mutations are permission-gated but not rate-limited. Defense-in-depth; not exploitable without admin compromise.
- **Item 19** — Unified search session. One shared lib for home overlay + `/search` page + expert directory + `@-mention` autocomplete.

Both wait for your explicit "the X is back on" signal.

---

## F — Known background debt (not blocking, informational)

11 `TODO(Txxx)` / bare `TODO:` markers in `web/src/` (2026-05-13 audit; T238a resolved this session as obsolete-per-RLS, count was 12). All either owner-blocked, calendar-gated, or working-as-intended. Tracked in code, not file-level. Pick up individually when the relevant gate clears.

Owner-blocked (waiting on explicit go or external prereq):
- **T5** `api/admin/articles/[id]/route.ts:519` — replace article+children writes with `update_admin_article_with_children` RPC. Halted per T5 schema-work runbook.
- **T230** `admin/moderation/page.tsx:26` — per-comment audit trail for hide/unhide. Needs new `moderation_actions` table; halted same as T5.
- **T241** `api/cron/pipeline-cleanup/route.ts:40` — broken-link verification cron for sources. Needs 2 new columns + index + new cron route. Halted same as T5.
- **T287** `lib/featureFlags.js:60` — admin UI for kill-switches at `/admin/system-controls`. Medium scope; defer.
- **T177** `api/billing/cancel/route.js:27` — recent-auth gate for sensitive billing actions. Blocked on missing `/api/auth/re-verify` route; revisit after AUTH-MIGRATION lands.
- **T238b** `api/admin/users/[id]/route.ts:255` — GDPR hard-purge endpoint/cron for rows with `deleted_at < now() - 30d`. Needs content re-attribution to sentinel user. Defer.
- **Pipeline lock RPC** `api/admin/pipeline/generate/route.ts:599` — replace soft application lock with `claim_story_lock_v2` RPC (Wave 7). Safe under single-operator usage; defer.
- **Kids App Store URL** `components/kids/OpenKidsAppButton.tsx:3` — swap to real App Store URL once kids app is published. Owner-track.
- **NCMEC reporting** `lib/ncmec.ts:89` — implement CyberTipline. Legal/ops gate: ESP registration must happen before code. File header has 5-step operator checklist.

Calendar-gated (do nothing yet):
- **auth/confirm grace route** `api/auth/confirm/route.ts:11` — delete after 2026-05-17 (currently a no-op redirect kept for in-flight magic-link clicks from stale email clients).

Working-as-intended (zero-value to touch):
- **Quiz edit pointer** `admin/analytics/page.tsx:348` — comment notes editing happens at `/admin/story-manager`; current button is intentionally `disabled` with a tooltip. Cosmetic comment; leave alone.

---

## Critical path (web + cross-platform)

- **Ship `/directory`:** parked at A4 (owner not ready). When you re-open it: A4 → A5 → A6 → A7.
- iOS critical path lives in `TODO-IOS.md`. Independent track.

No active web-side blocker waiting on you while A4 is parked.

---

## G — Home page outstanding work

### G1 — Owner-decision items (blocked on your call)

#### G1.1 — Desktop nav ≥1280px `[Owner]`
`web/src/app/_home/SectionsMenu.tsx:254-256` hides the SectionsMenu trigger at `min-width: 1280px`. `web/src/app/_home/Sidebar.tsx` exports a 208px category rail but is not imported anywhere — orphaned. Wide-desktop users have no top-nav.

**Owner: parked 2026-05-13 — will revisit alongside mobile sections menu / categories / sub-cats / search redesign.** Two options when revisited:
- (a) Mount `<Sidebar>` in `web/src/app/_home/HomeLayout.tsx` after `<h1 className="vp-rh-sr">` (~30–80 LOC).
- (b) Delete the 1280px hide rule, keep sections trigger always visible (~5–10 LOC).

#### G1.2 — iOS `home_layouts` slot port

Moved to `TODO-IOS.md` Section B. Owner-locked 2026-05-13 (iOS = 1:1 with web for editorial); scope (full port vs Lead+Cluster only) panel-reviewed 2026-05-13 and pending owner answer.

### G2 — Pending bundles `[Code]`


#### G2.6 — Article-page SsrAdCell migration (deferred follow-up)

Client-side DOMPurify sanitization shipped on `Ad.jsx` — XSS gap closed on all 6+ article/sticky/admin callers. Remaining: full SsrAdCell migration (impression accounting + viewability beacon parity with home slots) for the 7 callsites across:
- `web/src/app/[slug]/page.tsx` (2 callsites: article_rail, article_end)
- `web/src/components/article/ArticleSurface.tsx` (2 callsites: article_header, article_in_body — needs hoist via props from server parent since the component is client-side)
- `web/src/components/ArticleQuiz.tsx` (1 callsite + dual-probe pattern)
- `web/src/components/MobileStickyAd.tsx` (1 callsite, root-layout client)
- `web/src/app/category/[id]/page.js` (2 callsites)

**Blocker for full migration:** SsrAdCell only renders `house` ad_network creatives — it returns null for `google_adsense` and third-party `srcDoc` iframe units. Migrating naively would silently drop AdSense + third-party support on those placements. Either extend SsrAdCell to handle all 4 ad_network paths (AdSense via SsrAdSenseCell, third-party via sandboxed iframe SSR), OR defer until AdSense launch decision lands.

#### G2.8b — Email wordmark consolidation (~10 LOC, deliverability-gated)

Email helpers in `web/src/lib/{betaApprovalEmail,accessRequestEmail,magicLinkEmail,waitlistEmail}.ts` still hardcode `'verity post'` in HTML strings AND in `from_name` fields. Same visual wordmark as the JSX surfaces; logically part of G2.8 consolidation.

**Owner check required before shipping:** `from_name` lands in inbox sender headers and can affect deliverability with some providers. If you have a deliverability-driven reason for the exact string (capitalization, spelling, character set), say so. Otherwise this is a straight `import { BRAND_NAME }` + interpolate change.

### G3 — Loose ends `[Code, low priority]`

- **CSS property allowlist parity:** Server (SsrAdCell `AD_SANITIZE_OPTIONS`) validates ~40 CSS properties via regex map. Client (`Ad.jsx` `AD_DOMPURIFY_CONFIG`) admits `style` whole-cloth. Acceptable today (admin-only authoring; iframe sandbox covers third-party). Tighten client to match via `uponSanitizeAttribute` hook if/when third-party / DSP advertiser self-serve lands.
- **Legacy `/story/[slug]/` directory deletion (deferred until 2026-05-19):** `web/src/app/story/[slug]/page.tsx` (redirect), `layout.js`, `opengraph-image.js`, `error.js`, `loading.tsx` are functionally dead-code after the `next.config.js` 308 redirect. Owner rule = ≥30 days in prod before deletion. 308 has been live since ~2026-04-19 (per `fa185a8a` git history), so safe-to-delete date is 2026-05-19. Keep the `next.config.js` redirect forever (load-bearing for old iOS shares + external bookmarks).

### G4 — Final iOS build verification

Moved to `TODO-IOS.md` Section E.
