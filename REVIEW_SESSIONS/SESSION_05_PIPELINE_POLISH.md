# Session 5 — Pipeline Cost-Cap + Polish

**You are the architect for this session.** Fresh conversation. Read this doc, then `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md` (top synthesis + remaining unclosed P1s + the `## PM-9 — Pipeline-and-Cron` and remaining items in PM-2, PM-6, PM-7, PM-10).

## Prerequisite

Sessions 1, 2, 3, 4 marked complete.

## Scope

This session is broader than the others — it absorbs the last P0 plus most of the cross-platform bundles + remaining user-visible P1s.

### P0 (must close)
1. **PM-9** — 5 LLM-calling routes bypass `lib/pipeline/call-model.ts` (skipping cost-cap, retry, ledger, redaction). Affects: `quiz-regenerate`, `sources-regenerate`, `timeline-regenerate`, `score-comments` cron (every 15 min), legacy `ai/generate`. Fix: route all 5 through `call-model.ts`; verify ledger writes; verify cost-cap blocks at correct threshold.

### P1 — Pipeline + cron
- **PM-9** — `kid_url_sanitizer` step is non-fatal but doesn't set `needs_manual_review` on failure (kid articles can persist with raw external URLs). COPPA-adjacent.
- **PM-9** — `score-comments` cron has no parallelism cap or per-tick budget.
- **PM-9** — `subscription-reconcile-stripe` overwrites local `kid_seats_paid` without freshness guard against recent webhook write.

## Locked decisions (from owner, 2026-05-03)

- **Q08 Privacy "Followers-only":** Option B — drop the option, fix the copy. In `web/src/app/profile/settings/_cards/PrivacyCard.tsx`, remove the middle `AudienceOption` (lines 311–317), simplify the audience enum to two states (Public ↔ Private), update toast at line 165 (`'Profile is followers-only.'` → `'Profile is private.'`). In `web/src/app/profile/_sections/PublicProfileSection.tsx`, fix the line-285 sublabel (`'Only your followers can view.'` → `'Only you can view it.'`). **No DB migration. No iOS change** (iOS has no privacy-visibility settings UI; existing public/private/hidden enum gating in `PublicProfileView.swift:379-385` stays). Optional `CHECK (profile_visibility IN ('public','private','hidden'))` constraint is a separate ticket.
- **Q09 Web Push parity:** Path B — document iOS-only at launch. Two edits: (1) `web/src/app/profile/settings/_cards/NotificationsCard.tsx:43` rewrite from `'Time-sensitive notifications on the iOS app. iOS only — no web push yet.'` → `'Time-sensitive notifications on the iOS app. Web is in-app and email only.'`; (2) Append row 11 to CLAUDE.md Kill-Switch Inventory: `| 11 | Web Push notifications | Not built — iOS-only by design | n/a (no scaffolding) | Build out service worker + VAPID + cron webpush branch when web returns warrant it |`. Optional comment in `web/src/app/api/cron/send-push/route.js` after line 17 noting "APNs-only by design — see CLAUDE.md kill-switch row 11."
- **Q10 iOS account-state banner port:** Port 5 banner states — `muted`, `verify_locked` + `unverified_email` (paired), `plan_grace`, `deletion_scheduled`, `banned`. Insert at chrome level above `adultTabView` at `ContentView.swift:245-254` (sibling to `sessionExpiredBanner` and `deepLinkErrorBanner`). New files: `VerityPost/VerityPost/AccountState.swift` (port `deriveAccountStates(user:)` enum + derivation, severity-sorted), `VerityPost/VerityPost/AccountStateBannerView.swift` (SwiftUI component mirroring `web/src/app/profile/_components/AccountStateBanner.tsx`). Extend `VPUser` in `Models.swift` with: `is_banned`, `ban_reason`, `is_muted`, `muted_until`, `verify_locked_at`, `deletion_scheduled_for`, `plan_grace_period_ends_at`, `locked_until`, `comped_until`. Extend `AuthViewModel.swift:1336-1338` `select(...)` allowlist accordingly. CTA targets: verify_locked/unverified_email → `auth.resendVerificationEmail()`; plan_grace → branch on plan_provider (Apple → `StoreKit.AppStore.showManageSubscriptions`, Stripe → SafariViewController to portal); deletion_scheduled → call account-undelete endpoint; banned → SafariViewController to `https://veritypost.com/contact`; muted → no CTA (timer only). Remove the inline `if user.frozenAt != nil { frozenAccountBanner }` at `ProfileView.swift:148-150` and delete the private `frozenAccountBanner` once the chrome banner ships. iOS-kids: **N/A**.
- **Q11 Kids image allowlist:** Ship hard 2-host first-party allowlist on `VerityPostKids/VerityPostKids/KidReaderView.swift:122`. Allowlist computed at module-load: `{ <SupabaseKidsClient.shared.client.supabaseURL host>, "cdn.veritypost.com" }`. Validation: `https` scheme + lowercased host membership; otherwise `gradientPlaceholder`. **Do NOT** name third-party news CDNs (Reuters/AP/Getty/Unsplash) — they violate Apple Kids 1.3. Reserved `cdn.veritypost.com` entry forward-compats the future rehost CDN; harmless until DNS lands.
- **Q12a `verityposts://` parser branch:** Option B — delete the dead `verityposts://story/<slug>` parser branch in `VerityPost/VerityPost/VerityPostApp.swift` (lines 21-26 area). Keep the `verity://` scheme (live Supabase OAuth `redirectTo` use) and the universal-link `https://veritypost.com/story/<slug>` branch. No Info.plist change.
- **Q12b Kids APNs entitlement:** Option B — remove the `aps-environment` key (lines 5-6) from `VerityPostKids/VerityPostKids/VerityPostKids.entitlements`. Keep the associated-domains block. No Swift changes (no push code exists).
- **Q12c `manageSubscriptionsEnabled` flag:** Option A — flip to `false` at `VerityPost/VerityPost/AlertsView.swift:340`. Leave the three stub Add handlers (`AlertsView.swift:786-812`) in place; `manageContentPlaceholder` (lines 351-374) renders when flag is off and is timeline-copy-clean. Update CLAUDE.md kill-switch row 5 line number `305 → 340`.
- **Q12d `biasedHeadlinesSpotted` dead path:** Option B — delete the dead state field at `VerityPostKids/VerityPostKids/KidsAppState.swift:38`, the `biasedSpotted: Bool` parameter on `completeQuiz` (line 226), the `if biasedSpotted { ... }` branch (lines 241-253), and the `biasedSpotted: false` argument at `KidsAppRoot.swift:252`. Keep `BadgeUnlockScene` view, `QuizOutcome.badge: BadgeUnlockScene?` slot, and the streak-side scene-queue in `KidsAppRoot`. Replace the unused gold-badge preview at `BadgeUnlockScene.swift:347-352` with a streak-tier example or delete the preview block.

