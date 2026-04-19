# VerityPostKids

**Placeholder folder — the kids iOS build lives here once it's split.**

Today: kid mode still lives inside `/VerityPost/` (the unified adult + kid app). This folder is empty + reserved so the repo structure reflects the plan.

## When this gets built

See `docs/planning/product-roadmap.md` P3 — kids iOS is planned to split from VerityPost after adult iOS hits TestFlight. Prerequisites:

1. Extract shared Swift code from `VerityPost/` into a Swift Package (`packages/ios-core/`) that both apps consume.
2. Create new Xcode project here in `VerityPostKids/` with new bundle ID `com.veritypost.kids`.
3. Route kid-only views (`KidViews.swift`, `FamilyViews.swift`, kid leaderboard/story flow) into this project.
4. Strip third-party analytics (Apple Kids Category rule).
5. Parental gates on every external link.
6. New App Store Connect record in Made for Kids track.

## Don't put code here until

- Adult iOS is stable in TestFlight
- Shared Swift package extraction is done
- COPPA compliance checklist is worked through (see `docs/planning/future-dedicated-kids-app.md` if that doc exists, or flag to owner)
