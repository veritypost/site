# Q12 — Four iOS implementation-vs-removal mini-decisions

**Source finding:** Session 5 (`SESSION_05_PIPELINE_POLISH.md`) — PM-6 (lines 29-30), PM-7 (line 36), PM-10 (line 43).

**Bundle recommendations:** Q12a → Option B (delete dead parser). Q12b → Option B (remove entitlement). Q12c → Option A (flag back to `false`). Q12d → Option B (delete dead scene path).

All four converge on the same shape: **the codebase shrinks**. None of these features have an upstream signal, a UI promise to users, or a backing schema worth holding.

---

## Q12a — `verityposts://` URL scheme registration

### Question
Info.plist registers `verity` (singular); a parser in `VerityPostApp.swift` checks `verityposts` (plural). PM-6 framed it as "push deep-links silently fail." Which side is correct?

### Options
- **A.** Register `verityposts` in Info.plist (additive — keeps the parser, makes scheme work end-to-end).
- **B.** Delete the `verityposts` branch from the parser (matches what's already registered + what's actually sent).

### Recommendation
**Option B — delete the `verityposts://story/<slug>` parser branch in `VerityPostApp.swift:23`.**

It has zero upstream callers anywhere. The `verity` (singular) scheme registered in Info.plist is the one actively used (Supabase OAuth `redirectTo` in `AuthViewModel.swift`). The parser branch is dead.

### Reasoning
1. **Web push payloads do NOT use a custom scheme.** The APNs payload composer in `web/src/lib/apns.js:84-101` puts whatever `action_url` was stored in `notifications.action_url` into `payload.action_url`. Every site that writes that column writes a *path string* — `/profile/settings/billing`, `/story/<slug>`, `/profile/kids/<id>`. Grep confirms zero `verityposts://` or `verity://` strings are constructed anywhere in `web/src/` or `supabase/`.

2. **iOS has no push-tap deep-link handler.** `PushRegistration.swift` implements only `willPresent` (foreground banner), not `didReceive response`. There is currently no path from a push tap into `ArticleRouter.pendingSlug`. PM-6's framing — "push deep-links silently fail" — overstates: there is no push deep-link path at all, with or without the right scheme.

3. **In-app notification taps already work.** `AlertsView`'s `VPNotification.storySlug` (line 855) parses the `/story/<slug>` path directly out of `action_url` — no custom scheme involved. That's the live tap path.

4. **The registered `verity://` scheme IS in use.** `AuthViewModel.swift:1170, 1208, 1312` use `verity://login` and `verity://reset-password` for Supabase OAuth `redirectTo`. Renaming/removing it would break auth.

5. **Adding `verityposts://` to Info.plist would not light anything up.** Nothing constructs a `verityposts://` URL. It would be a registration in search of a producer.

### What we would build vs. what we would delete
- **Option A cost:** edit Info.plist (additive; harmless), but the parser remains a dead branch with no caller. No user-visible improvement.
- **Option B cost:** delete 7 lines in `VerityPostApp.swift` (lines 21-26), keep universal-link `https://veritypost.com/story/<slug>` branch which has a real use case (Apple Universal Links via `applinks:veritypost.com` associated-domain — verify this is registered for VerityPost target if Universal Links are intended; the kids app has it but not adult app).

### Files
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/VerityPostApp.swift` — lines 13-37 (parser) and line 23 (the `verityposts` branch to delete)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/Info.plist` — lines 19-29 (`CFBundleURLSchemes` array, leave `verity` as-is)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AuthViewModel.swift:1170, 1208, 1312` — the live consumer of `verity://`
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AlertsView.swift:854-859` — the live in-app `/story/<slug>` parser
- `/Users/veritypost/Desktop/verity-post/web/src/lib/apns.js:84-101` — push payload composer (no custom-scheme construction)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/send-push/route.js:368` — `url: n.action_url` (path string only)

> Followup (out of scope here, but worth a separate question): if push-tap deep-linking is in-scope for launch, the right fix is to (1) add a `didReceive response` handler that reads `action_url` from `userInfo` and stamps `articleRouter.pendingSlug`, (2) keep the universal-link branch in the parser, (3) drop the dead custom-scheme branch.

---

## Q12b — Kids APNs entitlement

