# Outstanding

Running list of things that need to be updated, fixed, or looked at. Curated from the audits and review sessions; not auto-generated. Items are numbered sequentially and grouped by theme. Numbers are stable — don't renumber, just add to the end.

---

## How to work an item

Every item below is a research-and-fix task, not a code instruction. Run it through this discipline:

1. **Trust code, not docs.** This file is a pointer. Don't take the description as truth — go read the actual code, the actual DB schema (via Supabase MCP), and the actual route handlers before deciding what to do. If you find the description is stale, fix the file when you fix the item.
2. **Dispatch a team.** Send at least 3 investigators in parallel before touching anything: one on the implementation surface, one on the downstream effects (callers, listeners, RLS, audit log, analytics, push, email, billing), and one on the upstream effects (what feeds this surface — webhooks, cron, admin tools, other clients). Then dispatch one adversary specifically charged with finding what the investigators missed and what would break a real user.
3. **Pressure-test every path.** For each item, enumerate: signed-in vs anon, web vs iOS adult vs kids iOS, desktop vs mobile, free vs Verity+, owner vs non-owner, normal vs edge (network failure, race, expired token, dead cookie, permission revoked mid-session). Don't only test the happy path.
4. **Cover code + DB + integrations.** Code changes alone are rarely the whole picture. For every fix ask: is there a DB column / RLS policy / migration that needs to move with it? Is there an audit row that should fire? Is there an admin UI that will show stale counts? Is there an iOS contract that diverges? Is there an analytics consumer that breaks?
5. **No half-measures.** If a fix needs server + iOS + web to move together, all three move. If only one is in scope, say "not applicable" for the others explicitly — don't leave it implicit.
6. **No push without owner approval.** Commit when work is verified; don't push until owner says go.

---

## 2. Apple submission readiness for the just-shipped auth changes

The waitlist removal + OTP session-body fix in commit `e4cad79d` is committed locally and not pushed. Before it goes to production and TestFlight, the iOS binary needs to be built, the Swift SDK behavior of `setSession` on iOS 17+ confirmed, and the API change tested end-to-end against the live deploy.

**Prompt for the agent team:**
> Pressure-test the auth changes in commit `e4cad79d` end-to-end on a real iOS build. Verify: (a) anon user can launch the app and reach Home without ever seeing a signup prompt; (b) an iOS user typing the 8-digit code into the OTP field successfully signs in and `client.auth.session` returns the installed session afterward; (c) the tapped-from-email Universal Link path still works; (d) signing out, then signing back in via OTP, works without showing the stale "Check your inbox" card; (e) the audit_log row for an iOS signup tags `client: "ios"` and `signup_source: "ios"`; (f) the web waitlist UI still functions correctly with no regressions. Verify the Supabase Swift SDK 2.43.1 `setSession(accessToken:refreshToken:)` semantics — does it emit `.signedIn` synchronously, async, or both? If it races the auth listener's own `loadUser`, document the race and decide if a fix is needed. Use the methodology above (3 investigators + 1 adversary).

## 4. Analytics distinction between per-login client and durable signup_source

A returning web user who installs iOS and signs in will produce audit_log rows tagged `client: "ios"` even though their canonical `signup_source` is `"web"`. Per-login client and durable origin are now two different things. Any dashboard that conflates them will misattribute iOS logins as iOS acquisitions.

**Prompt for the agent team:**
> Audit every consumer of `audit_log.metadata.client` and `users.raw_user_meta_data.signup_source` (via grep + Supabase MCP). For each, decide whether it wants the per-login client or the durable origin. Fix any that read the wrong field. Build a one-page reference under `/admin/` that explicitly documents the distinction so future analytics queries don't get it wrong. Include funnel reports, cohort retention queries, and any growth dashboard.

## 5. iPad layout — adult app renders phone UI stretched

Owner-stated goal: iPad should look like web desktop, or at least give users the option to swap. Today the iOS adult app has zero `horizontalSizeClass` checks, zero `NavigationSplitView`, zero `userInterfaceIdiom == .pad` branches. On a 12.9" iPad in landscape, the app is a thin column of iPhone UI floating in a sea of white space. Web desktop activates a 2-column article grid at 1180px, a profile sidebar at 860px, and a 3-column home grid at 1100px.

