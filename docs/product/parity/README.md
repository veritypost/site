# 02-Parity — Cross-platform feature split

Three sibling markdown files document which surfaces live on which platform. Keep in sync with the live code in `site/src/` and `VerityPost/VerityPost/`.

- [`Shared.md`](./Shared.md) — surfaces present on both web and iOS (core content, auth, quiz, comments, billing, family, kids).
- [`iOS-Only.md`](./iOS-Only.md) — iOS-exclusive files (app entry, services, push registration, Theme helpers, TTSPlayer).
- [`Web-Only.md`](./Web-Only.md) — web-exclusive routes (admin pages, OG routes, settings sub-pages, onboarding flows).

**Last refreshed:** 2026-04-16 (Pass 2 Task 28 — refreshed from live code ground truth; Pass 3 Task 33 re-homed each file here from its former standalone parent directory).

See `../04-Ops/PROJECT_STATUS.md` §5 for the cross-platform feature parity matrix that these three files derive from.
