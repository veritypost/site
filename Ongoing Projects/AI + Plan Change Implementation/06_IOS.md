# iOS changes

Two apps. Each touched separately because they have different architectures.

- **VerityPost** — adult app, Supabase auth, full feature surface
- **VerityPostKids** — kid app, separate auth (PIN + pair code + delegated kid JWT), constrained feature surface

---

## VerityPost (adult app)

### Subscription + paywall

#### `VerityPost/VerityPost/SubscriptionView.swift`
Major update. Currently shows 4 plan cards including `verity_family_xl`.

Changes:
- Remove `verity_family_xl` references entirely (lines 36, 439, 470, 484, etc.)
- Plan cards: Free, Verity, Family
- Verity card: "$7.99/mo or $79.99/yr"
- Family card: "$14.99/mo or $149.99/yr — includes 1 kid. Add up to 3 more for $4.99/mo each."
- Annual toggle (already exists, preserve)
- Plan tier comparison feature list (new — current view doesn't have a feature matrix)

#### `VerityPost/VerityPost/StoreManager.swift`
Major update. Add the 8 new Family product IDs:

```swift
static let familyMonthly1Kid = "com.veritypost.family.1kid.monthly"
static let familyMonthly2Kids = "com.veritypost.family.2kids.monthly"
static let familyMonthly3Kids = "com.veritypost.family.3kids.monthly"
static let familyMonthly4Kids = "com.veritypost.family.4kids.monthly"
static let familyAnnual1Kid = "com.veritypost.family.1kid.annual"
// ... etc
static let verityMonthly = "com.veritypost.verity.monthly"  // existing? verify
static let verityAnnual = "com.veritypost.verity.annual"
```

Remove:
- `familyMonthly`, `familyAnnual` (replaced by tiered SKUs)
- `familyXlMonthly`, `familyXlAnnual` (cancelled product line)

New methods:
- `upgradeToFamilyTier(kidCount: Int, period: BillingPeriod)` — computes target SKU + initiates StoreKit upgrade within subscription group
- `currentFamilyKidCount() -> Int` — derives kid count from active SKU

Apple StoreKit handles within-group upgrades natively. Confirm via SubscriptionGroupID metadata in App Store Connect.

#### `VerityPost/VerityPost/SettingsView.swift`
Search keywords list (line 1001) — drop "pro" if Pro tier is fully retired. Or keep for grandfathered users.

### Family management

#### `VerityPost/VerityPost/FamilyViews.swift`
Major update. Currently ~1100 lines. Touched throughout.

**`CreateKidInput` struct (line 745):**
- Remove `readingLevel: String?` (or keep as informational if owner wants subjective reading level UI separate from system band)
- DOB stays required

**`AddKidView` (around line 920):**
- Remove the reading-level picker (lines 925-930, 980-984) — system-derived `reading_band` replaces it
- DOB validation stays (3-12)
- After kid creation, show seat-cost confirmation: "$4.99/mo will be added to your subscription"

**`KidDetailView` or similar (verify exact name):**
- DOB read-only with "Was this entered incorrectly?" link
- Show current `reading_band` ("Kids 7-9" or "Tweens 10-12")
- Add "Advance to Tweens" button (gated: age ≥ 9 OR parent override)
- Add "Move to adult app" button (gated: age ≥ 13 OR parent override)
- Confirmation modals for both — clearly explain irreversibility

**Birthday-prompt banner:**
- Top-of-family-screen banner if `kid_profiles.metadata.birthday_prompt_pending = true`
- "Your child turns 10/13. Time to advance to Tweens / Adult app?"
- Tap → confirmation modal → calls `/api/kids/[id]/advance-band`

**DOB-correction request sheet:**
- New SwiftUI view: `DobCorrectionRequestView`
- Fields: requested DOB, reason, optional doc upload (older-band)
- Preview: shows resulting band change
- Submit → calls `/api/kids/[id]/dob-correction`
- Existing requests visible in a "Requests" tab/section

#### `VerityPost/VerityPost/KidsAppLauncher.swift`
- Currently launches kid app via deep link
- Update: don't show launcher for graduated kids (none should remain in family list anyway, but defensive)

### Auth + onboarding

#### `VerityPost/VerityPost/SignupView.swift`
Add path for graduated-kid onboarding:
- Detect `?graduation_token=...` in URL params
- If present: validate token, pre-fill display name from kid profile, ask for email + password
- On success: account created + linked to family, sign in, redirect to home

#### `VerityPost/VerityPost/AuthViewModel.swift`
- Around line 414 (existing transitions logic)
- Add: handle graduation token validation
- Add: post-graduation handoff state

#### `VerityPost/VerityPost/WelcomeView.swift`
- Detect graduation context
- Skip standard welcome, show "Welcome, [name]! Your kid account has moved to the main app."

### Profile + activity

#### `VerityPost/VerityPost/ProfileView.swift`
- Lines 1704-1771 already correctly filter `kid_profile_id` from adult activity. Preserve.
- Plan badge update for new tiers
- Display seat usage if Family ("2 of 6 seats used")

#### `VerityPost/VerityPost/Models.swift`
- Around line 340 (existing `KidProfile` struct)
- Add `readingBand: String?`
- Add `bandChangedAt: Date?`
- Add `bandHistory: [BandHistoryEntry]?`
- Drop the `ageRange` enum-based `ageLabel` (lines 387-399) — replaced by `readingBand`
- Keep the `age` computed property (DOB → years)

### Plan-tier permissions

#### `VerityPost/VerityPost/PermissionService.swift`
- Verify it reads plan tier from server
- Add new permission keys: `family.kids.manage`, `family.seats.manage`
- Plan-tier-driven gating on certain features (e.g., "Open kids app" button visible only if Family tier)

### Push notifications

#### `VerityPost/VerityPost/PushRegistration.swift`
No structural change. Tokens carry through across plan changes.

#### Server-side push targeting
When dispatching kid-targeted pushes (existing service): filter by `reading_band` so a tween-only push doesn't fire on a kid-band child. Add to push job.

---

## VerityPostKids (kid app)

### Read path — band-aware filtering

#### `VerityPostKids/VerityPostKids/ArticleListView.swift`
Line 200 currently:
```swift
.from("articles")
.select("...")
.eq("status", value: "published")
.eq("is_kids_safe", value: true)
```

Update to filter by band:
```swift
.from("articles")
.select("...")
.eq("status", value: "published")
.eq("is_kids_safe", value: true)
.in("age_band", value: visibleBands(for: profile.readingBand))
```

`visibleBands(for:)` helper:
- profile.readingBand == "kids" → ["kids"]
- profile.readingBand == "tweens" → ["kids", "tweens"]
- else → []

Server-side RLS enforces the same rule (M10 in `02_DATABASE.md`), so this is defense-in-depth.

#### `VerityPostKids/VerityPostKids/KidReaderView.swift`
- Same band filter when fetching individual articles
- Quiz pool fetch (likely) needs same filter via `.eq("articles.age_band", ...)`

#### `VerityPostKids/VerityPostKids/KidQuizEngineView.swift`
- Same filter on quiz fetch

### Models

#### `VerityPostKids/VerityPostKids/Models.swift`
- `KidProfile` struct: add `readingBand: String?` (line 18 area)
- `KidArticle` struct: add `ageBand: String?` (line 95 area)

### State

#### `VerityPostKids/VerityPostKids/KidsAppState.swift`
- Hold the current profile's `readingBand`
- Expose `visibleBands` to views for filtering
- Refresh on profile load

### Graduated-state handoff

#### `VerityPostKids/VerityPostKids/KidsAppRoot.swift`
On launch, after auth:
- Fetch kid profile
- If `is_active = false` AND `reading_band = 'graduated'`:
  - Show one-time "You've moved to the main app!" screen
  - Generate adult-account claim deep link to VerityPost
  - Sign out + open VerityPost
  - On VerityPost first launch with graduation token → adult signup completes

#### `VerityPostKids/VerityPostKids/ProfileView.swift`
- Display current `reading_band` ("You're a Tween reader!") — no advance UI; parent-only
- Display age in profile

#### `VerityPostKids/VerityPostKids/ParentalGateModal.swift`
- Already exists for COPPA-gated actions
- Reuse for any parent-confirmation moments inside the kid app (e.g., if parent triggers graduation while kid is using the app)

### Auth

#### `VerityPostKids/VerityPostKids/KidsAuth.swift`
- Verify kid JWT carries `app_metadata.kid_profile_id` for RLS function `current_kid_profile_id()`
- Refresh tokens to include latest `reading_band` (or rely on RLS function reading from `kid_profiles` directly)

---

## File change manifest (iOS)

### VerityPost (adult)
- `SubscriptionView.swift` — plan card rewrite
- `StoreManager.swift` — 10 new product IDs, retire 2 old, upgrade-within-group helper
- `FamilyViews.swift` — DOB lock, band display, advance CTAs, DOB correction sheet, seat purchase confirmation
- `Models.swift` — `KidProfile.readingBand`, drop vestigial `ageRange` paths
- `SignupView.swift` — graduated-kid signup path
- `AuthViewModel.swift` — graduation token handling
- `WelcomeView.swift` — graduated context
- `ProfileView.swift` — plan badge updates, seat display
- `KidsAppLauncher.swift` — defensive graduated check
- `PermissionService.swift` — new permission keys
- `SettingsView.swift` — search keyword update

### VerityPostKids
- `ArticleListView.swift` — band filter
- `KidReaderView.swift` — band filter
- `KidQuizEngineView.swift` — band filter
- `Models.swift` — `KidProfile.readingBand`, `KidArticle.ageBand`
- `KidsAppState.swift` — band-aware state
- `KidsAppRoot.swift` — graduated handoff
- `ProfileView.swift` — band display
- `KidsAuth.swift` — JWT band claim verification

---

## App Store Connect setup

### VerityPost
- Set up subscription group `Verity Subscriptions`
- Add 10 products at the levels described in `03_PAYMENTS.md`
- Apply for Apple Small Business Program **before submitting any of this**
- Update app description / keywords / screenshots if Pro is mentioned anywhere

### VerityPostKids
- No subscription products (kids don't pay; family plan covers them)
- Verify "Made for Kids" designation is correct in App Store Connect
- COPPA-related Privacy Nutrition Labels: confirm DOB collection is disclosed correctly with the new policy
- Privacy Policy link: ensure it covers DOB-correction process

---

## Ad SDK integration (iOS Free tier)

Per decisions: adult Free iOS users see ads. Kid app never sees ads.

### VerityPost
- Decision: AdMob, Apple Search Ads, or third-party SDK?
- Recommended: AdMob (Google) — broadest inventory, kid-app-safe (we don't use it there)
- Integration: SwiftUI AdMob banner placements in feed + story views
- Configuration: only render for users where `subscription.tier == 'free'`
- File: new `VerityPost/VerityPost/AdProvider.swift` or similar
- Banner-ad placements: top of HomeView, mid-feed every 10 cards, story-view bottom

### VerityPostKids
- Audit codebase for any Google/AdMob SDK references — should be zero
- COPPA compliance requires no third-party SDKs that could fingerprint kids

---

## Testing matrix

| Scenario | iOS path |
|---|---|
| New Verity solo signup → access | Free → Verity |
| Existing Verity → Family upgrade | StoreKit upgrade within group, kid count = 1 |
| Family with 1 kid → add 2nd kid | Family-1kid → Family-2kid SKU upgrade |
| Family with 4 kids → add 5th | Hard-stop UI, no API call |
| Family with 2 kids → remove 1 | Family-2kid → Family-1kid SKU at next renewal |
| Kid graduates → adult signup | Kid app handoff → VerityPost graduation token → signup completes |
| Plan change blocked (web sub on iOS user) | "Manage in App Store" message, no purchase button |
| DOB-correction request submission | Modal opens, validates, submits, shows status |
| Kids-band kid sees only kids articles | Band filter + RLS both block tweens articles |
| Tweens-band kid sees kids + tweens articles | Both bands visible |
| Graduated kid opens kid app | Graduation handoff screen, sign out, deep link |

---

## iOS lift estimate

| Area | Hours |
|---|---|
| VerityPost — SubscriptionView + StoreManager | 8 |
| VerityPost — FamilyViews (DOB lock, band UI, sheets) | 10 |
| VerityPost — Models + AuthViewModel + Signup graduation | 6 |
| VerityPost — Plan-tier permission gating | 3 |
| VerityPost — AdMob integration | 6 |
| VerityPostKids — band filtering across ArticleList/Reader/Quiz | 4 |
| VerityPostKids — Models + State + auth band claim | 3 |
| VerityPostKids — graduation handoff | 4 |
| App Store Connect setup (10 SKUs) | 4 |
| Testing matrix | 8 |
| **iOS total** | **~56 hours** |

About 1.5 weeks. Largely parallelizable with web work.