**Prompt for the agent team:**
> Plan and implement iPad-adaptive layouts in the adult iOS app. Recommended path (validate against alternatives): `@Environment(\.horizontalSizeClass)` branches in HomeView, StoryDetailView, ProfileView, SettingsView that mirror web's 720/1100/1180 breakpoints. The article reader's 1024–1179px "awkward zone" comment in `web/src/app/globals.css` is the warning shot — don't replicate that pain on iPad. Investigate whether `NavigationSplitView` is the right primitive for ProfileView's master/detail or if a custom split makes more sense (article reader's sticky timeline rail doesn't fit NavigationSplitView cleanly). Pressure-test every modal (sheets, full-screen covers) at iPad widths — many become absurdly wide and break readability. Cover landscape + portrait + Split View + Slide Over. Cross-platform check: web stays unchanged; kids iOS is out of scope.

## 6. iPad layout — swap-mode toggle

Adjacent to #5. Owner mentioned the option for users to switch between "iPad layout" and "desktop layout" themselves. No scaffolding exists for this today on either platform.

**Prompt for the agent team:**
> After #5 lands, design and build a user-toggleable layout-mode setting. Probable approach: `@AppStorage("ui.layoutMode")` on iOS + a matching setting on web (cookie or `localStorage`), with values `auto | compact | expanded`. Default `auto` (driven by viewport). The other two override regardless of size. Investigate where this setting lives — Settings → Appearance is the natural home, but verify it doesn't conflict with theme persistence. Pressure-test: does flipping mid-session require a re-render of currently-mounted views, or is it OK to require a relaunch? Mobile web user toggling expanded mode on a phone — what should that look like (probably "not supported, snap back to auto")?

## 7. Profile architecture mismatch

Owner-stated goal: iOS adult should look like web mobile. iOS Profile is a 4-tab dashboard (Overview / Activity / Categories / Milestones) sitting below a hero+stats+social+quick-actions+previews stack. Web Profile is a 21-section master/detail shell — same on mobile and desktop, just stacked. These are two completely different mental models. One of them has to move.

**Prompt for the agent team:**
> Decide which architecture wins and migrate the loser. Read both implementations end to end first: `VerityPost/VerityPost/ProfileView.swift` and `web/src/app/profile/_components/ProfileApp.tsx` + `AppShell.tsx`. Investigate which surfaces a real user actually uses (audit log, page-view analytics) before deciding direction. Then dispatch a 3-person expert panel (UX, eng, journalism) per memory `feedback_spec_session_expert_panel_sop.md` to converge on the right model. Implement. Cover: anon vs signed-in, free vs Verity+ vs admin, all 21 web sections' equivalents on iOS, web mobile vs web desktop. iPad inherits from #5.

## 8. Settings IA mismatch

Web shows 21 settings cards in a master/detail drawer (Identity, Security, Password, Emails, MFA, Notifications, Privacy, Billing, Data, etc.). iOS groups everything into 7 parent sections (Account, Preferences, Privacy & Safety, Billing, Expert, About, Danger zone). Same features, fundamentally different information architecture. Owner-stated goal of platform parity means one of them has to move.

**Prompt for the agent team:**
> Reconcile settings IA. Read every card in `web/src/app/profile/settings/_cards/` and every section in `VerityPost/VerityPost/SettingsView.swift`. Map each web card to its iOS equivalent. Identify which web cards don't have an iOS twin (and vice versa) — those are real feature gaps. Either consolidate web to 7 groups or expand iOS to 21 cards; lean iOS toward web's structure since web is the more granular and explicit one. Pressure-test save UX per setting (optimistic / debounced / explicit save), permission gates, and "owner-mode" visibility.

## 12. Typography model mismatch

Web uses fixed-pixel typography (18px body / 1.7 line-height for article prose, 16px elsewhere). iOS uses Dynamic Type so font size scales with the user's accessibility settings. Same article on a user's iPhone with large accessibility text looks dramatically different from the same article on the web. Affects readability, layout overflow, and accessibility posture.

**Prompt for the agent team:**
> Decide whether web should adopt a clamp-based scale (e.g., `clamp(16px, 1rem + 0.2vw, 20px)` and respect user font-size preferences) or whether iOS should pin to a fixed-pixel scale for parity with web. Lean toward web adopting a responsive scale — locking iOS away from Dynamic Type would regress accessibility, which the platform requires for App Store review. Investigate every fixed-pixel value in web's article surface and propose a translation table. Pressure-test at the iOS Dynamic Type extremes (xxxLarge accessibility size) to confirm web's new scale matches.