### P1 — Web AppShell user-visible
- **PM-2 / Q08** — Privacy "Followers-only" — drop the option per Q08 above.
- **PM-2** — `PublicProfileSection` share-link block suppressed by stale kill-switch comment (kill-switch row #3 is stale; flag #1 is already `true`). Re-enable the block.
- **PM-2** — `RegistrationWall` drops `next` param + lacks modal hardening (no `role="dialog"`, no focus trap, no Escape).
- **PM-2** — Story-page kids-app CTA missing `target="_blank"`.
- **PM-2** — BookmarksSection imports `useToast` but never invokes it; failure path is dead-end.

### P1 — iOS adult
- **PM-6 / Q12a** — `verityposts://` URL scheme — delete the dead parser branch per Q12a.
- **PM-6 / Q12c** — `AlertsView` Manage Subscriptions — flip `manageSubscriptionsEnabled = false` per Q12c.
- **PM-6** — `RegistrationSheetView` force-unwraps a constructed URL (`StoryDetailView.swift:3528`). Use the safe `siteURL.appendingPathComponent` pattern that already exists at `SubscriptionView.swift:128`.
- **PM-6 / Q10** — Account-state banner port — port 5 states per Q10.

### P1 — iOS kids
- **PM-7** — Profile stats render stale 0 on cold launch (`KidsAppState.loadKidRow()` selects only `streak_current`, `reading_band`). Fix: include `verity_score`, `quizzes_completed_count` in the SELECT.
- **PM-7 / Q12d** — `biasedHeadlinesSpotted` BadgeUnlockScene — delete the dead path per Q12d.
- **PM-7** — Streak count flickers down on foreground reload before server trigger lands.
- **PM-7 / Q11** — AsyncImage host allowlist — ship 2-host first-party allowlist per Q11.

### P1 — Cross-platform
- **PM-10 / Q10** — iOS account-state banner port — see Q10 above (5 states, chrome-level).
- **PM-10 / Q09** — Web push parity — document iOS-only per Q09.
- **PM-10 / Q12b** — iOS-kids APNs entitlement — remove per Q12b.
- **PM-10** — Story-page "Open in Verity Kids" CTA uses web URL not custom scheme.

### Out of scope
- All P2 items unless they bundle cleanly with a P1 in the same file.
- CLAUDE.md kill-switch row updates (Session 6).

## Orchestration

This session has the most volume. Use 5 PMs.

| PM | Owns |
|---|---|
| **PM-A: Pipeline cost-cap unification** | P0 #1 + the 3 PM-9 P1s. The "make all LLM calls go through call-model.ts" cluster. |
| **PM-B: Web AppShell P1s** | All PM-2 P1s. Privacy copy, share-link unblock, RegistrationWall hardening, BookmarksSection, story-page CTA. |
| **PM-C: iOS adult P1s** | All PM-6 P1s. URL scheme + force-unwrap + banner port + AlertsView decision (coordinate with Session 4 status). |
| **PM-D: iOS kids P1s** | All PM-7 P1s. Stats SELECT + dead-code badge + streak flicker + image allowlist. |
| **PM-E: Cross-platform bundles** | PM-10 banner port (works with PM-C), Web Push decision, kids APNs entitlement, kids-app CTA scheme. |

Each PM dispatches subagents as fits its surface (Swift PMs use bug-hunter-runtime + bug-hunter-flow; web PMs add bug-hunter-security where relevant; pipeline PM uses bug-hunter-security + adversary).

## Verification gates

1. **Pre-impl** — verify each finding still applies. After Sessions 1-4, some may have been incidentally closed. Drop refuted ones with evidence.
2. **Build-verifier** — type-check + lint web; Xcode build for both iOS apps.
3. **Smoke-tester** — boot dev server. Run pipeline regenerate against a test story; verify cost ledger writes. iOS: launch both apps in Simulator, verify push deep-link handling, verify kid stats load on cold launch, verify AsyncImage host filter.
4. **Independent reviewer** — fresh agent reads each PM's diff + confirms each finding closed.
5. **Adversary** — mandatory on PM-A (cost-cap), optional on PM-D (kids — already covered Session 1 for COPPA DB layer; do a quick check on the image allowlist).

## Done definition

- 1 P0 + ~17 P1s closed or refuted.
- All gates pass.
- `## Status` block appended.
- REVIEW_REPORT.md: each closed finding gets `> CLOSED in Session 5 — commit <hash>`.

## Status

(append final status block here)
