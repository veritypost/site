# Prelaunch UI Change

Date drafted: 2026-04-25
Scope: presentation layer only. Backend, RPCs, RLS, permission matrix, plan catalog, score tiers, pipeline, kid JWT — all unchanged. This document is about how Verity Post is *shown* to people, not how it *works*.

---

## Owner notes (added 2026-04-25)

These supersede anything below them. Resolve before related work begins.

1. **No curation-attribution language anywhere user-facing.** No "Why we picked these," no "today's brief by [anyone]," no "hand-curated by," no naming or alluding to the people / role behind story selection. Selection happens; the framing should let the work speak for itself. Applies to home, marketing pages, future personalization copy, and dev docs.

2. **Profile navigation needs a real redesign, not a polish pass.** The 4-tab model with Milestones and Categories buried behind taps, plus scroll-to-find within tabs, is broken. Do not act on §3.3's profile notes until the nav model is decided. Open: (a) one scroll with sticky section nav, (b) denser hub with secondary surfaces moved off profile entirely, (c) tabs made visually obvious / collapsed sections, (d) something else.

3. **"Reading activity" tab doesn't make sense.** A timeline of articles read is filler — reading is private and passive. Open: (a) repurpose Activity as the user's *public* contribution surface (comments, quizzes passed, expert answers), (b) fold into the streak grid + milestones and remove as a tab, (c) cut entirely. Decision needed before §3.3 proceeds.

4. **Weekly email digests are being removed.** Both `weekly_reading_report` and `weekly_family_report` email templates are killed pre-launch. The in-app weekly recap *quiz* (`/recap`, `/recap/[id]`, `RecapView`) is a separate surface and stays — only the cadence email digests go. The in-app family report view at `/profile/kids/reports` (RPC-driven) also stays. See §6.1 for the removal scope.

---

## Part 1 — North star

The product's spine is "the discussion section is earned." Everything visible should reinforce that one idea. We are not BuzzFeed. We are not Reddit. We are not Substack. We are a publication where the comment thread is the payoff for paying attention.

The UI should feel:

- **Slow.** Deliberate pace. No autoplay, no infinite-scroll feed-shock. Pages end.
- **Earned.** Every gate (quiz pass, paid tier, expert role, verified email) should look like an unlock, not a wall. Locked content should be visible as a faded silhouette of what's there, not a 403.
- **Composed.** One typeface for body, one for chrome, four colors of accent, four spacing rhythms. Nothing decorative.
- **Show your work.** Sources are first-class. Verity score is visible everywhere a user is named. Comprehension proof shows on every comment.
- **Restrained.** No emoji on adult surfaces. No celebratory motion for trivial actions. Rewards come from the work — passing the quiz, earning the discussion — not from layered animations.

If a single sentence captured it: **"a serious place where you have to prove you read it before you can talk about it, presented with the polish of a paid product."**

---

## Part 2 — Foundations (build these once, retrofit everywhere)

The missing primitives that, if built, lift every surface at once.

### 2.1 Spacing tokens
4-pt grid: `xs 4 / sm 8 / md 12 / lg 16 / xl 20 / 2xl 24 / 3xl 32 / 4xl 48 / 5xl 64`. iOS `Spacing` enum in `Theme.swift` + `KidsTheme.swift`. Web `S` const in `web/src/lib/spacing.ts`. Pre-commit lint flags raw padding numbers.

