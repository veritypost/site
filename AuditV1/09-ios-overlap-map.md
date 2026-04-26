# Session 9 — `VerityPost/` + `VerityPostKids/` overlap map

**Scope:** both iOS apps end-to-end — sources, project.yml, Info.plist, entitlements, Assets.xcassets/AppIcon, REVIEW.md, possibleChanges/, README.md.

**Read end-to-end / sampled:**

- **Adult `VerityPost/`:** `project.yml` (full 102 lines), `Info.plist` (full 65 lines), `VerityPost.entitlements` (full), `Assets.xcassets/AppIcon.appiconset/` (listing only — Contents.json + 0 PNGs), full file listing of `VerityPost/VerityPost/` (44 Swift files + REVIEW.md + Info.plist + entitlements + xcprivacy + Assets), `REVIEW.md` (full 400 lines), `possibleChanges/` listing (7 HTML/JSX/MD files).
- **Kids `VerityPostKids/`:** `project.yml` (full 84 lines), `Info.plist` (full 60 lines), `VerityPostKids.entitlements` (full), `Assets.xcassets/AppIcon.appiconset/` (listing only — Contents.json + 0 PNGs), `README.md` (5879 bytes — top-level kids README), full file listing of `VerityPostKids/VerityPostKids/` (29 Swift files + Info.plist + entitlements + xcprivacy + Assets).
- **Cross-app verification grep:** ParentalGate callers, BadgeUnlockScene reachability, `#if false` blocks, App Store URL placeholder, HomeFeedSlots/Keychain caller refs, `manageSubscriptionsEnabled`, KidsAppLauncher fallback URL.
- **Total Swift LOC:** 25,797 across both apps (44 adult + 29 kids).

**Anchor SHA at session open:** `5ad6ad4`.

---

## Overlap map by topic

### T1 — Both apps use XcodeGen (project.yml as source of truth)

`project.yml` for each app is the canonical generator input; `*.xcodeproj` is regenerated. CLAUDE.md's "iOS adult — SwiftUI, iOS 17+ … VerityPost/" matches both project.ymls (`deploymentTarget: "17.0"`).

Adult `project.yml`:
- Bundle: `com.veritypost.app`
- Marketing version 1.0, project version 1
- URL scheme: `verity://` (handles deep links from web)
- LSApplicationQueriesSchemes: `veritypostkids` (so `KidsAppLauncher.canOpenURL` works)
- Background modes: `audio` (TTS playback off-screen)
- Entitlements: `com.apple.developer.applesignin = Default` only
- Single dependency: `Supabase` package (supabase-swift, from 2.0.0)

Kids `project.yml`:
- Bundle: `com.veritypost.kids`
- Marketing version 0.1, project version 1
- URL scheme: `veritypostkids://` (so adult app can deep-link in)
- `UIRequiresFullScreen: true` (Apple Made-for-Kids requires full-screen if orientation restricted)
- Portrait-only (`UISupportedInterfaceOrientations` = portrait)
- Entitlements file referenced but `aps-environment + associated-domains` defined in the .entitlements file directly

Both project.ymls embed the publishable Supabase URL + anon key as defaults (line 81-82 adult / line 68-69 kids). Per the comment, this is by-design — anon key is public.

### T2 — Entitlements gap: adult is missing aps-environment + associated-domains

Adult `VerityPost.entitlements`:
```xml
<key>com.apple.developer.applesignin</key>
<array><string>Default</string></array>
```

Only Sign In With Apple. Missing:
- **`aps-environment`** — needed for `PushRegistration.swift` to register for remote notifications. Without it, `registerForRemoteNotifications` silently fails. **Confirms AuditV2 C4** (P0).
- **`com.apple.developer.associated-domains` (`applinks:veritypost.com`)** — needed for Universal Links. Without it, web links to `veritypost.com/story/X` open in Safari, not the app. **Apple-block until dev account active — now active.**

Kids `VerityPostKids.entitlements`:
```xml
<key>aps-environment</key><string>development</string>
<key>com.apple.developer.associated-domains</key>
<array><string>applinks:veritypost.com</string></array>
```

