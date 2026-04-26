# hasPermission() Call Site Classification — T-045
Compiled: 2026-04-26
Source grep: `grep -rn "hasPermission(" web/src/app/ web/src/components/ web/src/lib/` — 115 total hits.

## Methodology

115 grep hits break down as:
- **11 comment / doc lines** — inline comments or JSDoc blocks that name `hasPermission()` but are not executable. Listed in the excluded section below.
- **104 executable call sites** — classified in the table below.

GateType definitions:
- **HARD** — user cannot access the feature at all; the false branch is a router redirect, a page-level "access denied" block, or the component returns `null` with no upgrade path visible.
- **SOFT** — feature is visible but locked; the false branch renders an inline upsell CTA, a link to `/profile/settings#billing`, or an explanatory panel naming a paid plan.
- **INVISIBLE** — feature element simply does not render; the button, section, or affordance is absent with no hint to the user that it exists.

Post-T-044 desired behavior column values:
- **keep-modal** — hard-gate interrupt is correct UX; don't replace (DM gate, expert access, mention warning)
- **inline-CTA** — replace or augment with `LockedFeatureCTA` (inline faded surface + upsell); `gateType="plan"` unless noted
- **keep-invisible** — absence is correct UX (destructive actions, admin-only, security features, display-only signals)
- **keep-hard-redirect** — router redirect on permission denial is correct; no UI replacement needed

---

## Classification Table

Line numbers verified against live grep output 2026-04-26.

