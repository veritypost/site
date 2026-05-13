# TODO-IOS — iOS-specific outstanding work

Split out from `TODO.md` 2026-05-13. This file holds work that is **entirely iOS** (adult app `VerityPost/` — kids is separate, redirect-only per locked memory). Web-only and cross-platform items remain in `TODO.md`.

## ‼️ README — rules of engagement

The rules of engagement at the top of `TODO.md` apply equally here. Re-read them before touching any item in this file. In particular:

1. **Read the actual code first.** Open `VerityPost/VerityPost/` files, the `.xcodeproj/project.pbxproj`, `Info.plist`, `*.entitlements`, plus any cross-cutting infra (`web/public/.well-known/apple-app-site-association`, push payload generators, JSON-LD emitters that produce iOS-renderable shapes). Don't trust line numbers in this doc — verify.
2. **Cross-platform applicability check still required.** Every change states web ✓/N-A + iOS ✓/N-A + kids iOS ✓/N-A. Yes, even iOS-side fixes — confirm web is N-A explicitly rather than silently.
3. **No `xcodebuild` runs without owner authorization** — the harness can `swiftc -parse` and `plutil -lint` for syntax checks, but real Xcode builds need the owner-driven Apple Developer toolchain.

---

## ⏱ Session resumption — read this on new session start

**Last write: 2026-05-13.** iOS work split from TODO.md this session.

**Mid-flight: nothing pending on iOS today.**

**Most recent locked decisions (verify with `git log` if unsure):**
- iOS = 1:1 view of web for editorial. Every editorial pin on `/admin/home` must propagate to iOS. (Section D below.)
- Canonical wordmark = "verity post" (lowercase, with space) — iOS audit pending in TODO.md G2.8.
- Canonical article URL = `/{slug}`. Stage 1 (web) shipped. Stage 2 iOS pending next iOS release (Section C below).

**Critical path:**
- **Ship auth commit to TestFlight:** A1 → A2 → (A3) → A4 if needed (Section A).
- **Next iOS release prep:** Section C (expert-coverage tooltip).
- **Deferred but locked:** Section B (slot port) — scope-pending owner answer.

---

## Section A — TestFlight gate for auth commit `e4cad79d`

The code change is already on `origin/main` (waitlist removed from iOS, server-side bypass for `client: "ios"`, OTP `setSession` race fix). What's missing is end-to-end verification on a real iOS binary before users get it via TestFlight.

### A1 — Build iOS adult app for TestFlight or real device `[Owner]`

Open `VerityPost.xcodeproj` → Archive → upload to App Store Connect → push to internal TestFlight. Or install on a tethered iPhone via Xcode.

### A2 — Run the smoke test `[Owner]`

The iOS OTP flow is **code-entry**, not a clickable email link — the email contains an 8-digit code that the user types into the login screen's TextField. Keep that in mind for the steps below.

1. **Anon → Home** — cold launch the app with no account. Should land on Home immediately. No "you're on the waitlist" card. No signup prompt.
2. **OTP sign-in** — tap "Send sign-in link" → request OTP → check email → type 8 digits → confirm sign-in succeeds and you land in the app signed in.
3. **Universal Link deep-link** — tap a `verity://` or `https://veritypost.com/r/<slug>` link from another app — confirm it routes into the app correctly and (if signed in) does not re-prompt for auth. (Note: this is the PKCE recovery / deep-link path, separate from the OTP code-entry flow.)
4. **Sign out → re-sign in** — sign out from Settings → request a new OTP → confirm the "Check your inbox" card does NOT persist stale from the prior session, and the new code path works clean.
5. **Audit log tags** — after the first iOS signup, query in Supabase: `SELECT metadata FROM audit_log WHERE actor_id = '<your-test-user-id>' ORDER BY created_at DESC LIMIT 3` — confirm `metadata.client = "ios"`. Then `SELECT raw_user_meta_data->>'signup_source' FROM auth.users WHERE id = '<your-test-user-id>'` — should return `"ios"`.
6. **Web waitlist regression** — open `https://veritypost.com/request-access` in a browser. Confirm it still gates a non-beta browser visitor with the waitlist form. Confirm the existing `/admin/access-requests` queue still works.
7. **`setSession` race** — sign in via OTP, then immediately tap into Profile or any permission-gated surface. Confirm permissions resolve correctly (no flash of locked content). This is the only user-visible symptom of the race.

