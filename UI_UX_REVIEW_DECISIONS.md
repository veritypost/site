# UI/UX Review — Decisions ledger

Locked Q&A. Each decision answered once, applied forever. If a question would recur across units, it lands here.

Format: numbered, dated, scope tag, question + answer + how-to-apply.

Findings cite as `DECISION #<n>`.

---

## #001 — Color-per-tier
**Date:** 2026-04-29 (carried forward) **Scope:** all platforms
**Q:** Should reader/expert tiers be visually distinct (color, gradient, ramp)?
**A:** No. Tier is a label, not a visual identity. No rainbow, no muted ramp, no gradient encoding rank.
**Apply:** Reject any reviewer/agent suggestion of color-coded ranks. Already in PRINCIPLE §1.2.

## #002 — Keyboard shortcuts in admin
**Date:** 2026-04-25 (carried forward) **Scope:** web admin
**Q:** Add keyboard shortcuts / hotkeys / command palettes to admin flows?
**A:** No. Click-driven only.
**Apply:** Don't propose or build. Already in PRINCIPLE §2.2.

## #003 — User-facing timelines
**Date:** 2026-04-27 (carried forward) **Scope:** all platforms
**Q:** Can copy reference future delivery ("coming soon", "next release")?
**A:** No. Describe present state only.
**Apply:** Strip from any copy spotted during review. Already in PRINCIPLE §5.1.

## #004 — Email notifications scope
**Date:** 2026-04-27 (carried forward) **Scope:** all platforms
**Q:** Can UI promise email replies/follows/digest?
**A:** No. Email is security-only (password reset / verify / billing / deletion).
**Apply:** Any UI promising broader email = finding. Already in PRINCIPLE §7.2.

## #005 — Launch hides
**Date:** 2026-04-19 (carried forward) **Scope:** all platforms
**Q:** Delete code for launch-hidden features, or keep behind gates?
**A:** Hide via gates/flags. Keep state, queries, types alive so unhide is a one-line flip.
**Apply:** Don't propose deletion of code behind a kill-switch.

## #006 — Kids product scope
**Date:** standing **Scope:** kids
**Q:** Kids web app — review or skip?
**A:** Skip. Kids product is iOS only. Kids web is redirect-only.
**Apply:** Wave C reviews kids iOS only. No kids web units.

## #007 — Genuine fixes vs patches
**Date:** standing **Scope:** all platforms
**Q:** When a finding's full fix is large, can we patch?
**A:** Surface the tradeoff. Default is full integration: kill the thing being replaced, no parallel paths, no TODOs/HACKs/force-unwraps. Patch only when explicitly accepted.
**Apply:** Findings doc records both options when ambiguous; owner picks.