### 2.2 Type ramp
Body: serif (Source Serif Pro or similar — we're a publication). Chrome: sans (Inter). Define `Type.display / headline / title / body / label / caption / footnote` once. iOS via `.scaledSystem` so Dynamic Type respects user settings. Web via Tailwind theme override.

### 2.3 Color tokens
Keep current palette. Add three score-tier accent colors (already in `score_tiers` table — surface them as the only "decorative" color). Everything else is neutral.

### 2.4 Elevation scale
Three levels only: `flat / raised (1px border + faint shadow) / floating (modal/sheet, 16px shadow)`. No mid-card shadows. No drop shadows on text.

### 2.5 Motion language
**One global transition: 200ms ease-out, no overshoot, no spring.** Every state change uses it. No bespoke motion components on adult surfaces. The kid app keeps its existing scenes (`GreetingScene`, `StreakScene`, `QuizPassScene`, `BadgeUnlockScene`) — those are on-brand for that surface and stay.

### 2.6 EmptyState primitive
One component, web + iOS. Takes `title`, `body`, `cta` props. Human copy at every call site. Examples:
- Empty bookmarks: *"Nothing saved yet. Tap the bookmark on any article to keep it here."*
- Empty notifications: *"Quiet for now. We'll send you the news that matters when it breaks."*
- Empty messages: *"You haven't started any conversations. Find someone interesting on the leaderboard."*

### 2.7 Skeleton primitive
Replace every spinner. Skeletons match the shape of the content. iOS uses `.redacted(reason: .placeholder)`. Web uses one shared `<Skeleton variant="card|line|avatar">`. The existing `web/src/components/admin/SkeletonRow.jsx` becomes the user-facing primitive too.

### 2.8 Toast / feedback
One toast component, used by every mutation. Three variants: success (4s), error (8s with action), info (4s). Currently `Toast.tsx` exists but only the admin variant (`ToastProvider.jsx`) is wired across mutations. Adult mutations frequently don't toast — that's the change.

### 2.9 LockedFeatureCTA — the single highest-leverage component
The behavior inversion that defines this rebuild. Today, `LockModal.tsx` *blocks* a permission denial with a focus-trapped modal. Replace it with an inline component that renders the surface *faded* with a single-line upsell beneath: "Verity Pro feature — see plans" or "Verify your email to comment" or "Sign in to bookmark." The user sees the surface they're paying for, not a wall.

The component takes a `gateType` prop:
- `gateType="plan"` — upsell with plan name + price
- `gateType="role"` — muted explainer, no upsell ("This is an admin tool")
- `gateType="verification"` — CTA to verify

Every `hasPermission()` call site is classified once before the sweep. Plan-gated and role-gated must never be confused; that's the prop's job.

### 2.10 Date + time format
Stop showing "Apr 25, 2026 14:32." Show "Friday afternoon." Natural-language dates everywhere a human reads them; ISO timestamps only in code and admin tables.

---

## Part 3 — Surface-by-surface rebuild

Each entry below assumes the foundations above are in place. Format: **what it is now → what it becomes**.

### 3.1 Home — `/` (web) + `HomeView` (iOS)

Now: 1 hero + up to 7 supporting articles, dated, page ends.

Becomes:
- **Hero gets full-bleed treatment.** Image bleeds to viewport edges (web) or screen edges (iOS), title overlays bottom-left in serif display, single source byline beneath.
- **Date treatment is human.** "Friday, April 25" not "04/25/26."
- **Page ends with a clean stop.** A small dated mark or thin rule that signals "that's the brief."
- Removes the `FALLBACK_CATEGORIES` hardcode (currently still drifted; tracked in MASTER_TRIAGE).

### 3.2 Story — `/story/[slug]` (web) + `StoryDetailView` (iOS)

Now: 3 tabs (Story/Timeline/Discussion), anon trial, quiz, TTS, comments, bookmarks.

Becomes:
- **Reader is full-bleed.** No persistent chrome. Top bar collapses on scroll to a thin 1-px progress line.
- **Source chips inline.** Today sources live at the bottom. Move them inline as the reader encounters them — superscript number, tap to reveal a citation card.
- **Quiz unfolds inline.** When the reader hits ~50%, a thin ribbon at the bottom whispers *"You've read enough to take the quiz when you finish."* When the reader hits ~95%, the ribbon expands into the quiz panel — no modal, no nav change.
- **Comments unfold on pass.** The Discussion panel literally slides in beneath the article. Comments are visible immediately, no tab switch. (The pass-then-load logic is already correct at `story/[slug]/page.tsx:541`; this is presentation only — the global 200ms transition does the work.)
- **Each comment carries proof.** Comprehension badge + verity-score-tier color on the avatar ring. Tap reveals when they passed the quiz.
- **Anon trial gets a counter.** Top-right pill: *"1 of 2 free reads."* Wall arrives expected, not as a 403 surprise.

The existing quiz UI stays. No swipe rebuild.

### 3.3 Profile — `/profile` (web) + `ProfileView` (iOS)

Now: hero card with two streak integers (`streak_current`, `streak_best`), 4 tabs (Overview/Activity/Categories/Milestones).

Pending owner notes 2 + 3, the direction once nav and Activity are decided:
- **Hero is a single composition.** Verity score ring as the centerpiece, tier name as a soft subhead, delta-to-next as a small gauge. No secondary cards stacked above.
- **Streak grid replaces the integer cards.** Full-width 30-day calendar, day cells colored by reading minutes, tap to see the day's articles. The grid is the only streak surface — no separate freeze-visibility card, no separate badge surface.
- **Categories surface becomes a heatmap.** Categories you've read 50+ times glow brighter. Tap to see your reading history there.
- **Milestones surface is a wall of badges.** Earned ones full color, unearned ones silhouette with the unlock criteria.
- **Public profile is a portfolio.** When someone else views you, they see your best comments, your top categories, your earned badges — not your settings.

### 3.4 Settings — `/profile/settings` (web) + `SettingsView` (iOS)

Now: web is one ~3,800-line page with anchor sections. The 11 sub-routes (`alerts`, `billing`, `blocked`, `data`, `emails`, `expert`, `feed`, `login-activity`, `password`, `profile`, `supervisor`) are redirect shims pointing **into** the unified page. iOS is stacked NavigationStack.

Becomes:
- **Web: the 11 shims flip direction.** Each sub-route becomes the real destination. The unified `/profile/settings` page becomes either a sidebar/landing or itself redirects out. Sidebar order on desktop: Account, Profile, Notifications, Reading, Privacy, Billing, Family, Danger. Bottom-sheet selector on mobile.
- **iOS: card-based hub** mirroring Apple's Settings.app convention. Cards on the root, push to detail.
- **Each toggle has a microcopy preview** of what changes. *"Show read receipts: people you DM see when you've read their messages."* Not just a label.
- **Billing section is its own destination,** not a nested anchor. First-class route on web (already correct in Stripe URLs); first-class card on iOS.

### 3.5 Billing — `SubscriptionView` (iOS) + `/profile/settings/billing` (web)

Now: 5-card grid on iOS, 3-card grid on web (family hidden).

Becomes:
- **One plan-card per tier.** Tier name in display type, price below in body, *what you unlock* as a 5-line list pulled from `plan_features` (already in DB).
- **Annual savings in dollars, not percent.** *"Save $24 per year"* beats *"Save 17%."*
- **Family plan visualization.** Sketch of two parent silhouettes + N kid silhouettes, captioned *"Verity Family: 2 adults + 2 kids."*
- **Promo code is a small "Have a code?" link**, not a visible field.
- **Web shows family tiers as "available in iOS app"** with a deep-link, instead of hiding them. Information parity.

### 3.6 Bookmarks — `/bookmarks` (web) + `BookmarksView` (iOS)

Now: list, banner appears only after hitting the cap (`enforce_bookmark_cap` RPC + `bookmarks/page.tsx:357`).

Becomes:
- **Personal library, not a list.** Cover-card grid with article thumbnails, title, source, date saved.
- **Cap counter at the top, proactive.** *"7 of 10 saved — Verity unlocks unlimited."* `LockedFeatureCTA` (`gateType="plan"`) on the unlock half. The user sees the wall coming, not on impact.
- **Collections are folders with covers** (paid). First article's image becomes the folder cover.
- **Search within bookmarks.** Free for everyone — saved articles are theirs to search.
- **Notes appear inline on the cover card** — small italic preview if a note exists.

### 3.7 Leaderboard — `/leaderboard` (web) + `LeaderboardView` (iOS)

Now: rankings by period, global / category / family views.

Becomes:
- **Top 3 get podium treatment.** Larger cards, tier accent color, score visible.
- **Your rank is sticky** at the bottom while you scroll.
- **Category leaderboards** as a horizontal tab strip, not a dropdown.
- **Family leaderboard** renders kids in kid-styled treatment so parents/kids can recognize each other.
- **Tap a name → public profile drawer** without leaving the leaderboard.

### 3.8 Messages — `/messages` (web) + `MessagesView` (iOS)

Now: DM list, search by user, role filter, inline report/block.

Becomes:
- **Verity-score-colored avatar rings.** Same as comments — credibility is visible at a glance.
- **Comprehension badges by name** for contacts who've passed the same quiz as you.
- **Thread previews show last message + relative time.** Currently sparse; needs density.
- **Compose is full-screen on iOS, modal on web.** Search-as-you-type with verity-score sorted results.
- **Block/report in thread footer (iOS already)** — replicate to web header.

When a free user clicks the Messages tab, the list renders faded with `LockedFeatureCTA` (`gateType="plan"`) — they see the inbox shape they're paying for, not the today-blocking modal.

### 3.9 Notifications — `/notifications` (web) + `AlertsView` (iOS)

Now: inbox + Manage tabs.

Becomes:
- **Grouped by today / this week / older.** Default sectioning.
- **Inline previews, not titles.** *"David Wong replied to your comment on 'Markets fall on...': 'Right but the Fed didn't say...'"*
- **Swipe-to-mark-read on mobile.** Swipe-to-archive too.
- **Manage moves to its own route** (`/notifications/manage`). Notifications is consumption; Manage is configuration. Different intents.
- **Push prompt timing.** Don't ask at first launch. Ask after the user takes their first comprehension quiz pass — they're invested.

### 3.10 Expert Queue — `/expert-queue` (web) + `ExpertQueueView` (iOS)

Now: 4 tabs (Pending/Claimed/Answered/Back-channel), claim/answer.

Becomes:
- **Question card shows asker context.** Verity score + tier badge — calibrate the answer.
- **Inline answer composer with markdown preview** (web). Sheet-based on iOS, but with live preview.
- **Auto-advance to next question** on submit. Don't bounce to list.
- **Vacation mode toggle in queue header.** One click, not buried in settings.
- **Back-channel tab unread count** on the tab itself.
- **Per-question category visible** when an expert is in multiple categories.

### 3.11 Recap — `/recap` + `/recap/[id]` (web) + `RecapView` (iOS)

Now: web has hub + detail, iOS shows current week only.

Becomes:
- **Recap hub on iOS too.** Vertical list of past recaps with score and date.
- **Recap detail is a story format, not just a quiz.** Each question has a "this question came from this article" preamble — the recap teaches as it tests.

### 3.12 Find — `/search` + `/browse` (web) + `FindView` (iOS, new)

Now: web has separate `/search` and `/browse`. iOS has neither.

Becomes:
- **Web stays as two routes** with shared chrome. Search input plus three result tabs (Articles, People, Categories). Browse stays a category grid.
- **iOS gets one "Find" tab** with two segments: Search and Browse. One new top-level view, not two.
- Article results show source + date + your reading status. People results show verity score + tier + comment count. Category results show your reading history.

### 3.13 Kids — `VerityPostKids/`

Now: PairCodeView, 4 tabs, reader, quiz, leaderboard, expert sessions, profile.

Becomes:
- **Home tab is "today's adventure."** One single CTA: today's article. Below: yesterday's badges, this week's streak. No competing CTAs.
- **Reading is large-type, illustrated.** Pull illustrations from `articles.illustration_url` (column add, UI-only). No ads ever.
- **Streak grid is the kid's most precious surface.** Big, on the profile, animated when a day is added (existing `StreakScene`).
- **ParentalGateModal call-site audit.** Verify it fires on every external link / payment / mailto. No close-button addition — the existing "Not now" cancel stays as the only sanctioned dismiss path (see §16.2).

Kid scenes (`GreetingScene`, `StreakScene`, `QuizPassScene`, `BadgeUnlockScene`) already exist and stay. They're on-brand for the kid surface in a way they aren't for adult.

### 3.14 Admin — `/admin/*` (web only)

Now: 52 utilitarian pages.

Becomes (surgical, not wholesale):
- **Hub is a dashboard.** Today's reports queue, today's pipeline runs, today's revenue, today's signups, this week's churn. Numbers + sparklines.
- **Newsroom for the daily workflow.** Drag-drop ordering of home stories, schedule-for-future, **preview-as-anon** (matters for SEO).
- **Reports / moderation queue shares chrome with expert queue** (4 tabs, claim/resolve, action history inline).
- **Permissions page is a live resolver.** "If I grant this permission to this user, here's what changes for them" preview before save.
- **User detail is one dossier.** History, perms, plan, kids, devices, comments, reports against, reports by — all in one scroll.
- **Settings page (`/admin/settings`) gets preview-before-save** for any value that affects user UX.
- **Admin notifications page** loses the two weekly-digest toggle rows (§6.1).

---

## Part 4 — Per-role rebuild

What changes for each role on each surface, beyond the surface rebuilds above.

### Anon (no account)

**Web:** Trial counter on `/story/[slug]`. Registration wall A/B copy with outcome list. `LockedFeatureCTA` on bookmark/comment/follow affordances with `gateType="verification"` linking to signup.

**iOS:** Trial counter in `StoryDetailView`. `LoginView` is currently dead-end — add subtle "Continue browsing" affordance.

### Free (verity account, no plan)

**Web:** Bookmark cap counter visible from save #1, escalating at 7 and 9. `/messages` renders the inbox shape faded behind `LockedFeatureCTA` (`gateType="plan"`) instead of the blocking LockModal. Quiz attempt counter visible on attempt 2/2.

**iOS:** Same on `BookmarksView`, `MessagesView`, `StoryDetailView`.

### Verity / Verity Pro

**Web:** Billing section shows what's unlocked vs locked on current plan. Bookmarks collections discoverability — first-time onboarding tooltip. Mentions autocomplete tooltip on first comment.

**iOS:** SubscriptionView shows current plan as the active card. TTS surfaces as "available on your plan."

### Verity Family / Family XL

**Web (parent):** Per-kid card on `/profile/kids` shows streak, this-week minutes, last quiz score, badges. Pair code includes "Print this card" / "Email to kid's device." Family weekly report stays as the in-app data view at `/profile/kids/reports` (RPC-backed, *not* the email — that's removed per §6.1). Family tier shown in web billing UI as "manage in iOS app" with deep-link.

**iOS (parent):** `FamilyViews` gets printable card. `KidsAppLauncher` fallback URL completed (Apple-block until dev account). Adult `ProfileView` shows kid avatars + last activity inline.

**Kids iOS:** Today's-adventure single-CTA home. Reader large-type + illustrations. Streak grid prominent on profile. ParentalGateModal call sites verified.

### Expert / Journalist / Educator

**Web + iOS:** Auto-advance on submit. Vacation toggle in header. Back-channel unread badge. Per-question category. Asker context.

### Moderator

**Web:** `/admin/moderation` penalty stack as timeline. Inline action history on user lookup. Appeal review with structured approve/deny ladder. Reports queue shares chrome with expert queue.

**iOS:** None by design.

### Admin / Owner

**Web:** Hub dashboard. Newsroom daily-workflow surface. Permissions live resolver. User detail dossier. Settings preview-before-save.

**iOS:** None by design.

---

## Part 5 — What stays the same (intentionally)

To prevent scope creep, name what does not change:

- All RPCs and DB schema. Permission matrix. Plan catalog. Score tiers. Score rules. Rate limits.
- Auth topology (GoTrue for adult; custom JWT for kid).
- StoreKit / Stripe split.
- 6-agent ship pattern for admin code.
- DB-as-source-of-truth rule.
- Permission xlsx ↔ DB 1:1 sync rule.
- Three apps, one DB.
- Kid-only emoji rule. Kid-only motion scenes.
- Conventional commit format with item IDs.
- The existing quiz UI (no swipe rebuild — bulk-submit contract preserved).
- `ParentalGateModal.swift` math challenge + "Not now" cancel; no other dismiss path added.
- iPad and dark mode are post-launch. Pre-launch: don't-break only.

---

## Part 6 — Cleanups

### 6.1 Scope removal — weekly email digests

The `weekly_reading_report` and `weekly_family_report` **email digests** are removed before launch. Cadence email is the wrong engagement primitive for a discussion product. The weekly *recap quiz* product stays.

**Removed (email-only):**
- `email_templates` rows: `weekly_reading_report`, `weekly_family_report`. Soft-delete (`is_active = false`) following the schema/019 precedent for `morning_digest` / `daily_digest` / `category_alert`.
- `web/src/app/api/cron/send-emails/route.js:23–24` — remove both entries from `TYPE_TO_TEMPLATE`.
- `web/src/app/admin/notifications/page.tsx:44–45,70` — `email_weekly_reading_report` and `email_weekly_family_report` toggles + their default-true entries.
- `web/src/app/profile/settings/page.tsx:244,259` — `weekly_reading_report` user preference key + label.
- Any producer that inserts `notifications` rows with these types — find via `grep -rn "weekly_reading_report" web/src` and drop the insertion.

**Kept (in-app surfaces):**
- `/recap`, `/recap/[id]`, `RecapView` — the weekly recap quiz product.
- `/profile/kids/reports` and `/api/family/weekly-report/route.js` (RPC `family_weekly_report`) — the in-app family report data view.
- `/api/reports/weekly-reading-report/route.js` (RPC `weekly_reading_report`) — same pattern.
- `kids.parent.weekly_report.view` permission — gates the in-app view.
- Plan-feature copy at `web/src/lib/plans.js:50` ("Category leaderboards + weekly recap quiz") — refers to the quiz product.

### 6.2 Engagement loops — three missing notification templates

Add to `TYPE_TO_TEMPLATE` in `send-emails/route.js` and the corresponding push payloads in `send-push/route.js`:

- **`comment_reply`** — when someone replies to your comment. Push + email. The single highest-retention event the product can produce; currently has no template.
- **`expert_answer_posted`** — when an expert answers a question on a thread you follow. Push + email.
- **`streak_jeopardy`** — push at hour 22 if today isn't yet logged. The grid in §3.3 is the prerequisite — without it the push has nothing to refer to.

Each template needs: subject + body_html + body_text + variables array, plus the matching `notifications.action_url` payload. Producer rows live in the existing comment-create / answer-post / cron paths.

---

## Part 7 — Sequencing

### Phase 1 — Foundations (1–2 weeks, **LOW risk**)
**Ships:** Spacing/type/color/elevation tokens. EmptyState, Skeleton, Toast unification, `LockedFeatureCTA` (with `gateType` prop). One global 200ms ease-out transition. The `gateType` classification of every `hasPermission()` call site (~50 sites). `web/public/.well-known/apple-app-site-association` file. `com.apple.developer.associated-domains` added to both adult and kids entitlements. Visual regression baseline: top 10 surfaces × 5 iOS sizes + 4 web viewports = 90 baseline screenshots in CI.

**Touches:** Adds files; modifies near-zero existing files. No URL changes. No behavior changes.

**Why first:** every other phase depends on tokens + primitives.

### Phase 2 — Auth polish + form sweep (1 week, **MEDIUM risk**)
**Ships:** Sheet/cover dismissal (explicit close buttons everywhere except `ParentalGateModal`). `window.location.href → router.push` migration on the *non-OAuth* callsites only. Inline form validation. Live password strength meter. Email-debounce indicator. Keyboard-avoidance fix on iOS forms. Autocomplete + inputmode attributes on every input.

**Critical:** the post-callback hard-nav legs at `login/page.tsx:242`, `signup/page.tsx:120`, `signup/page.tsx:228` MUST stay `window.location.href` — Supabase Set-Cookie requires full page navigation. The strings at `login:97` / `signup:254` are SDK `redirectTo` option values, not navigations.

### Phase 3 — Settings split + URL hygiene + email digest removal (1–2 weeks, **HIGH risk**)
**Ships:** The 11 settings sub-route shims flip direction (each becomes the real page; the unified page becomes sidebar/landing or redirects out). Internal `#anchor` href sweep updates ~10 callers. Stripe URLs verified (already correct: `/profile/settings/billing`). Email template audit + DB updates. Weekly-digest cleanup (§6.1).

**Pre-flight:**
- [ ] `select * from email_templates where body like '%profile/settings#%'` audited and updated for the five remaining live templates (`breaking_news_alert`, `kid_trial_day6`, `kid_trial_expired`, `data_export_ready`, `expert_reverification_due`)
- [ ] Stripe checkout test → lands on `/profile/settings/billing?success=1`
- [ ] Stripe portal test → returns to `/profile/settings/billing`
- [ ] All 11 settings routes load; the unified-page fallback for old bookmarks works
- [ ] Weekly-digest cleanup checklist (§6.1) green
- [ ] `robots.js` reviewed
- [ ] APNs `aps.url` and `notifications.action_url` audited for old `#anchor` URLs in the same sweep

### Phase 4 — Story + Home + Bookmarks + Billing (2 weeks, **LOW–MEDIUM risk**)
**Ships:** Story reader full-bleed (web + iOS). Home full-bleed hero + human dates. Bookmarks library grid with proactive cap counter. Billing rebuild (one-card-per-tier with live unlock preview from `plan_features`).

**No URL changes.** No backend changes. Permission keys stay valid.

### Phase 5 — Profile + LockedFeatureCTA inversion + 3 notification templates (1–2 weeks, **MEDIUM risk**)
**Ships:** Profile redesign (after the §3.3 nav-model decision). Streak grid replaces integer cards. The behavior inversion: `LockModal.tsx` callsites swap to `LockedFeatureCTA` (faded surface + inline upsell instead of blocking modal). Three new notification templates (§6.2): `comment_reply`, `expert_answer_posted`, `streak_jeopardy`.

**Why fifth:** the `LockedFeatureCTA` swap depends on Phase 1's `gateType` classification. The notification templates depend on the streak grid being live (jeopardy needs something to refer to).

### Phase 6 — Engagement surfaces + admin surgical + errors + kids polish (2 weeks, **MEDIUM risk**)
**Ships:**
- Messages, Notifications, Leaderboard, Recap, Find (iOS new view), Expert queue (auto-advance + vacation toggle).
- Admin: hub dashboard, newsroom (with preview-as-anon only), permissions live resolver, user dossier, settings preview-before-save.
- Errors: public 404, app-root `error.tsx`, 403 page, curated `AuthViewModel` error mapping.
- Kids: today's-adventure home, illustration support, ParentalGateModal call-site audit.

**Final QA:**
- [ ] Full e2e suite passes (the 6 known test files updated: `profile-settings`, `billing-flows`, `bookmarks`, `messages-notifications`, `auth-edge-cases`, `anon-golden-path`)
- [ ] Visual regression diffs reviewed
- [ ] Manual VoiceOver pass on top 10 surfaces
- [ ] Manual keyboard-only pass on web top 10
- [ ] Slow-3G manual pass on top 5 (home, story, profile, bookmarks, settings)
- [ ] Cron `send-emails` + `send-push` tested with new templates → correct landing
- [ ] iOS TestFlight build before any public deploy

---

## Part 8 — Acceptance criteria per surface

A surface is launch-ready when:
1. Uses spacing tokens — no raw padding numbers.
2. Uses type ramp tokens — no raw font sizes.
3. Has a defined loading state (skeleton, not spinner).
4. Has a defined empty state (human copy via `EmptyState`).
5. Has a defined error state (actionable, not generic).
6. Every mutation produces a toast.
7. Every locked affordance uses `LockedFeatureCTA` with the correct `gateType`, not a blocking modal or a hide.
8. Every interactive element meets touch-target minimum (44pt iOS / 48dp web).
9. Bottom safe-area cleared on iOS (100pt over tab bar).
10. Tested at 320px width (smallest mobile web).
11. Tested with VoiceOver / screen reader.
12. Tested with reduce-motion (the global 200ms transition respects `prefers-reduced-motion`).

If a surface fails any of the 12, it's not done.

---

## Part 9 — Risk audit (what could break)

The backend isn't changing — but the UI layer has hidden coupling to production-critical systems. This section catalogs every coupling found in code so the rebuild doesn't ship a regression.

### 9.1 Severity matrix

| Risk area | Severity | Why |
|---|---|---|
| Settings split into 11 real routes | **HIGH** | Stripe success/return URLs, ~10 internal `#anchor` hrefs, email templates in DB, `robots.js`, cron payloads |
| Auth flow polish | **MEDIUM** | OAuth callback at `/api/auth/callback` MUST stay hard-navigation on the post-callback legs to receive Set-Cookie from GoTrue |
| `LockModal → LockedFeatureCTA` inversion | **MEDIUM** | Must distinguish plan-gated (safe to upsell) vs role-gated (don't upsell) vs verification-gated (CTA to verify) — the `gateType` prop is the discipline |
| Three new notification templates | **MEDIUM** | New rows in `email_templates`, new types in `TYPE_TO_TEMPLATE`, new producer code paths. Test that opt-out preferences are honored before first send |
| Token migration (font/spacing) | **MEDIUM** | No visual regression tests exist until Phase 1 baselines them |
| Story reader full-bleed | **LOW** | No `/story/[slug]#anchor` deep links found; SEO metadata is in `<head>`, unaffected |
| Profile redesign | **BLOCKED** | Pending §3.3 nav decision. Cannot start until owner answers |
| iOS Universal Links | **HIGH** | AASA file does not exist AND `associated-domains` entitlement missing on both apps. Both legs required |
| Email template URL changes | **MEDIUM** | Templates live in `email_templates` table. Audit for `/profile/settings#` strings |
| Weekly digest removal | **LOW** | Soft-delete only, no destructive change. Two cron-map entries, two admin toggles, one user-pref row |
| E2E tests | **MEDIUM** | 23 e2e tests; ~6 will fail on URL changes (see Phase 6 QA list) |
| `public/ads.txt` | **LOW** | AdSense reads it at apex `/ads.txt`; don't disturb during AASA rollout |

### 9.2 Critical findings — file:line citations

**Stripe coupling (HIGH):**
- `web/src/app/api/stripe/checkout/route.js:82` — `successUrl: ${origin}/profile/settings/billing?success=1`
- `web/src/app/api/stripe/portal/route.js:53` — `returnUrl: ${origin}/profile/settings/billing`
- **Implication:** `/profile/settings/billing` MUST exist as a real route after the split. It already does (the redirect shim today is a real page after Phase 3 — the redirect just gets removed).

**Internal `#anchor` links to settings (~10 sites):**
- `web/src/app/recap/page.tsx:86` → `/profile/settings#billing`
- `web/src/app/messages/page.tsx:828` → `/profile/settings#billing`
- `web/src/app/search/page.tsx:229` → `/profile/settings#billing`
- `web/src/app/bookmarks/page.tsx:359` → `/profile/settings#billing`
- `web/src/app/profile/card/page.js:75` → `/profile/settings#billing`
- `web/src/app/profile/family/page.tsx:118` → `/profile/settings#billing`
- `web/src/app/profile/kids/[id]/page.tsx:337` → `/profile/settings#billing`
- `web/src/app/profile/page.tsx:843,1285,1304` — `window.location.assign()` to `/profile/settings/profile` and `/profile/settings/feed`
- `web/src/app/profile/settings/expert/page.tsx:53` → `/profile/settings`
- `web/src/app/signup/expert/page.tsx:953` → `/profile/settings`

**OAuth callback (DO NOT change):**
- `web/src/app/api/auth/callback/route.js` — exchanges the Supabase auth code for a session and writes the GoTrue cookies. The browser leg that *returns from* this handler must be a hard navigation so the Set-Cookie attaches to the next request.
- The strings at `login/page.tsx:97` and `signup/page.tsx:254` are SDK `redirectTo` option values inside `signInWithOAuth` — not navigations. Don't migrate; don't "fix."
- The actual hard-nav callsites are: `login/page.tsx:242`, `signup/page.tsx:120`, `signup/page.tsx:228`. These three **must stay `window.location.href`**. Add a marker comment on each: `// MUST stay window.location.href — Supabase Set-Cookie requires full page navigation`.

**Safe to convert to `router.push`:**
- `web/src/app/signup/pick-username/page.tsx:96,190,209` — final step
- `web/src/app/welcome/page.tsx:16,21` — onboarding finish
- `web/src/app/verify-email/page.tsx:185–189` — post-verify
- `web/src/app/signup/expert/page.tsx:250` — final home redirect

**Quiz API contract (preserved — no swipe rebuild):**
- `web/src/app/api/quiz/submit/route.js:18–21` expects `{ article_id, answers[], ... }` as one POST.
- `web/src/app/api/quiz/submit/route.js:33–34` validates `answers.length === quizCount`.
- `web/src/app/api/quiz/submit/route.js:74–79` rate-limits at 30/min.
- The existing quiz UI stays. No migration to per-question swipe; bulk submit contract is untouched.

**ParentalGateModal exemption:**
- `VerityPostKids/VerityPostKids/ParentalGateModal.swift:59–70` — has a "Not now" cancel button (calls `onCancel()`), but **no easy-bypass affordance**: no swipe-to-dismiss that skips the math, no "X" close in the header. The COPPA / Apple Kids Category constraint is that a kid cannot bypass the math challenge to take the gated action — not that there's no cancel path at all.
- **Rule:** the "add close button to every sheet" sweep must exempt this file. Don't add a header "X", don't add swipe-to-dismiss that skips the challenge, don't add an escape-key shortcut. The existing "Not now" is the only sanctioned dismiss path.

**Apple Universal Links (HIGH — currently broken on both ends):**
- `web/public/.well-known/apple-app-site-association` — does not exist. Verified: only `web/public/ads.txt` lives in `public/`.
- `VerityPost/VerityPost/VerityPost.entitlements` — `com.apple.developer.associated-domains` is not present. Only `com.apple.developer.applesignin` is registered. Same gap on the Kids app entitlements.
- Action: ship AASA + add `associated-domains` to both adult and kids entitlements (`applinks:veritypost.com` etc) in the same change. Both legs are required.
- Suggested paths to register: `/story/*`, `/profile/*`, `/leaderboard/*`, `/search*`, `/bookmarks*`, `/messages*`, `/notifications*`. Auth paths typically don't deep-link.

**robots.js + sitemap:**
- `web/src/app/robots.js:22` — Disallow includes `/profile/settings`. Decide whether settings sub-routes should be indexable.
- Same logic applies to `sitemap.xml` at `robots.js:29`.

**Email templates in DB:**
- Templates live in the `email_templates` table per `schema/040_*.sql` and `schema/102_*.sql`.
- Live templates after §6.1 removal: `breaking_news_alert`, `kid_trial_day6`, `kid_trial_expired`, `data_export_ready`, `expert_reverification_due`. Audit each for `/profile/settings#` URLs.
- Plus the three new templates from §6.2: `comment_reply`, `expert_answer_posted`, `streak_jeopardy`.

**Cron URL coupling:**
- `web/src/app/api/cron/send-emails/route.js:179` — `action_url` from `notifications` table → `absoluteUrl(...)`
- `web/src/app/api/cron/send-push/route.js:302` — `url: n.action_url` and APNs `aps.url` field
- Other crons embedding URLs that need the same audit: `process-data-exports`, `flag-expert-reverifications`, `sweep-kid-trials`, `cleanup-data-exports`.

**Tests that will fail on URL changes:**
- `profile-settings.spec.ts` — assertions on `/profile/settings`
- `billing-flows.spec.ts` — Stripe redirect lands at `/profile/settings/billing`
- `bookmarks.spec.ts` — upgrade link target
- `messages-notifications.spec.ts` — Manage tab target
- `auth-edge-cases.spec.ts` — `?next=` preservation
- `anon-golden-path.spec.ts` — full journey

### 9.3 `LockedFeatureCTA` — gate-type discipline

A blanket sweep would put "Upgrade to Verity" on supervisor/expert/admin gates and confuse users. Classify before swap:

**Plan-gated — safe to upsell** (`gateType="plan"`):
- `messages.inbox.view`
- `bookmarks.collections`
- `bookmarks.list.view` (cap counter)

**Role-gated — DO NOT upsell** (`gateType="role"`, muted explainer only):
- `settings.supervisor.view`
- `settings.expert.view`
- `expert_queue.view`
- `admin.*`

**Verification-gated** (`gateType="verification"`, CTA to verify):
- `settings.emails.add_secondary`
- `comment.post`
- `profile.card_share`

The `gateType` prop is the safety mechanism. Don't drop it "for simplicity" — it's the prop that keeps role-gated and plan-gated affordances from being miscategorized as upsells.

### 9.4 Sign in with Apple — Apple G4.8 risk

Auth flow changes must keep SIWA at first-position or equal visual weight. Burying SIWA below Google/email will fail App Store Review. Verify after Phase 2:
- `LoginView` SIWA placement
- `SignupView` SIWA placement
- Web `/login` and `/signup` SIWA placement

If anything moves SIWA below or behind another button, escalate before submitting to Apple.

---

## Part 10 — Pre-flight checklist

Run through this before Phase 1 starts. Anything unchecked is a blocker.

- [ ] `web/public/.well-known/apple-app-site-association` file plan agreed
- [ ] `com.apple.developer.associated-domains` planned for both `VerityPost.entitlements` and the Kids app entitlements (currently absent in both)
- [ ] `web/public/ads.txt` confirmed unaffected by AASA rollout
- [ ] Visual regression test infrastructure (Playwright `toHaveScreenshot()`) wired into CI
- [ ] Baseline screenshots captured for top 10 surfaces × 5 iOS + 4 web viewports
- [ ] `email_templates` table audited for `/profile/settings#` URLs
- [ ] All Stripe redirect URLs identified (`checkout/route.js:82`, `portal/route.js:53`) and confirmed safe
- [ ] OAuth post-callback legs identified (`login:242`, `signup:120,228`) and exempted from `router.push` migration
- [ ] `ParentalGateModal.swift` exempted from "add close button to all sheets" rule (comment marker added)
- [ ] All 23 e2e tests reviewed; ~6 known to need updates flagged
- [ ] Bundle-size baseline measured (`npm run build` output captured)
- [ ] Profile navigation model decided (one of the four options in owner note 2)
- [ ] Activity tab purpose decided (one of the three options in owner note 3)
- [ ] `LockedFeatureCTA` `gateType` classification done for every `hasPermission()` call site (~50 sites)
- [ ] No conflict with active items in `Current Projects/MASTER_TRIAGE_2026-04-23.md`
- [ ] Git working tree clean before starting; one branch per phase

---

## Part 11 — Compatibility shims to keep

These exist for reasons; do not remove during cleanup sweeps.

1. **`/profile/settings/{section}/page.tsx`** as the real destination after Phase 3. Plus the unified `/profile/settings` either becomes a sidebar/landing or itself redirects out — pick one and document. Either choice protects old bookmarks, email links, and external references.

2. **`window.location.href` on the post-callback navigation legs.** `web/src/app/login/page.tsx:242`, `web/src/app/signup/page.tsx:120`, `web/src/app/signup/page.tsx:228`. Hard navigation is required so Supabase Set-Cookie attaches on the next request. Add a marker comment on each: `// MUST stay window.location.href — Supabase Set-Cookie requires full page navigation`.

3. **`ParentalGateModal.swift` math challenge + "Not now" cancel as the only sanctioned dismiss.** Permanent. Add a marker comment: `// COPPA-gated: "Not now" is the only sanctioned dismiss path — do NOT add a close button, swipe-dismiss, or escape-key bypass that skips the math challenge`.

4. **The bulk-submit quiz API contract.** `quiz/submit/route.js` expects all answers in one POST and rate-limits at 30/min. Don't migrate to per-question without first updating the rate limit.

5. **The `gateType` prop in `LockedFeatureCTA`.** Don't drop it "for simplicity." It's the discipline that keeps plan-gated, role-gated, and verification-gated surfaces from being miscategorized.

---

## Part 12 — Bottom line

The rebuild can ship without breaking production. The risk is concentrated in three places:

1. **The settings split** (Phase 3) touches Stripe, email templates, ~10 internal hrefs, cron payloads, and 6 e2e tests. With the pre-flight checklist run and the unified-page fallback in place, it's safe.
2. **The auth flow changes** (Phase 2) must preserve SIWA prominence and must not migrate the post-callback hard-nav legs off `window.location.href`.
3. **The COPPA gate** stays as it is. No "add close button to every sheet" sweep touches `ParentalGateModal.swift`.

Everything else — tokens, primitives, surface rebuilds, the `LockedFeatureCTA` inversion, the three notification templates, error/empty/loading work, the weekly-digest removal — is additive or self-contained. None of it changes a permission, a plan, an RPC, or a webhook.

Six phases. Six surfaces rebuilt. Four primitives. One behavior inversion. Three new notification templates. Four edge surfaces. One scope removal. That's the work.

Start with foundations + visual regression baseline + AASA file + entitlements in Phase 1, then auth polish, then settings split with the digest removal, then the four heavy surfaces, then the inversion plus templates, then everything else.

---

End of document. Owner reviews and decides which phase to greenlight first.