### A3 — Edge cases flagged by adversary `[Owner, optional but worth doing]`

8. **Existing web user installing iOS** — sign in on iOS with an email that already has a `signup_source = "web"` user. Confirm they sign in cleanly. Their `signup_source` will stay `"web"` (it's only written once at user creation, by design).
9. **MFA-enrolled account** — if you have a test account with TOTP enabled, try signing into iOS with it. The current server returns `200 ok` with no session on MFA accounts; iOS will show "Invalid code" with no path forward. May not block launch if no iOS users have MFA yet.
10. **Soft-deleted account** — try signing into iOS with an account where `deletion_completed_at IS NOT NULL`. The `enforceDeletedAccountGate` should sign them out post-redemption.

### A4 — Fix anything that fails `[Code]`

Triage and patch by failing path. Re-run only the broken step.

---

## Section B — iOS `home_layouts` slot port `[Code, owner-locked, panel-recommended scope reduction pending]`

**Owner-locked 2026-05-13:** iOS must be 1:1 with web for editorial. Every editorial decision on `/admin/home` propagates to iOS. No divergence accepted.

**Current behavior (verified by code + DB audit 2026-05-13):**

- Web home (`/`) renders the layout admins build via `/admin/home`. Live prod layout has 5 slots (data_ticker, lead, cluster of 12 items, insight_row, discovery_feed).
- iOS home (`VerityPost/VerityPost/HomeView.swift`) ignores `home_layouts` entirely. Zero references to `home_layouts` / `home_slots` in iOS source. Reads `top_stories` (0 rows in prod) and falls back to `articles ORDER BY published_at DESC`. Net: iOS hero = whatever article was most recently published; iOS feed = next 11 most-recent articles. Editorial has no control.
- iOS file header at `HomeView.swift:7-8` claims "Mirrors web/src/app/page.tsx" — stale; web's `page.tsx` was redesigned around home_layouts and iOS wasn't brought along.
- **Sleeper bug surfaced by panel:** iOS HomeView.swift L676-745 reads `top_stories` AND `hero_pick_for_date` directly from Supabase. Tables are empty NOW, but the reader path is hot — anyone clicking one button at `/admin/top-stories` instantly overrides whatever `/admin/home` configured. StoryEditor.tsx L1396 writes `hero_pick_for_date` on every article edit save (`/api/admin/articles/save/route.ts:172`). The "dead surface" framing is wrong.

**Three editorial workflows for one homepage today:**
1. `/admin/home` (2,907 LOC) → drives web only. Editor's actual workflow.
2. `/admin/top-stories` (5-pin pinboard) → drives iOS hero if anyone uses it. Empty in prod.
3. `articles.hero_pick_for_date` column → iOS-only fallback. No admin UI exists.

**5-agent panel review 2026-05-13 — open scope question for owner:**

- **Original locked plan:** full slot port, ~2,200 net new Swift LOC, ~50–70 engineering hours, 5 sub-bundles (Lead + Cluster P0; remaining 12 slot kinds P1–P3).
- **Adversary recommendation:** port Lead + Cluster only — those are the two slot kinds your live layout actually uses. The other 12 slot kinds are unused in production. "Wave 1 / no wave 2" precedent from the ad-placement bug is empirically strong; committing to 5 stages risks zombie scaffolding when stages 3–5 sit half-finished for months.
- **Data architect + cross-platform engineer:** full port assumed, but flagged that:
  - There is no `/api/home/layout` endpoint today — web reads via direct Supabase RPC inside `_home/data.ts`. iOS port either builds the endpoint OR reads Supabase directly via anon RLS (already enforced; `home_layouts.status='live'` is the gate).
  - Server-side resolution recommended — bake `payload.resolved_placement_web` + `payload.resolved_placement_ios` into the response so renderers stay pure view code.
  - `unstable_cache` invalidation surface grows: web uses `revalidateTag('home-layout')` from 6 admin write routes; iOS needs equivalent (pull-to-refresh + scenePhase=active + optional silent push).
- **Admin UX:** flagged that retirement of `top_stories` + `hero_pick_for_date` is more work than killing tables — need to:
  - Strip `top_stories` read from iOS HomeView.swift before dropping the table (or in-field binaries 404).
  - Strip StoryEditor "Hero today" toggle + the `/api/admin/articles/save` writer before dropping the column.
  - Strip iOS `Models.swift:219 heroPickForDate` field before dropping the column.

**Suggested staged implementation (5-stage, each shippable independently):**

1. **Stage 1 — Data layer.** New `/api/home/layout` endpoint (~80 TS LOC) OR direct Supabase read on iOS via anon RLS. Reuse `fetchLiveLayout()` + tag invalidation if endpoint. Swift `Decodable` types for `LayoutRow / SlotRow / SlotItem / HomeStory`.
2. **Stage 2 — Foundation: Lead + Cluster.** SwiftUI `LeadSlot` (with timeline aside when ≥3 rows) + `ClusterSlot` (mixed article + ad items, 1/2/4-col responsive grid). Mount in `HomeView.swift` behind a feature flag; keep current hardcoded feed live as fallback. ~600–900 Swift LOC. **Cuts the live editorial-drift gap inside the first session.**
3. **Stage 3 — Remaining slot kinds (optional per adversary).** `second_lead`, `breaking_strip` (no-op), `list_rail`, `secondary_pair`, `wide_strip`, `editors_picks`, `promo`, `engagement`, `feature`, `insight_row`, `discovery_feed`. Add as editorial starts using them.
4. **Stage 4 — `data_ticker` decision.** Cramped horizontal strip is bad mobile UX. Either redesign as a 2-row marquee for iOS OR filter the slot out of the iOS dispatcher with a comment.
5. **Stage 5 — Retire legacy paths.** Strip iOS `top_stories` reads, strip StoryEditor "Hero today" toggle, drop `articles.hero_pick_for_date`, drop `top_stories` table, drop `/admin/top-stories`. **Only after** every in-field iOS binary has rolled to a version that doesn't read `top_stories`/`hero_pick_for_date`. The flag from Stage 2 becomes default-on.

**Cross-platform applicability:** web N-A (already shipped); iOS adult = entire bundle; kids iOS N-A (kids = category launcher per locked memory).

---

## Section C — iOS expert-coverage tooltip `[Code, deferred per BUILD.md]`

Web has the "X experts" hover/tap tooltip on article rows; iOS Browse renders the count only. Marked non-blocking in BUILD.md follow-ups. Pick up after `/directory` (TODO.md Section A) is otherwise solid.

**Cross-platform applicability:** web ✓ (already shipped); iOS = primary; kids iOS N-A.

---

## Section D — Final iOS build verification `[Verify]`

Real Xcode build is the only authoritative gate before TestFlight. Open `VerityPost/VerityPost.xcodeproj` → build for iPhone simulator → confirm Home + Browse + Profile tabs render and the sections-grid icon still opens HomeSectionsSheet.

**One specific render-check from the 2026-05-13 iOS ad placement ship:** confirm the new `ios_home_*` SPONSORED cards display correctly with their CTAs ("Join free" / "Try Verity" / "Sign up" / "Upgrade" / "Create account" / etc.). `HomeAdSlot` only reads `advertiser_name` + `cta_text` + `alt_text` — verify those render where they should and the card hides cleanly when no fill.

**Cross-platform applicability:** web N-A; iOS = primary verify; kids iOS — separate verify against `VerityPostKids.xcodeproj` if owner wants kids build sanity in the same session.