## #008 — Article reader layout (desktop)
**Date:** 2026-05-02 **Scope:** web
**Q:** What's the desktop article-page layout?
**A:** Single article surface with a timeline rail. Article body takes ~75% of screen width; timeline takes the remaining ~25% as a right rail. This is not a balanced two-column grid — the article is dominant, the timeline is a companion. Each timeline entry that references a previous article must be a clickable link to that article.
**Apply:** Reader desktop renders timeline as a ~25% right rail beside a ~75% article body. Not a footer section, not balanced columns. Article body still respects its reading-measure cap (DECISION #4 / 680px) — the 75% is the *region* the article lives in, the body itself stays measured inside it.

## #009 — Article reader layout (mobile / iOS)
**Date:** 2026-05-02 **Scope:** web mobile + iOS adult
**Q:** What's the mobile/iOS article-page layout?
**A:** Three sections per article page — article | timeline | quiz & discussion. Implementation as tabs (not a vertical scroll dump) so each section gets equal weight and the user can move between them without losing place.
**Apply:** No "everything stacked into one long scroll" mobile reader. Tab UI required. Discussion tab covers both quiz and comments.

## #010 — Per-article comment binding
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** Are comment threads tied to one article, or shared across timeline-linked articles?
**A:** Each article has its own comment section. Comments do not span timeline-related articles, even when the articles cover the same story arc.
**Apply:** Reject any design that pools comments across a story timeline. Per-article only.

## #011 — Tab-switch state persistence (article reader)
**Date:** 2026-05-02 **Scope:** all platforms (mobile reader specifically)
**Q:** When users switch tabs in the article reader's discussion/quiz area, should they keep their position?
**A:** Yes. Tab switches preserve scroll position, comment draft text, and any in-progress quiz state. Switching away and back must feel like returning to the same place, not starting over.
**Apply:** Any tab implementation that re-mounts on switch (losing state) is a finding. Use stateful tab containers.

## #012 — Adult gamification register
**Date:** 2026-05-02 **Scope:** web + iOS adult (NOT kids)
**Q:** Should adult surfaces use celebratory popups, scenes, confetti, or unlock overlays for gamification?
**A:** No. Adult gamification is subtle and trust-leaning. Track stats (streaks, quizzes passed, articles read) and surface them in profile/dashboard contexts. No popups, no celebration scenes, no confetti, no full-screen unlock overlays. Subtle inline indicators (count tick, quiet badge) only.
**Apply:** Reject any reviewer/agent suggestion that adds a celebration scene or modal popup to adult flows. Kids product is a separate register and KEEPS its celebration scenes — this rule applies only to adult web + iOS adult.

## #013 — Owner Mode (owner + god mode unified, grantable)
**Date:** 2026-05-02 **Scope:** all platforms (RBAC)
**Q:** Are "owner mode" and "god mode" separate, and who gets them?
**A:** They are **merged into a single Owner Mode** — implemented as one permission/role key (rename `admin.god_mode` → `admin.owner_mode`, including the permission set). Owner Mode = full access to every feature, every plan tier, every admin permission, every gated surface, on both admin and user/profile sides. `admin@veritypost.com` holds it by default via auto-grant. Owner Mode is **grantable to other accounts** by anyone who already holds it; recipients gain identical full access.
**Apply:**
- One permission key (`admin.owner_mode`) — no separate `god_mode` / `is_owner` flags. Rename existing `admin.god_mode` rows to `admin.owner_mode` in the perms catalog and migrate call sites.
- Owner Mode bypasses all permission, plan-tier, and feature-flag gates on web AND iOS.
- Hardcoded `OWNER_EMAILS` backup in `permissions.js:107` + `auth.js:460` is removed (per owner's call 2026-05-02). DB role-grant is the sole identification path.
- Owner Mode is grantable from `/admin/users/[id]` perm editor — granting it gives the recipient full owner-equivalent access.
- Supersedes prior wording that said Owner Mode was "bound exclusively to admin@veritypost.com." Default-bound to that account, but transferable.

## #014 — Admin role (limited, per-user toggleable)
**Date:** 2026-05-02 **Scope:** web admin
**Q:** What's the default admin role's scope?
**A:** Admins have access to `/admin` but their specific permissions are **granular and toggleable per account**, set by the owner. There is no monolithic "admin = everything" — every admin's permission set is individually configured.
**Apply:** Don't ship blanket admin grants. Permission checks are per-permission, not per-role. Owner is the only account with implicit-all-permissions (via Owner Mode #013).

## #015 — Admin user search + permission editing
**Date:** 2026-05-02 **Scope:** web admin
**Q:** How does the owner change a user's permissions?
**A:** From the admin Users surface: search by email / username / handle → open user detail → toggle individual permissions. This is the canonical UI for permission management. No CLI / DB-only / migration-only paths.
**Apply:** `/admin/users` must support text search + per-user detail view + per-permission toggle. Permission changes from this UI take effect without redeploy. Audit trail required (who toggled what, when).

## #016 — Permission editor UI placement
**Date:** 2026-05-02 **Scope:** web admin
**Q:** Embed the full per-permission toggle list on `/admin/users/[id]`, or keep it on the sub-route `/admin/users/[id]/permissions`?
**A:** Sub-route stays. The user detail page (`/admin/users/[id]`) shows a **permissions summary section**: Owner Mode badge if held, count of granted permissions by category, last 5 recent changes, and a prominent "Manage permissions" button that opens the sub-route. The sub-route is where the full toggle UI + filters + scope-override controls live.
**Apply:** Don't inline 50+ permission toggles on the detail page (unscannable). Detail page = summary + entry point. Sub-route = full editor.

## #017 — Audit trail scope
**Date:** 2026-05-02 **Scope:** web admin
**Q:** Show audit history per-user only, or also a global feed?
**A:** Per-user only at launch — last 20 permission changes for the user, displayed on the user detail page. No global `/admin/audit` feed yet. Add a global feed only when admin count grows enough to need cross-user oversight.
**Apply:** User detail page surfaces this user's perm-change history. Don't build the global feed pre-launch.

## #018 — Audit row fields
**Date:** 2026-05-02 **Scope:** web admin
**Q:** What does each audit row capture?
**A:** Each row captures: **who** toggled (admin user_id + email), **which permission** (key + display name), **action** (grant / block / remove / assign-set / remove-set), **before → after** state (was-granted + was-blocked + new state), **reason text** (free-form, optional input from admin at toggle time), **when** (timestamp), **scope_id** (if a scoped override), **expiry** (if temporary grant). UI shows the compact form; expand-on-click reveals the full record.
**Apply:** `admin_audit_log` writes for permission actions must include all 8 fields. Compact UI: who → did what → to which permission. Click to expand for before/after, reason, scope, expiry.

## #019 — User search match fields
**Date:** 2026-05-02 **Scope:** web admin
**Q:** Which user fields does `/admin/users` search match against?
**A:** Email, username, display_name, handle, and user_id (UUID for direct lookup). All five matched against the same search input — no separate "search by" dropdown.
**Apply:** Update `/admin/users/page.tsx` query to OR across these five fields. Direct UUID paste resolves to a single result.

## #020 — Owner Mode visibility to the holder
**Date:** 2026-05-02 **Scope:** web + iOS adult
**Q:** Should holders of Owner Mode see a visible indicator that they have it?
**A:** Yes — but **subtle and private**. The holder sees an "Owner Mode" indicator on their own profile/settings page (small inline label, no badge on public profile). Other users viewing the holder's profile see nothing — Owner Mode is never publicly visible. This applies whether the holder is `admin@veritypost.com` or a granted recipient.
**Apply:** Profile/settings page shows "Owner Mode: ON" inline for holders. Public profile, comments byline, leaderboard, and any other public surface render the holder identically to a normal user. Aligns with #012 (adult subtle tracking) and #001 (no visual identity for tiers/roles).

## #021 — Home is a curated front page, not a today-bound edition
**Date:** 2026-05-02 **Scope:** web (home), iOS adult (home parity)
**Q:** Is `/` a "today's edition" (only articles published today) or a curated front page (any-age curation, owner-picked)?
**A:** Curated front page. `top_stories` is the source of truth — articles can be from today, yesterday, last week. There is no editorial-day cutoff. The "edition" framing was an early stub.
**Apply:**
- Drop the `gte('published_at', today.startUtc)` fallback. When `top_stories` is empty, fall back to "most recent N curated-eligible articles" (date-DESC, no day cutoff), not "today only."
- Remove all "today" copy: masthead `humanDate` dateline (`page.tsx:321`), footer "That's today's edition." (`_HomeFooter.tsx:40`), empty state "Nothing published today" (`page.tsx:336`), header comment lines 47-49.
- Drop the `editorialToday()` helper unless something else needs it.
- The breaking strip's "today only" filter (`page.tsx:211`) is a separate question — breaking is time-sensitive in a way the curated front isn't. Default: keep breaking time-bound, separate decision if owner wants otherwise.
- iOS adult home (Wave D unit 30) inherits the same model — flag in that unit when reached.

## #022 — Slug-less articles never reach the renderer
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** When an article row joins to a story with a null slug, what should the UI do?
**A:** Filter at the query layer. Add `stories.slug not.is.null` to every fetch that renders article links. Drop `href="#"` fallbacks — they become unreachable, and a silent dead link is worse than a missing card. Defer the DB CHECK constraint to a separate data-integrity pass; query-filter is enough for now.
**Apply:** Reject any new code that renders an article link with `href="#"` as a fallback. Reject defensive UI around null slugs — fix the query.

## #023 — No calendar dateline in chrome or mastheads
**Date:** 2026-05-02 **Scope:** web + iOS adult
**Q:** Should any surface display today's calendar date as chrome or as a masthead element?
**A:** No. Per-card relative timestamps ("2h ago", "3d ago") carry the only temporal info readers need. A persistent "today is X" cue is decorative — duplicates the OS clock and implies a cadence the curated front (DECISION #021) doesn't have. Per-article publish-time stays.
**Apply:** Remove existing chrome/masthead daterules. Reject new ones. Per-card timestamps are unaffected.

## #024 — Client islands render immediately, accept perks pop-in
**Date:** 2026-05-02 **Scope:** all platforms (frontend pattern)
**Q:** When a client island renders content visible to everyone but has paid-only enhancements (timestamp, badge, etc.), should it suppress the whole component until perms hydrate?
**A:** No. Render the universal content immediately on first paint. Accept the brief pop-in of paid-only enhancements after perms hydrate (~100-300ms). Suppressing universal content to protect a tiny paid-perk reveal inverts value hierarchy — the universal content is what readers came for. Drop any captured-but-unused `permsReady` state.
**Apply:** Reject "wait for perms before rendering" patterns on islands that show universal content. Paid perks are quiet whisper-reveals (aligns with DECISION #012), not gated content.

## #025 — No social-proof / streak / activity highlights outside profile
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** Can the home, onboarding, or any non-profile surface highlight another user's activity ("[Name] reads this every morning"), streaks, waitlist tenure, or other social-proof affordances?
**A:** No. Never. Stats — streaks, articles read, waitlist days, referrer relationships — live on the user's own profile and nowhere else. No surfacing them on home, no first-login overlays, no welcome ribbons, no sidebar widgets, no notifications referencing other users' activity for social proof.
**Apply:**
- Reject any reviewer/agent suggestion that adds a "[Name] does X" surface to home, onboarding, feeds, or notifications.
- Reject any "your streak is on fire" / "you've read N articles this week" surface outside `/profile`.
- Reject any waitlist-tenure or referrer-name overlay anywhere.
- Existing offenders to remove: `HomeFirstLoginMoment` (entire component — see Unit 1 fix list).
- This supersedes any panel synthesis or external recommendation that suggests preserving "high-leverage" social-proof variants. Owner-locked: never ever.

## #026 — `HomeFirstLoginMoment` removed entirely
**Date:** 2026-05-02 **Scope:** web home
**Q:** Keep the first-login overlay (with bug fixes), strip to inline ribbon, or scrap?
**A:** Scrap. Delete `_HomeFirstLoginMoment.tsx`, remove its import + render from `page.tsx`, drop the `referred_by_user_id` + `access_requests` lookup. Onboarding-completed marker logic that depended on this component moves to wherever else writes `onboarding_completed_at` (verify nothing else relies on this component to set it; if so, set it on first home visit unconditionally via a tiny no-render island).
**Apply:** Implements DECISION #025 for the home surface. No replacement ribbon — first home visit shows the home, nothing more.

## #027 — Restricted-account home CTA matrix
**Date:** 2026-05-02 **Scope:** web + iOS adult (home surfaces)
**Q:** When a user is in a restricted account state, should home CTAs be hidden, dimmed, replaced with state-appropriate copy, or left to the global account-state banner alone?
**A:** Replace the primary home CTA (the "Create free account" / "Browse all categories" closer) with state-aware copy for high-leverage states only. Other states stay banner-only. Browse link and read access are NEVER restricted.
**Apply (per flag):**
- `is_banned` → primary CTA becomes "View suspension details →" (links to support / appeal)
- `frozen_at` → "Contact support →"
- `deletion_scheduled_for` → "Cancel deletion — N days left →" (with N = days until `deletion_scheduled_for`)
- `plan_grace_period_ends_at` (subscription dunning) → "Update payment to keep your subscription →"
- `locked_until` (time-bounded lockout) → banner-only, no home CTA change
- `is_muted` (comment-scoped) → banner-only
- `email_verified=false` (unverified) → banner-only (dedicated verify surface exists)
- Browse link + Browse-all-categories link untouched in all cases — read access is never restricted.
- Order of precedence if multiple flags apply: banned > frozen > deletion-scheduled > grace-period > others.

## #028 — `top_stories` broken-pin handling (manual mode)
**Date:** 2026-05-02 **Scope:** web home (extends to iOS adult home parity)
**Q:** When a pinned row's joined article resolves null (RLS-denied / unpublished / deleted mid-pin), what should the renderer do?
**A:** Pure manual mode. (1) Drop the null pin silently for readers — render N-1 cards rather than auto-top-up from date-sort. The home shrinks until the pin is fixed. (2) Show an admin-only inline banner at the top of the home for users with `admin.dashboard.view`: "N pinned story unavailable — fix in /admin/top-stories →". (3) At write-time, refuse to insert into `top_stories` when `articles.status != 'published'` or `stories.slug` is null.
**Apply:**
- No auto-top-up from date-sort. Owner has chosen manual curation control over algorithmic backfill.
- Admin banner is per-pin: 1 broken → "1 pinned story unavailable", 3 broken → "3 pinned stories unavailable".
- Date-sort fallback ONLY fires when `top_stories` is empty entirely (no pins set), not as a backfill for partial failures.
- Deferred: cascade FK constraint at the DB layer (separate data-integrity sweep).

## #029 — Static hybrid timestamps on article cards
**Date:** 2026-05-02 **Scope:** all web surfaces that render article publish-time
**Q:** What timestamp format should article cards use, given DECISION #021 (curated, any-age) mixes minutes-old and weeks-old in the same column?
**A:** Static hybrid, server-rendered. Articles less than 24 hours old: relative ("5m ago", "3h ago"). Articles 24+ hours old: absolute ("May 2", or "Apr 12, 2025" if cross-year). No client-side ticking, no progressive enhancement.
**Apply:**
- `timeShort()` in `_homeShared.ts` switches to the hybrid: `if (diffMs < 24*60*60*1000) return relative; else return absolute`.
- Hydration mismatch is solved structurally: the bucket is static at render time, no `Date.now()` dependency on client.
- Skip the per-card client island that ticks every minute (fights §5.2 restraint, JS cost not justified for ~1% gain on long-open tabs).
- Same rule applies to BreakingStrip's optional paid-only timestamp (`_HomeBreakingStrip.tsx:94`) — breaking is always <24h so it lands in the relative branch.

## #030 — Article body is universally readable
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** Can paid tier gate the article body itself?
**A:** No. The body always renders for everyone — anon, free, paid, restricted. Ad revenue requires every visitor to see the body. The `article.view.body` permission is dropped from launch perm catalog OR repurposed exclusively for age-gated content (18+) and restricted-account states (banned/frozen). It is NOT a paid-tier gate.
**Apply:**
- Drop the `canViewBody` ternary at `web/src/components/article/ArticleSurface.tsx:91-137` — always render body via `dangerouslySetInnerHTML={{ __html: bodyHtml }}`.
- iOS `StoryDetailView.swift:687-708` upgrade panel removed — body always renders.
- Tier delta is delivered via Sources/Timeline/Discussion/Ask-Expert/Bookmarks/ad-free, NOT via body access.
- COPPA articles still show body to adults per DECISION #036 (with banner). Age-gated content (18+) keeps an explicit gate via the repurposed perm.

## #031 — Paid section affordance pattern (Sources / Timeline locked)
**Date:** 2026-05-02 **Scope:** all platforms (any paid section embedded in a free surface)
**Q:** When a section (Sources, Timeline, etc.) is paid-tier and the viewer's tier denies it, what's the visual treatment?
**A:** Render the section heading + a single muted tease line beneath. Exact pattern: `<h2>Sources</h2>` + one line *"Sources are a Verity Plus perk."* + inline text-link "See plans" → `/pricing`. No button, no icon, no colored badge, no blurred preview.
**Apply:**
- `web/src/components/article/SourcesSection.tsx:51` and `TimelineSection.tsx:107` no longer `return null` on empty paid-tier; render heading + tease.
- Same pattern wherever a paid-only section embeds in a free surface (article reader, future related-content rails, recap detail).
- Heading uses `<h2>` for document outline (closes Reviewer A finding #47).
- Aligns with DECISIONS #001 / #012 / #024 and PRINCIPLE §3.2.

## #032 — Logged-in denial copy pattern
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** When a logged-in user lacks a permission, what's the copy + CTA?
**A:** Branch on auth state.
- Anon → "Sign in to read this." + `[Sign in]` (only when the gate is genuinely auth-related; for paid-only gates, skip — only auth gates use Sign-in copy).
- Restricted account (banned / frozen / deletion-scheduled) → DECISION #027 affordance, NO Upgrade CTA.
- Authed but lacks the permission (paid-tier denial) → "Upgrade to read this." / *short reason* / `[Upgrade]` → `/pricing`.

Long-term improvement: server returns a structured deny reason (`anon | plan | age | restricted | region`) so the client stops guessing — file as future cleanup.
**Apply:**
- Where today's reader says "Sign in" to a logged-in user, switch to "Upgrade" branch.
- iOS already uses "Upgrade" framing — keep parity.
- Web/iOS copy unifies: heading "Upgrade to read." / body "Your current plan does not include this." / `[Upgrade]`.
- For paid-tier sections inside a free surface, use DECISION #031 pattern instead of full-takeover.

## #033 — Editor draft preview pattern
**Date:** 2026-05-02 **Scope:** all platforms — applies wherever editors view unpublished content on a public route
**Q:** Should editors viewing draft / archived content on the public reader see the engagement zone (quiz / comments / bookmark)?
**A:** Yes — render the full engagement zone with a persistent **"DRAFT — not visible to readers"** banner pinned at the top of the engagement region. BUT: intercept submit handlers at a single boundary so editor test interactions DON'T write to prod tables (`quiz_attempts`, `comments`, `bookmarks`, `ad_impressions`). Render a toast on intercepted submit: "Preview mode — not submitted." Optionally log intercepted payloads to admin-only `preview_interactions` table per DECISION #018 audit shape.
**Apply:**
- Drop the `status === 'published'` gate at `web/src/app/[slug]/page.tsx:293, 263` for editors (`canEdit || isGodModeViewer`).
- Wrap submit endpoints (POST `/api/comments`, POST `/api/bookmarks`, POST `/api/quiz/start`, POST `/api/quiz/submit`) with a server-side check: when the target article is non-published AND the actor is editor/owner, return `{ preview: true }` without writing.
- Quiz preview: still allow start + submit (they need to test scoring), but flag the attempt with `is_preview=true` in `quiz_attempts` so it's excluded from analytics + leaderboards.
- Apply to any future preview surface (e.g., ideas drafts, recap drafts).

## #034 — Hide-action reason required (moderation)
**Date:** 2026-05-02 **Scope:** web admin moderation + iOS moderator surfaces
**Q:** When a moderator hides a comment, is the reason required?
**A:** Yes. Required dropdown of pre-set reasons: `harassment` / `spam` / `off_topic` / `abuse_or_threats` / `context_blocking` / `other`. Optional free-text "context" field. Required free-text only when "other" is selected. Remove the `'moderator action'` placeholder fallback entirely.
**Apply:**
- Update disable predicate at `web/src/components/CommentThread.tsx:1078-1086` to gate submit on a non-default selection.
- Remove the `dialog.reason || 'moderator action'` fallback at `:528`.
- Server-side `assertReportReason` mirror for hide reasons; reject empty.
- Same shape applies to category-supervisor flag (`runDialogAction` 'flag' branch) when the action is moderation-grade.
- Aligns with DECISION #018 audit shape.

## #035 — Ask-an-Expert requires article quiz pass
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** Does the "+ Ask an Expert" affordance require quiz pass for the current article?
**A:** Yes. The `expert.ask` permission alone is NOT sufficient — the user must hold the perm AND have passed the current article's quiz. When the user holds `expert.ask` but hasn't passed: render the button in a locked state with one inline upsell line *"Pass this article's quiz to ask an expert."* Click routes into the existing quiz modal. No badges, no exclamation, no celebration (DECISION #012).
**Apply:**
- `web/src/components/CommentThread.tsx:114, 781-785` — gate `canAskExpert` on `hasPermission('expert.ask') && hasPassed`.
- Keep the perm-only check for showing the locked-state pill (perm denies → button absent entirely; perm granted but not passed → locked with upsell).
- Server-side `/api/expert/ask` mirrors the gate (defense in depth) — reject if quiz not passed for the article.
- iOS bridges this gate when Ask-an-Expert ships on iOS (DECISION #007 parity).

## #036 — COPPA article × adult viewer
**Date:** 2026-05-02 **Scope:** web + iOS adult
**Q:** When an adult lands on a kids/tweens article (`is_kids_safe=true` OR `age_band=kids/tweens`) on the adult product, what renders?
**A:** Body shown + small banner placed BELOW the body (where the engagement zone would be), not above. Banner copy: *"From the Kids edition. The quiz, discussion, and reactions live in the Verity Kids iOS app."* CTA: `Open in Verity Kids` → App Store link (env-issued). Plain-text fallback when link unset. Engagement zone (quiz / comments / bookmark / share / view tracker / JsonLd) stays suppressed; `noindex,nofollow` stays.
**Apply:**
- `web/src/app/[slug]/page.tsx:263, 293` — replace silent suppression with the banner-below pattern.
- COPPA-compliant ad serving applies (no behavioral targeting on under-13 content) — that's an ad-network config (DECISION #044 per-tier preview validates), not a UI gate.
- iOS adult mirrors: same banner if a kid-tagged article ID is reached on adult app.
- Aligns with DECISIONS #006 / #012.

## #037 — `?a=<unpublished-article-id>` redirect behavior
**Date:** 2026-05-02 **Scope:** web
**Q:** What happens when `?a=<id>` points at a non-published article for a non-edit reader?
**A:** Redirect to the default published article in the same story. Don't 404 the whole story.
**Apply:**
- `web/src/app/[slug]/page.tsx:128, 230` — when `matched && matched.status !== 'published' && !canEdit`, `redirect(\`/${story.slug}\`)` instead of `notFound()`.
- Editor + Owner Mode keep current behavior (see drafts).

## #038 — `generateMetadata` matches 404 when only drafts exist
**Date:** 2026-05-02 **Scope:** web
**Q:** When a story has only draft articles, the page 404s but `generateMetadata` exposes the draft title/excerpt via fallback. What should metadata return?
**A:** Match the page — return `{ title: 'Article not found · Verity Post' }` and no description / no JsonLd when no published article exists.
**Apply:**
- `web/src/app/[slug]/page.tsx:99-101` — pre-filter: if no `articles.find(...published)`, return the not-found metadata.
- Stops draft titles from leaking via OG / Twitter cards / search-index meta.

## #039 — CommentThread renders thread without waiting for perms
**Date:** 2026-05-02 **Scope:** all client islands with universal content
**Q:** Should CommentThread wait for `permsLoaded` before initial `loadAll()`?
**A:** No. Drop the perm-wait. Render the comment thread immediately for everyone (anon + authed), let perm-derived chrome (sort options, expert filter, supervisor flag actions) pop in once perms hydrate.
**Apply:**
- `web/src/components/CommentThread.tsx:271-273, 602-633` — kick off `loadAll` on mount independent of `permsLoaded`. Skeleton stays only while the actual comments query is in flight.
- This is DECISION #024 applied to comments.

## #040 — Verity Plus tier perks (locked)
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** What does the paid tier (Verity Plus) actually include?
**A:** Verity Plus = ad-free reading + Sources + Timeline + Ask-an-Expert (perm + quiz-gated per #035) + unlimited Bookmarks + (eventually) TTS. Free tier and anon both see the body and may comment after passing the quiz; bookmarks have a free-tier cap.
**Apply (per tier):**
- **Anon:** body + display ads + browse + read-only comments. No bookmark, no comment posting, no Sources/Timeline (tease per #031).
- **Free signed-in:** body + premium ads + first-party-data targeting + native sponsored slots + comment after quiz + bookmark (capped) + read-only Sources/Timeline (tease).
- **Verity Plus:** body + zero ads + Sources + Timeline + Ask-Expert (still quiz-gated) + unlimited Bookmarks + TTS when shipped.
- Comments are universally quiz-gated, NOT tier-gated. Brand line.
- Pricing not locked here — separate decision when ready.

## #041 — Article reader ad slot inventory (locked by panel)
**Date:** 2026-05-02 **Scope:** web (mirror to iOS when iOS ad-serving lands)
**Q:** How many ad slots, where, and what format on the article reader?
**A:** **3 display slots maximum** in the article column (per panel: revenue peaks at 3-4, viewability collapses past 4):
- `article_above_body` — leaderboard / responsive 728×90 + 300×250
- `article_in_body` — mid-body (after ~30% scroll). On signed-in users this slot becomes a **native sponsored unit**; anon sees display.
- `article_end` — end-of-article, before "More in [Category]"

Plus:
- **`article_rail`** (DECISION #008's right rail): 1 × 300×600 multi-size sticky `[[300,600],[300,250],[160,600]]`, sticky AFTER timeline scrolls past. Don't place above the timeline.
- **`mobile_sticky_footer`**: 320×50 anchor, dismissable. Light treatment.
- **`article_quiz_interstitial`**: every 3rd quiz pass (already wired). Format = rewarded skippable video (skip after 5s) per DECISION #045.

All slots gated by `ad_placements.hidden_for_tiers=['paid']` so Verity Plus sees zero ads. Anon-vs-free delta delivered via inventory quality (header bidding + first-party data + native), NOT via slot count.

**Apply:**
- Seed `ad_placements` rows for all six placement keys above.
- Wire `<Ad placement="..."/>` into `web/src/app/[slug]/page.tsx` and `web/src/components/article/ArticleSurface.tsx`.
- Slot density check: 3 in-column slots ≈ 12-18% viewport density, safe under Better Ads Standards 30% trigger.
- Same pattern for home + browse + category surfaces (their own placements per Q14 future scope).

## #042 — Ad-product mix order of operations (locked by panel)
**Date:** 2026-05-02 **Scope:** web ad infrastructure
**Q:** What ad-tech stack at what traffic level?
**A:** Stage-gated, do NOT skip:
- **Stage 0 (now, <100K PV/mo):** AdSense **manual placements** (NOT AutoAds — AutoAds wreck the 75/25 layout). Header bidding under 100K PV loses money to dev cost.
- **Stage 1 (100K–500K PV/mo):** + Ezoic OR Snigel managed wrapper (no dev work, ~10-15% rev-share, +30-60% eCPM lift over AdSense alone).
- **Stage 2 (500K–2M PV/mo):** + Prebid.js + 4 SSPs (Magnite, Index, PubMatic, OpenX) + Amazon TAM + UID 2.0 (free, drop-in Prebid module). +60-120% lift over Stage 1.
- **Stage 3 (2M+ PV/mo):** + LiveRamp ATS (RampID) + GAM PMPs + direct-sales hire. +20-40% on top of Stage 2.

Newsletter sponsorship unlocks at ~10-25K engaged subs (sell via Paved/Swapstack, $30-60 CPM).

**Apply:**
- Stage 0 = current launch state. Don't pursue Prebid before 500K PV.
- Skip Outbrain / Taboola / Revcontent entirely — destroys credibility brand.
- AdSense AutoAds explicitly rejected — manual `<Ad placement="..."/>` only.

## #043 — Registration wall pattern (highest-revenue lever)
**Date:** 2026-05-02 **Scope:** all platforms
**Q:** What does the anon → free signup funnel look like, and where does the wall fire?
**A:** Body stays free for anon (DECISION #030). Sources / Timeline / Comments (post-quiz) / Bookmarks / Ask-Expert are ALL behind signup (free tier — not paid). Signup nudges fire on:
- **Always-on:** Bookmark click (~22-30% conversion at point of intent), Quiz pass (~14-18%), passive end-of-article CTA (~1-2%, no retention hit).
- **Hard gate:** After 3rd article in a 7-day window AND user clicks Sources or Timeline tease — converts 6-9% with <2% retention impact.
- **Never:** Force signup before first read (kills retention 14%, converts <1%).

This model nets ~$833 per 1,000 12-mo visitors per panel modeling; ~75% of that revenue comes from signed-in ads (3-4× anon eCPM via first-party data).

**Apply:**
- New `<RegistrationWall/>` component triggered by Sources/Timeline tease click + 3-article-7-day cohort check. Server-rendered modal with Sign up / Continue reading dismiss.
- Anon read-counter via cookie + server-side rate-limited counter. Don't pixel-track anons; lightweight per-session.
- Post-launch: monitor conversion-vs-retention curve, tune trigger threshold.
- Build as cross-cutting slice (not per-unit). See `UI_UX_REVIEW_SLICES.md` Slice 3.

## #044 — Admin ad system completion (architecture)
**Date:** 2026-05-02 **Scope:** web admin (ad system)
**Q:** What's the full architecture of the admin-controlled ad-placement + analytics system?
**A:** Schema is production-ready (`ad_campaigns`, `ad_placements`, `ad_units`, `ad_impressions`, `ad_daily_stats`, `sponsors`). Admin CRUD works for campaigns / placements / units / sponsors. The build-out closes these gaps:

1. **Subcategory schema** — new `subcategories` table with `category_id` parent, `articles.subcategory_id`, `targeting_subcategories` JSON on `ad_units`. Blocked on TODO-010; resolve first.
2. **Targeting UI** on `/admin/ad-units/[id]`: multi-select for categories (tree with subcategories), cohorts, countries, plans, platforms. Saves to existing `targeting_*` JSON columns.
3. **Analytics dashboard** at `/admin/ad-analytics`:
   - KPIs: impressions, viewable, clicks, CTR, eCPM, revenue (7d / 30d / 90d / custom).
   - Drill-downs: by campaign, placement, ad_unit, advertiser, category, subcategory.
   - Per-advertiser pitch view: "Sports > NFL = X impressions / Y clicks / Z CTR last 30d".
   - CSV export.
   - Built off `ad_daily_stats` + `ad_impressions`.
4. **Slot wiring** — seed `<Ad placement="..."/>` calls on home / browse / category / article / quiz surfaces.
5. **Scroll-depth tracking** — IntersectionObserver on every `<Ad/>` to update `is_viewable` + `viewable_seconds`. Article-body scroll-depth events to `analytics_events` (25 / 50 / 75 / 100% milestones).
6. **Frequency-cap enforcement** — audit `serve_ad()` RPC; ensure it counts user/session impressions and skips units over `frequency_cap_per_user/session`.
7. **Creative approval queue** — `/admin/ads/queue` listing `ad_units` where `approval_status='pending'`. Block `serve_ad()` from returning unapproved units.
8. **Per-tier preview tool** — admin picks a surface + a tier (anon / free / paid) and sees exactly which ads serve.
9. **iOS ad serving** — separate slice, deferred (Apple Mobile Ads SDK or pass through `/api/ads/serve` and render in SwiftUI). NOT in initial launch.

**Apply:**
- Build as Slice 4 in `UI_UX_REVIEW_SLICES.md`. Prerequisite: subcategory schema (Slice 0).
- Permission keys already exist (`admin.ads.*`); no new keys needed except possibly `admin.ads.analytics.view` if separating from `admin.ads.view`.
- Each step verified through MCP queries against actual schema before building.

## #045 — Quiz interstitial = rewarded skippable video
**Date:** 2026-05-02 **Scope:** web (mirror to iOS when iOS ad-serving lands)
**Q:** What format is the quiz interstitial (every 3rd pass)?
**A:** Rewarded skippable video, skippable after 5s, served via GAM with Prebid video adapters. NOT generic display interstitial.
**Apply:**
- `web/src/components/Interstitial.tsx` — wire as rewarded video unit (~$15-25 eCPM vs ~$3 for display interstitial).
- Frame as "watch to unlock comments" — matches the existing quiz-gates-comments mechanic.
- Gated by `article.view.ad_free` (Verity Plus skips entirely) and the every-3rd-pass cadence (`bumpQuizCount`).
- See finding #81 — `bumpQuizCount` localStorage scope must be fixed (per-user-per-article) BEFORE this lands.

## #046 — Don't aggressively convert top-20% free users to paid
**Date:** 2026-05-02 **Scope:** all platforms (subscription strategy)
**Q:** Should we hard-push high-engagement free users to subscribe?
**A:** No. Top quintile generates ~$40/yr in ad revenue at $22 eCPM. A $8/mo sub at 4% churn = $66 LTV. Sub wins by $26 IF they convert — but only ~1.5% convert under hard push and 98.5% churn from annoyance. **Expected value of hard push: NEGATIVE.** Soft self-select only — passive end-of-article CTA, profile/settings upgrade card, no popups.
**Apply:**
- No upgrade interstitials, no "you'd love Verity Plus" interruptions, no email-nag campaigns to engaged free users.
- Verity Plus surfaces stay opt-in (footer link, sources/timeline tease, profile settings).
- Aligns with DECISIONS #012 (subtle adult tone) and PRINCIPLE §8.1 (90% retention floor).

## #047 — iOS report-reasons CSAM trio bridges (legal hardening)
**Date:** 2026-05-02 **Scope:** iOS adult + iOS kids (independent of UI/UX visual pass)
**Q:** iOS comment-report enum is missing CSAM / child_exploitation / grooming reasons that web has — bridge or accept?
**A:** Bridge. Legal exposure under 18 U.S.C. § 2258A — not a UI/UX call, a hardening requirement. Ship as standalone slice (Slice 5).
**Apply:**
- `VerityPost/VerityPost/BlockService.swift:141-158` — extend `ReportReason` enum to include `csam`, `child_exploitation`, `grooming`. Mirror `web/src/lib/reportReasons.js:18-27`.
- Confirmation dialog reorders so the urgent trio appears first, matching web.
- Server-side validation already accepts these values (web side); confirm `assertReportReason` whitelist.
- Apply to both VerityPost (adult) and VerityPostKids if kids has separate report enum.

## #048 — `article_above_body` slot → `article_header` (repositioned)
**Date:** 2026-05-02 **Scope:** web article reader
**Q:** Should the in-article leaderboard slot be seeded as "above the article title" or repositioned?
**A:** Rename to `article_header`, position **between the title/byline block and the first body paragraph** — not before the article title. "Above title" is a Better Ads compliance target (accidental click risk, between-nav-and-content placement) and the top reader-bounce point on quality content sites. Below the headline is a standard, compliant, revenue-positive slot.
**Apply:** Seed `ad_placements` row with key `article_header`, position = `between_title_and_body`. Wire `<Ad placement="article_header"/>` between the article title/byline block and the `dangerouslySetInnerHTML` body div.

## #049 — `article_quiz_interstitial` = standard display at Stage 0
**Date:** 2026-05-02 **Scope:** web article reader
**Q:** Should the quiz interstitial serve AdSense rewarded video (per DECISION #045) at Stage 0 launch?
**A:** No. AdSense does not serve rewarded video — that format requires Google Ad Manager (Stage 2, 500K+ PV/mo). At Stage 0, wire the quiz interstitial to serve a **standard display ad** from AdSense every 3rd quiz pass. Add a code comment: "upgrade to rewarded video (DECISION #045) when GAM ships (Stage 2+)." DECISION #045 format remains the target; this is a Stage 0 bridge.
**Apply:** Seed `ad_placements` row with key `article_quiz_interstitial` and format `interstitial`. Wire standard `<Ad placement="article_quiz_interstitial"/>` in the every-3rd-pass trigger in `Interstitial.tsx`/`ArticleQuiz.tsx`.

## #050 — `home_top` ships with visual separator
**Date:** 2026-05-02 **Scope:** web home
**Q:** Ship the leaderboard above the first hero card on home, or remove it?
**A:** Ship. The slot is standard at quality publishers (NYT, Guardian, WaPo), AdSense-compliant, and the revenue loss from removing the highest-fill slot at Stage 0 is not justified. Mitigate UX concern with a clear thin rule + "Advertisement" label above the unit, visually separating it from editorial content. Monitor bounce rate week 1; remove if spikes.
**Apply:** Seed `home_top` placement. Wire `<Ad placement="home_top"/>` with a visible "Advertisement" label above it (matching the `sponsoredLabel` style in `Ad.jsx` but placed outside the ad card itself).

## #051 — Ad analytics CSV export schemas
**Date:** 2026-05-02 **Scope:** web admin
**Q:** What column headers should the by-campaign and by-category CSV exports use?
**A:** Two schemas, panel-synthesized:

**By campaign (internal reporting):**
`Date, Campaign Name, Advertiser, Placement, Ad Unit, Impressions, Viewable Impressions, Viewability Rate (%), Clicks, CTR (%), Revenue (USD), eCPM (USD), Paid Audience %, Free Audience %, Anon Audience %, Avg Time-in-View (sec)`

**By category (advertiser pitch — no revenue column):**
`Category, Subcategory, Date, Impressions, Viewable Impressions, Viewability Rate (%), Avg Time-in-View (sec), Clicks, CTR (%), eCPM (USD), Paid Subscriber %, Free Registered %, Anonymous %`

Key: revenue excluded from pitch export (leaks pricing floor). Bot impressions excluded from both exports (internal audit only). Revenue/eCPM in USD with 2 decimal places (cents ÷ 100). ISO date (YYYY-MM-DD).
**Apply:** `/admin/ad-analytics` CSV export buttons generate files matching these exact column headers. Date range and drill-down dimension (campaign/category) are pre-applied before export.

## #052 — Up-Next sheet scroll trigger threshold
**Date:** 2026-05-02 **Scope:** web + iOS adult (article reader)
**Q:** At what scroll depth should the Up-Next sheet fire?
**A:** 90%. 3-expert panel unanimous: 90% targets the seam between article body and discussion zone, catching readers at natural exit intent without interrupting reading. 95% fires too late (reader deep in discussion); 85% risks clipping the body on short articles. Post-comment-send is the primary high-intent trigger; scroll-90% is the fallback for non-commenters. Auto-locked: 3/3 convergence.
**Apply:** UpNextSheet fires when `window.scrollY / (document.body.scrollHeight - window.innerHeight) >= 0.90`. Also fires immediately after a successful comment POST. Fires once per article-page-load — set a ref to prevent double-fire.

## #053 — Browse SSR vs. client-only (auto-locked, 3/3 convergent)
**Date:** 2026-05-02 **Scope:** web Browse (`/browse`)
**Q:** Should `/browse` be refactored to a React Server Component (server fetch + client island for filters) for SEO indexability, or is client-only rendering acceptable at launch?
**A:** Defer RSC refactor post-launch. (1) Google News authority is zero at launch regardless of SSR — domain authority and Publisher Center acceptance precede meaningful search placement; SSR has no measurable lift in the pre-authority window. (2) Splitting the 663-line `'use client'` page into RSC + island right before Apple/AdSense review introduces regression risk at the worst moment. (3) The skeleton loading UX is acceptable for the early-adopter cohort.
**Apply:**
- Ship client-only at launch as-is.
- Schedule RSC refactor for first post-launch sprint, tied to Google News Publisher Center submission milestone.
- Improve `loading.tsx` skeleton quality in Slice 11 (see findings #30-32) as the low-effort perceived-performance bridge.
- Metadata (DECISION #053 finding #37): add a server-side `layout.tsx` that exports `metadata` for Browse — this does NOT require an RSC refactor of the page, just a wrapping layout file.

## #054 — Browse filter state persistence (auto-locked, 3/3 convergent)
**Date:** 2026-05-02 **Scope:** web Browse (`/browse`)
**Q:** Should Browse filter state (category, lifecycle, date range, coverage, sort, query) be persisted to URL query params, sessionStorage, or remain in-memory only?
**A:** URL query params via `router.replace` + `useSearchParams()`. (1) `router.replace` (not `push`) keeps history clean — Back exits the page, not back through filter states. (2) URL params solve Back-button restore AND shareable filtered views in one pass. (3) Engineering cost ≈ 1 day; sessionStorage gives ≈ half the benefit at ≈ 60% of the cost, but leaves a permanent sharing gap that requires a second implementation pass. (4) On a browse surface, filters are the core navigation gesture — reset on back-nav directly erodes the trust that drives return visits.
**Apply:**
- On every filter or sort change: `router.replace(\`/browse?${params}\`, { scroll: false })`.
- On mount: read `useSearchParams()` to initialize all 6 filter dimensions. Absent params → `DEFAULT_FILTERS`.
- Shareable link: user navigating to `/browse?cat=Politics&lc=breaking&sort=coverage` sees pre-filtered results.
- Include: `cat`, `lc` (comma-joined lifecycle array), `from`, `to`, `cov`, `sort`, `q`. Omit `quiz` until quiz filter is implemented.

## #055 — Category page filter/sort URL state persistence (auto-locked, extends #054)
**Date:** 2026-05-02 **Scope:** web Category (`/category/[id]`)
**Q:** Should sort mode and subcategory filter selection on `/category/[id]` be persisted to URL params?
**A:** Yes — same reasoning as DECISION #054. URL params via `router.replace` + `useSearchParams()`. (1) Enables Back-button restore after article navigation. (2) Enables shareable filtered category views. (3) Filter is the key navigation gesture on this surface — reset on back-nav erodes return-visit behaviour.
**Apply:**
- On sort or subcategory change: `router.replace(\`/category/${id}?${buildParams(sort, activeSubcat)}\`, { scroll: false })`.
- On mount: read `useSearchParams()` → init `sort` from `?sort=` (default `'Latest'`), `activeSubcat` from `?sub=<uuid>` (default `null`). If `?sub=` UUID doesn't match any loaded subcategory, treat as `null`.
- `visibleCount` is NOT persisted to URL (it is always 5 on page load; "Load more" is session-only).
- Auto-locked: direct extension of #054, 0 divergence.

## #056 — Category page dynamic metadata (auto-locked, extends #053)
**Date:** 2026-05-02 **Scope:** web Category (`/category/[id]`)
**Q:** Should `/category/[id]` layout export a static `metadata` object or dynamic `generateMetadata` per category?
**A:** Dynamic `generateMetadata` in the layout. The category name is fetchable from the DB at request time (same `categories` query, by `id` or `slug`). Returns `title: \`${category.name} · Verity Post\`` and a description derived from `category.description` (or a fallback). This matches DECISION #053's pattern: a server-side layout wraps a `'use client'` page — no RSC refactor of the page needed.
**Apply:**
- Convert `layout.js` to `layout.tsx` (server component, no `'use client'`).
- Export `generateMetadata({ params })` that fetches the category row and returns `{ title, description, openGraph }`.
- Fallback when fetch fails or category not found: `title: 'Category · Verity Post'`.
- `robots`: index/follow (category pages are canonical, linkable surfaces — opposite of search results).

---

*New decisions append below. Never delete — supersede with a follow-up entry referencing the prior number.*