Has push + universal links, but `aps-environment=development` — **App Store builds need `production`**. **Confirms AuditV2 C37**. Kids has no Sign In With Apple (correct — kids don't sign in directly, parents do via web).

### T3 — AppIcon set is empty in both apps

Both `Assets.xcassets/AppIcon.appiconset/` contain only `Contents.json` — no PNG files. **App Store rejects builds without icons.** **Confirms AuditV2 C5** (P0). Apple-block: now unblocked since dev account is active.

### T4 — `VerityPost/VerityPost/REVIEW.md` is a 400-line UI/UX audit dated 2026-04-19

Substantial findings inventory:
- **§1**: 13 distinct cornerRadius values across ~200 call sites → recommend 5 tokens.
- **§2**: 13 touch targets below 44×44pt (HIG min).
- **§3**: 2 instances of "Log In" vs canonical "Sign in".
- **§4**: 9 empty states missing CTAs.
- **§5**: 14 error messages needing warmer voice.
- **§6**: Zero `.accessibilityLabel` on icon-only buttons (11 hits); no `@ScaledMetric` / Dynamic Type; 7 animations don't check Reduce Motion.
- **§7**: Zero haptics anywhere.
- **§8**: 16 distinct font sizes.
- **§9**: Padding inconsistencies — 5 card padding values, 6+ button padding patterns.
- **§10-§14**: Visual hierarchy, safe areas, forced light mode, missing skeletons, deprecated `.cornerRadius()`, hardcoded colors.

**Total: ~20 hours estimated effort across all priorities.** REVIEW.md ends with a P0/P1/P2/P3 priority matrix.

REVIEW.md is dated 2026-04-19. Some items have been addressed in subsequent sessions (per Session 5 SHIPPED commits — accessibilityHidden additions, KidQuizEngineView 36→44pt close button, etc.) but REVIEW.md isn't annotated with which items shipped. **Stale documentation.**

References "KidViews" extensively (line 19, 21, 22, 24, 60, etc.) — that file used to be in adult app but was removed when kids forked into VerityPostKids/ 2026-04-19. The line:column references in §1+§2 point at the old combined adult/kids file. These references no longer resolve.

### T5 — `VerityPost/VerityPost/possibleChanges/` ships 7 mockup files in the app bundle

Files: `AdultHomeFeed.html`, `KidModeDelight.jsx`, `KidModePixar.html`, `KidModeV3.html`, `PaywallRewrites.html`, `TypographyTokens.html`, `index.html`.

Per `project.yml` line 28-31:
```yaml
sources:
  - path: VerityPost
    excludes:
      - "**/.DS_Store"
```

The `sources` walk includes everything under `VerityPost/` — only `.DS_Store` is excluded. **The 7 mockup files will ship as Resources in the .app bundle.** **Confirms AuditV2 C42** (P3).

Either add `possibleChanges/**` to the excludes list before App Store submission, or move the folder out of the target source path entirely.

### T6 — ParentalGate has 4 live callers — refutes CLAUDE.md + Future Projects claims

`ParentalGateModal.swift` defines `struct ParentalGateModal` (line 22) plus a `.parentalGate(...)` view-modifier (per inferred convention from the call sites).

Live callers (verified via grep):
1. `ProfileView.swift:48` — unpair button gate (`showUnpairGate`)
2. `ProfileView.swift:51` — legal-links gate (`showLegalGate`)
3. `ExpertSessionsView.swift:85` — parent gate (`showParentGate`)
4. `PairCodeView.swift:143` — help-screen mail composer (`showHelpGate`)

Plus 2 internal `#Preview` invocations in `ParentalGateModal.swift:262 + 279`.

**4 live COPPA gates**, contradicting:
- CLAUDE.md repo tree: "ParentalGateModal.swift COPPA gate — defined, zero callers (T-tbd)"
- AuditV2 §2.A row 4: "Reference/CLAUDE.md ParentalGate 'zero callers (T-tbd)'" → P1 delete claim
- Session 04-23 OWNER_QUESTIONS §4.3: already verified the 4 callers (claim was the audit error). **CLAUDE.md wasn't updated.**

`Future Projects/views/ios_kids_profile.md` (Session 4 read) explicitly proposes adding the parental gate to the unpair button — but it's already there per ProfileView:48. Spec is behind code.

### T7 — `BadgeUnlockScene` is reachable in concept but unreachable in practice

`KidsAppRoot.swift:196-199`:
```swift
let outcome = state.completeQuiz(
    passed: ...,
    score: ...,
    biasedSpotted: false  // hardcoded
)
```

`KidsAppState.swift:203`:
```swift
if biasedSpotted {
    // enqueue BadgeUnlockScene
}
```

Since `biasedSpotted` is hardcoded `false`, the badge-unlock branch never fires. The scene is fully implemented but never reached from quiz completion. **Confirms AuditV2 C11.**

Either wire bias-spotting from quiz answers (the kids product had a "biased headline" detection mechanism per ProfileView stat label), or delete the dead branch.

### T8 — `HomeFeedSlots.swift` and `Keychain.swift` appear to be orphans

Grep across `VerityPost/VerityPost/` for "HomeFeedSlots" or "Keychain" returns only the file itself + a REVIEW.md mention. Neither is referenced by any other Swift file. **Confirms AuditV2 C40.**

If genuinely unused, delete both. If intentionally retained for future feature wiring, document why.

### T9 — Adult app `#if false` blocks: 6 (5 AlertsView + 1 StoryDetailView)

- AlertsView.swift: 5 `#if false` blocks (lines 645, 682, 711, 741, 777) — likely the kid-mode chrome that was removed when kids forked
- StoryDetailView.swift:1907 — likely the expert Q&A panel block (per AuditV2 C38: "Round 9 expert-Q&A panel `#if false`'d in adult iOS")

These are launch-hide patterns analogous to `{false && ...}` in web/. CLAUDE.md launch-hide memory says keep them alive for one-line unhide. Remaining web KILL_SWITCH_INVENTORY items (Session 8 finding) extend here on the iOS side.

### T10 — KidsAppLauncher fallback URL points at marketing landing, not App Store

`KidsAppLauncher.swift:19`: `URL(string: "https://veritypost.com/kids-app")`. Comment lines 7 + 13: "the /kids-app info page on the web. Swap fallbackURL to a real App Store URL once the kids app ships. Apple-block until dev account active." Apple-block now unblocked (per memory + Session 04-23 OWNER_QUESTIONS).

`web/src/components/kids/OpenKidsAppButton.tsx:3`: `// TODO: swap to real App Store URL once app is published`. Both web + iOS carry the same Apple-block-pending placeholder. **Confirms AuditV2 C43.**

### T11 — AlertsView Manage tab gated off pending `subscription_topics` table

`AlertsView.swift:252`: `private let manageSubscriptionsEnabled = false`. Lines 243-256 carry the rationale: "the Manage tab used to render category/subcategory/keyword … real `subscription_topics` table + API route ships. Do NOT flip this." **Confirms AuditV2 C39.**

The `Future Projects/views/ios_adult_alerts.md` (Session 4 read) proposes warming up the Manage tab copy — but the gate is intentional pending the table.

### T12 — Both Info.plists carry `CFBundleVersion = 1` (never bumped)

Adult `Info.plist:30-31` + Kids `Info.plist:32-33`: `<string>1</string>`. Project.ymls also set `CURRENT_PROJECT_VERSION: "1"`. **Confirms AuditV2 C41.**

Bump pattern needs to be established (manual / agvtool / CI).

### T13 — Cross-zone hook from KILL_SWITCH_INVENTORY (Session 5 / Session 8) — iOS-side resolution

Items not covered by web/ Session 8:
- AlertsView Manage tab (T11) — still hidden
- Adult `#if false` blocks (T9) — still hidden
- KidsAppLauncher fallback (T10) — Apple-block (now actionable)
- `BadgeUnlockScene` orphan (T7) — wire-or-delete decision
- `HomeFeedSlots.swift` / `Keychain.swift` orphans (T8) — delete-or-document
- Kids `aps-environment=development` (T2) — flip to `production` for App Store

CZ-G **fully resolved**: 5 web-side hidden + 6 iOS-side findings (variations of hidden / orphan / Apple-block) — total kill-switch landscape covered.

### T14 — `Future Projects/views/ios_*` (Session 4) vs current iOS state

| ios_*.md spec | Current state |
|---|---|
| `ios_adult_home.md` — masthead + 8 slots from `front_page_state` | Current `HomeView.swift` reads articles directly; no front_page_state table; matches Session 8 web finding (CZ-D bridge) |
| `ios_adult_story.md` — un-tab structure, strip metadata | Current `StoryDetailView.swift` is the 3-tab (Article/Timeline/Discussion) version; not yet rebuilt per spec |
| `ios_adult_subscription.md` — failure UI for product-load failure | Verified status not checked end-to-end this session |
| `ios_adult_alerts.md` — empty-state copy + Manage decision | Current code has the Manage gate + warmer empty-state copy; spec partially shipped |
| `ios_adult_family.md` — family pair-code QR | Verified at `FamilyViews.swift` referenced (not deep-read) |
| `ios_adult_profile.md` — collapse 6 tabs to 4 + streak move | Verified status not checked end-to-end |
| `ios_kids_*` (9 specs) | Most kid views present in code; bias-spotted unhooked (T7) |

The Future Projects views/ specs are forward-looking — they describe the redesign, not current state. **Spec-vs-code drift is expected by design** since the spec is a proposed future state. But specs aren't marked "PROPOSED — not yet shipped" anywhere; a reader of `views/web_story_detail.md` could misread it as current.

### T15 — Cross-zone hook resolutions

| Hook | Status |
|---|---|
| **CZ-A** F7 V4 vs F7-DECISIONS-LOCKED | Not iOS-relevant; remains owner-call. |
| **CZ-G** KILL_SWITCH_INVENTORY 11 items | **FULLY RESOLVED** (T13). |
| **CZ-H** ADMIN_ROUTE_COMPLIANCE | Not iOS-relevant; carry to Session 11. |
| **CZ-L** AuditV2 P0 runtime bugs | iOS surfaces don't have new bugs added; the C1-C3 P0s are DB-side (Session 10). |

---

## Confident bucket (ready for cleanup decisions)

**C-1.** Adult `VerityPost.entitlements` is missing `aps-environment` and `associated-domains`. Push registration is silently broken; Universal Links don't open in app. Both Apple-block-pending until 2026-04-23 — **now actionable**. **AuditV2 C4 + C36.**

**C-2.** Kids `VerityPostKids.entitlements` `aps-environment=development` — flip to `production` for App Store builds. **AuditV2 C37.**

**C-3.** Both `Assets.xcassets/AppIcon.appiconset/` need PNG files. Generate the icon set. **AuditV2 C5.**

**C-4.** `VerityPost/project.yml` `excludes` block needs `possibleChanges/**` added so 7 HTML/JSX mockups don't ship in the .app bundle. **AuditV2 C42.**

**C-5.** Both `Info.plist` `CFBundleVersion=1` — establish a bump pattern (manual / agvtool / CI hook) before next release. **AuditV2 C41.**

**C-6.** `KidsAppLauncher.swift:19` fallback URL is `https://veritypost.com/kids-app` — swap to real App Store URL once kids app ships. Apple-block now actionable. **AuditV2 C43.**

**C-7.** `web/src/components/kids/OpenKidsAppButton.tsx:3` carries the same TODO. Pair the swap with C-6.

**C-8.** `HomeFeedSlots.swift` and `Keychain.swift` are orphans (no callers across `VerityPost/`). Delete or document why retained. **AuditV2 C40.**

**C-9.** `BadgeUnlockScene` unreachable: `KidsAppRoot.swift:199` hardcodes `biasedSpotted: false`. Either wire bias-spotting from quiz answers OR delete the `if biasedSpotted` branch in `KidsAppState.swift:203`. **AuditV2 C11.**

**C-10.** CLAUDE.md repo tree says "ParentalGateModal.swift … zero callers (T-tbd)". Confirmed 4 live callers via `.parentalGate(...)` modifier in ProfileView × 2 + ExpertSessionsView + PairCodeView. **Update CLAUDE.md.** **AuditV2 §2.A row 4** (already P1 in their list).

**C-11.** `VerityPost/VerityPost/REVIEW.md` is a 400-line 2026-04-19 UI/UX audit. Some items have shipped (e.g., accessibilityHidden, kids close button 36→44pt) but REVIEW.md isn't updated. Cross-references files like `KidViews.swift` that no longer exist (kids forked 2026-04-19). Either annotate per-item ship state OR mark whole file as "historical 2026-04-19 audit" + create a current REVIEW for outstanding work.

**C-12.** `VerityPostKids/README.md` — contains a kids-app-specific README (5879 bytes, not read end-to-end this session). Pair-flow + V3 scenes + COPPA notes. Spot-check it for stale claims; pair with C-10.

---

## Inconsistent bucket (project-itself-is-inconsistent — flag for resolution session)

**I-1.** Adult app has `applesignin` entitlement but no `aps-environment` + no `associated-domains`. Three Apple-block items, only one of which (`applesignin`) shipped. Either flip all three at once now that Apple Dev is active, OR document why one shipped before the other two.

**I-2.** Kids app has `aps-environment=development` + `associated-domains` but no `applesignin`. Adult has `applesignin` but no push or domains. The two apps' entitlement sets are disjoint and incomplete in different directions. A single coordinated entitlements pass would close both gaps.

**I-3.** `Future Projects/views/ios_kids_profile.md` proposes adding parental gate to unpair — already shipped in `ProfileView.swift:48` (predates the spec). Spec is behind code. Same pattern likely true for several other ios_kids_*.md specs (not deep-read).

**I-4.** REVIEW.md (2026-04-19) is a substantial audit but isn't annotated with what shipped. Multiple subsequent session logs (04-21 through 04-25) shipped UI fixes that REVIEW.md predicts; cross-referencing requires reading both. Either annotate REVIEW.md per-item or retire it.

**I-5.** Both apps ship `1.0` MARKETING_VERSION + `1` CFBundleVersion across multiple session-shipped changes. No version bump tracking. (This is C-5 framed as a process inconsistency, not just a one-line file fix.)

---

## Open questions (need owner direction)

**Q-1.** `BadgeUnlockScene` — wire bias-spotting from quiz answers (substantive feature work) OR delete the dead branch? Decision determines whether the scene stays.

**Q-2.** Apple Day-1 entitlements bundle — flip aps-environment + associated-domains on adult + aps-environment to production on kids + applesignin on kids? Or sequence them per-cycle?

**Q-3.** REVIEW.md — keep, annotate per-item, or retire?

**Q-4.** `possibleChanges/` — purge from app bundle and move out of the target source tree, or keep as developer reference inside the iOS source tree?

---

## Cross-zone hooks (carried forward)

- **CZ-A** (continued): F7 prompts — owner-call.
- **CZ-H** (continued): ADMIN_ROUTE_COMPLIANCE — full re-run is its own project.
- **CZ-I** (continued): TODO_2026-04-21.md unchecked items — Session 11.
- **CZ-L** (continued): AuditV2 P0 DB bugs — Session 10.
- **CZ-M** (continued): Proposed Tree adoption — Session 11.
- **CZ-N** (continued): hasPermissionServer dual-export — track until rename.
- **CZ-O** (continued): lib/plans.js half-migrated — track until DB-first migration completes.
- **CZ-P** (new): iOS app version bump pattern — establish before next release.

---

## Plan for Session 10

`schema/` migrations.

Approach:
1. List `schema/` directory (per Session 8 last migration is 177 + the stray 100_backfill in `Archived/`).
2. Read every numbered migration (likely 100+ files) — head + first DDL block + comment header for each.
3. Verify AuditV2 P0 / P1 DB findings:
   - C1: `cleanup_rate_limit_events` → `occurred_at` vs `created_at`
   - C2: 092/093/100 missing on disk; live RPCs `require_outranks` + `caller_can_assign_role` body capture
   - C6: 8 RPC bodies referencing `superadmin`
   - C7: schema/127 rollback perm-key bug
   - C13: adult quiz threshold hardcoded `>= 3` in `user_passed_article_quiz`
4. Verify `reset_and_rebuild_v2.sql` matches numbered migrations (DR replay correctness).
5. Cross-reference any schema/* file numbering against MASTER_TRIAGE / SHIPPED commit logs.
6. Surface any orphan migrations (referenced in docs but missing from disk, or vice versa).
7. Write `AuditV1/10-schema-overlap-map.md`.
8. Update `AuditV1/00-README.md`.

This is the largest file-count session (~170 .sql files) but each file is small. Will batch-read with grep + targeted reads.
