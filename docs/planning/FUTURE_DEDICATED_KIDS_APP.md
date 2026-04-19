# Future Build: Dedicated Kids iOS App

Deferred. Parked for post-launch. Current architecture ships kid mode as a gated feature inside the unified iOS app; this doc captures what a dedicated Kids-category app would require when/if the team decides to fork.

---

## Why this is deferred

- Unified app is launch-ready (feature-verified kids + family_admin tracks).
- Apple's Kids Category is strict (parental gate on every external link, no third-party analytics/ads/tracking, stricter review). Starting there delays launch by weeks.
- Real usage data needed first — if kid-mode engagement is strong, a dedicated app makes sense for organic Kids Category discoverability.
- Post-launch fork is cheaper than pre-launch fork because the domain model + permissions are already stable.

---

## Two ways to structure the fork

### Option A — Two Xcode targets, shared Swift sources

One Xcode project, two targets. Compile-time flag `#if KIDS_APP` strips the adult surface from the kids binary. Shared `SupabaseManager`, `PermissionService`, `Models.swift`.

**Effort**: ~1 week focused work.

**Pros**
- Single codebase, fewer places to sync fixes
- Shared Codable types, one schema source of truth
- Simpler CI

**Cons**
- Compile-time flag pollution in many files
- Build configs are harder to keep clean
- Accidental adult symbol reference in kid target can slip through until review rejects

### Option B — Fork into two separate Xcode projects

Copy the project. Extract shared sources into a Swift Package (`VerityCore`) that both projects depend on. Kids project keeps only the kid surface + minimum shared infra.

**Effort**: ~2 weeks focused work (more upfront, less long-term drift).

**Pros**
- Hard separation — kid project physically cannot reference an adult view
- Cleaner review submissions per bundle
- Each binary stays smaller
- Easier to enforce COPPA-only rules (no grep for `#if !KIDS_APP`)

**Cons**
- 2x project files to configure signing, capabilities, build settings
- Harder to share a late-binding fix
- Swift Package boundary is real work to set up correctly first time

**Recommendation when we fork**: start with Option A (targets) because the initial lift is lower. Promote to Option B (separate projects) later if the kid app stabilizes and the shared surface is small.

---

## The actual hard parts (not Xcode plumbing)

### 1. Auth flow rework
Kids apps on the App Store are expected to NOT have the child self-sign-up. Parents create the account on the adult app (or web) + add a kid profile with PIN. The kid logs into the kids app with a short code or QR from the parent — no child-facing email/password.

**What changes**:
- New "pair with parent" flow on kids app launch (short code + server endpoint)
- New server endpoint `POST /api/kids/pair` that validates the short code and returns an auth token scoped to that kid profile
- Kid profile tokens need to be scoped — kid can't act as parent or see parent surface
- Current `handle_new_auth_user` trigger flow needs to NOT fire for kid pairings (kid uses parent's auth.users row via a delegated token, or gets its own minimal row with `is_kid_delegated=true`)

### 2. COPPA compliance (Apple Kids Category specifics)
- Parental gate on every purchase, external link, settings change
- No third-party analytics (Sentry → strip from kid binary OR use Apple's in-app analytics only)
- No tracking IDs
- No user-to-user comms (DMs, comments off by default)
- No outbound web links without parental gate (source citations need parental tap)
- Must list the contact for COPPA questions in App Store listing

**Specifically to strip from kid binary**: Sentry SDK, any analytics, comments, DMs, follows, outbound source links (or gate them), ad slot component (Ad.tsx equivalent on iOS).

### 3. Universal links + deep links
Two sets of associated domains. If both bundles handle `veritypost.com`, iOS prompts the user which app to open — ugly UX.

**Options**:
- Scope kids app to a dedicated subdomain (`kids.veritypost.com/*`)
- Or use different path prefixes (`/kids/*` → kids app, `/*` → adult app)

### 4. App Store listing per app
- Kids app needs separate screenshots, description, age rating (4+ or 9+ subcategory)
- Review notes must explain parental gate flow + COPPA compliance
- Rejected-first-submission rate for Kids Category is high — expect 1-2 revision rounds

### 5. IAP — share or duplicate
- Simplest: no IAP in kid app; parent subscribes on adult app; kid app validates parent's subscription via server (`/api/kids/pair` can check parent's `users.plan_id`)
- Alternative: "Kids Plus" IAP only in kid app. More complex; needs a separate subscription group or the kid app in the same group

---

## Prerequisites before starting the fork

1. **Launch unified app first**. Get real kid-mode engagement data.
2. **Collect pairing-code UX validation**. Test with families.
3. **Strip analytics/tracking dependencies** from planned-shared code (easier to fork later if kid-binary doesn't need to exclude things).
4. **Decide subdomain strategy** (`kids.veritypost.com` vs path-based).
5. **Draft Apple Kids Category review notes** and parental gate spec.
6. **Set up pairing endpoint server-side** — independent of iOS work, can be added to web APIs now if we want.

---

## Scaffold (do only when ready to start)

When the owner says go:

1. Create `KIDS_APP` build setting in `project.yml` under a new target
2. Add `#if !KIDS_APP` wrappers around adult-surface entry points (ContentView tabs, DM button, Ad slot component, Sentry init)
3. Create `ContentView_Kids.swift` — minimal kid-only entry point
4. Extract Codable models into a shared target or package
5. Create new bundle ID `com.veritypost.kids`
6. New entitlements file for kids target (no push if we don't want kid device push, or yes push with stricter notification categories)
7. New Info.plist with Kids Category metadata

---

## Estimated total effort when we come back

- Option A path: ~1 week focused iOS work + 2 weeks App Store review cycles
- Option B path: ~2 weeks focused iOS work + 2 weeks App Store review cycles

Either way, plan for ~3-4 elapsed weeks from decision to live Kids-category app in the store.

---

## Nothing to do now

Leave the current iOS project alone. When ready to fork, start by re-reading this doc + the current `FEATURE_LEDGER.md` kids entries to confirm the surface area hasn't drifted.