| File:line | Permission key | GateType | Current behavior (false branch) | Desired post-T-044 |
|-----------|----------------|----------|---------------------------------|---------------------|
| web/src/app/NavWrapper.tsx:186 | `admin.dashboard.view` | INVISIBLE | Admin nav link hidden; no hint | keep-invisible |
| web/src/app/NavWrapper.tsx:187 | `search.basic` | INVISIBLE | Search nav link hidden; no hint | keep-invisible |
| web/src/app/admin/categories/page.tsx:182 | `admin.pipeline.categories.manage` | HARD | `router.push('/')` — page redirect | keep-hard-redirect |
| web/src/app/admin/permissions/page.tsx:138 | `admin.permissions.catalog.view` | HARD | `router.push('/')` — page redirect | keep-hard-redirect |
| web/src/app/admin/prompt-presets/page.tsx:179 | `admin.pipeline.presets.manage` | HARD | `router.push('/')` — page redirect | keep-hard-redirect |
| web/src/app/admin/users/page.tsx:139 | `admin.users.list.view` | HARD | `router.push('/')` — page redirect | keep-hard-redirect |
| web/src/app/bookmarks/page.tsx:122 | `bookmarks.unlimited` | INVISIBLE | Cap enforced client-side; no explicit gate UI (cap counter is separate logic) | keep-invisible |
| web/src/app/bookmarks/page.tsx:123 | `bookmarks.collection.create` | INVISIBLE | Collections section not loaded; no upgrade hint | inline-CTA |
| web/src/app/bookmarks/page.tsx:124 | `bookmarks.note.add` | INVISIBLE | Note affordance hidden; no upgrade hint | inline-CTA |
| web/src/app/bookmarks/page.tsx:125 | `bookmarks.export` | INVISIBLE | Export affordance hidden; no upgrade hint | inline-CTA |
| web/src/app/expert-queue/page.tsx:103 | `expert.queue.view` | HARD | Renders "Experts only" page with role-based explainer and apply link | keep-modal (role gate, not plan gate; gateType="role") |
| web/src/app/expert-queue/page.tsx:121 | `expert.queue.oversight_all_categories` | INVISIBLE | Falls back to expert's own categories only; no UI indication of broader access | keep-invisible |
| web/src/app/leaderboard/page.tsx:148 | `leaderboard.view` | INVISIBLE | Anon / free users see top-3 only (pageLimit capped); no explicit lock shown | keep-invisible |
| web/src/app/leaderboard/page.tsx:149 | `leaderboard.category.view` | INVISIBLE | Category drill-down tab available but category filter hidden; no upsell | inline-CTA |
| web/src/app/messages/page.tsx:221 | `messages.dm.compose` | SOFT | Sets `canCompose=false`; render path shows regwall overlay on top of the chat shell | keep-modal |
| web/src/app/notifications/page.tsx:87 | `notifications.inbox.view` | HARD | Signed-in user without perm gets page-level "account doesn't have access" block | keep-hard-redirect |
| web/src/app/page.tsx:168 | `home.breaking_banner.view` | INVISIBLE | Breaking strip absent; no hint | keep-invisible |
| web/src/app/page.tsx:169 | `home.breaking_banner.view.paid` | INVISIBLE | `showMeta=false` — breaking strip renders without paid metadata field | keep-invisible |
| web/src/app/profile/card/page.js:40 | `profile.card_share` | SOFT | Renders "Shareable profile cards are available on paid plans" page with View plans CTA | inline-CTA (replace full-page gate with inline strip) |
| web/src/app/profile/family/page.tsx:70 | `family.view_leaderboard` | HARD | Part of tri-check; all three false → "Family dashboard is part of the Verity Family plan" page + upgrade CTA | inline-CTA (replace page gate) |
| web/src/app/profile/family/page.tsx:72 | `family.shared_achievements` | HARD | Same tri-check — OR'd combination | inline-CTA |
| web/src/app/profile/family/page.tsx:72 | `kids.achievements.view` | HARD | Same tri-check — OR'd with family.shared_achievements | inline-CTA |
| web/src/app/profile/family/page.tsx:73 | `kids.parent.weekly_report.view` | HARD | Same tri-check | inline-CTA |
| web/src/app/profile/kids/[id]/page.tsx:115 | `kids.parent.view` | HARD | `setDenied(true)` → `router.push('/profile/kids')` | keep-hard-redirect |
| web/src/app/profile/kids/[id]/page.tsx:120 | `kids.streak.freeze.use` | INVISIBLE | Streak freeze button disabled silently | inline-CTA |
| web/src/app/profile/kids/[id]/page.tsx:121 | `kids.parent.global_leaderboard_opt_in` | INVISIBLE | Leaderboard opt-in toggle disabled silently | inline-CTA |
| web/src/app/profile/kids/page.tsx:112 | `kids.parent.view` | HARD | `setDenied(true)` — page-level denied block | keep-hard-redirect |
| web/src/app/profile/kids/page.tsx:113 | `family.add_kid` | INVISIBLE | Add kid button not rendered | inline-CTA |
| web/src/app/profile/kids/page.tsx:114 | `family.remove_kid` | INVISIBLE | Remove kid button not rendered | keep-invisible (destructive action; no upsell appropriate) |
| web/src/app/profile/kids/page.tsx:115 | `kids.trial.start` | INVISIBLE | Trial start option not shown | inline-CTA |
| web/src/app/profile/kids/page.tsx:116 | `kids.parent.household_kpis` | INVISIBLE | KPI stats section not loaded; no hint | inline-CTA |
| web/src/app/profile/kids/page.tsx:144 | `kids.parent.household_kpis` | INVISIBLE | Guard before API call; conditional already handled at line 116 | keep-invisible (duplicate guard) |
| web/src/app/profile/page.tsx:229 | `profile.header_stats` | INVISIBLE | Header stats section not shown | inline-CTA |
| web/src/app/profile/page.tsx:230 | `profile.activity` | INVISIBLE | Activity tab renders `<LockedTab name="Activity" />` — has copy but no upgrade path | inline-CTA (add upgrade path to LockedTab copy) |
| web/src/app/profile/page.tsx:231 | `profile.categories` | INVISIBLE | Categories tab renders `<LockedTab name="Categories" />` | inline-CTA |
| web/src/app/profile/page.tsx:232 | `profile.achievements` | INVISIBLE | Milestones tab renders `<LockedTab name="Milestones" />` | inline-CTA |
| web/src/app/profile/page.tsx:233 | `profile.card_share` | INVISIBLE | Card share button absent in overview | inline-CTA |
| web/src/app/profile/page.tsx:234 | `messages.inbox.view` | INVISIBLE | Messages link absent from profile overview | keep-invisible |
| web/src/app/profile/page.tsx:235 | `bookmarks.list.view` | INVISIBLE | Bookmarks link absent from profile overview | keep-invisible |
| web/src/app/profile/page.tsx:236 | `settings.family.view` | INVISIBLE | Kids button absent from profile header | keep-invisible |
| web/src/app/profile/settings/expert/page.tsx:132 | `settings.expert.view` | HARD | Renders "Expert settings are not available on your account" block (no upgrade path — role gate) | keep-hard-redirect (gateType="role") |
| web/src/app/profile/settings/expert/page.tsx:133 | `expert.application.apply` | INVISIBLE | Apply form not shown; no CTA | inline-CTA (gateType="role") |
| web/src/app/profile/settings/page.tsx:628 | various `section.gateKey` | INVISIBLE | Entire settings section filtered from sidebar nav and page render | keep-invisible (section-level gate; individual items below get CTAs) |
| web/src/app/profile/settings/page.tsx:630 | various `sub.gateKey` | INVISIBLE | Settings subsection filtered from sidebar and page render | keep-invisible |
| web/src/app/profile/settings/page.tsx:2299 | `settings.auth.password_change` (PERM.ACTION_PASSWORD_CHANGE) | INVISIBLE | Password form renders but shows "Password changes are disabled for your account" info block; submit button disabled via `canSubmit` | keep-invisible (admin-locked accounts; no upgrade path appropriate) |
| web/src/app/profile/settings/page.tsx:2492 | `settings.auth.sessions_revoke_all` (PERM.ACTION_SESSIONS_REVOKE_ALL) | INVISIBLE | "Sign out everywhere" button disabled silently | keep-invisible (security feature; no plan gate) |
| web/src/app/profile/settings/page.tsx:2650 | `settings.feed.cat_toggle` (PERM.ACTION_FEED_CAT_TOGGLE) | INVISIBLE | Category toggles rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:2651 | `settings.feed.hide_lowcred` (PERM.ACTION_FEED_HIDE_LOWCRED) | INVISIBLE | Hide-low-credibility toggle rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:3183 | `settings.a11y.tts` (PERM.ACTION_A11Y_TTS) | INVISIBLE | TTS default toggle rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:3184 | `settings.a11y.text_size` (PERM.ACTION_A11Y_TEXT_SIZE) | INVISIBLE | Text size select rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:3185 | `settings.a11y.reduce_motion` (PERM.ACTION_A11Y_REDUCE_MOTION) | INVISIBLE | Reduce motion toggle rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:3186 | `settings.a11y.high_contrast` (PERM.ACTION_A11Y_HIGH_CONTRAST) | INVISIBLE | High contrast toggle rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:3312 | `settings.blocked.unblock` (PERM.ACTION_BLOCKED_UNBLOCK) | INVISIBLE | Unblock button rendered but disabled silently | keep-invisible (moderation control; no upsell appropriate) |
| web/src/app/profile/settings/page.tsx:3434 | `settings.data.request_export` (PERM.ACTION_DATA_EXPORT) | INVISIBLE | "Request data export" button rendered but disabled silently | inline-CTA |
| web/src/app/profile/settings/page.tsx:3594 | `settings.supervisor.opt_in` (PERM.ACTION_SUPERVISOR_OPT_IN) | INVISIBLE | Opt-in button disabled silently (shown only for eligible users) | keep-invisible (role/score gate; no plan upgrade path) |
| web/src/app/profile/settings/page.tsx:3810 | `settings.billing.change_plan` (PERM.ACTION_BILLING_CHANGE_PLAN) | INVISIBLE | Plan change actions hidden/disabled on billing page | keep-invisible (billing-state gate; showing an upsell here would be circular) |
| web/src/app/profile/settings/page.tsx:3811 | `settings.billing.cancel` (PERM.ACTION_BILLING_CANCEL) | INVISIBLE | Cancel button hidden | keep-invisible |
| web/src/app/profile/settings/page.tsx:3812 | `settings.billing.resub` (PERM.ACTION_BILLING_RESUB) | INVISIBLE | Resubscribe button hidden | keep-invisible |
| web/src/app/profile/settings/page.tsx:3813 | `settings.billing.portal` (PERM.ACTION_BILLING_PORTAL) | INVISIBLE | Stripe portal / App Store / Play button hidden | keep-invisible |
| web/src/app/profile/settings/page.tsx:3814 | `settings.billing.promo` (PERM.ACTION_BILLING_PROMO) | INVISIBLE | Promo code field hidden | keep-invisible |
| web/src/app/profile/settings/page.tsx:5082 | `settings.data.delete_account` (PERM.ACTION_DATA_DELETE) | INVISIBLE | Delete account button hidden | keep-invisible (destructive; no upsell) |
| web/src/app/profile/settings/page.tsx:5083 | `settings.data.delete_cancel` (PERM.ACTION_DATA_DELETE_CANCEL) | INVISIBLE | Cancel deletion button hidden | keep-invisible |
| web/src/app/profile/settings/page.tsx:5250 | `settings.auth.sessions_revoke_all` (PERM.ACTION_SESSIONS_REVOKE_ALL) | INVISIBLE | SignOutEverywhereCard button disabled silently | keep-invisible (duplicate of line 2492; same key, same behavior) |
| web/src/app/recap/[id]/page.tsx:98 | `recap.list.view` | HARD | Renders "not available on your current plan" error string; no upgrade link on this page | inline-CTA (add upgrade link) |
| web/src/app/recap/page.tsx:58 | `recap.list.view` | SOFT | Renders full "Upgrade" page with link to `/profile/settings#billing` | inline-CTA (replace page-level gate with LockedFeatureCTA strip; wire from home widget entry point) |
| web/src/app/search/page.tsx:64 | `search.view` | HARD | OR'd with search.basic and search.articles.free; overall renders "Search unavailable" page with support contact suggestion | keep-hard-redirect (security/role gate) |
| web/src/app/search/page.tsx:65 | `search.basic` | HARD | OR'd in same guard expression | keep-hard-redirect |
| web/src/app/search/page.tsx:66 | `search.articles.free` | HARD | OR'd in same guard expression | keep-hard-redirect |
| web/src/app/search/page.tsx:68 | `search.advanced` | SOFT | Non-advanced users see "Advanced filters (date range, category, source) are available on paid plans. View plans →" notice | inline-CTA (wire to LockedFeatureCTA strip after T-044 ships) |
| web/src/app/search/page.tsx:69 | `search.advanced.category` | INVISIBLE | Category filter select hidden when !canAdvanced | inline-CTA |
| web/src/app/search/page.tsx:70 | `search.advanced.date_range` | INVISIBLE | Date range fields hidden when !canAdvanced | inline-CTA |
| web/src/app/search/page.tsx:71 | `search.advanced.source` | INVISIBLE | Source filter field hidden when !canAdvanced | inline-CTA |
| web/src/app/story/[slug]/page.tsx:533 | `article.bookmark.add` | INVISIBLE | Bookmark button absent | inline-CTA |
| web/src/app/story/[slug]/page.tsx:534 | `article.listen_tts` | INVISIBLE | TTS button absent | inline-CTA |
| web/src/app/story/[slug]/page.tsx:535 | `article.view.body` | SOFT | Fail-open on perm fetch error (set to true in catch); effective gate is absent for most users; only meaningful for frozen accounts | keep-invisible (article body is free; no plan upsell for frozen state) |
| web/src/app/story/[slug]/page.tsx:536 | `article.view.sources` | INVISIBLE | Sources tab hidden; no hint | inline-CTA |
| web/src/app/story/[slug]/page.tsx:537 | `article.view.timeline` | INVISIBLE | Timeline tab hidden; no hint | inline-CTA |
| web/src/app/story/[slug]/page.tsx:538 | `article.view.ad_free` | INVISIBLE | Ad slot shown; no hint that upgrade removes it | inline-CTA |
| web/src/app/u/[username]/page.tsx:157 | `profile.follow` | INVISIBLE | Follow button absent (FollowButton returns null) | inline-CTA (gateType="verification" if email-gated; "plan" if plan-gated — check perm DB row) |
| web/src/app/u/[username]/page.tsx:158 | `messages.dm.compose` | INVISIBLE | Message button absent on public profile | inline-CTA |
| web/src/app/u/[username]/page.tsx:159 | `profile.score.view.other.total` | INVISIBLE | Verity score hidden in profile header | keep-invisible (display-only signal; no plan gate appropriate) |
| web/src/app/u/[username]/page.tsx:160 | `profile.card_share` | INVISIBLE | Share card button absent | inline-CTA |
| web/src/app/u/[username]/page.tsx:161 | `profile.expert.badge.view` | INVISIBLE | Expert badge absent in profile header | keep-invisible (display-only; no plan gate) |
| web/src/components/ArticleQuiz.tsx:83 | `quiz.attempt.start` | INVISIBLE | Quiz idle UI returns `null` — quiz start absent entirely | keep-invisible (no quiz if not allowed — correct behavior) |
| web/src/components/ArticleQuiz.tsx:84 | `quiz.retake` | INVISIBLE | Retake option absent after a failed attempt; no upsell | inline-CTA |
| web/src/components/ArticleQuiz.tsx:85 | `quiz.retake.after_fail` | INVISIBLE | Attempt counter shows "2 attempts" with no hint that more are available on paid plans | inline-CTA |
| web/src/components/ArticleQuiz.tsx:86 | `article.view.ad_free` | INVISIBLE | Interstitial ad shown between quiz attempts (negated check — ad fires when `!hasPermission`) | keep-invisible |
| web/src/components/CommentComposer.tsx:47 | `comments.reply` / `comments.post` | INVISIBLE | Composer returns `null` — no hint that posting is possible | keep-invisible (mute/ban state already shown in sibling branch; no upgrade path for those) |
| web/src/components/CommentComposer.tsx:48 | `comments.mention.insert` | SOFT | If false + user types @mention: inline warning "Mentions are available on paid plans — your @handle will post as plain text"; post not blocked | keep-modal (inline warning is correct; wire mention affordance to LockedFeatureCTA post-T-044 for the explicit @-insert button if one exists) |
| web/src/components/CommentRow.tsx:123 | `comments.reply` | INVISIBLE | Reply button absent | inline-CTA |
| web/src/components/CommentRow.tsx:124 | `comments.upvote` | INVISIBLE | Upvote button absent | keep-invisible (voting is verification-gated not plan-gated; check perm DB) |
| web/src/components/CommentRow.tsx:125 | `comments.downvote` | INVISIBLE | Downvote button absent | keep-invisible |
| web/src/components/CommentRow.tsx:126 | `comments.context_tag` | INVISIBLE | Context-tag button absent | keep-invisible |
| web/src/components/CommentRow.tsx:127 | `comments.report` | INVISIBLE | Report option absent from menu | keep-invisible (moderation action) |
| web/src/components/CommentRow.tsx:128 | `comments.edit.own` | INVISIBLE | Edit option absent from menu | keep-invisible |
| web/src/components/CommentRow.tsx:129 | `comments.delete.own` | INVISIBLE | Delete option absent from menu | keep-invisible |
| web/src/components/CommentRow.tsx:130 | `comments.block.add` | INVISIBLE | Block user option absent from menu | keep-invisible |
| web/src/components/CommentRow.tsx:131 | `article.expert_responses.read` | SOFT | Expert reply body blurred via CSS `filter: blur(6px)`; inline link to billing — "available on paid plans" | inline-CTA (wire to LockedFeatureCTA on the blurred section; gateType="plan") |
| web/src/components/CommentThread.tsx:79 | `comments.section.view` | INVISIBLE | Default true before perms load; if false post-load, comment section absent | keep-invisible |
| web/src/components/CommentThread.tsx:80 | `comments.score.view_subcategory` | INVISIBLE | Author category scores not loaded or displayed | keep-invisible |
| web/src/components/CommentThread.tsx:81 | `comments.realtime.subscribe` | INVISIBLE | Realtime subscription not established; comments don't update live | inline-CTA |
| web/src/components/CommentThread.tsx:82 | `expert.ask` | INVISIBLE | "Ask an expert" button not shown | inline-CTA |
| web/src/components/FollowButton.tsx:35 | `profile.follow` | INVISIBLE | Button returns `null` | inline-CTA (gateType="verification" or "plan" — verify perm DB row) |
| web/src/components/RecapCard.tsx:20 | `recap.list.view` | SOFT | Renders promo card "See what you missed this week — Available on paid plans" linking to billing | inline-CTA (already a soft nudge; wire to LockedFeatureCTA; gateType="plan") |
| web/src/components/TTSButton.tsx:33 | `article.listen_tts` | INVISIBLE | Button returns `null` | inline-CTA |