### Question
Kids app (`VerityPostKids.entitlements`) declares `aps-environment = development` but has no `UNUserNotificationCenter`, no `registerForRemoteNotifications` call, no token upload, no UI promising notifications. Implement push or remove the entitlement?

### Options
- **A.** Implement push registration (parental-gate first, kid-safe content only).
- **B.** Remove the entitlement.

### Recommendation
**Option B — remove `aps-environment` from `VerityPostKids.entitlements`.**

There is nothing to notify a kid about, no UI promising notifications, no kid-side notification preferences, no parent-controlled push settings, and Apple Kids Category review prefers fewer capabilities the app doesn't actually use.

### Reasoning
1. **Zero push code in kids.** `grep -rn "UNUserNotificationCenter\|registerForRemoteNotifications" VerityPostKids/VerityPostKids/` returns nothing. The entitlement was almost certainly cargo-culted from the adult target's project setup.

2. **Zero UI promising notifications.** No NotificationsCard, no settings toggle, no parent-dashboard notification setting. Kids Category review-readiness improves when the app declares only capabilities it uses.

3. **No notification feature in product scope.** Memory `feedback_kill_switched_work_is_prelaunch_parked` + `kids_scope` confirm kids = iOS only, no rich engagement push pipeline planned. The owner's stated email scope (`project_email_notifications_scope`) is "security-only, no rich pipeline" — push for kids would be even further out of scope.

4. **COPPA framing.** Push to a child's device requires (a) parental consent for the channel, (b) a kid-appropriate cadence + content gate, (c) a parent-side opt-out. None of this exists. Removing the entitlement is the COPPA-safer path because it removes a capability that could otherwise be enabled accidentally.

5. **No regression risk.** Apple does not require pre-declaring `aps-environment` to add push later. Adding it back is one Xcode-Capabilities click + a provisioning-profile refresh.