## 14. Web mobile has no visible search entry point

`NavWrapper.tsx` computes `canSearch` from `hasPermission('search.basic')` (line 199, 283) but never renders a search button. Mobile users can only reach `/search` via direct URL or through the SectionsMenu's internal results listing. iOS does surface a magnifier icon in the top bar (permission-gated).

**Prompt for the agent team:**
> Add a visible search entry to web mobile. Likely placement: top bar, replacing the dead `canSearch` slot. Confirm the icon + permission gate behavior matches iOS. Investigate desktop — does desktop need the icon too, or does SectionsMenu cover it? Pressure-test the unified search session memory note (`project_unified_search_session_pending.md`) — does this feed into that work, or is it a clean small fix that can ship independently?

## 15. Card radius alignment

Web cards are 8px radius (`CommentRow.tsx:603`). iOS uses `VP.radiusMD = 12` and `VP.Radius.md = 10` (`Theme.swift:166, 157`). Small differences (2–4px) but visible on every card. Intent-chip variant of this drift was resolved in the comments-redesign port (chips became text-only mono, no radius); this entry is now narrowed to general card surfaces.

**Prompt for the agent team:**
> Pick one canonical scale and align. Investigate where each side's radius constants are consumed (Theme.swift on iOS, inline styles on web), and decide whether web should introduce CSS custom properties to match iOS's named scale (`--radius-sm`, `--radius-md`, `--radius-pill`). Likely lands alongside the spacing-scale work in item 16 — they're the same design-system harmonization arc.

## 16. Spacing scale alignment

iOS has a formal scale (`VP.Spacing.s0–s10`, 4-base). Web has no central scale — every component hardcodes padding/margin in 8/10/12/14/16/18/20/24/28/40px values per component. Cumulatively jarring at scroll; impossible to refactor consistently.

**Prompt for the agent team:**
> Introduce a CSS custom property spacing scale on web that mirrors iOS's `VP.Spacing` (`--s0` through `--s10`, 4-base). Audit every hardcoded spacing value in `web/src/components/` and `web/src/app/_home/` and either migrate or leave with a `// magic` note explaining why it's intentional. Don't migrate everything in one pass — start with the highest-traffic components (CommentRow, ArticleSurface, HomeLayout) and ship gradually.

## 17. `--p-success` redesign tokens — finish migration or unify with iOS

**Updated 2026-05-12 after a Group F attempt found the old framing was wrong.** The redesign tokens (`--p-success`, `--p-warn`, `--p-danger`, `--p-info`) are NOT unused — they're consumed via `profile/_lib/palette.ts` (`C.success`, `C.warn`, `C.danger`) by at least 8 profile settings cards: MFACard, PasswordCard, BackgroundCard, EmailsCard, DataCard, BillingCard, PrivacyCard. Dropping the tokens would visually break the 2FA indicator, password strength meter, email verification badge, character-count warnings, and danger toggles.

The real drift: web's `--p-success` is `#15803d` (deep green), iOS's `VP.success` is `#22c55e` (brighter green). Web uses `--p-warn: #b45309` (rust), iOS uses `VP.warn: #f59e0b` (amber). Different shades for the same semantic intent.

**Prompt for the agent team:**
> Decide the harmonization direction. Two options: (a) iOS adopts web's hex values for success/warn/danger/info to unify the semantic palette. Cheap and visible — same color across both platforms. (b) Web's profile settings cards migrate from `--p-success` to legacy `--success` (`#22c55e`) so the redesign tokens become unused, then they can be dropped from globals.css. Web would change visible color from #15803d to #22c55e on the affected cards. Cover the four full CSS blocks in `globals.css` (light `:root`, system-dark `@media`, explicit dark `[data-theme="dark"]`, explicit light `[data-theme="light"]`). Also: `--p-success-soft` etc. are used by ArticleQuiz with hex fallbacks — keep those regardless of which option wins.

## 18. Admin rate-limit cleanup (deferred — owner-paused)

Per memory `project_admin_rate_limit_cleanup_deferred.md`: 10 admin mutation endpoints are permission-gated but not rate-limited. Defense-in-depth; not exploitable without admin compromise. Deferred until owner says go.