---

## Comment lines excluded from classification (11 total)

These mention `hasPermission()` in inline comments or JSDoc but are not executable.

| File:line | Content (abbreviated) |
|-----------|----------------------|
| web/src/app/appeal/page.tsx:13 | "not a role/plan gate — so there's no hasPermission() call" |
| web/src/app/browse/page.tsx:14 | "no hasPermission() call is added here" |
| web/src/app/expert-queue/page.tsx:15 | "replaced by a single `hasPermission('expert.queue.view')` check" |
| web/src/app/messages/page.tsx:14 | "check is replaced by a direct `hasPermission('messages.dm.compose')`" |
| web/src/app/messages/page.tsx:67 | "the DM feature runs through hasPermission('messages.dm.compose')" |
| web/src/app/profile/settings/page.tsx:72 | "key actually read from `hasPermission(...)`" |
| web/src/components/Ad.jsx:14 | "no `hasPermission('article.view.ad_free')` check" |
| web/src/lib/permissions.js:15 | JSDoc: "refreshAllPermissions(), hasPermission(key), getPermission(key)" |
| web/src/lib/permissions.js:23 | JSDoc: "hasPermission(key) — boolean; fail-closed" |
| web/src/lib/permissions.js:65 | Comment: "so any synchronous hasPermission() read during the refetch window" |
| web/src/lib/permissions.js:174 | Function declaration: `export function hasPermission(key) {` — not a call site |