### Files
- `/Users/veritypost/Desktop/verity-post/VerityPostKids/VerityPostKids/VerityPostKids.entitlements` — delete the `aps-environment` key (lines 5-6); keep the associated-domains block (lines 7-11) which IS actively used by Universal Links
- (No Swift changes — there's no push code to remove)

> Note: the adult app's entitlements file should be checked in passing to confirm `aps-environment` is `development` (matches DEBUG builds via `PushRegistration.swift:60`); if production builds are expected, it must be `production` for the App Store build configuration. That's a separate Apple-console question, not a Q12 decision.

---

## Q12c — `manageSubscriptionsEnabled` flag

### Question
Flag is `true` (`AlertsView.swift:340`). The Add buttons no-op (`_ = userId; _ = catName`). Apple Review risk: Guideline 2.1 ("apps with broken or non-functional UI are rejected"). CLAUDE.md kill-switch row #5 says it should be `false`.

### Options
- **A.** Set flag to `false` until handlers are properly implemented.
- **B.** Implement the Add handlers now.

### Recommendation
**Option A — flip `manageSubscriptionsEnabled = false` immediately for launch. Defer real implementation post-launch.**

The handlers are NOT a "small one-RPC implementation" across the board: only the Category Add maps to existing schema + an existing API. Subcategory Add and Keyword Add need new tables, new endpoints, new RPCs, and a fan-out story. That's not a quick patch.

### Reasoning

1. **Current state.** Three Add handlers are stubs, each ending in `_ = userId; _ = catName` etc. (lines 786-812). The Manage tab also renders an entire "Subscribed Categories / Subcategories / Keywords" UI that loads via `loadManageData` but the loader hardcodes `subscribedCategories = []` (line 767). So even READ is fake — never mind WRITE.

2. **Schema state across the three Add buttons** —

   | Affordance | Backing table | API route | Status |
   |---|---|---|---|
   | Add category subscription | `public.subscription_topics` (user_id, category_id) — **EXISTS** | `web/src/app/api/alerts/subscriptions/route.js` GET/POST/DELETE — **EXISTS** | Implementable in ~1 RPC call + readback |
   | Add subcategory subscription | No `subscription_subcategories` table; no `subcategory_id` column on `subscription_topics` | No route | Needs migration + new endpoint + fan-out trigger |
   | Add keyword subscription | No `subscription_keywords` table | No route | Needs migration + new endpoint + scoring/match logic + fan-out |

   The "implement the handlers now" framing imagines a one-RPC change. Reality: **only one of three** is one-RPC. The other two are a real feature build (table design, RLS, fan-out trigger, rate limiting, owner-mode tests, web parity per `feedback_cross_platform_consistency`). Keyword alerts in particular need a content-match path — non-trivial.

3. **Apple Review risk is real.** Three buttons that look functional but silently no-op is exactly Guideline 2.1's pattern. Flag-off renders the placeholder ("Subscription manager not available") which complies with `feedback_no_user_facing_timelines` (no "coming soon" copy — `manageContentPlaceholder` lines 357-374 already meet this rule).

4. **Web parity check.** Per `feedback_cross_platform_consistency`: does web have a working subscription manager? The API route exists (`alerts/subscriptions/route.js`), but a quick check would be needed to confirm there's a web UI consuming it. If web doesn't ship the manager, iOS off + web off keeps parity. If web DOES ship category-only, then iOS could ship category-only too, with subcategory + keyword sections hidden. Either way is owner's call.

5. **CLAUDE.md is consistent with this recommendation.** Kill-switch row #5 reads "Flip `manageSubscriptionsEnabled` to `true`" — which means the documented launch state is `false`. Current `true` is drift from intent.

### Minor note
CLAUDE.md cites `AlertsView.swift:305` for the flag — actual location is `:340`. Update the kill-switch row line number when flipping the flag.

### Files
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AlertsView.swift:340` — flip to `false`
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AlertsView.swift:786-812` — three stub handlers (leave as stubs while flag is off; real impl is post-launch)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/AlertsView.swift:351-374` — `manageContentPlaceholder` shown when flag is off (no timeline copy — compliant)
- `/Users/veritypost/Desktop/verity-post/web/src/types/database.ts:9793-9839` — `subscription_topics` schema (category-only)
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/alerts/subscriptions/route.js` — existing API (category-only)
- `/Users/veritypost/Desktop/CLAUDE.md:13` — update line number `305` → `340`

---

## Q12d — `BadgeUnlockScene` `biasedHeadlinesSpotted`

### Question
PM-7 found `KidsAppRoot.handleQuizComplete` hardcodes `biasedSpotted: false` (line 252). The downstream branch — bumping `biasedHeadlinesSpotted`, unlocking the "Bias Detection — Level 3" badge at 5 — is unreachable. Wire the real signal or delete?

### Options
- **A.** Wire the real signal (where would the data come from?).
- **B.** Delete the dead scene path + unused parameter.

### Recommendation
**Option B — delete the dead path. Drop `biasedSpotted:` parameter from `completeQuiz`, drop the `biasedHeadlinesSpotted` `@Published` field, drop the badge construction in the `if biasedSpotted` block, drop the gold "Bias Detection" badge content. Keep `BadgeUnlockScene` the view (it's reused — `KidsAppState.swift:298` types `QuizOutcome.badge` as `BadgeUnlockScene?` and the streak path could grow other badges later).**

### Reasoning
1. **The signal does not exist anywhere upstream.** `KidQuizResult` (`KidQuizEngineView.swift:18-23`) carries only `passed`, `correctCount`, `total`, `writeFailures`. There's no per-question type tag, no "this question was a biased-headline question" marker, no `biased_headline` column on `quiz_questions`, and no DB column or RPC return value with this signal. `grep -rn "bias\|biased" VerityPostKids/` returns six hits, all in the dead path itself plus its hardcoded `false`.

2. **No quiz-question content carries the bias-spotting concept.** A real implementation would require a `quiz_questions.is_bias_spot` flag (or a question-type enum), kid-friendly bias-spotting question prompts written by the editorial team, scoring per-correct-bias-answer, and a server-side aggregate. That's a real product feature, not a wiring fix.

3. **The badge currently can never unlock.** `biasedSpotted: false` is hardcoded at the only caller site, so `biasedHeadlinesSpotted` (lines 38, 243-244 of `KidsAppState.swift`) starts at 0 and never increments. The 5-spot badge unlock branch (lines 244-252) is unreachable. The `@Published` field on `KidsAppState` is a memory leak in concept, not bytes.

4. **Owner kids product scope.** Kids app surface is reading + quizzes + streak + score. No bias-detection UI, no parent dashboard for it, no mention in the product memory entries. This isn't a parked feature; it's an artifact of an earlier iteration.

5. **Cheap and safe to delete.** Single-file kids scope; the only `BadgeUnlockScene` consumer is the streak/badge queue in `KidsAppRoot`, which keeps working with `outcome.badge = nil` always (badge slot is already optional, line 263 `if let badge = outcome.badge`). Adult and web are unaffected.

### Surface that disappears
- `KidsAppState.swift:38` — `@Published var biasedHeadlinesSpotted: Int = 0`
- `KidsAppState.swift:226` — `biasedSpotted: Bool` parameter on `completeQuiz`
- `KidsAppState.swift:241-253` — the entire `if biasedSpotted { ... }` branch including the badge construction
- `KidsAppRoot.swift:252` — `biasedSpotted: false` argument at the call site
- `BadgeUnlockScene.swift:347-352` (preview) — preview shows the now-unused gold-badge headline; replace preview with a generic streak-tier example or delete the preview block

### Surface that stays
- `BadgeUnlockScene` the view (`BadgeUnlockScene.swift:14`)
- `QuizOutcome.badge: BadgeUnlockScene?` (`KidsAppState.swift:298`)
- The scene-queue path in `KidsAppRoot.handleQuizComplete` (the `if let badge = outcome.badge` block — currently never fires, but a future streak-based badge could populate it)

### Files
- `/Users/veritypost/Desktop/verity-post/VerityPostKids/VerityPostKids/KidsAppState.swift:38, 226, 241-253, 298`
- `/Users/veritypost/Desktop/verity-post/VerityPostKids/VerityPostKids/KidsAppRoot.swift:239-269` (handler), `:252` (call site)
- `/Users/veritypost/Desktop/verity-post/VerityPostKids/VerityPostKids/BadgeUnlockScene.swift:14-30` (view stays), `:340-360` (preview cleanup)
- `/Users/veritypost/Desktop/verity-post/VerityPostKids/VerityPostKids/KidQuizEngineView.swift:18-23` (KidQuizResult — no change; signal was never proposed to flow through here)

---

## Owner decision

- [ ] **Q12a — `verityposts://` parser branch**
  - [ ] **Option A** — register `verityposts` in Info.plist (keeps parser, no real callers light up)
  - [x] **Option B (recommended)** — delete the `verityposts` branch from `VerityPostApp.swift:21-26`; keep `verity` (auth) and the universal-link branch
  - [ ] Defer

- [ ] **Q12b — Kids APNs entitlement**
  - [ ] **Option A** — implement parental-gated push (real feature; out of launch scope)
  - [x] **Option B (recommended)** — delete `aps-environment` from `VerityPostKids.entitlements`; keep associated-domains
  - [ ] Defer

- [ ] **Q12c — `manageSubscriptionsEnabled` flag**
  - [x] **Option A (recommended)** — set flag to `false` (`AlertsView.swift:340`); fix CLAUDE.md line number `305 → 340`; leave handlers as stubs
  - [ ] **Option B** — implement category-only Add (1 RPC), hide subcategory + keyword sections behind separate flags; defer the other two until schema lands
  - [ ] **Option C** — implement all three (requires migrations + endpoints + fan-out; not a small fix)

- [ ] **Q12d — `biasedHeadlinesSpotted` dead path**
  - [ ] **Option A** — design + ship a bias-spotting question type (real feature)
  - [x] **Option B (recommended)** — delete the dead state field, parameter, branch, and call-site arg; keep `BadgeUnlockScene` view + `QuizOutcome.badge` slot for future streak-based badges
  - [ ] Defer

---

## Cross-platform / web parity check

- **Q12a:** web N/A (web has no custom URL scheme handling). iOS-kids has its own scheme (`veritypostkids://`) consumed by `web/src/components/kids/OpenKidsAppButton.tsx` — separate flow, not affected.
- **Q12b:** web N/A. iOS-adult has push and is unaffected. Kids loses an entitlement only.
- **Q12c:** web has the API route + `subscription_topics` table, but a separate question would need to confirm whether a web UI consumes it; iOS flag-off keeps parity if web also has no UI today, OR is a temporary divergence if web ships a UI first (acceptable per `feedback_cross_platform_consistency` if explicitly noted).
- **Q12d:** kids-iOS only. Adult web/iOS have no equivalent dead path.