**Prompt for the agent team:**
> Only execute this item when owner explicitly says "the admin rate-limit cleanup is back on." When it is: enumerate the 10 mutations (grep `/api/admin/.../route.ts` for unguarded POST/PATCH/DELETE handlers), add rate-limit policies in `lib/rateLimits.ts` keyed appropriately (per-actor or per-target), and wire them through `checkRateLimit`. Pressure-test: confirm the rate-limit isn't so tight it locks out a legitimate batch-import admin flow.

## 19. Unified search session (deferred — owner-paused)

Per memory `project_unified_search_session_pending.md`: one shared lib for the home overlay search, the `/search` page, the expert directory, and the `@-mention` autocomplete. Owner-deferred. Pick up when owner says "the search session."

**Prompt for the agent team:**
> Only execute when owner explicitly opens this. When opened: investigate all four search surfaces and propose a single `useUnifiedSearch()` hook (web) + Swift equivalent (iOS) that handles query construction, debounce, permission gating, result shaping. Pressure-test the four surfaces' differing UX contracts (overlay vs page vs autocomplete vs directory) before unifying.

## 20. Verity Monthly Stripe price — mint required

Per memory `project_verity_monthly_stripe_pending.md`: pricing page shows "Subscribe via iOS App" because `plans.verity_monthly.stripe_price_id IS NULL`. Owner must click Mint at `/admin/plans` (credential-gated, can't shortcut from CLI).

**Prompt for the agent team:**
> Owner-action item, not a coding task. When owner is ready, walk through: navigate to `/admin/plans`, locate the Verity Monthly row, click Mint, confirm the resulting `stripe_price_id` populates, reload the pricing page, confirm the "Subscribe via iOS App" copy is gone and the Stripe checkout button is live. Verify the equivalent annual / lifetime plans don't need the same mint. After mint: smoke-test a real checkout in Stripe test mode end to end.

## 21. iOS verifyMagicCode setSession race (low priority)

After the OTP success path lands in commit `e4cad79d`, `client.auth.setSession(...)` may emit a `.signedIn` event that wakes the auth listener (`AuthViewModel.setupAuthListener`). The listener has its own `loadUser` call. My code also calls `loadUser` explicitly right after `setSession`. Both calls hit the same endpoint and are idempotent — wasteful but not incorrect.

**Prompt for the agent team:**
> Confirm Supabase Swift SDK 2.43.1's event emission timing on `setSession`. If `.signedIn` is fired synchronously, the listener and explicit `loadUser` race. Options: (a) leave it (idempotent, ~50ms of wasted bandwidth per signup); (b) gate the listener's `loadUser` behind a "didExplicitlyAuthenticate" flag that the OTP path sets; (c) drop the explicit `loadUser` and let the listener handle it. Lean toward (a) if the SDK's event is reliably synchronous, since the listener will see the same state and exit early. Pressure-test by adding instrumentation to log both `loadUser` callsites and observe in TestFlight.

## 23. Regenerate `web/src/types/database.ts` after recent migrations

The auto-generated Supabase TypeScript types file still references `bookmarks`, `bookmark_collections`, `articles.bookmark_count`, and the seven dropped bookmark functions — all gone from the live DB as of migration `20260512190000`. Same file is also missing the three new `access_requests` columns (`consumed_at`, `consumed_by_user_id`, `consumption_source`) and the `consume_access_request` RPC. The local `as never` casts and inline `Req` type extensions added during the access_requests work were specifically commented as "drop after the next `supabase gen types` run."

**Prompt for the agent team:**
> Run `supabase gen types typescript --linked > web/src/types/database.ts` (or the project's equivalent script) to regenerate the file from the current live schema. Then sweep the codebase for: (a) any `as never` casts on `service.rpc('consume_access_request', ...)` calls — drop the casts now that the function is typed; (b) the `ConsumeUpdate` type alias in `web/src/app/api/admin/access-requests/[id]/approve/route.ts` — replace with bare `TableUpdate<'access_requests'>`; (c) the inline `Req` type extension at the top of `web/src/app/admin/access-requests/page.tsx` that adds `consumed_at`, `consumed_by_user_id`, `consumption_source` — those become part of the generated Row type; (d) the `updateRow as never` cast in the bulk-approve route. Pressure-test by running `tsc --noEmit` before and after the regen — the only error should remain the pre-existing `CommentThread.tsx:921`.
