# views/ — Per-View Implementation Docs

Each MD in this folder is the self-contained spec for changes to one view (or tightly-related group of views). The format is consistent:

- **Current state** — what the view does today, grounded in the 2026-04-21 recon.
- **What changes** — concrete edits, referencing the strategy MDs for rationale.
- **Files** — the actual file paths under `web/src/app/...` or `VerityPost/VerityPost/...` or `VerityPostKids/VerityPostKids/...`.
- **DB touchpoints** — any table reads/writes, joined with the matching `db/` MDs if schema changes are involved.
- **Panelist owner** — who on the 39-person panel is the judgment authority for this view.
- **Acceptance criteria** — specific, testable, no wiggle room.
- **Dependencies** — which strategy or other view MDs must land first.

## Coverage

### Web (13 files)
- `web_home_feed.md`
- `web_story_detail.md`
- `web_paywall_surfaces.md`
- `web_profile.md`
- `web_profile_settings.md`
- `web_profile_kids.md`
- `web_login_signup.md`
- `web_leaderboard.md`
- `web_bookmarks.md`
- `web_messages.md`
- `web_notifications.md`
- `web_search.md`
- `web_welcome_marketing.md`

### Adult iOS (6 files)
- `ios_adult_home.md`
- `ios_adult_story.md`
- `ios_adult_profile.md`
- `ios_adult_subscription.md`
- `ios_adult_alerts.md`
- `ios_adult_family.md`

### Kids iOS (8 files)
- `ios_kids_pair.md`
- `ios_kids_home_greeting.md`
- `ios_kids_reader.md`
- `ios_kids_quiz.md`
- `ios_kids_streak.md`
- `ios_kids_badges.md`
- `ios_kids_leaderboard.md`
- `ios_kids_profile.md`
- `ios_kids_expert.md`

## What's not covered here

- **Admin views.** 40+ admin pages exist. Admin is `@admin-verified` LOCKED per CLAUDE.md; no edits without explicit owner approval.
- **Kids web pages.** Per project rule: kids has no web surface. `/kids-app` is a placeholder landing.
- **Marketing content pages.** `/about`, `/contact`, `/privacy`, `/terms`, `/dmca`, `/accessibility`, `/help` — copy pages, updated per `01_POSITIONING.md`. No per-view doc needed.
- **Standards / refusals / corrections / masthead public pages.** Removed from scope in the 2026-04-21 Charter update. The article is the product.

## How to work from these docs

1. Pick a view to work on based on `18_ROADMAP.md` phase sequence.
2. Open the matching MD. Read it end to end.
3. Read the strategy dependency docs it names.
4. Read the current file in the codebase.
5. Make the changes.
6. Check against acceptance criteria.
7. Open PR; reference the MD path in the description.
