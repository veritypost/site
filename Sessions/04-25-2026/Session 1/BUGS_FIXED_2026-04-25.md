# Bug-Hunt Session — 2026-04-25

Living log of bugs surfaced by the new test infrastructure (Playwright web E2E + XCUITest iOS) and what was done about each one. Append as we go; never edit prior entries.

## How to read this

Each entry: **`[FIXED|OPEN|WONTFIX] <one-line title>`** then:
- **Where**: file:line or route path
- **Symptom**: what the user / test sees
- **Root cause**: why it happens
- **Fix**: what changed (or what would need to change if OPEN)
- **Regression test**: spec file + name that prevents future regressions

---

## FIXED

### [FIXED] iOS adult — Browse categories list was non-interactive

- **Where**: `VerityPost/VerityPost/HomeView.swift:558-568` (BrowseLanding)
- **Symptom**: Owner reported "I see categories list and I can't click it." Tapping any row in the Browse view did nothing — looked like a broken list.
- **Root cause**: Each category row was rendered as `Text(cat.displayName)` with no `Button`, `NavigationLink`, or `onTapGesture`. Static text only.
- **Fix**: Wrapped each row in `NavigationLink(value: cat)`. Added new `CategoryDetailView` that lists published articles for the tapped category. Added `Hashable` conformance on `VPCategory` so the navigation value works.
- **Regression test**: `VerityPost/VerityPostUITests/SmokeTests.swift::test_browseCategoriesAreInteractive`

### [FIXED] Web — `/api/admin/promo` returned 500 on duplicate code

- **Where**: `web/src/app/api/admin/promo/route.ts:75-78`
- **Symptom**: Admin trying to create a promo code that already exists got "Server Error" toast (500) instead of a friendly "code already exists" (409).
- **Root cause**: Catch block returned 500 for every Supabase error, including `23505` (unique violation).
- **Fix**: Map Postgres `23505` to a 409 with `error: 'A promo with that code already exists'`. All other errors still 500.
- **Regression test**: `web/tests/e2e/admin-deep.spec.ts::admin-deep — billing › promo create returns 409 on duplicate code`

### [FIXED] Web — `/browse` "Latest" section showed empty grid when no articles

- **Where**: `web/src/app/browse/page.tsx:259-331`
- **Symptom**: When zero articles are published, the "Latest" section header still rendered with an empty grid below it — no UX signal that there were no stories.
- **Root cause**: `featured.map(...)` rendered directly with no length check.
- **Fix**: Added `featured.length === 0` branch that renders a dashed-border "No new stories yet today. Check back later." card.
- **Regression test**: existing `tests/e2e/anon-golden-path.spec.ts` covers `/browse` rendering; no specific empty-state spec yet (low value — visual-only).

### [FIXED] Web — `/api/users/[id]/block` returned 500 on non-existent target

- **Where**: `web/src/app/api/users/[id]/block/route.js:73-82`
- **Symptom**: Blocking a user whose ID doesn't exist returned a generic 500 "Internal error" instead of a clean 404.
- **Root cause**: Postgres `23503` (foreign_key_violation) from the `blocked_users.blocked_id` FK was caught and mapped to 500.
- **Fix**: Added explicit handler — `error.code === '23503'` → 404 `{ error: 'User not found' }`.
- **Regression test**: `web/tests/e2e/profile-settings-deep.spec.ts::profile-settings-deep — privacy & blocking › block + unblock round-trip does not 5xx`

### [FIXED] iOS Kids — Expert sessions list was non-tappable

- **Where**: `VerityPostKids/VerityPostKids/ExpertSessionsView.swift:34-36`
- **Symptom**: Same class as the BrowseLanding bug. Kids saw a list of upcoming expert sessions rendered as cards with title/description/date/duration but tapping any card did nothing — no detail view, no sheet, no action.
- **Root cause**: `ForEach(sessions) { s in card(s) }` rendered each card as a static VStack with no `Button`, `NavigationLink`, or `.onTapGesture` wrapper.
- **Fix**: Wrapped each card in a `Button { selectedSession = s }` and added a `.sheet(item: $selectedSession)` that shows the full session detail (untruncated description, scheduled time, duration). Tapping a card now opens the sheet; closing returns to the list. Sheet supports medium + large detents.
- **Regression test**: TODO — XCUITest pattern would be: launch kids → enter pair code → tap first session card → assert sheet visible. Adding once the seeded session set is wired into the kids smoke target.

### [FIXED] Admin "Generate" button in /admin/newsroom did nothing on click

- **Where**: `web/src/components/admin/PipelineRunPicker.tsx:162` reads `ai_models`; `schema/114_f7_foundation.sql:77-87` created the table with RLS but no grants. Also affected `ai_prompt_overrides`, `kid_articles`, `kid_sources`.
- **Symptom**: Owner clicked Generate in /admin/newsroom — nothing happened, no error toast, no console log. Button stayed disabled because `pickerReady` was false; picker couldn't load models because PostgREST returned "permission denied for table ai_models" on the SELECT.
- **Root cause**: 4 F7 tables had `ENABLE ROW LEVEL SECURITY` + admin-only SELECT policies, but never had `GRANT SELECT TO authenticated, service_role`. PostgREST checks grants BEFORE RLS, so every read was rejected at the grant layer.
- **Fix**: Migration `schema/177_grant_ai_models_select.sql` grants SELECT on the 4 tables to `authenticated, service_role`. Owner applied it 2026-04-25; PostgREST schema cache reloaded via `NOTIFY pgrst, 'reload schema'`. Verified: anon-keyed probe now returns the 4 seeded models (claude-sonnet-4-6, claude-haiku-4-5-20251001, gpt-4o, gpt-4o-mini).
- **Regression test**: TODO — write spec that signs in as admin, navigates to /admin/newsroom, asserts the provider picker has options. Will add in next batch.

### [FIXED] iOS Kids — App Store orientation warning at archive

- **Where**: `VerityPostKids/project.yml`
- **Symptom**: `xcodebuild archive` warned "All interface orientations must be supported unless the app requires full screen." This warning becomes a rejection blocker at App Store Connect submission.
- **Root cause**: Kids is portrait-only by product decision, but `UIRequiresFullScreen=true` was missing — Apple requires that flag when restricting orientations.
- **Fix**: Added `UIRequiresFullScreen: true` to Kids Info.plist via `project.yml`. Re-ran `xcodegen generate`. Archive now warning-free.
- **Regression test**: `xcodebuild archive ... 2>&1 | grep warning` should be empty (manual; will fold into a CI workflow later).

---

## Pending audits — bugs may surface from these

- 31 untested admin flows (out of 51 mapped) — reports/appeals/feature flag/category/sponsor/access/data-request remaining
- 45 untested profile/settings flows — password change full round-trip, kid CRUD, billing upgrade/downgrade, data export, account deletion, expert sub-pages
- 37 user-mutation routes with no explicit rate limit (RPC-level limits exist; tightening to route-level is week-one polish)
- ~10 admin pages whose empty-state branches haven't been verified by the agent walk
- ECONNRESET flakes on dev server under high parallelism — re-runs pass; could harden by lowering parallel workers in `playwright.config.ts` if recurrent

## Method

1. Pick a flow from the audit lists or the failing spec output.
2. Write a test that exercises the flow.
3. Run. If 5xx / wrong behavior / dead UI → log new entry as OPEN.
4. Fix the bug. Update entry to FIXED with the fix details + regression test.
5. Re-run full suite to confirm no regressions.
6. Repeat.