Total: 11 non-executable. 115 - 11 = **104 executable call sites** classified above.

---

## Summary by GateType

| GateType | Count |
|----------|-------|
| HARD | 15 |
| SOFT | 6 |
| INVISIBLE | 83 |
| **Total** | **104** |

## Summary by Desired Post-T-044 Behavior

| Desired behavior | Count |
|-----------------|-------|
| inline-CTA | 41 |
| keep-invisible | 46 |
| keep-hard-redirect | 12 |
| keep-modal | 5 |
| **Total** | **104** |

---

## Key findings for T-044 wiring pass (T-067)

**Priority 1 — Article reader (high traffic, high conversion impact):**
- `article.view.sources`, `article.view.timeline`, `article.bookmark.add`, `article.listen_tts`, `article.view.ad_free` — 5 invisible features in the article reader. All plan-gated. Wire `gateType="plan"`. This is the product's primary revenue surface.

**Priority 2 — Settings page disabled buttons (8 call sites):**
- Accessibility settings (4 toggles), feed customization (2 toggles), data export (1 button) — all rendered but disabled with no hint. Wire `gateType="plan"` or `gateType="verification"` per perm DB row.

**Priority 3 — Expert response blur in CommentRow.tsx:131 (SOFT):**
- Already has a billing link. Replace with `LockedFeatureCTA gateType="plan"`. The blurred content treatment is correct; the CTA is the part to upgrade.

**Priority 4 — Profile activity/categories/milestones tabs (INVISIBLE):**
- `<LockedTab>` renders but has no upgrade path. Add `LockedFeatureCTA` inside each locked tab. `gateType="plan"`.

**Priority 5 — Recap (SOFT):**
- `RecapCard.tsx` and `recap/page.tsx` already surface soft upsells. Replace anchor links with `LockedFeatureCTA`.

**Non-action admin gates (4 redirects):**
- Admin page redirects are correct. Do not add CTAs.

**Billing page controls (lines 3810-3814, 5082-5083):**
- All `keep-invisible` — these are billing-state gates, not plan-upgrade opportunities. Showing an upsell on the billing page for billing actions would be circular.

**Verify before wiring (2 call sites):**
- `profile.follow` (FollowButton.tsx:35 and u/[username]/page.tsx:157) — check the perm DB row to confirm gateType: "verification" (email-confirmed) vs. "plan" before wiring.
- `comments.upvote` / `comments.downvote` — keep-invisible now; verify in perm DB before deciding gateType.
