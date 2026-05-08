# Changelog

Entries are brief — enough for another agent to know what changed and why, and to spot if something went wrong.

---

## 2026-05-08

### Owner cleanup — item 12 shipped (Follow stories) — web + main iOS
**Files:** see breakdown below.

Closes the conceptual rebuild kicked off in item 2: the retired bookmarks framing is replaced with explicit per-user, per-story Follow. The unit followed is the **story (slug)**, not the article. New article on a followed story → in-app notification + unread dot in the Following list. Tap the row → land on the latest article + dot clears.

**DB migrations (applied via supabase MCP):**
- `story_follows_owner_cleanup_12` — new table `story_follows (id, user_id FK→users, story_id FK→stories, followed_at, last_seen_at, UNIQUE(user_id, story_id))`. RLS enabled with 4 own-row policies. Indexes on `(user_id, followed_at DESC)` and `(story_id)`. Two SECURITY DEFINER RPCs: `toggle_story_follow(p_story_id)` returns `(following, follow_id)` (idempotent — INSERT or DELETE based on existing row); `mark_story_seen(p_story_id)` bumps `last_seen_at` to NOW() (no-op if not following). Trigger `articles_fanout_story_follow_notifications` writes one in-app `notifications` row per follower (excluding the author) when a published article lands on a followed story.
- `story_follows_trigger_fix_owner_cleanup_12` — adversary surfaced two bugs in the initial trigger: action_url interpolated story_id UUID instead of slug (404'd on tap); fanout fired on INSERT only (missed draft→published UPDATE workflow). Fix joins `stories` for slug and adds a separate `AFTER UPDATE OF status` trigger gated on the published-transition.

**API:** `web/src/app/api/story-follows/route.js` (new). POST = toggle via RPC. GET = list user's follows joined to stories, decorated with `latest_article` + `unread` (latest article published_at > follow.last_seen_at). PATCH = mark seen. DELETE = explicit unfollow. Auth via `requireAuth()`; rate-limit policy `story-follows` at 60/min on POST.

**Web UI:**
- New `web/src/components/FollowStoryButton.tsx` (heart icon + Follow / Following label, anon path opens registration wall, optimistic toggle with revert on failure).
- `web/src/components/ArticleActions.tsx` swapped from `BookmarkButton` to `FollowStoryButton`. Hidden when article has no `story_id`.
- `web/src/app/[slug]/page.tsx` caller now passes `article.story_id`.
- `web/src/components/BookmarkButton.tsx` deleted (`git rm`) — orphaned after the swap.
- `web/src/app/following/page.tsx` rewritten end-to-end. Pulls `/api/story-follows`, renders rows with unread dots, bold title for unread, "New: " prefix on latest article. PATCHes /api/story-follows on row click to mark seen (optimistic dot clear).

**iOS main app:**
- `VerityPost/VerityPost/ContentView.swift` `.following` tab routes to `FollowingView()` instead of `BookmarksView()`.
- `VerityPost/VerityPost/FollowingView.swift` rewritten end-to-end. Queries `story_follows` joined to `stories` via the Swift Supabase client, fetches latest published article per story via a single bulk query, computes unread, renders rows with circle dot + bold title. Tap → NavigationLink to `StoryDetailView` + RPC `mark_story_seen` for live dot clear.
- `VerityPost/VerityPost/StoryDetailView.swift` Save/Saved button replaced with Follow/Following gated on `story.storyId` (hidden if article has no story). New state `isFollowing` + `followBusy`. New `toggleStoryFollow(storyId:)` (POST /api/story-follows + optimistic flip) and `loadStoryFollowState()` (queries story_follows for membership on view appear). Old bookmark state (`isBookmarked`, `bookmarkId`, `attemptBookmark`, `toggleBookmark`) left as orphan since it's still wired into the bookmark-cap alert chain — harmless, no UI references; cleanup pass can remove later.

**Kids iOS — data layer ready, UI deferred:**
- `VerityPostKids/VerityPostKids/Models.swift` `KidArticle` now decodes `story_id`. `ArticleListView.swift` SELECT extended to pull `story_id`.
- The DB table + API + RLS + RPCs + trigger are all kid-safe (RLS scopes to `auth.uid()`; kids users have their own auth path).
- The kid Follow button + kid Following list are NOT shipped this batch. Reasoning: kids tab bar is fixed at 4 (Home / Ranks / Experts / Me) — a Following destination needs its own design pass (sub-section under "Me" vs new tab vs gated entry), and a Follow button without a Following list is a half-affordance for a kid. Filed for the next batch as item 12-kids.

**Adversary pass run after impl** — found 2 trigger blockers (action_url UUID instead of slug; INSERT-only path missing draft→published transitions), both fixed via the second migration before commit. Otherwise clean: SQL inspection confirmed RLS, indexes, RPCs, triggers all in place; web UI handles loading/error/empty/populated states; iOS Story init matches Models.swift memberwise init; orphan bookmark state in StoryDetailView verified as having no live references.

### Owner cleanup — third batch shipped (6, 7)
**Files:** see breakdown.

Closing the remaining cleanup items the owner had open. Item 6 was a quick visual polish; item 7 was a substantive design change to comment edit + a teardown of the follow-ups feature.

**Item 6 — comment-tag chips de-bulked.** `web/src/components/CommentRow.tsx` + `VerityPost/VerityPost/StoryDetailView.swift` (`tagChipButton`) flipped to muted text-only chips: 11px font, tighter padding (4×10 web / 4×10 iOS), 28px min-height, single ink color throughout, no filled backgrounds, no colored borders. Active state = full ink + 600 weight; inactive = muted + 500. Per-tag colors stay defined in `TAG_META`/`commentTagOrder` for any future audit/log surface but aren't used in the chip render. Owner's `feedback_no_color_per_tier` rule applied at the chip level.

**Item 7 — comment edit overhaul + follow-ups retired.** Owner-approved design change: TODO-48 ("non-editable, author can append up to 2 follow-ups") replaced by real edit with a 60-second silent typo grace, a 15-minute hard window, append-only enforcement after the grace, and immediate lock-on-reply.

*DB migration (applied via supabase MCP):* `comments.edit_history JSONB NOT NULL DEFAULT '[]'`. Each entry shape: `{ edited_at, prev_body, prev_body_html, mode: 'typo' | 'append' }`. Server-side only, never exposed in public API responses; used for moderation, abuse appeals, and dispute resolution. Migration name `comments_edit_history_owner_cleanup_7`.

*Server:* `web/src/app/api/comments/[id]/route.js` PATCH path:
- `EDIT_WINDOW_MS` = 15 min (was 10).
- New `TYPO_GRACE_MS` = 60s. Edits inside grace flip is_edited back to false + edited_at to null after the RPC sets them, so reads stay clean (no "edited" marker on early typo fixes).
- New lock-on-reply check using `reply_count > 0` → 403 `comment_locked_by_reply`. Closes the bait-and-switch attack — once anyone has built on a comment, it's frozen.
- New append-only check after grace: `body.startsWith(existing.body)` must hold or 400 `append_only_required`. Author can extend their comment ("\nEdit: …") but cannot rewrite the prefix readers/repliers already saw.
- New history append: each successful PATCH writes one entry to `edit_history` BEFORE the RPC mutates the body. Recorded mode is `'typo'` inside grace, `'append'` after.
- SELECT extended to pull `body_html`, `edit_history`, `reply_count` (+ existing `body`, `created_at`, etc).
- Admin path (`admin.comments.edit.any`) intentionally bypasses window/lock/append checks — the moderation surface stays unaffected.
- The header doc block was rewritten to publish the new contract for cross-platform consumers.

*Follow-ups feature retired entirely:*
- API route `web/src/app/api/comments/[id]/followups/route.js` deleted (`git rm`).
- Web: `CommentRow.tsx` had its `CommentFollowup` type, `EnrichedComment.followups` field, all 5 follow-up state vars + the FOLLOWUP_MAX/CHAR_LIMIT consts, the `followupsMerged` derivation, and the entire ~280-line follow-up JSX block (composer, list, "Add an update" button) deleted.
- Web: `CommentThread.tsx` switched 3 SELECTs from `'*, followups:comment_followups(...)'` to `'*'`. The realtime subscription for the `comment_followups` table (INSERT + DELETE handlers) deleted.
- iOS: `StoryDetailView.swift` had 5 follow-up state vars, the `followupSection(for:)` view function, `relativeUpdateLabel`, `mergedFollowups`, `postFollowup`, `refetchFollowups`, the `followupSection` call site, and the `comment_followups` realtime channel subscribers (INSERT + DELETE async loops) all deleted. The 3 iOS SELECT statements dropped the `comment_followups(...)` embed and added `reply_count`.
- iOS: `Models.swift` had the `VPComment.Followup` nested struct + `followups` field + `case followups = "comment_followups"` CodingKey deleted; `replyCount` field + CodingKey added (drives the lock-on-reply UI gate).
- The `comment_followups` table itself stays dormant per the same pattern as `comments.helpful_count`. No reads, no writes from clients.

*UI gates (so the edit affordance disappears when the user can't succeed):*
- Web `CommentRow.tsx` derives `editWindowOpen` (within 15 min) and `editLockedByReply` (`reply_count > 0`); the edit menu item is gated on `canEditOwnNow = canEditOwn && editWindowOpen && !editLockedByReply`. `hasMenuItems` updated in lockstep.
- iOS `StoryDetailView.swift` Edit button gated on `(comment.replyCount ?? 0) == 0 && (comment.createdAt.map { Date().timeIntervalSince($0) <= 15 * 60 } ?? false)`.
- Server stays the final arbiter; the UI gates just spare the user a 403 on common rejections.
- Kids iOS: n/a (no comment UI).

*Permission separation:* `comments.expert_thread.allow_followup` is the EXPERT THREAD grant feature (asker grants the expert another reply slot). Different concept from author follow-ups, kept untouched.

Adversary pass run after impl — no compile / type / runtime / cross-platform issues found. Edge cases covered: clock skew (POSITIVE_INFINITY fallback blocks edits on malformed timestamps), nil `createdAt` on iOS, nil `replyCount` on iOS (older cached rows treated as no-replies until refresh), history immutability if RPC fails (history records the attempt, body unchanged — semantically correct).

### Owner cleanup — second batch shipped (2, 4, 10, 11)
**Files:** see breakdown per item.

Continuing the page-by-page cleanup pass from `/owner cleanup.md`. Medium bucket: Claude implements + post-impl adversary; one round of fixups after the adversary surfaced two blockers.

**Item 2 — Alerts removed; Saved → Following rename + URL change to `/following`.**
- Web nav: `web/src/app/NavWrapper.tsx` — Alerts top-bar link block deleted (along with the now-unused `unreadCount` state, the polling effect, and the bottom-nav unread-dot rendering). Bottom-nav `Saved → /bookmarks` flipped to `Following → /following`.
- Web routes: `/notifications` directory deleted entirely; `/bookmarks` → `/following` rename via `git mv`. The pre-existing launch-hidden `/following/page.tsx` ("Active Stories") stays — it's the closer concept match for what owner wants out of "following stories." 301 redirects added in `web/next.config.js`: `/bookmarks → /following` and `/notifications → /` (catches stale push payloads + shared deep links).
- Web ancillary: `web/src/middleware.js` PROTECTED_PREFIXES + KNOWN_NON_ARTICLE_PATHS swapped `/bookmarks → /following`, dropped `/notifications`. `web/src/app/robots.js` swapped `/bookmarks → /following`, dropped `/notifications`.
- iOS: `AlertsView.swift` deleted. `ContentView.swift` MainTabView label "Saved" → "Following" (the tab id was already `.following` internally — only the label was wrong). `ProfileView.swift` quickActionChip + quickLink labels flipped from "Saved" to "Following," icon swapped to `heart.fill`. The Alerts quickLink in profile "My stuff" deleted.
- The `BookmarksView` Swift class name is intentionally unchanged — owner direction was URL + label rename only; component-name cleanup is a separate concern.
- `/api/bookmarks` API endpoints + `bookmarks` table stay as the data layer. The "saved articles" UI is retired; data + API remain dormant for any future re-expose. Same pattern as the helpful_count column from the previous batch.

**Item 4 — Timeline right-rail restored on web ≥1180px.**
- `web/src/app/globals.css` — added `@media (min-width: 1180px)` block setting `[data-reader-body]` to CSS Grid `minmax(0, 1fr) 300px` with 32px gap, max-width 1080px. Timeline panel becomes a sticky right rail at `top: calc(var(--vp-top-bar-h, 56px) + 24px)` with `align-self: start` + bounded `max-height` + scroll on the rail itself (so sticky doesn't silently die when ancestor overflow rules change).
- The previously-mobile-only tab-strip block widened from `@media (max-width: 1023px)` to `@media (max-width: 1179px)` so the tabbed UI covers the awkward 1024–1179 zone (where 25% of viewport collapses below ~280px and timeline entries truncate ugly per the Q4 panel's rationale).
- TODO-38 comment header rewritten — "the timeline now flows below the article" was no longer true.
- iOS already shows timeline as a tab; kids has no timeline. Web-only by nature.

**Item 10 — 404 redesign (web only).**
- `web/src/app/not-found.js` — reduced to a single CTA pointing at the home route, copy flipped to "Nothing here. Probably nothing important." Old "out of date / moved or removed" framing + "Browse categories" second button retired.
- `web/src/app/[slug]/not-found.tsx` — same shape, slug-context copy: "Couldn't find that one. Maybe it never happened."
- iOS + kids 404s explicitly out of scope this round (owner direction). Filed as separate items.

**Item 11 — Footer trim to legal-only.**
- `web/src/app/NavWrapper.tsx` footer cut from 14 links + 1 button to 8 legal/compliance links + the Cookie preferences button: Privacy · Kids Privacy · California Privacy · Do Not Sell or Share My Personal Information · Terms · Cookies · DMCA · Accessibility. Each item is required by GDPR / CCPA / COPPA / ePrivacy / DMCA safe harbor or is an industry-standard accessibility commitment.
- The non-legal items (About / How it works / Pricing / Editorial standards / Corrections / Help / Contact) relocated. About is reachable directly via header on signed-out flows + `/about` URL. How it works / Pricing / Help / Editorial standards / Corrections added as a "More" section to the About page (`web/src/app/about/page.tsx`). Apple's App Store Connect Support URL (`/help`) stays reachable via the About page.
- `/privacy#do-not-sell` anchor was missing — added `id="do-not-sell"` on the relevant section in `web/src/app/privacy/page.tsx` (split the California-rights bullet into its own Do-Not-Sell section so the anchor lands cleanly).

Adversary pass after impl found 2 blockers — both fixed before this commit:
1. The `git mv web/src/app/bookmarks web/src/app/following` placed the bookmarks content as a *nested* `/following/bookmarks/` route because `/following/` already existed (launch-hidden Active Stories page). Resolution: deleted the nested bookmarks dir; the existing `/following/page.tsx` is the destination.
2. Footer linked to `/privacy#do-not-sell` but no matching anchor existed in the privacy page. Resolution: anchor added.

### Owner cleanup — first 5 items shipped (1, 3, 5, 8, 9)
**Files:** see breakdown per item.

Working from `/owner cleanup.md` (owner-driven page-by-page cleanup pass). Each item self-contained, no panel review required (trivial bucket).

**Item 1 — tagline removed.** Phrase "Read. Prove it. Discuss." removed from web home masthead (`web/src/app/page.tsx`) and About page (`web/src/app/about/page.tsx`). Variant "Read. Quiz. Discuss." removed from iOS Welcome onboarding (`VerityPost/VerityPost/WelcomeView.swift`). How-it-works step titles ("Read", "Quiz", "Discuss", "Earn") left intact — they're page architecture, not the tagline.

**Item 3 — home sidebar simplified.** `web/src/app/_HomeSidebar.tsx` no longer collapses subcategories behind a chevron. Subs render unconditionally under each parent. Chevron `<button>` + `<svg>` deleted, `useState` import + `expanded`/`setExpanded` state removed. Sidebar still hidden below 1280px (existing behavior — owner confirmed mobile is fine as-is).

**Item 5 — "Helpful" tag/+1 removed across web + iOS.** `helpful` retired as a comment-tag kind. UI is gone; column `comments.helpful_count` stays dormant per locked decision (asymmetric drop cost + labeled-corpus value).
- Web: `CommentRow.tsx` (TagKind type, TAG_META, DEFAULT_TAG_KINDS, helpfulCount/isHelpfulTagged derivations, the heart button, and the now-vestigial `.filter(k => k !== 'helpful')` all removed); `CommentThread.tsx` (TagKind + TAG_KINDS); `redesign/leaderboard/page.tsx` (fixture); `api/comments/[id]/context-tag/route.js` (writer kill — `'helpful'` no longer in `ALLOWED_TAG_KINDS`).
- iOS: `StoryDetailView.swift` (`commentHelpfulCounts` state, `heartHelpfulButton`, the inline "Helpful" badge ~line 2150, the `if kind == "helpful"` branches in `toggleCommentTag` + `revertCommentTagOptimistic`, the `helpful_count` parsing in the response handler — all removed); `Models.swift` (`helpfulCount` field + CodingKey on VPComment); `SettingsService.swift` (`helpfulBadgeThreshold` getter); `Theme.swift` (`tagHelpful` color).
- Kids iOS: n/a (no comment-tag UI, intentional).
- SELECT statements in `StoryDetailView.swift` still fetch `helpful_count` — Codable ignores the column now that the field is gone, harmless and consistent with "leave column dormant."

**Item 8 — drop cap removed.** `web/src/app/globals.css` no longer renders an oversized first letter on the article body's lead paragraph. Single CSS rule (`[data-article-body] > p:first-of-type::first-letter`) deleted. Stale "drop cap on the lead" reference in the typography block comment also cleaned up. Web only — iOS / kids never had a drop cap.

**Item 9 — Messages link 404 fix.** `web/src/app/profile/_sections/MessagesSection.tsx:150` was generating `/messages/${t.id}` (URL segment), but the messages page only accepts `/messages?to=<userId>` (query param). One-line fix: `t.other_user?.id ? '/messages?to=${t.other_user.id}' : '/messages'`. Web only — iOS goes direct to `MessagesView()` and was never broken.

Adversary pass run after impl — no compile / cross-platform / flow issues found beyond the stale CSS comment that's now fixed.

### Security — TODO 7: lock permission-management surfaces to owner_mode
**Files:** seven `route.js` files under `web/src/app/api/admin/permissions/`, `web/src/app/api/admin/permission-sets/`, and `web/src/app/api/admin/users/[id]/permissions/`. Closes the privilege-escalation path TODO 7 named.

**The hole:** any admin holding `admin.permissions.scope_override` (or `admin.permissions.set.edit` / `admin.permissions.assign_to_user` / `admin.permissions.assign_to_plan` / `admin.permissions.assign_to_role`) could promote themselves — or anyone else — to `admin.owner_mode` through the existing admin UI. The granular permission keys were intended for delegated admin tiers but were strong enough to mint the highest tier.

**Fix:** all 7 permission-management write endpoints now require `admin.owner_mode`:
- `POST /api/admin/permissions` (catalog row create)
- `PATCH/DELETE /api/admin/permissions/[id]` (catalog row edit/delete)
- `POST/DELETE /api/admin/permissions/user-grants` (grant/revoke set to user)
- `POST /api/admin/permission-sets` (create permission set)
- `POST/DELETE /api/admin/permission-sets/members` (add/remove keys to set)
- `POST /api/admin/permission-sets/plan-wiring` (wire set to plan)
- `POST /api/admin/permission-sets/role-wiring` (wire set to role)
- `PATCH/DELETE /api/admin/permission-sets/[id]` (edit/delete set)
- `POST /api/admin/users/[id]/permissions` (per-user override + assign_set/remove_set — the exact route TODO 7 named)

Owner is the only user with these keys today (verified via MCP), so the change is a no-op for current usage. It becomes a real guardrail the moment a non-owner admin is onboarded — they'll be unable to escalate themselves regardless of which lower-tier permission they hold. View / read endpoints (e.g. `admin.permissions.catalog.view`) untouched. UI buttons aren't hidden — clicking them by a non-owner just gets a clean 403 toast.

**Future:** when tiered admin roles are introduced (e.g. a `superadmin` who can grant most things but not `owner_mode`), the gates can relax with a "you can't grant a permission you don't have yourself" check at the data layer.

### Pipeline — backward source hydration at generate-time
**Files:** `web/src/app/api/admin/pipeline/generate/route.ts`. Closes the "older related coverage gets missed" gap that the 24h ingest window opens.

**Problem:** RSS ingest pulls only items fetched in the last 24h (default `lookbackMs`). When a new article on the same story arrives days after the original, the older discovery_item is already in the DB but invisible to the in-batch clusterer (`.gte('fetched_at', cutoffIso)` filter), so it never merges into the new cluster. The body-writer then generates from one source even though older, related coverage exists.

**Fix:** New step 9b inserted before source_fetch. Before scraping, the route queries `feed_clusters` for other recent rows (last 30 days, `created_at >=`) whose `keywords` array overlaps the current cluster's via Postgres `&&`. Each candidate gets scored with the existing `keywordOverlap()` from `cluster.ts`; matches above the 0.4 threshold (mirroring story-match) are sorted by score and capped at 5. Their `discovery_items` are pulled (`raw_body` already populated from prior scrape), deduped against the current cluster's URLs, capped at 5 added items, and merged into the `items` array that feeds source_fetch. Already-cached `raw_body` means line 1388's `>200 chars` cache hit fires and the scrape step skips the network round-trip — free hydration.

Skipped on the `source_urls` override path (operator picked specifically) and on standalone / story-generate sentinel clusters (those keywords have no semantic signal). Non-fatal try/catch — a lookup failure logs a warning and falls through to current-cluster-only generation. Logs `newsroom.generate.related_sources_added` with cluster ids + match scores so operator can see what got merged.

Cross-platform: web pipeline only. iOS / iOS Kids automatically benefit (richer corpus produces better articles, no app-side change).

### TODO 51 Part B — consolidated prompt-pass closing the remaining 4 items
**Files:** `web/src/lib/pipeline/editorial-guide.ts`, `web/src/app/api/admin/pipeline/generate/route.ts`, `web/src/app/admin/newsroom/_components/SourcesBlock.tsx`. After 4 skeptical audit agents (one per remaining 51B item), each item collapsed from "architectural" to "prompt-rule + small validator." Owner's instinct was right: 51B was overstated. Closed all 4 in one session, ~150 lines instead of the 17–23 hours / 5–6 sessions originally estimated.
- **#1 Native JSON mode → prompt-fix.** Every JSON-emitting user prompt now ends with "Respond with the JSON object only — no preamble, no markdown fence, no explanation." extractJSON's existing fence-strip + `{...}` regex fallback already handles the long tail. Native tool-use was theater for our <0.5% drift rate.
- **#2 ≥2-sources gate → prompt rule + UI badge.** New EDITORIAL GUIDE rule SINGLE-OUTLET FRAMING (with BAD/GOOD examples). Body system prompt detects single-outlet corpora at runtime via `distinctOutlets.size === 1` and appends a SINGLE OUTLET ALERT directive that names the sole outlet, forcing the model to attribute every contested claim. SourcesBlock UI surfaces a "Single outlet" danger pill so the operator sees the risk before clicking Generate. Hard route gate deferred until traffic + revenue make the hot-news argument real.
- **#3 Per-claim provenance → prompt + regex check.** EDITORIAL GUIDE rule NEVER INVENT ATTRIBUTION strengthened with concrete BAD/GOOD examples. New ATTRIBUTION_PATTERNS regex pass after body generation scans for libel-shaped phrasings ("according to a person familiar," "officials said," "sources said," etc.); any hit flips `attributionFlaggedReview` and feeds `needs_manual_review`. source_grounding threshold tightened from >3 unsupported claims (warn-only) to >0 (flips `groundingFlaggedReview`). Operator now sees these via the existing AudienceCard "Needs review" trust pill. Full structured-provenance JSONB schema deferred until legal asks.
- **#4 Summary-after-body → DROPPED.** Replaced with a 3-sentence scaffold prompt (sentence 1 = setup/context, sentence 2 = event/development, sentence 3 = significance/what's-next). Latency stays parallel; quality target now structural, not length-relative.
- Cross-platform: web pipeline only. iOS / iOS Kids automatically benefit from cleaner article output (no app-side change needed).

### TODO 51 Part B — Anthropic prompt cache restructure + retry-confirm modal
**Files:** `web/src/lib/pipeline/call-model.ts`, `web/src/app/api/admin/pipeline/generate/route.ts`, `web/src/app/admin/newsroom/_components/AudienceCard.tsx`. Closes 2 more of the 51 Part B architectural items.
- **Cache restructuring** — `CallModelParams` got a `system_cache_stable?: string` field. When set (and is a prefix of `system`), `callAnthropicOnce()` splits the system param into a cached `cache_control: ephemeral` block + a second uncached block carrying the per-category append + admin overrides. Without this, Anthropic's 5-min prompt cache hashed the entire concatenated system on every call and never hit (hash differed because override / category differed). The body call's stable prefix is `EDITORIAL_GUIDE` (~5.3K tokens, ~99% of the system payload); for kid/tween audiences it's the whole `KIDS_ARTICLE_PROMPT` / `TWEENS_ARTICLE_PROMPT`. Wired across all 11 call sites in `generate/route.ts` (audience check, headline, summary, categorization, body, source grounding, timeline, kid url sanitizer, quiz, quiz verification). Expect ~5–10× cost reduction on repeated Anthropic generation steps within a 5-min window. OpenAI path unchanged (no native ephemeral cache).
- **Retry-confirm modal** — AudienceCard's failed-state Retry button now arms a two-step inline confirm: first click swaps the action row to a one-line warning ("Retry creates a new article row. Any hand-edits to the previous one will be stranded.") + Yes, regenerate / Cancel pair; second click fires the existing retry endpoint. No modal component, text-only, no icons. Approach B from the 4+4 divergence-resolution panel (preferred over UPDATE-in-place because the latter loses audit trail and can't reliably distinguish operator-dirty columns from pipeline-fresh ones). Operator now gets explicit informed consent before stranding hand-edits on the prior `articles` row.
- Cross-platform: web admin only. iOS / iOS Kids n/a (no admin newsroom).

### TODO 51 Part B — cost hint on model picker + trust signals on AudienceCard
**Files:** `web/src/lib/newsroomModels.ts`, `web/src/app/admin/newsroom/page.tsx`, `web/src/app/admin/newsroom/_components/AudienceCard.tsx`. Closes 2 of the 8 TODO 51 Part B architectural items in tandem.
- **Cost hint** — `MODEL_OPTIONS` got a `costPerArticle` field per entry (~$0.05 GPT-4o Mini → ~$10 Claude Opus 4.7), reflecting the all-in cost of a 12-step editorial chain. Select label now reads "Claude Opus 4.7 · ~$10/article" so the 100× delta is visible before the operator clicks Generate. Native `<option>` `title` attribute carries the same string for keyboard nav and tooltip.
- **Trust signals** — `AudienceCard.fetchArticleStatus` extended to read `plagiarism_status` + `needs_manual_review` from `/api/admin/articles/[id]`. Success state renders an inline pill row (11/600/0.1em uppercase, editorial meta family, text-only — no icons / emojis) with up to one of: **Needs review** (warn), **Rewritten** (dim, neutral), **Original kept · review** (danger), **Rewrite failed** (danger). Empty-good = no pills (no badge spam when all signals are clean).
- Cross-platform: web admin only. iOS / iOS Kids n/a (no admin newsroom).

### Editorial typography family — 16-round visual polish pass across the product
**Files:** every page-shell + section component on web (article, home, profile, leaderboard, messages, search, pricing, login/signup) — see commits below for the per-surface diffs. Pure visual; no schema, no behavior, no chrome additions.
- **The shipped family:** Page H1s 28–44px / 600 / -0.02em / 1.1–1.15. Body 18px / 1.7 / antialiased + kern + liga. Card-list titles 17px Source Serif 4 / 500 / -0.01em / 1.3. Editorial meta family (byline, eyebrows, timestamps, section labels): 11px / 600 / 0.1em uppercase muted-ink. Comment body 16/1.7. Comment author 14/600/-0.005em. Action chips 12/500-inactive/600-active/pill 20px/32-min-height. Button family 14/600/10r with -0.005em. Reading progress ribbon 2px ink. **Restraint rule: weight 700 and 800 banished — 600 is the heaviest active state.** **Color rule: accent-blue is reserved for the Alerts top-bar slot only**; editorial chrome stays in ink + ink-muted + dim. Card chrome borderRadius 10–12, no heavy shadows.
- **Round-by-round commit map:**
  - `4cb4cb56` — Article surface foundation: title 44/600/-0.02, drop cap, body links, blockquote, h2/h3, hr.
  - `5463a21c` — Comment HTML rendering parity, reading ribbon 3px accent → 2px ink.
  - `303eab8d` — NextStoryFooter, mobile tab strip, CommentRow chrome (author/timestamp/pinned label).
  - `98e4fb5b` — Comment action chips (heart, tag pills, replies toggle), Sources heading.
  - `1da66bf7` — CommentComposer (body 14→15/1.7, no shadow, 700→600 buttons), TimelineSection (label serif, NOW badge, heading 0.1em).
  - `71f9d81e` — ArticleQuiz + MidBodyQuizTeaser (passed-state "You're in." 32/700 → 28/600 — calm card, no fanfare, matching the original code-comment intent).
  - `eccf6767` — UpNextSheet (sans 15/700 titles → Source Serif 4 17/500).
  - `1ad718f0` — AnonArticleCtaBanner.
  - `4d250810` — ArticleActions row (Save + Share buttons aligned to 14/600/10r family).
  - `bad539a5` — Home page (Hero, TwoUpCard, SupportingCard, MetaLine, eyebrow, lifecycle pills, BreakingStrip, SectionsMenu).
  - `01190e52` — Profile (StatTile values 800 → 600, all serif headings -0.01 → -0.02, AppShell rail, expert/verified badges).
  - `d340d33a` — `/leaderboard` (7 weight-700 violations swept).
  - `4492d871` — `/messages` (densest concentration of 700/800 — H1, paywall dialog, conversation list, message bubbles all aligned).
  - `d70eea5d` — `/search` (H1 24/800 → 28/600, result-card titles to Source Serif 4 17/500, meta to 11/600/0.1em).
  - `823240f9` — `/pricing` (price weight 800 → 600 — removes "loud SaaS landing page" feel).
  - `976b70a7` — `/login` + `/signup` (logo accent-blue → ink, "Check your email" 26/700 → 28/600, featured-article read link accent-blue → editorial underline).

### Bug-sweep pass — Messages, NavWrapper, KidsStoryEditor
- **Messages badge counted general notifications, not DMs** (commit `970204c4`). ProfileApp's Messages-rail badge was sourcing from `/api/notifications?unread=1` (counts comment replies, follow events, mentions, etc.) instead of the `get_unread_counts()` RPC the `/messages` page uses. Fixed: badge now sums per-conversation unread counts from the same RPC. Source of truth shared with the inbox page.
- **NavWrapper polled `/api/notifications` with no consumer** (commit `9b6d5f6e`, then re-enabled in `3b46fede` with a real consumer). The bottom nav lost its `/notifications` slot but the 60-second poll kept running; gated to no-op when no nav item references the route. Re-enabled when the Alerts top-bar slot landed.
- **`/api/conversations` GET 404** → MessagesSection inline view always rendered "no conversations" (commit `0f735260`). Route only exports POST; the inline section's GET fetch silently 404'd into the catch block. Fixed by reading directly via supabase client (same query the `/messages` page uses).
- **KidsStoryEditor "AI generate" + "Simplify language" buttons POSTed to `/api/ai/generate` which doesn't exist** (commit `793b02b1`). Empty placeholder directory; every click 404'd silently behind a misleading "AI API key not configured" toast. Removed dead UI; comment marks the spot for future build.

### Following → Saved rename + Alerts top-bar link
**Files:** `web/src/app/NavWrapper.tsx`, `BookmarkButton.tsx`, `bookmarks/page.tsx`, `profile/_components/ProfileApp.tsx`, `VerityPost/VerityPost/ContentView.swift`, `StoryDetailView.swift`, `ProfileView.swift`. Commit: `3b46fede`.
- **Decision-driven from a 4+4 panel** (4-expert audit + 4 fresh judges to break a 2:2 tie). Verdict: 4/0 unanimous on second round — bookmark feature is functionally a manual save with no notifications and no auto-feed; "Following" semantically implies a subscription stream (which the user-graph IS or will be). Today's labels were inverted vs what the features actually do.
- **Article-following surfaces renamed to "Saved"**: bottom-nav slot (web + iOS), profile rail entry, page H1, `BookmarkButton` labels (Save / Saved), iOS Tab.following label, iOS sign-in-gate copy, iOS quick-action chip, iOS profile quick link. Schema untouched (`bookmarks` table).
- **User-graph "Following" surfaces preserved**: profile YouSection stat tile, `FollowButton`, `PublicProfileView`, `FollowingView` (iOS), `UserFollowListView` nav title.
- **"Alerts" top-bar link** added on web (text-only, dim → accent + bold when unreadCount > 0). Single visible-when-needed entry point to `/notifications` from every page; no icon, no dot, color shift is the entire signal (per owner directive).

### Following as 3rd bottom-nav slot (web + iOS)
**Files:** `web/src/app/NavWrapper.tsx`, `VerityPost/VerityPost/ContentView.swift`. Commit: `800fd60d` (later renamed to "Saved" in `3b46fede`).
- Article-level following was reachable only via Profile → Library → Following (2 clicks). Both surfaces gained a direct slot; logged-in nav becomes Home / Following / Profile (web) and Today / Following / Profile (iOS Tab enum). Anon nav unchanged.
- Story-level `/following` (Active Stories) surface remains launch-hidden — different page, different watch list.

### TODO 47 — Advanced search filters on iOS
**File:** `VerityPost/VerityPost/FindView.swift` (rewritten). Closes TODO 47. Audit-driven plan; one override on the agent's plan (Filters affordance is text-only, not an icon, per the editorial restraint rule).
- New filter sheet (`.sheet`-presented from a "Filters" text button at the trailing edge of the search bar). Three filter rows, each gated independently by its own permission so anon and free users see only the doors they can open: `search.advanced.category` (Picker over top-level non-kids categories with `deleted_at IS NULL`), `search.advanced.date_range` (two `DatePicker`s with a "Clear dates" reset), `search.advanced.source` (free-text publisher field, matches web).
- Active-filter chip strip below the search bar surfaces every applied filter as a tappable pill (12/600 with × glyph). Tap clears that filter and re-runs the search.
- `doSearch()` now appends `category` / `from` / `to` / `source` query params when the corresponding permission is granted AND the filter has a value. Param shape matches `/api/search` exactly — same endpoint web uses.
- Permission resolution via `PermissionService.shared.has(...)` resolved on mount + on `PermissionStore.changeToken` (mirrors the AlertsView pattern).
- Result-row typography snapped to the editorial card-list family: 17px Source Serif 4 / 500 / -0.17 tracking title, 14/regular muted excerpt, 11/600/0.1em uppercase byline meta. Same shape as UpNextSheet / NextStoryFooter / SectionsMenu / web `/search`.
- iOS Kids: n/a (kids has no search surface).

### TODO 45 — iOS ads wired end-to-end (home + article)
**Files:** `VerityPost/VerityPost/HomeFeedSlots.swift` (rewrite), `HomeView.swift`, `StoryDetailView.swift`. Closes TODO 45. Audit-driven plan from a fresh agent verified against the live `serve_ad` RPC + impression/click endpoints.
- **AdPayload rewritten.** Old shape decoded a flat `{id, title, body, click_url}` from the response root; the API actually returns `{ ad_unit: {...} | null }` wrapping the row. New `AdServeResponse` + `AdPayload` decodes the 9 columns the `serve_ad` RPC emits (`id`, `placement_id`, `ad_format`, `creative_url`, `creative_html`, `click_url`, `alt_text`, `cta_text`, `advertiser_name`). Optional RPC columns (`campaign_id`, `ad_network`, `ad_network_unit_id`, `reduced`) safely ignored.
- **Impression + click bodies fixed.** Old code POSTed `{ad_id, placement}` to both endpoints — both wrong. Impression now sends `{ ad_unit_id, placement_id, page, position, session_id, article_id? }` (matches `/api/ads/impression`'s required UUID fields). Click captures the impression's returned `impression_id` and POSTs `{ impression_id }` (matches `/api/ads/click`).
- **Per-launch session id.** New `AdSession.id = UUID().uuidString`; mirrors the EventsClient pattern. Threaded through serve and impression so frequency caps + reporting work.
- **HomeAdSlot now takes `placement` + `page` + optional `articleId`** (was hardcoded to `placement=home_feed`, a placement that doesn't exist in `ad_placements`). Self-hides on no-fill or any failure so a broken ad never breaks the surface.
- **HomeView wired** at four positions, mirroring the web feed: `home_top` after hero, `home_in_feed_1` after supporting card index 3 (4th card), `home_in_feed_2` after index 7 (8th card), `home_below_fold` after the supporting list.
- **StoryDetailView wired** at three positions, mirroring `[slug]/page.tsx`: `article_header` between byline and body, `article_in_body` immediately after the body, `article_end` before the pass-to-comment CTA. Each slot passes `articleId: story.id` so server-side category-targeting works.
- **All 7 placement names verified in `ad_placements`** via MCP before wiring.
- iOS Kids: not applicable.

### TODO 39 — iOS tag-row parity ports the web pattern
**File:** `VerityPost/VerityPost/StoryDetailView.swift`. Closes the iOS half of TODO 39 (web shipped 2026-05-07, commit `dd73c1ec`).
- Replaced the old `+ Tag` opens-picker UX in `commentTagChipsRow` with the always-visible heart + three inline pills: `helpful` is a heart-icon button (unicode ♥/♡, matches the web rendering exactly) at the front of the row, followed by `context` / `cite_needed` / `off_topic` as always-visible pill chips. No opener, no picker, no two-step reveal.
- Chips share the web action-chip family shape: 12px / weight 500 inactive / 600 active, pill 20px radius, 32 min-height, transparent → tinted-color bg on cast.
- Helpful heart picks up `VP.tagHelpful` for the cast state (matches the existing color choice from `commentTagOrder`).
- Dropped dead state (`tagOpenCommentId` `@State` + `tagPickerOpen(for:)` helper) — no callers after the redesign. Build clean.

---

## 2026-05-07 (continued)

### TODO 36 finish — deselect, row-list rank, percentile on leaderboard
**Files:** `web/src/app/leaderboard/page.tsx`, `web/src/app/profile/_sections/CategoriesSection.tsx`. Commit: `6611fb8c`. No DB.
- **Sub-pill deselect alignment.** `/leaderboard`'s `setActiveSub` toggles off on second click — matches the profile pattern. One mental model across both surfaces.
- **Rank in the profile's all-parents row list.** "Score" caption under each parent's score becomes `#14` when the user has a rank for that category, falling back to "Score" otherwise. See standing without drilling into the scope card.
- **Percentile on `/leaderboard`.** `CEIL(rank / total * 100)` derived client-side from the loaded users list (suppressed when only one participant). Rendered in the "Your rank" inline card up top and the sticky bottom bar — same "top X%" string the profile shows.
- TODO 36 closed.

### TODO 36 — Category leaderboard, mostly shipped
**Files:** `web/src/lib/scoring.js`, `web/src/app/api/comments/[id]/context-tag/route.js`, `web/src/app/profile/_sections/CategoriesSection.tsx`, `web/src/components/ArticleEngagementZone.tsx`, `web/src/app/[slug]/page.tsx`, `web/src/app/leaderboard/page.tsx`, `web/src/types/database.ts`. Commits: `a2fef2a8`, `c6fc6a71`, `6ce3f584`. **DB migrations:** `score_receive_context_tag` (new score_rules row), `user_category_ranks_self_only` (new RPC).
- **Context tag now scores into the article's category.** Replaces the legacy `receive_helpful_tag` path (the rule was never seeded into `score_rules` — silent no-op for as long as it's been wired). The Helpful tag is the heart / social signal in the new comment voice model and intentionally does not score. New `receive_context_tag` rule = 15 pts, max 20/day. `scoreReceiveContextTag` reads the comment's article + the article's category and passes both to `award_points` so a great Politics commenter actually moves on the Politics leaderboard.
- **Rank + percentile in the profile.** New `user_category_ranks()` RPC — window-function pass over `category_scores` partitioned by `(category_id, COALESCE(subcategory_id))` returns the caller's rank, total participants, and "Top X%" per leaf in one round trip. RPC is `auth.uid()`-scoped (no parameter; matches `category_scores` RLS posture). `CategoriesSection`'s scope card now reads "47 score · #14 of 612 · top 2%" — same scope (parent OR sub-pill leaf) drives both the metrics block and the rank line.
- **Article → leaderboard entry point.** Below the comment thread on every article (signed-in, quiz-passed branch), centered "See {Category} leaderboard →" link routing to `/leaderboard?cat=<id>`. `ArticleEngagementZone` got a new `articleCategoryName` prop fed from the article page's existing category load.
- **Sticky leaderboard rank bar shows the active category.** Was just "Your rank · #15 · 1234"; now reads "Your rank · Politics" with parent active or "Your rank · Politics · Elections" with a sub drilled in. Falls through to plain "Your rank" on the global view.
- **Tail item still open:** subcategory deselect-on-click inconsistency between profile (toggles off) and leaderboard (drilldown semantics). Minor UX polish; tracked as the lone TODO 36 remainder.

### Daily impression cap on ad units
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx`, `web/src/app/api/admin/ad-units/[id]/route.js`, `web/src/types/database.ts`. Commit: `3ad9dd24`. **DB:** `ad_units_daily_impression_cap` migration (new column + `serve_ad` rewrite).
- Common direct-buy ask: "stop after N impressions per day." The existing freq caps were per-user / per-session only — there was no ad-unit-wide daily ceiling.
- New `ad_units.daily_impression_cap int` (NULL = no cap). `serve_ad` adds one COUNT against today's impressions for the unit; same access pattern as the existing freq caps. Admin form has a NumberInput in the Creative & settings grid; treats 0 as "no cap" and sends NULL on save. PATCH ALLOWED list updated. Types regenerated.

### Placement utilization badge + creative thumbnails
**File:** `web/src/app/admin/ad-placements/page.tsx`. Commit: `d00bb77b`. Pure UI.
- Placement list shows an active+approved unit count per placement (warn-tinted "0 ads" badge when empty so it jumps out). Counts come from a single GET `/api/admin/ad-units` aggregated client-side; refresh on unit save / delete.
- Each unit row in the right pane shows a 48×32 thumbnail of `creative_url` (cover-fit, dashed-border fallback for HTML-only ads).

### Campaign pacing block on the ad-unit page
**File:** `web/src/app/admin/ad-units/[id]/page.tsx`. Commit: `6c42ea53`. **DB:** none — uses existing `ad_campaigns` columns.
- Renders a "Campaign pacing" section between Performance and Creative & settings only when the unit has a `campaign_id`. Four tiles (Spent / Budget / Daily cap / Pacing status). Spend-progress bar with a vertical marker at the time-elapsed-fraction in the campaign window so the operator can eyeball variance. Pacing buckets: on-track within ±10%, slightly off 10–25%, off >25%. Open-ended campaigns (no end_date) skip the pacing comparison.
- Lifetime impressions / clicks / pricing model in the footer line.

### Ad-unit performance panel
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx`, new `web/src/app/api/admin/ad-units/[id]/performance/route.js`. Commit: `b4da9f6e`. **DB:** `ad_unit_performance` RPC via `mcp__supabase__apply_migration`.
- Closes the asymmetry the targeting work created — operators could configure deeply but never see what happened. Performance is now the first section on `/admin/ad-units/<id>`.
- New `ad_unit_performance(p_unit_id uuid, p_days int)` RPC aggregates `ad_impressions` directly (`is_clicked` + `revenue_cents` are on the row — no join with `ad_clicks` needed). Excludes `is_bot=true` rows. Returns impressions / clicks / CTR / revenue, per-category breakdown, and a per-day series. Admin-only.
- New GET `/api/admin/ad-units/[id]/performance?days=N` (admin.ads.view, 60/min limit, days clamped 1–365 default 30).
- UI: 7 / 30 / 90 day selector in the section header, four headline tiles, top-8 category table with per-category CTR, daily impressions sparkline. Auto-loads on mount and on period change with race-cancel; empty-state copy when there are no impressions yet.

### TODO 11 cleanup — drop dead targeting jsonb columns
**Files:** `web/src/types/database.ts`, `web/src/app/api/admin/ad-units/[id]/route.js`. Commit: `7dc30203`. **DB migration:** `drop_dead_targeting_columns_on_ad_units` via `mcp__supabase__apply_migration`.
- Dropped five jsonb columns from `ad_units` that had been read-and-write dead since the unified `ad_targets` ship in `fcf52c70`: `targeting_categories`, `targeting_subcategories`, `targeting_platforms`, `targeting_countries`, `targeting_cohorts`. Verified zero references across `web/src`, `VerityPost`, `VerityPostKids` before dropping.
- Regenerated `database.ts`. Stale comment in the PATCH route trimmed.
- **TODO 11 closed.**

### TODO 11 polish — schedule, tri-state exclusion, reach estimator, category logging
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx`, `web/src/components/admin/TextInput.jsx`, `web/types/admin-components.d.ts`, new `web/src/app/api/admin/ad-units/[id]/estimate-reach/route.js`. Commit: `91fc2933`. **DB migrations:** `ad_impressions_category_id` (new column + `log_ad_impression` rewrite) and `estimate_targeting_reach_rpc` (new function), both applied via `mcp__supabase__apply_migration`.
- **Schedule fields** — `start_date` / `end_date` columns now render in the admin form as native date inputs in a new "Schedule" PageSection between Creative and Targeting. `null` = no bound. `TextInput` accepts `date` / `datetime-local` (JSDoc + `.d.ts` widened).
- **Tri-state UI for exclusion** — wires the existing `mode='exclude'` schema into the category tree. Under a checked parent, sub checkboxes render checked unless explicitly excluded; clicking a sub there adds a `subcategory exclude` row instead of an `include`. New `TriStateCheckbox` component sets `el.indeterminate = bool` via ref-callback (DOM property can't be set through React's `checked` prop alone). Parent indeterminate when any child is excluded. Removing parent strips child excludes (no orphan rows). Banner text updated to explain the model.
- **Check reach estimator** — new `estimate_targeting_reach(p_targets jsonb, p_days int)` RPC mirrors `serve_ad`'s include / exclude / wildcard predicate against the last N days of articles. New `/api/admin/ad-units/[id]/estimate-reach` POST endpoint runs it against the form's *unsaved* targeting array (admin auth + 60/min rate limit). New "Check reach" button under the Targeting section reports "Eligible on N of M articles published in the last 7 days" and flags zero-match in danger color. Predicate verified end-to-end via MCP (World-targeted matches Europe article via parent; Politics-targeted matches UK two-party).
- **`category_id` on `ad_impressions`** — new column + partial index, `log_ad_impression` rewrite derives `category_id` from `articles` for each impression. Click rows inherit via the impression-id join (no separate column). Reporting can now split targeted-by-category vs run-of-site performance.
- **Cross-platform:** web admin only. iOS / iOS Kids consume `serve_ad` output unchanged.

### TODO 11 — Targeting goes live via unified `ad_targets` table
**Files:** `web/src/app/admin/ad-units/[id]/page.tsx` (rewrite), `web/src/app/api/admin/ad-units/[id]/route.js`, `web/src/app/api/admin/ad-units/route.js`, `web/src/types/database.ts` (regenerated). Commit: `fcf52c70`. **DB:** new `ad_targets` table + `replace_ad_targets` RPC + `serve_ad` rewrite (applied via `mcp__supabase__apply_migration`).
- **Schema (forward-compatible):** `ad_targets(ad_unit_id, target_type CHECK ('category','subcategory','article'), target_id, mode CHECK ('include','exclude') DEFAULT 'include', created_at)`. PK = `(ad_unit_id, target_type, target_id)`. FK CASCADE on `ad_unit_id`. Indexes on `(ad_unit_id, mode)` and `(target_type, target_id)`. RLS enabled, no policies — RPCs read/write via `SECURITY DEFINER`. Future target types (platform, country, cohort, story-collection) plug in by extending the CHECK constraint and the `serve_ad` resolver — zero new DDL on this table.
- **`serve_ad` rewrite:** resolves article context once (`v_cat`, `v_sub`, `v_cat_parent`, `v_sub_parent`) via two `LEFT JOIN`s on `categories`. INCLUDE branch: untargeted ad (no include rows) serves anywhere; targeted ad must match at least one include row. EXCLUDE branch: any match kills the ad. Wildcard parent semantics handle BOTH article shapes — `category_id` as a top-level (Politics) AND `category_id` as a subcategory (Europe with `parent_id=World`). The IN-list direction `t.target_id IN (v_cat, v_cat_parent, v_sub_parent)` is null-safe.
- **`replace_ad_targets` RPC:** admin auth via `is_admin_or_above()`, 500-target cap, atomic delete-all-then-insert for one ad unit. Called from the PATCH route after the main row update.
- **Admin form rewrite:** unified `adTargets` array sourced from `ad_targets`. Categories tree: parent check adds a `category` target row, child check adds a `subcategory` target row. Parent-checked + expanded shows wildcard caption (preserves the prior `toggleCat` fix in `9315a310`). New "Specific articles" section with 300ms debounced `ilike` search on `articles.title` (limit 25, ordered by `published_at DESC NULLS LAST, created_at DESC`); selected articles render with title + Remove. Empty-targeting banner. Categories fetch filters `deleted_at IS NULL` (1 tombstone exists).
- **Form fields dropped this session:** `targeting_subcategories`, `targeting_platforms`, `targeting_countries`, `targeting_cohorts` UI removed. `serve_ad` never read these columns; per adversary review, shipping UI for unwireable dimensions is the silent-lie failure mode. The dead jsonb columns on `ad_units` are NOT dropped this session (left harmless to avoid a deploy window where running code references columns that no longer exist) — a future cleanup migration drops them.
- **`PLAN_OPTIONS` fixed:** the form's `verity_plus` value matched no row in `plans.tier`. Real values are `free` / `verity` / `verity_pro` / `verity_family`.
- **PATCH route:** `ALLOWED` list trimmed to drop the 5 dead jsonb fields. Validates incoming `ad_targets` array (silently drops malformed rows at the boundary; RPC enforces auth + cap). Audit-log includes the targeting payload.
- **POST route:** drops the lone `targeting_categories` create-time write. New ad units start with zero targets; admin sets them via PATCH after create.
- **End-to-end serve test (run via `mcp__supabase__execute_sql` before commit):** untargeted ad serves on both Politics and Europe articles. Targeted to World matches Europe (parent lookup) and does NOT match Politics. Article-level include matches only the targeted article. Predicate null-safe.
- **Cross-platform:** web admin only. iOS / iOS Kids consume `serve_ad` JSON output unchanged (no targeting fields surface client-side).

### TODO 11 Wave 1 — Parent-check is wildcard, not snapshot
**File:** `web/src/app/admin/ad-units/[id]/page.tsx`. Commit: `9315a310`.
- `toggleCat` no longer writes a snapshot of current child subcategory IDs into `targeting_subcategories` when a parent is checked. Parent membership in `targeting_categories` now means "this category and all current and future children" — wildcard semantics.
- Sub-list render: when a checked parent is expanded, the per-child checkboxes are replaced by an italic caption *"All {cat.name} subcategories targeted (current and future)."* Children remain individually toggleable when the parent is unchecked.
- Load-time normalization drops any `targeting_subcategories` entries whose parent is already in `targeting_categories`. Legacy rows (parent + child snapshot from the bug) self-heal into the wildcard model on first save.
- **Wave 1 collapsed to this single fix.** Pre-impl panel discovered the live `serve_ad` Postgres function does not filter on `targeting_categories` / `targeting_subcategories` (or any other `targeting_*` column) — the admin form has been writing to columns the runtime ignores. 4/4 fresh independent reviewers agreed: shipping the JSON→uuid[] migration + GIN indexes, tri-state UX, and "empty=all" banner ahead of the RPC rewrite would be premature. Those items belong in a future "targeting goes live" session that ships column-type change + `serve_ad` RPC rewrite + UI semantics atomically.
- Cross-platform: web admin only. iOS / iOS Kids n/a.

### TODO 3 + TODO 38 — Sources inline + drop the desktop side rail
**Files:** `web/src/components/article/SourcesSection.tsx`, `web/src/app/[slug]/page.tsx`, `web/src/app/globals.css`. Commit: `a9c53cf5`.
- **TODO 3 — sources moved into the article body.** SourcesSection rewritten as logo-driven rows. Each row is a button showing publisher favicon (Google s2 favicons API at `sz=32`, 16px rendered) + hostname (`bbc.co.uk`, `congress.gov`). Click toggles a panel below with the source's raw headline. Click the headline → opens URL in a new tab with `rel="noopener noreferrer"`. Anon-tease branch unchanged. Component moved out of `timelineSlot` in `[slug]/page.tsx` into `articleSlot`, right after `ArticleActions` — readers see provenance in the same scroll as the body, not in a side rail they often miss.
- **TODO 38 — desktop layout flattened to single column.** The 75/25 flex split with a sticky 25% right rail forced the body (capped at 680px) to sit left-heavy on wide screens, leaving dead space outside the rail. Killed in `globals.css [data-reader-body]`: now `display: block` with `max-width: 760px` centered. `[data-reader-panel="timeline"]` no longer flex/sticky — flows below the article body on desktop. **Mobile 3-tab UI (Article / Timeline / Quiz & Discussion) preserved** per owner skip on TODO-1.
- **Ad slot adjustment.** `article_rail` ad was a sticky right-rail position; with the rail dropped it now flows below the timeline on desktop, inside the Timeline tab on mobile (where it already lived). Same component, same impressions/click tracking.

### TODO 50 piece B — Firsthand context on comments
**Files:** `web/src/components/CommentComposer.tsx`, `CommentRow.tsx`, `CommentThread.tsx`, `web/src/app/api/comments/route.js`, `VerityPost/VerityPost/StoryDetailView.swift`, `Models.swift`. **DB:** `comments.real_world_experience text` (≤80 char CHECK); `post_comment` RPC extended with `p_real_world_experience` (old 5-arg overload dropped); `database.ts` regenerated.
- Composer: italic-serif "I know this firsthand" toggle. When checked, expands a 80-char `How do you know?` input. Pre-fills from `users.background_oneline` if set + composer field is empty.
- Render: em-dash byline below comment body. Same italic-serif treatment on web + iOS.
- Single-column model: presence of trimmed text IS the firsthand claim. Empty + checked → not persisted.
- "Verified Expert" chrome on comments hidden behind `SHOW_EXPERT_CHROME_ON_COMMENTS = false` flag (per locked decision #16 — kept alive in code, single-line flip to restore). Expert filter toggle + dead `{false &&}` gate stripped from CommentThread.

### TODO 48 — Author follow-ups on comments (was deferred, shipped anyway)
**Files:** `CommentRow.tsx`, `CommentThread.tsx`, new `web/src/app/api/comments/[id]/followups/route.js`, `StoryDetailView.swift`, `Models.swift`. **DB:** new `comment_followups` table with cap-of-2 trigger + UNIQUE (comment_id, sort_order) + `_enforce_comment_followup_invariants` raises SQLSTATE `VP001` on cap-hit for stable error-code detection; new `can_view_comment(uuid)` SECURITY DEFINER helper that mirrors `comments_select`; new `create_comment_followup` RPC (locks parent FOR UPDATE + re-counts).
- Italic-serif "Update" pinned beneath parent comment, OP-only composer, immutable. Cap of 2 enforced at trigger + RPC + UNIQUE constraint.
- API route maps RPC errors: SQLSTATE VP001 → 409, author mismatch → 403, parent missing → 404. Author-only DELETE.
- Realtime channel subscribes to INSERT + DELETE on `comment_followups`; refetches the affected comment's followups via the user's authed client (RLS defense-in-depth) and merges into state. Other viewers see updates within ~1s.
- **`supabase_realtime` publication updated to include `comments` AND `comment_followups`** (the existing iOS + web comments realtime had been silently failing because the publication was never extended).

### TODO 50 piece A — Profile background system
**Files:** `web/src/app/profile/_components/ProfileApp.tsx`, new `web/src/app/profile/_sections/BackgroundSection.tsx`, new `web/src/app/profile/settings/_cards/BackgroundCard.tsx` (~1000 lines), `u/[username]/page.tsx`, new `VerityPost/VerityPost/SettingsBackgroundView.swift` (~860 lines), `PublicProfileView.swift`, `SettingsView.swift`, `Models.swift`. **DB:** 7 new `users.background_*` columns (oneline, profession, years, where, lived, languages — varchar with CHECK; `lived_public` boolean default false); 3 new tables (`user_education`, `user_links`, `user_topics_known`); RLS gates SELECT on `profile_visibility` (private profiles hide background everywhere, including future expert-search via topics_known); `update_own_profile` extended to allowlist new fields; new `set_own_education` / `set_own_links` / `set_own_topics_known` replace-set RPCs; `public_profiles_v` view extended.
- Web `/profile` BackgroundCard: progressive-disclosure questionnaire — primary 80-char "In one line, who's writing?" + chip tray of optional sections (profession, years, education multi-entry, lived experience with privacy toggle, where, topics multi-select from `categories` table, languages, links with quick-preset chips for LinkedIn/Personal site/GitHub/Research/Resume).
- iOS `SettingsBackgroundView` mirrors web — chip tray, multi-entry editors, NSDataDetector-style URL handling, 80-char counters, save toolbar button. New row added to Settings → Account.
- Public profile read render on `/u/[username]` (web) and `PublicProfileView` (iOS): italic-serif `— {oneLine}` byline, optional sections only render when populated. `background_lived` gated on `lived_public`. Topic chips. Links auto-link with `rel="nofollow noopener noreferrer ugc"`. Empty-state hint on own profile invites fill-in.

### TODO 51 Part A — Article-gen prompt edits (libel hardening)
**Files:** `web/src/lib/pipeline/editorial-guide.ts`, `web/src/app/api/admin/pipeline/generate/route.ts:1732`. All 9 prompt edits from the 4-adversary panel review:
- **Allegation Mode carve-out** in rule 11: required hedges (`alleged` / `reportedly` / `according to [filing/official]`) for uncharged conduct against named persons. Restores fair-report privilege the prior strip-outlet rule destroyed.
- **BAD/GOOD example** in rule 11 (CBS News / Biden) showing primary-source attribution form.
- **Anti-hallucinated-attribution rule** added to FACTS ONLY: ban inventing `according to` / `sources said` / `a person familiar with the matter` unless those phrasings appear in the corpus. Closes St. Amant "purposeful avoidance" exposure.
- **Wikipedia-as-research-aid rule**: don't paraphrase Wikipedia prose — use it to find primary sources, attribute to those. Closes CC-BY-SA exposure.
- **Conditional length-band ladder dropped** in all 3 summary prompts (HEADLINE / KIDS / TWEENS), replaced with fixed 30–50 word target. Honest about parallel-execution constraint.
- **`route.ts:1732` 250-400 → 250-450** word-count sync between user-turn and `EDITORIAL_GUIDE`.
- **"so what" tightened** to attributable mechanism only (named source or quantitative causal claim, or omit). Removes contradiction with FACTS ONLY rules.
- **Cadence + scale comparisons + on-record statements** protected as carve-outs under EVERY SENTENCE A FACT — prevents over-cutting Jay Jones-class statements and collapsing to monotone declaratives.

### Misc cleanup (same commit)
- `ExpertApplyForm.tsx`: removed `"We review within 5 business days"` toast string (no-user-facing-timelines).
- TODO.md duplicate `#51` (comment-load error) removed — recon confirmed underlying issue already fixed in code.
- iOS xcodebuild + web typecheck clean throughout.

**Commit:** `8110a917` — 19 files, +4,473 / −79.

### TODO 39 (web half) — Tag-row redesign in CommentRow
**File:** `web/src/components/CommentRow.tsx`. Commit: `dd73c1ec` (part of the larger WYSIWYG-composer ship — full commit also covers composer, collapsible replies, permalink, quote reply).
- `helpful` tag promoted to a heart icon in the primary action row (Substack-style, with count). Filled heart when cast, outlined when not.
- `context` / `cite_needed` / `off_topic` rendered as always-visible inline buttons in the action row — no hidden picker, no `+ Tag` opener, no two-step reveal. Buttons gate on `comments.context_tag` permission + `quizPassed !== false`.
- Cast state shows count + colored border; uncast shows label + neutral border. Single source of UX truth — no separate "active list" vs "picker list" split.
- **iOS parity not shipped in this commit** — `StoryDetailView.swift` still uses the old `+ Tag` opens-picker pattern. Tracked in TODO 39 (now iOS-parity-only).

---

## 2026-05-06 (continued × 4)

### TODO 48 — iOS login activity: active sessions + per-session revoke
**File:** `VerityPost/VerityPost/SettingsView.swift` (`LoginActivityView`)
- Added `SessionRow` decodable struct (id, user_agent, ip, last_seen_at, is_current)
- New "Active sessions" section loads above the audit log via `GET /api/account/sessions`; device label parsed from user_agent (platform + browser detection); IP + last-seen shown as caption; current session gets a "This device" badge
- Per-row `Revoke` button in VP.danger color → `DELETE /api/account/sessions/[id]`; removes row from local state immediately on 200
- "Revoke all other sessions" button → `DELETE /api/account/sessions`; clears non-current rows on 200
- Both revoke actions gated on `settings.account.sessions.revoke` / `settings.account.sessions.revoke_all_other` permissions; in-flight state prevents concurrent taps
- Error banner on network/API failure; audit log section unchanged
- **iOS Kids:** not applicable. **Web:** already existed.

---

## 2026-05-06 (continued × 3)

### TODO 49 — iOS theme toggle
**Files:** `VerityPost/VerityPost/Theme.swift`, `VerityPostApp.swift`, `SettingsView.swift`
- `Theme.swift`: all ink/surface/border/text static tokens swapped from hardcoded hex to `UIKit` adaptive colors (`Color(UIColor.label)`, `.systemBackground`, `.secondarySystemBackground`, `.separator`, `.tertiaryLabel`, etc.); fixed colors (brand, success, danger, warn, tag chips) unchanged; `SkeletonBar` → `Color(.systemGray5)`; `PillButton` → `Color(.systemBackground)`. Added `import UIKit`.
- `VerityPostApp.swift`: `@AppStorage("vp_theme")` + `preferredColorScheme` computed property (`"light"` → `.light`, `"dark"` → `.dark`, anything else → `nil`); `.preferredColorScheme(preferredScheme)` applied to `ContentView()`.
- `SettingsView.swift`: `AppearanceSettingsView` — three-option Light / System / Dark checkmark picker using `SettingsPageShell + SettingsCard`; Appearance `HubRowSpec` added to `preferencesRows` (always visible, no permission gate) with current-value preview text.
- **iOS Kids:** shares root `preferredColorScheme` — applies automatically.
- **Web:** already existed via `AppearanceSection.tsx`.

---

## 2026-05-06 (continued again)

### TODOs 1+2 — Dark mode: chrome + article text
**Files:** `web/src/app/NavWrapper.tsx`, `web/src/components/article/ArticleSurface.tsx`, `ArticleReaderTabs.tsx`, `SourcesSection.tsx`, `MidBodyQuizTeaser.tsx`, `TimelineSection.tsx`, `UpNextSheet.tsx`, `AnonArticleCtaBanner.tsx`, `StoryArticlePicker.tsx`, `web/src/components/CommentRow.tsx`
- **Chrome fix:** `rgba(var(--bg-rgb, 255, 255, 255), 0.97)` → `rgba(var(--bg-rgb), 0.97)` on top bar + bottom nav (NavWrapper lines 398, 431). `--bg-rgb` already had correct dark overrides; the hardcoded white fallback was the entire problem.
- **Article text fix:** Swept 9 files from legacy CSS vars to `--p-*` tokens:
  - `--text-primary` / `--text` → `--p-ink`
  - `--dim` (dark shades #888/#666/#555) → `--p-ink-muted`
  - `--dim` (light shades #bbb/#999/#aaa) → `--p-ink-faint`
  - `--bg` → `--p-bg`
  - `--border` → `--p-border`
  - `--accent` (#0070f3/#2563eb, blue uses) → `--p-accent`
  - `--accent` (#111, dark ink uses) → `--p-ink`
- **iOS / iOS Kids:** not applicable (native theme system)

---

## 2026-05-06 (continued)

### TODO 28 — Inline plan cards in BillingCard
**Files:** `web/src/app/profile/settings/_cards/BillingCard.tsx`, `web/src/app/pricing/_CheckoutButton.tsx` (reused)
- Free-tier users now see Verity + Family plan cards inline in the Plan section — no redirect to /pricing
- Fetches DB pricing via Supabase client; falls back to `pricingCopy.ts` constants if fetch fails
- Verity card: shows live price + `CheckoutButton` (or "Subscribe via iOS App" disabled state when `stripe_price_id` is null)
- Family card: shows price + "Available on iOS →" link to /kids-app
- **iOS / iOS Kids:** not applicable (native subscription flow unchanged)

### TODO 25 — CommentRow bold cleanup
**File:** `web/src/components/CommentRow.tsx`
- "Helpful" chip: `fontWeight: 700` → `600`
- "VS score" chip: `fontWeight: 700` → `600`
- Active tag chip: `fontWeight: active ? 700 : 500` → `active ? 600 : 500`
- Intentional bolds kept: "Pinned as Article Context" label, Expert chrome label, Save button
- **iOS / iOS Kids:** not applicable

### TODO 37 — AvatarEditor responsive grid
**File:** `web/src/app/profile/_components/AvatarEditor.tsx`
- Grid column changed from `auto 1fr` to `min(160px, 40vw) 1fr` — preview column now shrinks on narrow viewports instead of forcing a fixed 160px minimum
- Removed `minWidth: 160` from preview panel (was redundant and overrode the column width)
- **Verify:** open /profile → Avatar on a phone; if overflow persists check `InviteLinkCard` (`minWidth: 96`) via DevTools
- **iOS / iOS Kids:** not applicable (native avatar editor)

### TODO 43 — Bookmark → Follow copy sweep
**Files:** `web/src/components/BookmarkButton.tsx`, `web/src/app/bookmarks/page.tsx`, `web/src/app/profile/_components/ProfileApp.tsx`, `web/src/app/profile/_sections/BookmarksSection.tsx`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/StoryDetailView.swift`, `VerityPost/VerityPost/SubscriptionView.swift`
- Web: button label "Bookmark"/"Saved" → "Follow"/"Following"; page title → "Following"; empty state copy updated; toast → "Removed from Following"; rail label → "Following"; Download copy updated
- iOS: quick action chip "Saved" → "Following"; quick link "Bookmarks" → "Following"; article button "Save"/"Saved" → "Follow"/"Following"; upgrade alert updated; plan feature list updated
- Schema untouched — `bookmarks` table, permissions, collections all unchanged
- **Remaining:** story-update surfacing (notify on new articles in followed stories) — awaiting owner decision on channel (Activity badge / push / both)
- **iOS Kids:** not applicable

### TODO 46 — "New since last visit" pill on iOS home feed
- Shipped as part of the iOS nav restructure (commit 925104eb)
- `HomeView.swift`: reads/writes `vp_last_home_visit_at` in UserDefaults; story cards show "New" badge when `publishedAt > lastVisitDate`
- **Web:** already existed via `_HomeVisitTimestamp.tsx`
- **iOS Kids:** not applicable

---

## 2026-05-06

### TODO 41 — iOS comment thread depth capped at 2
**Files:** `VerityPost/VerityPost/SettingsService.swift`, `StoryDetailView.swift`
- `SettingsService.swift:72` — `max_depth` default changed from `1` → `2` (was capping to 1 reply level instead of 2)
- `StoryDetailView.swift:1549` — `maxThreadDepth` changed from `3` → `2` (visual indent cap)
- `StoryDetailView.swift:2160` — Reply button now gates on `depth < SettingsService.shared.commentNumber("max_depth")`; previously had no depth check so reply button showed at any depth
- **iOS Kids:** not applicable (no comments)
- **Web:** already correct; `CommentRow.tsx` gates on `depth < commentMaxDepth` with default 2

### TODO 13 — iOS push notification tap-through
**Files:** `VerityPost/VerityPost/PushRegistration.swift`
- Added `userNotificationCenter(_:didReceive:withCompletionHandler:)` delegate method — previously missing, so tapping a push notification did nothing
- Handler extracts `story_slug` or `article_slug` from `userInfo`, posts `NotificationCenter.default.post(name: .vpOpenStory, ...)` so the app can navigate to the article
- Added `extension Notification.Name { static let vpOpenStory = Notification.Name("VPOpenStory") }`
- **Web / iOS Kids:** not applicable (push is iOS only)

### TODO 30 — Bookmarks removed from Activity feed
**Files:** `web/src/app/profile/_sections/ActivitySection.tsx`, `VerityPost/VerityPost/ProfileView.swift`, `VerityPost/VerityPost/Models.swift`
- Bookmarks already have a dedicated Bookmarks section in the rail — showing them in Activity too was duplicate noise
- **Web:** Dropped `BookmarkJoined` type, `bookmarks` state + query, `'bookmarks'` filter tab option, bookmark merge block, and bookmark render branch
- **iOS:** Dropped `ActivityFilter.bookmarks`, `bookmarkItems` state, `canViewBookmarks`, bookmark fetch, merge, and render branches from `ProfileView.swift`; removed `case bookmark` from `ActivityType` in `Models.swift`
- **iOS Kids:** not applicable (no activity feed)

---

### TODO 35 — Score tier UI removed
**Files:** `web/src/lib/scoreTiers.ts` (deleted), `web/src/app/profile/_components/TierProgress.tsx` (deleted), `ProfileApp.tsx`, `AppShell.tsx`, `YouSection.tsx`, `PublicProfileSection.tsx`, `CommentRow.tsx`, `CommentThread.tsx`, `CommentComposer.tsx`, `admin/users/page.tsx`, `admin/users/[id]/page.tsx`, `u/[username]/page.tsx`, `VerityPost/ProfileView.swift`
- All newcomer/reader/informed/analyst/scholar/luminary labels, the TierProgress bar, and scoreTiers loading logic removed everywhere
- Plan tier (free/pro/family) untouched — only score tier removed
- **iOS Kids:** not applicable

### TODO 42 — Timeline sticky rail overflow fixed
**File:** `web/src/components/article/ArticleReaderTabs.tsx`
- Added `align-self: flex-start` to `[data-reader-panel="timeline"]` — the rail now stops at the article container's bottom edge instead of floating over the footer
- **iOS:** timeline is a separate tab on mobile, not a sticky rail — not applicable
- **iOS Kids:** no timeline — not applicable

### TODO 40 — @mentions paid-gating copy (iOS)
- Swept iOS codebase — no paid-gating mention copy exists in Swift; web was already cleaned last commit
- Item fully done, no code change needed on iOS

---

## Earlier this session (2026-05-06)

### Bold / weight cleanup — article surface
- `TimelineSection.tsx` — removed `fontWeight: 600` from `LABEL_STYLE` (unintentional bold on timeline labels)
- `MidBodyQuizTeaser.tsx` — removed `fontWeight: 600` from `HEADLINE_STYLE`; kept button bold intentionally

### Tag quiz gate — web
- `CommentRow.tsx:642` — tag block now only renders when `quizPassed !== false`; previously showed tag UI before quiz was attempted

### Ad centering — home page bottom ad
- `Ad.jsx` — added `maxWidth: 728, margin: '12px auto'` to `wrapStyle` and `margin: '0 auto'` to img so the ad card self-centers
- `page.tsx` — removed inner redundant `maxWidth` wrapper that was conflicting

### "Better than X% of readers" copy removed
- `ArticleQuiz.tsx` — removed percentile copy from both pass state (lines 535-550) and fail state (lines 581-597); the stat was not meaningful and was distracting

### @mentions paid-gating copy removed
- `CommentComposer.tsx` — removed paid-mentions banner and footer line "@mentions are available on paid plans."
- `copy.ts` — removed `mentionPaid` and `mentionPaidComposerHint` keys
- **iOS:** not applicable (no paid-gating copy existed in Swift)
