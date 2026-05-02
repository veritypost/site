# Unit 1 — Home

**Surface(s):** `web/src/app/page.tsx` (+ `_HomeBreakingStrip.tsx`, `_HomeFooter.tsx`, `_HomeFetchFailed.tsx`, `_HomeFirstLoginMoment.tsx`, `_HomeVisitTimestamp.tsx`, `_homeShared.ts`) — wrapped by `NavWrapper.tsx` chrome (top bar + bottom nav + global footer).
**Status:** fixed (Slice 3 shipped 2026-05-02)
**Date:** 2026-05-02
**Anchor:** Slice 3 complete. 35 findings fixed across 7 files (4-stream parallel). 10 MOOT (HomeFirstLoginMoment deleted per DECISION #026). HomeBrokenPinBanner admin signal deferred (TODO in page.tsx). Build + tsc clean.

## Queued questions
*(none yet)*

## Findings

0. [crit] Home page implementation assumes "today's edition" but owner-locked model is **curated front page, any-age** (DECISION #021). Affected: fallback query `gte('published_at', today.startUtc)` (`page.tsx:202,211`), masthead dateline (`page.tsx:321`), footer "That's today's edition." (`_HomeFooter.tsx:40`), empty-state copy (`page.tsx:336`), `editorialToday()` helper (`page.tsx:70-100`), and the file's own header comment (lines 42-49). Touches the entire shape of the page.

1. [polish] HomeFirstLoginMoment overlay hard-codes `background:#fafafa` + `color:#374151` — flashes a near-white screen with mid-gray text on first sign-in regardless of theme. Violates PRINCIPLE §1.1 (dark-mode parity). — `web/src/app/_HomeFirstLoginMoment.tsx:155,165`
2. [polish] Top bar + bottom nav backgrounds are hard-coded `rgba(255,255,255,0.97)` — white floating chrome on a dark page in dark mode. Violates §1.1. **Cross-cutting** (every web surface that renders chrome). — `web/src/app/NavWrapper.tsx:393,423` → also moved to `UI_UX_REVIEW_OUT_OF_WAVE.md` as sweep candidate.
3. [polish] Global footer links + Cookie preferences button render at 11px with no padding — far below 44px hit target. Violates §2.1. **Cross-cutting** (every web surface that shows the footer). — `web/src/app/NavWrapper.tsx:530-563` → sweep candidate.
4. [polish] Empty-state copy "Nothing published today. Check back later." is wrong on two counts: (a) the page isn't bound to "today" (DECISION #021 supersedes the framing), and (b) it has no CTA (§3.2). The reframed empty state should describe a genuine no-curation state and route the reader somewhere real. — `web/src/app/page.tsx:325-337`. *Re-dispatching panel with corrected premise.*
5. [polish] Hero, SupportingCard, and BreakingStrip fall back to `href="#"` when `story.stories?.slug` is null. Silent dead links. Violates §2.3 (no dead buttons). Either filter the fetch (`stories.slug not.is.null`) or render unlinked. — `web/src/app/page.tsx:481`, `:608`, `web/src/app/_HomeBreakingStrip.tsx:39`
6. [polish] Top bar renders today's date next to the wordmark on `/` (`NavWrapper.tsx:588-604`) AND home renders today's `humanDate` masthead (`page.tsx:321`). Both misrepresent the curated front under DECISION #021 — neither is "the edition date." Question becomes: does the home need any dateline at all? *Re-dispatching panel with corrected premise.*
7. [polish] HomeFetchFailed retry button is text-sized — `fontSize:15`, no min-height/padding. Marginal hit target (§2.1). Same pattern in HomeFooter "Browse all categories" link. — `web/src/app/_HomeFetchFailed.tsx:37-54`, `_HomeFooter.tsx:42-55,82-95`
8. [polish] HomeBreakingStrip captures `permsReady` state (`_HomeBreakingStrip.tsx:21,31`) but never reads it — the strip renders unconditionally. The file comment (lines 4-9) says the strip should be suppressed until perms hydrate so the paid-only timestamp doesn't pop in. Either gate the strip render on `permsReady` (per intent) or drop the dead state.

### Findings from 3-agent independent pass (2026-05-02)

**Crit (a11y / dark mode / structure):**
9. [crit] Nested `<main>` landmarks — `layout.js:161` wraps every page in `<main>`, `page.tsx:300` adds another. WCAG violation.
10. [crit] No `<h1>` on the document; hero is `<h2>` and supporting are `<h3>`. Heading-level skip from styled `<p>` masthead → `<h2>` hero → `<h3>` cards. — `page.tsx:550,630`
11. [crit] Hero band hex colors don't adapt to dark mode (`CATEGORY_PALETTE` and `HERO_DEFAULT_BG`). — `page.tsx:110-128,130-134`
12. [crit] `LifecyclePill` hard-codes `#dc2626` / `#d97706` / `#fcd34d` / `#ffffff` instead of theme tokens. — `page.tsx:419-426`
13. [crit] `NewPill` hard-codes `#111` bg / `#ffffff` text — in dark mode (`--p-bg:#0a0a0a`) the pill nearly disappears. — `page.tsx:387-388`
14. [crit] `HomeBreakingStrip` text color hard-coded `#ffffff` + inner BREAKING label `rgba(0,0,0,0.22)` — neither adapts to theme. — `_HomeBreakingStrip.tsx:55,66`
15. [crit] `HomeFirstLoginMoment` JS animation ignores `prefers-reduced-motion` — `setTimeout(1400)` / `setTimeout(1600)` / RAF still run the full 1.6s sequence regardless of OS preference. — `_HomeFirstLoginMoment.tsx:111-142`
16. [crit] First-login overlay uses `aria-live="polite"` but `pointer-events:none` and no role/landmark/escape — sighted users get a fade flash; AT users get one announcement with no way to interact or dismiss. — `_HomeFirstLoginMoment.tsx:158,160`
17. [crit] Hero meta line `rgba(255,255,255,0.55)` (13px) fails WCAG AA against the lighter palette band entries. — `page.tsx:581`
18. [crit] Hero category eyebrow `rgba(255,255,255,0.65)` (11px) fails WCAG AA on lighter palette bands. — `page.tsx:522`
19. [crit] Hero excerpt `rgba(255,255,255,0.80)` (19px) borderline AA on a few palette entries — sample-test before shipping new palette colors. — `page.tsx:569`

**Crit (state coverage / data integrity):**
20. [crit] `top_stories` gate is `topArticles.length > 0` — if a pinned row's joined article is null (RLS-denied / unpublished / deleted), `topArticles` collapses but the gate stays true and date-sort never fallback-triggers. Stale pin = blank edition. — `page.tsx:248,265`
21. [crit] When `topStoriesRes.error` non-null but `storiesRes` succeeds, page silently falls through to date-sort with no admin signal that curation failed. — `page.tsx:247-257`
22. [crit] `fetchFailed = (topArticles.length === 0 && !!storiesRes.error) || fetchThrew` — misses cases where top_stories errors AND date errors AND breaking succeeded; renders broken page with no retry. — `page.tsx:254`
23. [crit] Banned / frozen / locked / deletion-scheduled / muted users see the home with active CTAs ("Browse all categories →", "Create free account →"). `AccountStateBanner` from NavWrapper is the only signal. — `_HomeFooter.tsx` (no flag branching)
24. [crit] `home.breaking_banner.view` permission gate is documented in `page.tsx:13` comment but never actually executed in code — kill-switch is missing. — `_HomeBreakingStrip.tsx`
25. [crit] Admin-created accounts (no organic onboarding) fire `HomeFirstLoginMoment` with "you made it." copy on first visit — admin lands on home with welcome flash. — `_HomeFirstLoginMoment.tsx:20-87`
26. [crit] First-login overlay covers home for 1.6s — visually hides masthead/hero/breaking strip. Even with `pointerEvents:none` underneath, the breaking strip click target is invisible during fade. — `_HomeFirstLoginMoment.tsx:147-176`

**Crit (interaction / hydration / edge cases):**
27. [crit] `HomeFirstLoginMoment` cleanup unmount sets `completedRef.current=true`, short-circuiting the doneTimer that writes `onboarding_completed_at` — if user navigates away before 1.6s elapses, marker is never persisted and moment re-fires on next visit. — `_HomeFirstLoginMoment.tsx:118-141`
28. [crit] HomeFirstLoginMoment second `useEffect` depends on `[copy, userId]` — account-switch mid-animation restarts at opacity 0 mid-flight and writes the *new* user's onboarding marker. — `_HomeFirstLoginMoment.tsx:111-142`
29. [crit] `_HomeFooter` `useAuth()` defaults `{loggedIn:false}` until NavWrapper hydrates — signed-in users see "Create a free account" anon pitch flash before swap to "That's today's edition." Visible content swap, not just chrome. — `_HomeFooter.tsx:19-98`
30. [crit] `timeShort()` runs server-side and renders relative time ("5m ago") in HTML — hydration mismatch on first client render, then permanently stale labels because there's no client tick. — `page.tsx:586,464`, `_HomeBreakingStrip.tsx:94`, `_homeShared.ts:30-43`
31. [crit] Hero band uses `marginLeft:-50vw; width:100vw` — `100vw` includes scrollbar width on Windows/Linux desktop browsers, causing horizontal scroll bar + ~17px overflow. — `page.tsx:486-498`
32. [crit] No protection against duplicate story IDs in `top_stories.articles` — multiple positions pointing to same article cause React key collisions + unstable reconciliation. — `page.tsx:349-359`

**Polish:**
33. [polish] Unverified user (`email_verified=false`) sees signed-in CTAs without verify prompt — HomeFooter only branches on `loggedIn`. — `_HomeFooter.tsx:21`
34. [polish] Web silently completes `onboarding_completed_at` on home view; iOS-side WelcomeView/onboarding may expect to drive completion. Cross-platform parity gap. — `_HomeFirstLoginMoment.tsx:127-129`
35. [polish] Hero `<h2>` `fontSize:40` not responsive — awkward wraps at 320px viewport for any title >~30 chars. — `page.tsx:550-562`
36. [polish] `WebkitLineClamp:2` is webkit-prefixed only — Firefox renders full excerpt, breaks visual rhythm. — `page.tsx:643-660`
37. [polish] First-login copy lowercase mid-sentence ("you've been on the list", "you made it.") — inconsistent with brand voice elsewhere. — `_HomeFirstLoginMoment.tsx:82,87`
38. [polish] HomeFooter anon copy promises "the quiz" but anon on home doesn't know what quiz refers to (no quiz on home). Orphan reference. — `_HomeFooter.tsx:79`
39. [polish] HomeFetchFailed visible text uses `&rsquo;` ("Couldn't") but `aria-label` uses real apostrophe — copy mismatch between visible + screen-reader announcement. — `_HomeFetchFailed.tsx:23,34`
40. [polish] `_HomeVisitTimestamp` cookie write fires on every render including bfcache restore — rapid refresh / Back-button kills "New" pills against legitimately-newer articles. — `_HomeVisitTimestamp.tsx:25-38`
41. [polish] `HomeFirstLoginMoment` catch-path `if (!cancelled) void supabase…update` runs even after `setCopy(null)` — minor logic mismatch with comment intent. — `_HomeFirstLoginMoment.tsx:88-101`
42. [polish] HomeFooter "Browse all categories →" + global footer's "About / How it works / Pricing" both at end of page — two competing closer CTAs. — `_HomeFooter.tsx:42-56` + `NavWrapper.tsx:481-569`
43. [polish] `HomeBreakingStrip` at 320px viewport: BREAKING badge + gap + padding + (paid) timestamp leaves <200px for title; ellipsis fires immediately. — `_HomeBreakingStrip.tsx:48-97`
44. [polish] `HomeBreakingStrip` has no semantic role / `aria-live` — if strip swaps in mid-session screen readers don't announce. — `_HomeBreakingStrip.tsx:38-47`
45. [polish] Supporting card `<h3>` inside `<Link>` — eyebrow + lifecycle pill text concatenate into the link's accessible name with no separator. — `page.tsx:606-664`
46. [polish] `<hr>` between supporting cards renders as semantic "separator" — screen readers announce between every story; noisy on a 12-card list. — `page.tsx:351,667`
47. [polish] No print stylesheet — full-bleed hero band prints as solid color block. — `globals.css` (absent)
48. [polish] `editorialToday()` offset parser doesn't handle 30/45-min timezones — moot once DECISION #021 lands (helper gets dropped). — `page.tsx:80-89`

## Locked answers (decisions for this unit)

- **#0 (curated front model)** — DECISION #021. Drop `editorialToday()`, drop `gte('published_at', today.startUtc)` fallback, replace with most-recent published (no day cutoff). Rewrite header comment lines 42-49.
- **#4 (empty state)** — Render: *"Nothing here yet."* + single link **"Browse →"** to `/browse`. No "today" copy, no "check back."
- **#5 (dead links)** — DECISION #022. Add `stories.slug not.is.null` to all three home queries (today/breaking/top_stories); delete `href="#"` fallbacks in Hero / SupportingCard / BreakingStrip.
- **#6 (dateline)** — DECISION #023. Drop chrome dateline (`NavWrapper.tsx:588-604`) AND masthead dateline (`page.tsx:321`). Per-card `timeShort()` stays.
- **Footer closer** — Signed-in branch: drop the *"That's today's edition."* line entirely. Keep the `/browse` link as the closer. Anon branch unchanged.
- **#8 (BreakingStrip permsReady)** — DECISION #024. Drop `permsReady` state. Update file comment to match accepted-pop-in behavior.
- **#1 (HomeFirstLoginMoment overlay)** — Swap hard-coded `#fafafa` → `var(--p-bg)`, `#374151` → `var(--p-ink-soft)`. Re-verify in light + dark.
- **#7 (HomeFetchFailed retry button)** — Add `minHeight:44`, `padding:'10px 16px'`, `display:'inline-flex'`, `alignItems:'center'`. Same treatment for HomeFooter "Browse" / "Create free account" links.

## Fixes (pending — code not yet edited)

Files to touch when fix pass runs (per locked answers above):

1. `web/src/app/page.tsx` — finding #0, #4, #5, #6 (masthead). Drop `editorialToday()`, rewrite query, rewrite empty state, drop masthead, rewrite header comment.
2. `web/src/app/_HomeFooter.tsx` — footer-closer lock. Drop signed-in *"That's today's edition."* line.
3. `web/src/app/_HomeBreakingStrip.tsx` — finding #5, #8. Drop `permsReady`, add slug-not-null guard, update comment.
4. `web/src/app/_HomeFirstLoginMoment.tsx` — finding #1. Swap hard-coded colors → tokens.
5. `web/src/app/NavWrapper.tsx` — finding #6 (chrome). Drop chrome dateline block.
6. `web/src/app/_HomeFetchFailed.tsx` — finding #7. Bump retry button hit target.

Cross-cutting findings #2 + #3 stay in `UI_UX_REVIEW_OUT_OF_WAVE.md` for wave-end sweep — not touched in this unit.

## Mid-session log
- 2026-05-02 — bucket 4 (cross-cutting) → sweep candidates "white-only chrome backgrounds" (#2) and "11px footer link tap targets" (#3) appended to `UI_UX_REVIEW_OUT_OF_WAVE.md`.
- 2026-05-02 — bucket 3 (revises locked rule) → owner correction "home isn't today-bound" → DECISION #021 appended; finding #0 added (crit); findings #4 + #6 reframed.
- 2026-05-02 — Q4 + Q6 panels re-dispatched with corrected premise; Q5 + Q8 panels valid (run earlier).
- 2026-05-02 — owner approved all four panel synthesis recommendations + footer-closer drop. Locked as DECISIONS #022/#023/#024 + per-unit copy locks. Code edits deferred (per owner: docs only this turn, no push).
- 2026-05-02 — owner asked "are we missing anything" → ran 3-agent independent review pass (a11y / state-coverage / interaction-edge). ~30 net-new findings (#9–#48), 3 cross-cutting (focus-visible outline, form input colors, skeleton shimmer) added to OUT_OF_WAVE. 4 new owner-decision questions (Q9–Q12) surface; panels needed before fix.
- 2026-05-02 — UI_UX_REVIEW.md updated: 3-agent independent review pass is now mandatory per unit (5 agents for deep-coverage units).

## Owner-decision questions Q9–Q12 — panel synthesis (awaiting owner)

- **Q9 (account states)** — Replace anon "Create free account" CTA with state-aware copy when user is **banned** ("View suspension details →"), **frozen** ("Contact support →"), **deletion-scheduled** ("Cancel deletion — N days left →"), or **grace-period** ("Update payment to keep your subscription →"). Locked / muted / unverified stay banner-only (time-bounded or have dedicated surfaces). Browse link untouched in all cases. *3/3 panel agreement on the principle; per-flag detail synthesized from divergence.*
- **Q10 (broken pins)** — At write-time block non-published articles from `top_stories`. At render-time drop null pins silently for readers, top up from date-sort to maintain 12 cards, AND show admin-only inline banner "N pinned stories unavailable — fix in /admin/top-stories". Defer cascade FK constraint to data-integrity sweep. *3/3 panel agreement on admin signal; top-up vs N-1 split resolved by retention bar §8.1.*
- **Q11 (timestamps)** — Static hybrid: server emits relative ("5m ago", "3h ago") for articles <24h, absolute ("May 2") thereafter. Skip client island — solves hydration mismatch structurally because the bucket is static at render time. *3/3 panel agreement on hybrid format; static vs progressive-enhancement split resolved by §5.2 restraint.*
- **Q12 (first-login overlay)** — **LOCKED 2026-05-02:** owner overrode panel synthesis. Scrap the entire component including the referrer-name variant. No social-proof surfacing anywhere outside profile. Locked as DECISIONS #025 (platform-level no-social-proof rule) + #026 (component removal). All 6 failure modes resolved by deletion.
- **Q10 (broken pins)** — **LOCKED 2026-05-02** as DECISION #028: pure manual. Drop null pins silently, render N-1, no auto-top-up. Admin-only inline banner + write-time block for non-published article pins.
- **Q9 (restricted-account CTAs)** — **LOCKED 2026-05-02** as DECISION #027: state-aware CTA matrix for banned/frozen/deletion/grace; banner-only for locked/muted/unverified; Browse always live.
- **Q11 (timestamps)** — **LOCKED 2026-05-02** as DECISION #029: static hybrid — relative <24h, absolute thereafter; no client tick.

All Q9–Q12 owner-decision questions now resolved. Fix pass unblocked.

## Deferred / sweep
- #2, #3 → moved to OUT_OF_WAVE sweep candidates (touch all web units, not home-specific).
