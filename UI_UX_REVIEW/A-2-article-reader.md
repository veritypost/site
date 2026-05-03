# Unit 2 — Article reader (web)

**Surface(s):**
- Routes: `/[slug]` (canonical), `/[slug]?a=<article-id>` (multi-article story), `/story/[slug]` (legacy redirect)
- Page: `web/src/app/[slug]/page.tsx`
- Chrome: `web/src/app/[slug]/loading.tsx`, `error.tsx`, `not-found.tsx`, `_ArticleFetchFailed.tsx`
- Body: `web/src/components/article/ArticleSurface.tsx`
- Picker: `web/src/components/article/StoryArticlePicker.tsx`
- Timeline + sources: `web/src/components/article/{TimelineSection,SourcesSection}.tsx`
- Engagement: `web/src/components/{ArticleEngagementZone,ArticleQuiz,CommentThread,CommentComposer,CommentRow}.tsx`
- Footer: `web/src/components/{ArticleActions,ShareButton,BookmarkButton,NextStoryFooter}.tsx`
- Analytics: `web/src/components/article/ArticleTracker.tsx`, `web/src/components/JsonLd.tsx`

**Status:** fixed (Slices 4+5 shipped 2026-05-02)
**Date:** 2026-05-02
**Anchor:** Slices 4+5 shipped 2026-05-02. 128 findings fixed (1 refuted: #76). All decisions locked to DECISIONS.md #030–#047. Unit status: fixed. Awaiting Wave A verification (Slice 10).

---

## Role × state × permission matrix (deep-coverage requirement)

### Roles (per PRINCIPLE §3.6 + DECISIONS #013–#015)

| Role | Definition | Identifying signal |
|------|------------|--------------------|
| Anon | No session | `user === null` |
| Logged-in (no perms) | Authed, no `comments.write` | bare authed |
| Quiz-passed reader | Authed + passed THIS article's quiz | `user_passed_article_quiz` RPC = true OR `canBypassQuiz` |
| Bookmarker | Authed + `article.bookmark.add` | perm-based |
| Expert (category-bound) | Authed + `is_expert` + matching category | comment row flag |
| Category supervisor | `user_is_supervisor_in(user, category)` | RPC = true |
| Moderator | `comments.flag` / `admin.moderation.view` | perm-based |
| Article editor | `articles.edit` OR `admin.articles.edit.any` | perm-based |
| Owner Mode | DECISION #013, `admin.owner_mode` | bypasses ALL gates |

### Article publication states

| Status | Meaning | Visibility |
|--------|---------|-----------|
| `draft` | unpublished | editors only |
| `published` | live | everyone (subject to age band + body perm) |
| `archived` / other | non-canonical | editors only |
| `deleted_at != null` | soft-deleted | filtered at fetch |
| Age-band: `kids` / `tweens` / `is_kids_safe` | COPPA bucket | indexable=false; engagement zone disabled |

### Comment item states (per CommentThread)

| State | Meaning | Source |
|-------|---------|--------|
| `visible` | normal | `status='visible'` AND `deleted_at IS NULL` |
| `pending` | awaiting moderation | (none of the renderer paths handle this — see finding #6) |
| `flagged` | under review | filter on `status='flagged'` (currently invisible to readers) |
| `hidden` | moderator-hidden | `status='hidden'` (filtered out) |
| `deleted` | author-deleted | body replaced with `[deleted]` marker (line 471–476) |
| `is_context_pinned` | context tag passed threshold | sort-pinned to top |
| `is_expert_question` / `is_expert_reply` | expert badge | filter toggle in header |

### Matrix coverage check

| Cell | Designed? | Notes |
|------|-----------|-------|
| Anon × published article | ✅ | reader + comment thread (read-only) |
| Anon × draft article | ✅ | 404 (line 230) |
| Anon × COPPA article | ⚠️ | Body renders but no engagement zone (line 263). No COPPA messaging — silent absence. Finding #11. |
| Anon × `article.view.body=false` | ⚠️ | Sign-in wall renders (ArticleSurface lines 99–137) but is **only triggered for permission-gated bodies**, never for paid-tier. No paywall surface exists. Finding #15. |
| Logged-in × not-passed × no-quiz article | ✅ | comments visible (gate `quizPassed=false` → composer locked) |
| Logged-in × not-passed × has-quiz | ✅ | quiz card; composer locked until pass |
| Quiz-passed × empty thread | ✅ | "No one has joined" (line 1132) |
| Quiz-passed × thread with comments | ✅ | sorted feed + composer |
| Expert × any state | ✅ | filter toggle visible (line 752) |
| Supervisor × visible comment | ✅ | flag/hide actions (per CommentRow) |
| Moderator × flagged | ❌ | No "review queue" affordance from reader; mod must navigate to `/admin/moderation`. Acceptable for unit 2 — out of scope (handoff to unit 51). |
| Article editor × draft | ✅ | edit link top-right (lines 70–87) |
| Owner Mode × any | ✅ | `canBypassQuiz=true`, view-counter suppression (line 236), bypass quiz gate |
| Anon × multi-article story (`?a=` invalid) | ✅ | redirect (line 128) |
| Logged-in × deleted article | ✅ | 404 |
| Banned/frozen/locked user × write | ❌ | No reader-side affordance — composer renders enabled, errors at submit. Finding #18. |
| Comment author × edit window | ✅ | `handleEdit` (PATCH `/api/comments/[id]`) |
| Comment author × deleted-by-self | ✅ | `[deleted]` marker (line 471–476) |
| Reader × comment with parent + child | ✅ | `renderWithReplies` recursion (line 674) |
| Reader × `comments.section.view=false` | ✅ | "Comments aren't available for your account." (line 645) |
| Realtime-enabled × INSERT during read | ✅ | listener (line 281) |
| Anon × COPPA + signed JsonLd | ✅ | suppressed (line 246) |

### Permission gates verified

- `articles.edit` / `admin.articles.edit.any` → edit link (✅ checked server-side)
- `article.view.body` → body or sign-in wall (⚠️ wall lacks paid-tier branch — finding #15)
- `article.view.sources` / `article.view.timeline` → empty list silently (⚠️ no inline upsell — finding #14)
- `article.bookmark.add` → bookmark button render (✅ but pop-in per #024 — see finding #19)
- `article.view.ad_free` → quiz interstitial (✅ inverted-check)
- `quiz.attempt.start` / `quiz.retake` → quiz availability (✅)
- `comments.section.view` / `score.view_subcategory` / `realtime.subscribe` → thread features (✅)
- `expert.ask` → "Ask an Expert" button (✅)
- `admin.god_mode` (still legacy key — see finding #1)

---

## Queued questions
*(none — fresh unit, no carry-overs from sibling sessions)*

---

## Findings (main session pass)

1. **[crit] Layout violates DECISION #008 + #009 — timeline/sources/discussion are stacked under the article body, not a 75/25 desktop rail or mobile 3-tab.** The desktop reader renders `ArticleSurface` (which embeds `<TimelineSection>` and `<SourcesSection>` AS BOTTOM SECTIONS at `ArticleSurface.tsx:138-139`), then `ArticleActions`, then `ArticleEngagementZone` — all inside a 680px column. There is no right rail, no tab UI, no mobile/desktop split. Both DECISION #008 (desktop 75/25 article + timeline rail) and DECISION #009 (mobile 3 tabs: article / timeline / quiz+discussion, with state persistence per #011) are completely unimplemented. Foundational re-layout required. — `web/src/components/article/ArticleSurface.tsx:69-141`, `web/src/app/[slug]/page.tsx:260-312`

2. **[crit] `not-found.tsx` says "Today's front page" — violates DECISION #021.** Home is a curated front page, not a today-bound edition. Should be "Front page" or "Home". — `web/src/app/[slug]/not-found.tsx:31`

3. **[crit] `NextStoryFooter` says "Back to edition" — violates DECISION #021.** Same edition framing. Should be "Back to home" or "Back to front page". — `web/src/components/NextStoryFooter.tsx:71`

4. **[crit] Legacy `admin.god_mode` permission key still in use — violates DECISION #013.** DECISION #013 locked the rename `admin.god_mode` → `admin.owner_mode`. The article page still calls `hasPermissionServer('admin.god_mode')` for view-counter suppression. — `web/src/app/[slug]/page.tsx:236` (and `useTrack` references the legacy key per Item 11a Phase 3 comment line 234)

5. **[crit] `ArticleEngagementZone` style object has duplicate `marginTop` + `margin` shorthand — `marginTop: 40` is overridden by `margin: '40px auto 0'`.** Effectively no-op but signals dead code; under React strict mode this is a warning trigger. — `web/src/components/ArticleEngagementZone.tsx:33-38`

6. **[parity] Reader has no surface for `pending` / `flagged` comment states.** The fetch filters `status='visible'` (line 167), so a logged-in viewer who reports a comment, returns to the article, and refreshes will see no acknowledgement that their report's targeted comment is now in pending/flagged review. Per PRINCIPLE §3.6, deep-coverage units must designate every state cell. Acceptable behavior is to filter, but the report flow should give the reporter persistent feedback (currently only a 3-second flashMessage at line 499). — `web/src/components/CommentThread.tsx:167`, `:499`

7. **[polish] `ArticleEngagementZone` accepts `currentUserTier` prop but the parent never passes it.** Dead prop drilling. Either pipe through from page.tsx or remove from the type. — `web/src/components/ArticleEngagementZone.tsx:12`, `:68`; `web/src/app/[slug]/page.tsx:299-307` (no `currentUserTier`)

8. **[polish] `not-found.tsx` uses hardcoded hex colors (`#111111`, `#5a5a5a`, `#666666`, `#ffffff`).** Dark mode parity violation per PRINCIPLE §1.1 — sibling files use `var(--text-primary)`, `var(--dim)`, `var(--card)`, etc. — `web/src/app/[slug]/not-found.tsx:24-37`

9. **[polish] `loading.tsx` uses `maxWidth: 720` while real reader is `maxWidth: 680`.** Skeleton width mismatch creates a perceptible re-flow when content lands. — `web/src/app/[slug]/loading.tsx:5` vs `ArticleSurface.tsx:37`

10. **[polish] `error.tsx` and `_ArticleFetchFailed.tsx` are duplicate components — same copy, same layout, same button, only difference is reset() vs router.refresh().** Consolidate into one shared `<ArticleLoadFailure>` taking an `onRetry` prop. — `web/src/app/[slug]/error.tsx:1-45` ≅ `web/src/app/[slug]/_ArticleFetchFailed.tsx:1-43`

11. **[crit] COPPA article × non-COPPA viewer: no chrome explains why engagement is missing.** When `isCoppa=true`, the page silently omits `ArticleActions` + `ArticleEngagementZone` (line 263, 293). No explanation, no link to the kids iOS app, no copy. A logged-in adult who lands on a kids article sees a body and nothing else — no quiz, no comments, no share. Either render a small "This article is for kids — get the Verity Post Kids app" affordance or hide via 404. — `web/src/app/[slug]/page.tsx:263, 293`

12. **[polish] `BookmarkButton` is bookmarked-once-per-mount only — no unbookmark path.** Once `bookmarked=true` the button disables (`disabled={busy || bookmarked}`, line 54) and stays disabled with "Saved" copy. Toggle off / unbookmark is only available via `/bookmarks` page. Acceptable if intentional, but the asymmetry vs iOS expectations on `/article` flows is a parity check. — `web/src/components/BookmarkButton.tsx:31, 54`

13. **[polish] `ArticleActions` placement orphans the bookmark/share row between body and engagement.** Currently appears at `40px-auto-0` margin between TimelineSection (which is INSIDE ArticleSurface) and ArticleEngagementZone. Visual spacing is muddled — actions should attach to the article (top-of-body or sticky) not float in the middle. Compounds with finding #1 — once layout is rail-based, actions go in the article column header. — `web/src/components/ArticleActions.tsx:13`

14. **[parity] Sources/timeline silently empty for users without `article.view.sources`/`article.view.timeline`.** Page passes `[]` arrays (line 290–291). No upsell, no "Sign in for sources", no perk reveal. Per DECISION #024 universal content should render immediately and paid perks pop in — but the current code returns nothing at all for non-paid. Either show an inline upsell card or render the section heading + tease. — `web/src/app/[slug]/page.tsx:290-291`, `SourcesSection.tsx:51`, `TimelineSection.tsx:107`

15. **[parity] No paywall / paid-tier upsell anywhere on the article reader.** Only gates are `article.view.body` (sign-in wall, ArticleSurface line 99) and `article.view.sources/timeline` (silent empty). No "Subscribe to read" / "Upgrade" / paid-tier story exists in the reader. Per DECISIONS #024 + adult subtle gamification register #012, an inline "Sources are part of the paid tier — learn more" tease would respect the rule. Owner-decision question: do paid bodies exist as a real tier and what's the entry-point copy? — `web/src/app/[slug]/page.tsx:140-145`

16. **[polish] `ArticleSurface` sign-in wall hardcodes `#fff`, `#0070f3`, etc.** PRINCIPLE §1.1 dark-mode parity. Use `var(--accent)`, `var(--card)`, etc. — `web/src/components/article/ArticleSurface.tsx:108-135`

17. **[polish] `StoryArticlePicker` doesn't truncate gracefully — clipped at 50 chars + "…" with no tooltip + no `aria-label`.** Screen reader gets only the truncated text. Add `title={article.title}` for hover and `aria-label` if truncated. Also `aria-current="page"` is correct (✅) but the inactive border is hardcoded `transparent`. — `web/src/components/article/StoryArticlePicker.tsx:38, 60`

18. **[crit] No reader-side state for restricted accounts (banned / frozen / muted).** The reader assumes `currentUserId` is enough to render composer + bookmark. A `is_banned` user lands on an article, sees the composer, types, hits Submit, then gets a backend error. Per DECISION #027 (home CTAs respect account state), the reader should respect parallel restricted-state rules at the composer level. — `web/src/components/ArticleEngagementZone.tsx:56-72`, `web/src/components/CommentComposer.tsx` (file not yet read but called from line 771)

19. **[polish] `BookmarkButton` violates DECISION #024 — defers render until perms hydrate.** `if (!currentUserId || !permsReady || !canBookmark) return null;` (line 28). Per #024, paid perks pop in; but the button itself is universal-eligible (any user with the perm). Pop-in here is acceptable, but the use of `permsReady` to delay the render path means the perm check should not gate render — render the disabled state and reveal when perms confirm. Trade-off — leave as-is per #024 acceptable pop-in, but flag for owner review. — `web/src/components/BookmarkButton.tsx:28`

20. **[parity] `ArticleQuiz` + `CommentThread` use `var(--success-text)` and `'#16a34a'` interchangeably for "success".** PRINCIPLE §1.1: use `var(--*)` consistently. — `ArticleQuiz.tsx:69`, `CommentThread.tsx:760`

21. **[crit] `ArticleQuiz.tsx` hardcodes `#ecfdf5` (light-green pass card).** Doesn't render in dark mode. — `ArticleQuiz.tsx:226`, `:233` (color: C.success which is hex)

22. **[polish] Quiz "passed" reveal links to `/browse`** ("Browse for your next article", line 257). Reasonable. But the `#discussion` jump-anchor is a hash and the discussion `id="discussion"` is set on `<section>` at `ArticleEngagementZone.tsx:43, 56`. Verify scroll target lands above the comment header, not below — current id is on the wrapping section, which works. ✅ no-op; flagging for verification. — `ArticleEngagementZone.tsx:43, 56`

23. **[polish] `CommentThread` has hardcoded `#bbb`, `#e5e5e5`, `#fffbeb`, `#fde68a`, `#b45309`, `#dc2626`, `#166534`, `#ecfdf5`, `#bbf7d0`.** Dark-mode parity violation. — `CommentThread.tsx:726, 720, 791, 793, 798, 854, 859-861`

24. **[polish] Dialog overlay uses `rgba(17,17,17,0.85)` not a token.** Same dark-mode concern. — `CommentThread.tsx:1196`

25. **[polish] Quiz card has duplicate "Question N of M" header AND a 3-bar progress strip.** The progress strip at line 344 already conveys the position; the text label at line 340 is redundant. Pick one. — `ArticleQuiz.tsx:340-362`

26. **[polish] Comment composer is mounted ABOVE the comment list.** Reader convention is composer-at-top OR composer-at-bottom (with consistent placement). Currently composer (line 771) renders before the empty-state check + comment feed (line 1117). When the thread has 50+ comments the composer is far above the conversation. Acceptable on web mobile (per #009 it's in the Discussion tab) but worth confirming the desktop pattern. — `CommentThread.tsx:771-779` vs `:1160`

27. **[crit] `quizPassed` defaults to `true` in `CommentThread` props (line 94)** — but the engagement zone passes `false` for anon (line 47). The default-true is a footgun: any future caller forgetting the prop would unlock the composer for unauthenticated readers. Should default to `false` and require explicit pass. — `CommentThread.tsx:69, 94`

28. **[polish] "Ask an Expert" button copy says "+ Ask an Expert"** with the leading `+`. Sibling places (`/expert-queue` not yet reviewed) likely use a different verb. Parity check candidate. — `CommentThread.tsx:783`

29. **[parity] Multi-article picker (`StoryArticlePicker`) sticks horizontal scroll regardless of count.** When 2 articles fit, the row is `overflow-x: auto`, allowing accidental rubber-banding on touch. Should switch to a flex-wrap or no-scroll layout below ~3 articles. — `web/src/components/article/StoryArticlePicker.tsx:24-34`

30. **[polish] `formatDate` in TimelineSection produces "May 2026" — but `formatDate` in StoryArticlePicker produces "May 2, 2026".** Two different date conventions across two adjacent surfaces. Pick one — likely "May 2026" for timeline (period grouping) and "May 2, 2026" for picker (specific publish), but document the rule. — `TimelineSection.tsx:89-98` vs `StoryArticlePicker.tsx:11-15`

31. **[polish] `CommentThread.tsx:189` selects `is_verified_public_figure, is_expert, expert_title` from `public_profiles_v` — but `is_verified_public_figure` is unused in CommentRow rendering (need to verify CommentRow).** Likely a stale select; re-confirm in CommentRow read pass. — `CommentThread.tsx:189`

32. **[polish] Realtime channel name uses `Date.now()` + `Math.random()` (line 278) — fine for uniqueness but adds reconnect noise.** Subsequent unmount/remount creates new channels each time. Acceptable; flagging for awareness. — `CommentThread.tsx:278`

---

---

## Findings (5-agent merge — net-new from independent reviewers)

> Reviewer A = a11y / visual / dark-mode parity
> Reviewer B = state coverage matrix
> Reviewer C = interaction edge cases / hydration / mobile
> Reviewer D = role × state × permission matrix
> Reviewer E = web ↔ iOS adult parity

### Accessibility, visual system, dark-mode parity (Reviewer A net-new)

33. **[crit] No `:focus-visible` styles on any interactive element across the reader.** Inline `outline: 'none'` on textareas/inputs (5+ sites) with no replacement. Keyboard users get no focus indication. Cross-cutting — sweep candidate. — `web/src/components/CommentComposer.tsx:479` (and many others)
34. **[crit] Comment ⋯ menu trigger is ~22×18px, well below PRINCIPLE §2.1 (44px) hit target.** — `web/src/components/CommentRow.tsx:336-355`
35. **[crit] Tag chips (Helpful / Context / Cite-needed / Off-topic) render at ~22px tall** — under PRINCIPLE §2.1. — `web/src/components/CommentRow.tsx:553-564`
36. **[crit] Reply / Agree / Disagree / Edit buttons set `minHeight: 30`** — under hit-target floor. — `web/src/components/CommentRow.tsx:614-650`
37. **[crit] StoryArticlePicker uses `var(--accent-bg, #f0f0f0)` and `var(--muted-foreground, #555)` — these tokens are NOT defined in the project token set.** Fallback hex always wins; no dark-mode adaptation. — `web/src/components/article/StoryArticlePicker.tsx:54-56`
38. **[crit] ArticleSurface admin Edit pill uses `border: '1px solid #ccc'` literal** (not `var(--border)`). — `web/src/components/article/ArticleSurface.tsx:77`
39. **[crit] Loading skeleton bars use `background: 'var(--card)'` with no shimmer.** In dark mode `--card` ≈ page bg → invisible skeleton. Use the project's `vp-skeleton` class instead. — `web/src/app/[slug]/loading.tsx:13-18`
40. **[crit] Mention-autocomplete dropdown forces `background: '#fff'`** with light-tuned shadow — glaring white over dark page. — `web/src/components/CommentComposer.tsx:509`
41. **[crit] Comment context-menu popover hardcodes `background: '#fff'` + light shadow.** — `web/src/components/CommentRow.tsx:363-366`
42. **[crit] Pre-quiz progress bar uses `rgba(17,17,17,0.60)` for completed segments** — invisible against dark-mode bg. — `web/src/components/ArticleQuiz.tsx:354`
43. **[crit] Mute banner pairs `var(--danger-bg)` with hardcoded `color: '#991b1b'`** — text token doesn't flip with bg in dark mode. — `web/src/components/CommentComposer.tsx:536`
44. **[crit] Quiz answer letter chip uses `bg: var(--border)` + `color: var(--dim)` ≈ 3:1 contrast** — fails AA for the 11px glyph. — `web/src/components/ArticleQuiz.tsx:417-418`
45. **[crit] CommentRow timestamp / separator hardcode `#999` / `#ccc`** — fail AA on white, no dark-mode adaptation. — `web/src/components/CommentRow.tsx:311-318`
46. **[crit] StoryArticlePicker tabs lack visible focus ring** — only 2px border-bottom for active state; keyboard users can't see focused tab. — `web/src/components/article/StoryArticlePicker.tsx:46-58`
47. **[crit] Discussion / Sources / Timeline / Quiz card headings all render as `<p>` or `<div>`, not `<h2>`.** Document outline broken; screen readers can't jump by heading. Article body has only the `<h1>`. — `web/src/components/article/SourcesSection.tsx:57`, `TimelineSection.tsx:115`, `ArticleQuiz.tsx:279`, `CommentThread.tsx:723`
48. **[parity] Quiz pass-card scale + translate transition (500ms) has no `prefers-reduced-motion: no-preference` guard.** Comment-stagger does; quiz reveal doesn't. Vestibular-sensitive users get the bounce regardless. — `web/src/components/ArticleQuiz.tsx:472-475`
49. **[polish] Border-radius scale drift: 4 / 5 / 6 / 7 / 8 / 9 / 10 / 12 / 14 / 99** in active use across the reader. Pick a 2-step scale. Cross-cutting — sweep candidate. — `web/src/components/ArticleQuiz.tsx:276,318,510` (repeated across 8+ files)
50. **[polish] Typography scale drift: 10/11/12/13/14/15/16/17/18/20/32/34** in active use. — `web/src/components/CommentRow.tsx:281-313`

### State coverage (Reviewer B net-new)

51. **[crit] Article WITHOUT a quiz: composer locks with "Pass the quiz above to join the discussion" but no quiz card renders.** Logged-in reader sees a permanent dead-end. `quizPassed = hasQuiz ? hasPassed : false` — when `hasQuiz=false`, this is always `false`. — `web/src/components/ArticleEngagementZone.tsx:69`, `web/src/components/CommentComposer.tsx:326-340`
52. **[crit] `quizCountResult.error` swallowed → `hasQuiz=false` silently.** Transient quiz-count failure on a quiz-bearing article puts the reader into the dead-end at #51 with no recovery affordance. — `web/src/app/[slug]/page.tsx:218`
53. **[crit] `passCheckResult.error` swallowed → forces a previously-passed reader to retake** with no error notice. — `web/src/app/[slug]/page.tsx:219`
54. **[crit] Quiz `canStart = hasPermission('quiz.attempt.start')` is synchronous; ArticleQuiz never calls `refreshIfStale`.** Stale empty perm cache renders no quiz panel while CommentThread independently locks the composer behind a non-existent quiz. — `web/src/components/ArticleQuiz.tsx:102`
55. **[crit] Quiz submit failure on the final question leaves all answers locked (`answers[q.id] != null` disables every option)** with only an inline error string — no retry path short of a full refresh. — `web/src/components/ArticleQuiz.tsx:195-199`
56. **[crit] Admin / editor viewing a draft or archived article: full engagement zone suppressed by `status === 'published'` gate** with no banner explaining why or that this article isn't public. Editor cannot QA quiz / discussion before publish. — `web/src/app/[slug]/page.tsx:293`
57. **[crit] `?a=<unpublished-article-id>` 404s the WHOLE story for non-edit readers** instead of redirecting to the published default. — `web/src/app/[slug]/page.tsx:128, 230`
58. **[crit] CommentComposer mute/ban banner copy "while the account notice at the top of the page applies" references an account notice that doesn't exist on the article surface.** — `web/src/components/CommentComposer.tsx:321`
59. **[crit] Comment-load failure renders only a small red string above the empty-state "No one has joined this discussion yet."** Readers can't tell load-failed from zero-comments; no retry. — `web/src/components/CommentThread.tsx:173`
60. **[crit] Anon viewer × empty thread: empty-state copy with NO sign-in CTA.** Auth-gate state has no path forward. — `web/src/components/CommentThread.tsx:1132`
61. **[crit] `ArticleSurface` no-body fallback shows "Sign in to read this article" to logged-in users lacking `article.view.body`.** Mis-labels a permission/tier gate as an auth gate. — `web/src/components/article/ArticleSurface.tsx:108`
62. **[crit] Frozen / deletion-scheduled / email-not-verified / locked account states are not pre-checked by the composer.** Only `is_banned` and active mute are inspected; other restricted states fail at server-side with generic errors. DECISION #027 silently violated on the reader. — `web/src/components/CommentComposer.tsx:86-102`
63. **[crit] Dialog action errors render OUTSIDE the focus-trapped modal** — submit failures inside delete/report/flag/hide/block dialogs are invisible to a focus-trapped user. — `web/src/components/CommentThread.tsx:494, 854`
64. **[crit] `_ArticleFetchFailed.tsx` recovery uses `router.refresh()` against `dynamic = 'force-dynamic'` route** — replays the same failing Promise.all with no backoff; "Try again" loops on persistent failures. — `web/src/app/[slug]/_ArticleFetchFailed.tsx:25`
65. **[polish] Sub-fetch failures (sources / timeline / nearby / category) silently degrade to empty arrays** with no "couldn't load this section" affordance. — `web/src/app/[slug]/page.tsx:212-215`
66. **[polish] Locked sources/timeline ≡ missing sources/timeline visually** — same empty render. No "this section is part of the paid tier" tease distinguishes them. — `web/src/app/[slug]/page.tsx:290-291`
67. **[polish] `ShareButton` clipboard failure is console-logged with zero user feedback.** Safari-without-HTTPS / iframe / permission-denied users silently fail. — `web/src/components/ShareButton.tsx:14`
68. **[polish] Pending / flagged / hidden comment statuses filtered for everyone including supervisors and moderators.** Mods cannot see comments they need to act on from the reader surface. — `web/src/components/CommentThread.tsx:166-170`
69. **[polish] Realtime subscribe failure has no UI surfacing.** User loses live updates with no "reconnecting" indicator. — `web/src/components/CommentThread.tsx:361`
70. **[polish] Muted-author comments not filtered or collapsed on the reader side** — only blocked authors are hidden. — `web/src/components/CommentThread.tsx:652`
71. **[polish] `generateMetadata` exposes draft title/excerpt as OG tags via `articles[0]` fallback** when only drafts exist (page itself 404s). Metadata leaks unpublished drafts. — `web/src/app/[slug]/page.tsx:99-101`

### Interaction / edge cases (Reviewer C net-new)

72. **[crit] StoryArticlePicker `next/link` to `?a=` triggers full client navigation that remounts `ArticleEngagementZone` via `key={article.id}`** — discards in-progress comment drafts and quiz state. **Direct violation of DECISION #011 for multi-article-story switching.** — `web/src/components/article/StoryArticlePicker.tsx:45`, `web/src/app/[slug]/page.tsx:300`
73. **[crit] Realtime UPDATE handler removes the row when status flips to non-visible** — conflicts with local soft-delete that keeps a `[deleted]` placeholder. Same comment vanishes in other tabs but stays as placeholder for the actor. — `web/src/components/CommentThread.tsx:325`
74. **[crit] `handlePosted` inserts the raw POST response without joining `public_profiles_v`** — optimistic comment renders with `users: undefined` and falls back to "user" until reload. — `web/src/components/CommentThread.tsx:563`
75. **[crit] Composer double-submit race: `checkCanMention` awaits BEFORE `setBusy(true)`** — fast double-clicks fire two POSTs. — `web/src/components/CommentComposer.tsx:240`
76. **[REFUTED — verified 2026-05-02]** Embed hint `stories!articles_story_id_fkey(slug)` was claimed to use deprecated suffix, but `web/src/types/database.ts:1750` confirms `foreignKeyName: "articles_story_id_fkey"` matches. Embed resolves correctly. Memory note `feedback_verify_fk_hints_against_schema.md` does not apply to this specific constraint.
77. **[crit] `generateMetadata` and the page handler each call `fetchBySlug` independently with no `cache()` wrap** — every article load runs the story + articles queries TWICE under `dynamic = 'force-dynamic'`. — `web/src/app/[slug]/page.tsx:96, 119`
78. **[crit] Every CommentRow fires its own `/api/settings/public` fetch on mount** — on a 50-row thread that's 50 duplicate requests for a value the parent thread already fetched. — `web/src/components/CommentRow.tsx:157`
79. **[crit] Realtime UPDATE handler reads `alreadyPresent` from inside the `setComments` updater closure** — under StrictMode the updater runs twice; the post-updater branch can fire a duplicate fetch + insert for new visible rows. — `web/src/components/CommentThread.tsx:329`
80. **[crit] Reply-visibility gate uses `comment.thread_depth ?? depth`** — DB-stored depth can drift from actual render position; legacy rows hide Reply at the wrong nesting level. — `web/src/components/CommentRow.tsx:216`
81. **[crit] `bumpQuizCount` writes to a single localStorage `'session'` key shared across all articles, accounts, and tabs on the device** — every-3rd-quiz interstitial cadence is global rather than per-user-per-article. — `web/src/components/ArticleQuiz.tsx:182` + `web/src/lib/session.js`
82. **[crit] BookmarkButton has no GET to seed initial bookmarked state** — reload always shows "Bookmark" even when already bookmarked; clicking again POSTs a duplicate. — `web/src/components/BookmarkButton.tsx:13`
83. **[crit] Modal overlay click-to-close + ESC are wired but body scroll is not locked.** On mobile the article keeps scrolling under a near-opaque overlay. — `web/src/components/CommentThread.tsx:872`
84. **[crit] Quiz `selectOption` guards double-tap with the async `answers[q.id]` value** — two rapid taps in the same render batch both pass through; on the last question the trailing setTimeout submits twice. — `web/src/components/ArticleQuiz.tsx:199-208`
85. **[polish] `error.tsx` declares `error: Error` prop but never uses it.** Failure cause silently dropped. — `web/src/app/[slug]/error.tsx:6`
86. **[polish] Stale `// @migrated-to-permissions 2026-04-18` and `// @feature-verified` markers** across ArticleQuiz / CommentThread / CommentComposer / CommentRow — dead annotations, no linter or runtime use. — `web/src/components/ArticleQuiz.tsx:1`
87. **[polish] CommentComposer shows two slightly different "@mentions are paid" copies** — the footer string and the live banner. — `web/src/components/CommentComposer.tsx:421-444`
88. **[polish] StoryArticlePicker overflow has no fade-mask or scroll-snap** — narrow viewports clip the rightmost tab with no visual cue more articles exist. — `web/src/components/article/StoryArticlePicker.tsx:29`
89. **[polish] `TimelineSection.formatDate` swallows invalid dates with `try/catch` returning ''** — empty date column instead of a stable fallback. — `web/src/components/article/TimelineSection.tsx:90`
90. **[polish] "Sign in to read this article" link to `/login` drops the return path** — sign-in bounces to home instead of back to the article. — `web/src/components/article/ArticleSurface.tsx:110`
91. **[polish] `helpful_badge_threshold` lands AFTER initial render** — first paint can show "Helpful" badges that disappear when the actual threshold lands. — `web/src/components/CommentThread.tsx:126-143`
92. **[polish] Report dialog has fixed `maxWidth: 420` with internal textarea but no max-height / overflow** — small phones with keyboard up push the action buttons off-screen, with no internal scroll. — `web/src/components/CommentThread.tsx:1202-1210`

### Role × state × permission matrix (Reviewer D net-new)

93. **[crit] Owner Mode bypass uses legacy `admin.god_mode` everywhere** — server gate (`auth.js:480`), client cache short-circuit (`permissions.js:204`), this file's view-counter suppression (`page.tsx:236`), `useTrack`, ArticleEngagementZone's `canBypassQuiz` derived from `isGodModeViewer`. **Direct DECISION #013 violation — rename hasn't landed**, requires sweep across `web/src/lib/auth.js`, `web/src/lib/permissions.js`, page.tsx, and supporting code. — `web/src/lib/auth.js:480`, `web/src/lib/permissions.js:204`
94. **[crit] `canBypassQuiz = canEdit || isGodModeViewer`** — category supervisors / moderators / `comments.flag` holders cannot see comments on draft articles (no quiz exists for drafts) and the bypass excludes them. Mod tooling for unpublished/staging is broken. — `web/src/app/[slug]/page.tsx:306`
95. **[crit] CommentComposer collapses two distinct denial reasons into one paid-only message.** A logged-in-no-perms free user (just signed up, no `comments.post` grant) sees "Posting comments requires a Verity subscription" — wrong copy when denial may be RBAC, not paywall. — `web/src/components/CommentComposer.tsx:310-316`
96. **[crit] Anon viewer reaches CommentThread with full `Reply / Agree / Disagree / Tag / Report / Block / ⋯` action chrome rendered** — every click is a no-op. No "sign in to participate" CTA. — `web/src/components/ArticleEngagementZone.tsx:41-52`, `web/src/components/CommentRow.tsx:606-657`
97. **[crit] Soft-deleted article (`deleted_at` non-null) filtered at fetch time** — Owner Mode / editor cannot reach a soft-deleted article via its slug to restore. No Owner-Mode-bypass cell. — `web/src/app/[slug]/page.tsx:79`
98. **[crit] Expert-question / expert-reply blurred preview links anon to `/profile/settings#billing`** — settings requires login; broken cell for anon × expert-reply. — `web/src/components/CommentRow.tsx:512-522`
99. **[crit] Ask-an-Expert button gated only by `expert.ask` permission, NOT by `quizPassed`** — quiz-not-passed user with the perm grant can ask without unlocking discussion (contradicts the quiz-gate brand line). — `web/src/components/CommentThread.tsx:114, 781-785`
100. **[crit] Hide-action confirmation accepts empty `dialog.reason`** — only `flag` and `report` are checked in the disable predicate. Moderators silently send `'moderator action'` placeholder, losing audit detail. — `web/src/components/CommentThread.tsx:1078-1086, 528`
101. **[crit] Pending comment is invisible to its author** — query filters `status: 'visible'` only. Author sees their submitted comment vanish with no "your comment is in review" affordance. — `web/src/components/CommentThread.tsx:166-170`
102. **[crit] Hidden comment vanishes from list with no audit hint, no undo affordance** for the moderator who hid it. — `web/src/components/CommentThread.tsx:534`
103. **[crit] `CommentRow.currentUserVerified=true` is a hardcoded default** — unverified-account state per DECISION #027 cannot disable Report. — `web/src/components/CommentRow.tsx:104, 396`
104. **[crit] DECISION #024 violation — CommentThread waits for `permsLoaded` before initial `loadAll`.** Anon and free users see a skeleton even though their thread render path doesn't depend on perms. — `web/src/components/CommentThread.tsx:271-273, 602-633`
105. **[crit] `editHref` branches on `article.is_kids_safe`** — a mis-tagged adult article with `is_kids_safe=true` routes the editor to `/admin/kids-story-manager` (which they may lack permission to enter). Silent permission contradiction. — `web/src/components/article/ArticleSurface.tsx:64-66`
106. **[crit] Supervisor flag with `category_id=null` (uncategorised article) silently 4xx** — no UI guard. — `web/src/components/CommentThread.tsx:507-510`

### Cross-platform parity (Reviewer E net-new)

107. **[crit] iOS comment-report dialog only ships 5 reasons** (spam / harassment / off_topic / misinformation / other) — **MISSING the 18 U.S.C. § 2258A urgent trio (csam / child_exploitation / grooming)** that the web `reportReasons.js` already added. **CSAM reporting parity gap = legal exposure.** — `VerityPost/VerityPost/BlockService.swift:141-146` (web cite: `web/src/lib/reportReasons.js:18-27`)
108. **[crit] iOS quiz pass triggers `star.fill` symbolEffect bounce + spring "+X points" overlay on adult.** Direct DECISION #012 violation (no celebration scenes / popups on adult). Web is calm. — `VerityPost/VerityPost/StoryDetailView.swift:2140-2161, 2914-2920`
109. **[crit] DECISION #008 layout violation on web — `ArticleSurface` is single 680px column with Timeline + Sources rendered inline below the body.** No 75/25 desktop article+timeline rail. (Already finding #1; restated under parity lens.)
110. **[parity] iOS has no `+ Ask an Expert` affordance** — web exposes it. — `web/src/components/CommentThread.tsx:781-851` (no iOS equivalent)
111. **[parity] iOS has no comment Sort control** (Top / Newest). — `web/src/components/CommentThread.tsx:728-749`
112. **[parity] iOS has no multi-article story picker** — Story model is single-article. If web grows multi-article stories, iOS users won't see siblings. — `web/src/components/article/StoryArticlePicker.tsx`
113. **[parity] iOS has no `comments.section.view` permission gate** — web shows "Comments aren't available for your account." — `web/src/components/CommentThread.tsx:635-650`
114. **[parity] iOS comment context-menu omits Hide-mod / Supervisor-flag** — web exposes them via `admin.comments.hide` + `viewerIsSupervisor`. — `web/src/components/CommentRow.tsx:406-415`
115. **[parity] iOS no-permission-to-post composer state is missing.** Web shows "Posting comments requires a Verity subscription." — `web/src/components/CommentComposer.tsx:310-316`
116. **[polish] Quiz idle copy diverges across platforms.** Web "Unlock the discussion" / "Answer 5 questions about this article. 3 correct unlocks the comment section." vs iOS "Pass to comment." / "5 questions about what you just read. Get 3 right and the conversation opens." — `web/src/components/ArticleQuiz.tsx:279-284`, `StoryDetailView.swift:1112-1115`
117. **[polish] Quiz pass headline diverges.** Web "{n} of {total}. You're in. The conversation is below." vs iOS "Passed — {n} of {total}. Discussion unlocked." — `web/src/components/ArticleQuiz.tsx:486-499`, `StoryDetailView.swift:1196-1198`
118. **[polish] Quiz fail copy + retake CTA diverge.** Web "The bar is 3 to unlock the discussion." + "Take another look and try again" vs iOS "Needed 3 to pass." + "Retake with fresh questions". — `web/src/components/ArticleQuiz.tsx:543, 630`, `StoryDetailView.swift:1198, 1264`
119. **[polish] Composer placeholder diverges.** Web "Add to the discussion." / "Write a reply…" vs iOS single "Join the discussion…". — `web/src/components/CommentComposer.tsx:359`, `StoryDetailView.swift:1580`
120. **[polish] Bookmark label diverges.** Web "Bookmark"/"Saved" vs iOS "Save"/"Saved". — `web/src/components/BookmarkButton.tsx:82`, `StoryDetailView.swift:362`
121. **[polish] Empty-discussion copy diverges.** Web "No one has joined this discussion yet." vs iOS "No comments yet. Be the first to share your thoughts." — `web/src/components/CommentThread.tsx:1132-1133`, `StoryDetailView.swift:1405`
122. **[parity] Restricted-body semantics diverge.** Web treats no-body-perm as "Sign in to read this article" (auth-gate); iOS treats it as "Upgrade to read this article" (plan-gate). Two different mental models on the same gate. — `web/src/components/article/ArticleSurface.tsx:108-135`, `StoryDetailView.swift:687-708`
123. **[polish] Mute-banner copy diverges in specificity.** Web vague ("Posting is disabled while the account notice at the top of the page applies"); iOS specific (when blocked + appeal link). — `web/src/components/CommentComposer.tsx:319-323`, `StoryDetailView.swift:1485-1499`
124. **[parity] Comment-thread header trust signal diverges.** Web shows "{n} comments · quiz-verified" + sort; iOS shows "DISCUSSION" label. — `web/src/components/CommentThread.tsx:713-750`, `StoryDetailView.swift:1357-1360`
125. **[parity] iOS Timeline auto-marks last/explicit event as "NOW" with ring + "Read this coverage" hint** on article-typed entries. Web has no current/now indicator and no read-this-coverage affordance. — `StoryDetailView.swift:1005-1025, 987` vs `web/src/components/article/TimelineSection.tsx`
126. **[parity] Up-Next divergence.** iOS auto-pops a sheet at 95% scroll + after comment-send; web only renders the static "More in [Category]" footer list. — `StoryDetailView.swift:2208-2254, 2299-2312` vs `NextStoryFooter.tsx:12-51`
127. **[parity] Mid-body quiz teaser is iOS-only** — 5-questions-waiting card injected at midpoint of the article body. Web has no equivalent. — `StoryDetailView.swift:2167-2202`
128. **[parity] Reading-progress ribbon is iOS-only** — top accent bar fills with scroll. Web has no equivalent. — `StoryDetailView.swift:2115-2128`
129. **[parity] TTS Listen / Pause / Resume / Stop controls are iOS-only** (`article.tts.play`). Web has no TTS UI even when the perm is held. — `StoryDetailView.swift:783-833`

---

## Fixes

- **Slice 4 — Article reader / Layout overhaul** — shipped 2026-05-02. `ArticleReaderTabs.tsx` restructured: desktop ≥1024px → 75/25 flex split (`data-reader-body` flex container, `data-reader-main` left column flex:75, timeline panel flex:25 sticky rail). Mobile <1024px → 3-tab UI preserved with CSS display:none state persistence (DECISIONS #008/#009/#011). Build + tsc clean.
- **Slice 5 — Article reader / Broken-state cleanup** — handles the remaining 126 findings, organized into 4 parallel streams + 1 verification stream:
  - Stream A — Engagement zone state cells (findings #51, #52, #53, #55, #84, #94)
  - Stream B — Comment thread state + race conditions (findings #59, #60, #63, #73, #74, #75, #78, #79, #80, #83, #92)
  - Stream C — Bookmark / share / quiz state (findings #67, #81, #82)
  - Stream D — Server / page / chrome (findings #2, #3, #5, #7, #8, #11, #14, #15, #33, #36, #37, #38, #56, #57, #64, #65, #66, #71, #85, #86, #93)
  - Stream E — Verification (re-grep, type-check, manual matrix)

Every recipe in SLICES.md cites the exact file:line + change. No code touched in this session.

Refuted: finding #76 (FK suffix) — verified against `database.ts:1750`, constraint name actually matches `_fkey` form. Dropped from list.

---

## Decisions locked from this unit's panels

The 7 panels (21 experts total) drove these locked decisions, all now in `UI_UX_REVIEW_DECISIONS.md`:

- #030 — Article body universally readable
- #031 — Paid section affordance pattern (heading + tease + See plans)
- #032 — Logged-in denial copy pattern (branch + future structured deny reason)
- #033 — Editor draft preview pattern (banner + intercepted submits)
- #034 — Hide-action reason required dropdown
- #035 — Ask-Expert requires article quiz pass
- #036 — COPPA × adult viewer = body visible + banner below
- #037 — `?a=draft` redirects to default
- #038 — generateMetadata matches 404
- #039 — CommentThread renders without perm wait
- #040 — Verity Plus tier perk list locked
- #041 — Ad slot inventory (3 slots + rail + sticky footer + quiz interstitial)
- #042 — Ad-product mix order of operations
- #043 — Registration wall pattern
- #044 — Admin ad system architecture
- #045 — Quiz interstitial = rewarded skippable video
- #046 — Don't aggressively convert top-20% free users
- #047 — iOS CSAM-trio bridges (legal hardening)

---

## Mid-session log
- 2026-05-02 — main pass logged 32 findings + matrix at top of doc.
- 2026-05-02 — 5-agent independent review dispatched and merged. Net-new: 97 findings (33–129). Total 129 findings; deep-coverage cell breadth confirmed.
- 2026-05-02 — verification agent re-checked 23 broken-claim findings against live code: 22 confirmed, 1 refuted (#76 dropped). Owner approved cluster.
- 2026-05-02 — 7 owner-decision panels (21 experts) dispatched + synthesized. Owner adjudicated. 18 decisions locked to DECISIONS.md #030–#047.
- 2026-05-02 — execution plan written to `UI_UX_REVIEW_SLICES.md` — 7-slice ordered plan with prerequisites + per-finding fix recipes + verification matrix.

---

## Deferred / sweep
- Hardcoded color tokens across ArticleSurface, ArticleQuiz, CommentThread, not-found.tsx, NextStoryFooter — likely a sweep candidate (5+ unit pattern). Defer formal sweep until 2-3 more units confirm. Tag: `dark-mode-token-sweep`.
- Edition / today-bound copy across multiple surfaces (NextStoryFooter, not-found, possibly more) — sweep candidate against DECISION #021. Tag: `edition-copy-sweep`.
