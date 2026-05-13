# VerityPostSnapshotTests

Pixel-baseline snapshot suite for adult-iOS layout work. Uses
[swift-snapshot-testing](https://github.com/pointfreeco/swift-snapshot-testing)
to render SwiftUI views at the seven locked viewports (320 / 375 / 414 / 768
/ 1024 / 1180 / 1366 pt) and diff PNGs against committed baselines.

## First-time setup: regenerate Xcode project + generate baselines

The `.xcodeproj` is gitignored — it's regenerated from `VerityPost/project.yml`
via XcodeGen. The snapshot test target lives in `project.yml`; pull it into
your local `.xcodeproj` with:

```sh
cd VerityPost && xcodegen generate
```

(Install XcodeGen first if needed: `brew install xcodegen`.)

The sandbox where this code is authored cannot run `xcodebuild` (no iOS
SDK, no CoreSimulator). The 14 baseline PNGs (7 viewports × 2 test methods)
must be generated **once** on a Mac with Xcode installed, after the xcodegen
regen above:

```sh
SNAPSHOT_RECORD=YES xcodebuild test \
  -project VerityPost/VerityPost.xcodeproj \
  -scheme VerityPost \
  -only-testing:VerityPostSnapshotTests \
  -destination 'platform=iOS Simulator,name=iPad Pro (12.9-inch)'
```

Every assertion will "fail" with a `recorded snapshot` message — that's
expected on the first run. PNGs land in
`VerityPost/VerityPostSnapshotTests/__Snapshots__/`. Commit that directory
alongside the source files.

## Verification: replay baselines

After baselines are committed, drop the env var:

```sh
xcodebuild test \
  -project VerityPost/VerityPost.xcodeproj \
  -scheme VerityPost \
  -only-testing:VerityPostSnapshotTests \
  -destination 'platform=iOS Simulator,name=iPad Pro (12.9-inch)'
```

Assertions pass when rendered output matches the committed PNGs byte-for-byte.

## When the UI legitimately changes

When you intentionally change a view that has snapshot coverage:

1. Run the test once and confirm the diff is the visual change you meant.
2. Delete the affected baseline PNG(s) from `__Snapshots__/`.
3. Re-run with `SNAPSHOT_RECORD=YES` to regenerate.
4. Commit the new PNG(s) in the same PR as the code change.

The owner is the baseline reviewer — eyeball every regenerated PNG before
committing.

## Determinism

`SnapshotTestCase.setUp()` pins:

- `NSTimeZone.default = UTC`
- `AppleLanguages = [en_US_POSIX]`
- Per-view: light color scheme, `.large` Dynamic Type, `en_US_POSIX` locale.

If a baseline diffs on a fresh machine despite no code change, something
above broke. Check Xcode version + simulator runtime before chasing it
deeper — the snapshot library is also sensitive to rendering changes
between iOS simulator runtimes.

## What this suite covers today

- `StoryDetailViewSnapshotTests` renders a **structural proxy** of
  `StoryDetailView` (named `StoryReaderProxy`) that mirrors the reader's
  outermost layout — tabbed at <1180pt, article-column + sticky timeline
  rail at ≥1180pt. The real `StoryDetailView` is too coupled to
  `AuthViewModel` + Supabase to snapshot hermetically without a
  dependency-injection refactor; the proxy is the bridge until that
  refactor lands.

When `StoryDetailView` becomes testable (a future session can add an
initializer that accepts pre-loaded `timeline:` / `sources:` and skips
the `.onAppear` network load), delete `StoryReaderProxy` from
`StoryDetailViewSnapshotTests.swift` and re-record.

## Viewports

| Width | Device family | Notes |
| ----- | ------------- | ----- |
| 320pt | iPhone SE | Smallest supported iPhone |
| 375pt | iPhone 14 / 13 / 12 | Current baseline iPhone |
| 414pt | iPhone 14 Plus / Pro Max | Widest iPhone |
| 768pt | iPad mini portrait, iPad 9.7 portrait | |
| 1024pt | iPad 10.9 portrait | Below the rail threshold (intentional) |
| 1180pt | iPad 10.9 landscape | Rail threshold — `VP.LayoutBreak.rail` |
| 1366pt | iPad Pro 12.9 landscape | Widest iOS canvas |
