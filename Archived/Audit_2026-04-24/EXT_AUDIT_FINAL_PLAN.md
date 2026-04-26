# External Audit — Final Close-Out Plan

**Anchor commit:** `5ad6ad4` on `main`. Migrations 161-174 deployed.
**Source:** the 28 still-real items from the 3-agent re-verification (2026-04-25).
**Goal:** ship the launch-blocking + compliance-edge items; consciously accept the rest as backlog so we can stop re-auditing and ship.

---

## How to read this doc

Every item carries:
- **ID** — keeps the cross-reference to the source audit clean
- **Verified state** — the actual file:line on disk today
- **Severity tier** — see below
- **Fix recipe** — the smallest change that closes the finding without scope expansion
- **Batch** — which shippable batch this lands in

Severity tiers (decreasing urgency):

| Tier | Meaning | Posture |
|---|---|---|
| **A. Launch gate** | A reviewer or first user trips on this | **Ship in batch 36** |
| **B. Compliance edge** | GDPR / COPPA / Apple-strictest reviewer concern | **Ship in batch 37** |
| **C. SEO + observability** | Real product impact post-launch | **Ship in batch 38** |
| **D. iOS / surface polish** | Quality-of-life, not blocking | **Ship in batch 39** |
| **E. Quality debt** | Real but small, not user-visible | **Backlog, no batch — ship opportunistically** |
| **F. Architectural** | Multi-week reframe, deliberately deferred | **Post-launch only** |

Each batch is sized to ship in one session, type-check clean, and not require owner intervention.

---

## TIER A — Launch gates (Batch 36)

### A1. **GG.3** — `permission_set_perms` SELECT `USING(true)`
- **Verified:** `schema/reset_and_rebuild_v2.sql:4827-4829` — three policies all `USING(true)` on `permission_set_perms`, `role_permission_sets`, `plan_permission_sets`. Writes are admin-only (gated at `:4839-4841`); only SELECT is wide open.
- **Risk:** any authenticated session can enumerate the entire permission matrix. Real-world impact low (no exfiltration path), but security auditors will flag it categorically.
- **Fix:** new migration `175` — drop the three SELECT policies, replace with `USING (public.is_admin_or_above())`. Service role bypasses RLS so the matrix-import script and the `loadEffectivePerms` SECDEF RPC are unaffected. Authenticated users get effective perms via the RPC return, which they're entitled to; they lose direct read of the underlying join tables (which they should never have had).
- **Verify:** after migration, hit `/admin/permissions` as admin → still works; hit `select * from permission_set_perms` as authenticated user → empty.

### A2. **J.4** — `SettingsView.swift:1860` hardcoded billing URL
- **Verified:** literal `"https://veritypost.com/profile/settings/billing"` at line 1860 + line 1867. `SupabaseManager.siteURL` exists at `:61-66` and is unused here.
- **Risk:** preview/staging iOS builds open production billing in the embedded webview. Bad UX in dev, real billing-flow risk if a tester taps through.
- **Fix:** swap both literals to `"\(SupabaseManager.shared.siteURL)/profile/settings/billing"`. 1-line edit each.
- **Verify:** xcodebuild succeeds; visual smoke check in DEBUG opens correct URL.

### A3. **C.3** — `refreshIfStale` zero-init edge case
- **Verified:** `web/src/lib/permissions.js:38` initializes `versionState = { user_version: 0, global_version: 0 }`; `:79-82` compares with `!==`; `:90` only refreshes when `bumped` is true.
- **Risk:** a brand-new user who legitimately has version 0 never triggers a refresh. In practice the bumps start ≥1 so the bug is theoretical, but the audit framing is correct.
- **Fix:** change initial state to `{ user_version: -1, global_version: -1 }` so the first DB version (always ≥0) is `!==` and triggers refresh. Add a 1-line comment explaining the sentinel.
- **Verify:** load any page as a new signup → permissions hydrate.

---

## TIER B — Compliance edges (Batch 37)

### B1. **X.8** — `export_user_data()` RPC missing tables
- **Verified:** `schema/028_phase19_data_export.sql:29-138` exports 18 tables; **missing**: `subscriptions`, `sessions`, `alert_preferences`, `push_receipts` (or `user_push_tokens`), `billing_events`, `audit_log` (user's own rows), `support_tickets` (user's tickets), `expert_applications`, `ad_events` (user's interactions), `kid_pair_codes`.
- **Risk:** GDPR Article 15 (right of access) requires "all personal data." Missing rows = incomplete export = non-compliant.
- **Fix:** new migration `175` (same migration as GG.3, low-risk additive) — add SELECT blocks per missing table to the `export_user_data` RPC body. Keep service-role-only EXECUTE grant.
- **Verify:** call the RPC for a test user with rows in each table → all rows present in the JSON output.

### B2. **X.7** — data-export storage retention
- **Verified:** `web/src/app/api/cron/process-data-exports/route.js:23` writes to bucket `data-exports`; signed URL has 7-day expiry; no cron deletes the underlying object after the URL dies. `web/vercel.json` has no expiry-cleanup schedule.
- **Risk:** storage cost grows unbounded; old PII sits indefinitely in private storage past the user's promised expiry.
- **Fix:** new cron route `web/src/app/api/cron/cleanup-data-exports/route.ts` that lists `storage.objects` in `data-exports` bucket, deletes anything older than 14 days (URL expiry + 7-day grace). Add to vercel.json schedule (daily). Reuse the `verifyCronAuth` + `withCronLog` pattern from the existing crons.
- **Verify:** create a test export, list storage, run cron, list again → row gone.

### B3. **W.1** — kids keychain persists across uninstall
- **Verified:** `VerityPostKids/VerityPostKids/PairingClient.swift:284` uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`; no `install_id`/`firstLaunch` UUID gate exists in `VerityPostKids/`.
- **Risk:** on a shared iPad, sibling reinstalls the app → keychain item persists → inherits the previous kid's session. COPPA edge case Apple reviewers may flag.
- **Fix:** on first launch, write a UUID to `UserDefaults` (which IS cleared on uninstall) and store it alongside the keychain JWT. On every launch, compare; if `UserDefaults` UUID is missing or differs from the keychain-stored UUID, treat the session as invalid + force re-pair. ~30 lines in `PairingClient.swift` + a `KidsAuth` boot check.
- **Verify:** uninstall + reinstall the kids app simulator build → pair-code prompt appears.

### B4. **OO.2** — CSP `style-src 'unsafe-inline'`
- **Verified:** `web/src/middleware.js:94` includes `'unsafe-inline'` in `style-src`.
- **Risk:** any XSS that lands as inline `<style>` runs unblocked. Not a current exploit path but security auditors flag categorically.
- **Fix:** keep `'unsafe-inline'` for now if the inline styles are throughout the codebase (audit said many are); the CSP_ENFORCE switch added in Batch 21 means moving to nonce-based styles is a multi-batch refactor. **Conservative ship:** add `Content-Security-Policy-Report-Only` ALSO without `'unsafe-inline'` so we collect violation reports without blocking. When the report endpoint is quiet, flip the enforcing header.
- **Verify:** observe `/api/csp-report` for inline-style violations → know which sites need to migrate.

### B5. **BB.3** — `/api/ads/serve` no URL allowlist at serve-time
- **Verified:** `web/src/app/api/ads/serve/route.js:33` returns the RPC payload as-is; admin-side validation (JJ.7) only blocks new inserts; existing rows or rows mutated via direct SQL pass through unchecked.
- **Risk:** an ad creative URL slipped past JJ.7 (or pre-existing in DB) renders client-side. Belt-and-suspenders matters for ad surface.
- **Fix:** add a 5-line `isSafeAdUrl(url)` guard in the serve route; null out `creative_url` and `click_url` fields if they fail the http(s)-only check. Same helper as JJ.7. Doesn't change response shape.
- **Verify:** insert a test row with `javascript:` URL via direct SQL → serve returns null URLs → client renders nothing instead of executing.

---

## TIER C — SEO + observability (Batch 38)

### C1. **SS.2** — zero JSON-LD schema markup
- **Verified:** zero `application/ld+json`, `@type":`, `schema.org` hits across `web/src/`.
- **Risk:** real SEO miss. Google + Bing rely on Article/NewsArticle/Organization JSON-LD for rich results, sitelinks, and the news carousel. Pre-launch this is the single highest-leverage SEO win.
- **Fix:** add a `<JsonLd>` server component in `web/src/components/JsonLd.tsx` that takes `{ type, data }`. Inject into:
  - `app/layout.js` head: `Organization` + `WebSite` schemas (constant)
  - `app/story/[slug]/page.tsx`: `NewsArticle` schema with headline, datePublished, author, image, publisher
  - `app/u/[username]/page.tsx`: `Person` schema for verified experts
- **Verify:** Google Rich Results Test on a published article URL → returns valid NewsArticle markup.

### C2. **SS.4** — sitemap.js `.limit(5000)` hard cap
- **Verified:** `web/src/app/sitemap.js:70` caps at 5000; lines 79-89 log a warning on overflow but truncate silently past the cap.
- **Risk:** at 5000+ articles the sitemap drops the tail; new articles invisible to crawlers until older ones are paginated out.
- **Fix:** convert `app/sitemap.js` (single sitemap) to `app/sitemap-index.js` (sitemap index pointing at chunked sitemaps). Each chunk holds 50K URLs, indexed by month or by article ID range. Boilerplate Next.js pattern.
- **Verify:** sitemap.xml returns a sitemap-index referencing chunk files; each chunk validates against sitemaps.org schema.

### C3. **Y.2** — `track.ts` no payload size cap
- **Verified:** `web/src/lib/track.ts:24` only enforces event-COUNT cap (20); no byte-size guard. `sendBeacon` has a ~64KB browser limit.
- **Risk:** a single big event (or 20 medium events with large payloads) silently fails to send. The fallback to `fetch keepalive` exists but masks the loss.
- **Fix:** add `MAX_PAYLOAD_BYTES = 32 * 1024` guard. Stringify each event on enqueue; if `> 4KB`, drop the event with a console warn. If buffer total exceeds 32KB, flush early.
- **Verify:** simulate a 100KB event in dev → console warn fires; sendBeacon path stays under 64KB.

### C4. **Y.4** — adult iOS emits zero analytics events
- **Verified:** zero `track(`/`events/batch`/`trackEvent`/`emitEvent` callsites across `VerityPost/`. Adult reader/quiz/comment surface is invisible to events pipeline.
- **Risk:** product analytics blind on the surface that's most likely to drive real engagement (long-form reading on iOS).
- **Fix:** add `EventsClient` Swift wrapper that POSTs to `/api/events/batch` with the same shape the web client uses. Wire into:
  - `StoryDetailView.swift` (article view)
  - `KidQuizEngineView.swift` adult parallel (quiz attempt) — actually the kids one
  - `AlertsView` push prompt result
  - `SettingsView` paid-tier upgrade tap
- **Verify:** open the app, perform each action, confirm rows land in the events table.

---

## TIER D — iOS / surface polish (Batch 39)

### D1. **J.4** — VerityPostApp scenePhase only refreshes StoreKit
- **Verified:** `VerityPost/VerityPost/VerityPostApp.swift:23-26` — `onChange(of: scenePhase)` calls `StoreManager.shared.checkEntitlements()` only.
- **Fix:** add `Task { await PermissionService.shared.refreshIfStale() }` inside the same `.active` branch. 1-line addition.

### D2. **J.4** — FamilyViews hardcodes
- **Verified:** `VerityPost/VerityPost/FamilyViews.swift:44-50` (maxKids switch), `:685` (coppaConsentVersion literal), `:841-846` (readingLevels array). Code comment at `:43` even acknowledges the drift.
- **Fix:** extract to `KidsAPI.familyConfig()` GET endpoint that returns these from settings table or `plans.metadata`. Owner can flip values without an iOS rebuild. ~1 hour of work.

### D3. **W.6** — Kid foreground state refresh
- **Verified:** `VerityPostKids/VerityPostKids/KidsAppRoot.swift:64-74` `onChange(of: scenePhase) .active` calls `PairingClient.shared.refreshIfNeeded()` (JWT rotation) but NOT `state.load(...)`. Kid streak/categories stay stale until view remount.
- **Fix:** add `await state.load(forKidId: kid.id, kidName: kid.name)` inside the `.active` branch right after the JWT refresh. ~3 lines.

### D4. **W.2** — Kid pair-code 7-day TTL (owner-confirm)
- **Verified:** `web/src/app/api/kids/pair/route.js:24` `TOKEN_TTL_SECONDS = 7 days`.
- **Owner decision needed:** the audit said "too long". Two options:
  - **Keep 7 days** — kid re-pairs weekly (current behaviour). Easy on parents.
  - **Shorten to 24-48h** — better COPPA posture, more parent friction.
- **Park for owner answer; do not auto-ship.**

---

## TIER E — Quality debt (no batch, opportunistic)

| ID | Title | Why deferred |
|---|---|---|
| O.2 | story flags resolved once on `[slug]` dep | Edge case (perms changing mid-session); subscribe to permsVersion when convenient |
| O.3 | quiz stage React-state-only | Lost on remount but server has the row; localStorage persistence is nice-to-have |
| O.6 | browse `.limit(500)` no cursor | Fine until you have 500+ published articles |
| E.3 | Apple JWS hardcoded windows | Same DB-extract pattern as E.2; ship when you next touch the file |
| E.1 | 7 BATCH_SIZE constants + 73 raw `.limit()` | Zero pattern of these biting; accept as constants-with-context |
| S.1 | send-emails no atomic claim | Real concern at scale; not a current bug because the lock-window is tighter than send rate |
| S.2 | cron skip-branch swallow | Wrap with `if (error)` check next time you touch send-emails |
| U.4 | scrape-article no robots.txt | The Jina proxy honors it server-side; direct-fetch path is rare |

## TIER F — Architectural (post-launch)

| ID | Title | Why deferred to post-launch |
|---|---|---|
| A.1 | v2LiveGuard 7% coverage | Sweep across 153 routes; only matters if you flip the master switch |
| A.3 | feature-flag pub/sub | 10s drift across instances acceptable until traffic justifies infra change |
| B.1 | two audit tables consolidation | Both alive, distinct purposes; consolidation is bookkeeping |
| B.2 | tier list 4-8 sites | DB extract is real but won't bite a launch |

---

## Batch sizing + sequence

| Batch | Tier | Items | Estimate |
|---|---|---|---|
| 36 | A — gates | GG.3, J.4 SettingsView URL, C.3 refreshIfStale | 30 min, 1 migration |
| 37 | B — compliance | X.8 RPC rewrite, X.7 cleanup cron, W.1 keychain freshness, OO.2 report-only mode, BB.3 serve allowlist | 90 min, 1 migration + 1 cron route + iOS edits |
| 38 | C — SEO + obs | SS.2 JSON-LD, SS.4 sitemap-index, Y.2 payload cap, Y.4 iOS events | 90 min, ~6 file changes |
| 39 | D — surface polish | J.4 scenePhase perms refresh, J.4 FamilyViews extract, W.6 kid state refresh | 60 min |
| — | D4 owner-decision | W.2 pair-code TTL | parked for owner |

After Batch 39: every TIER A/B/C/D item closed. TIER E + F stay backlog. **Total to ship: 4 batches, ~5 hours of focused work.**

---

## Stop condition

Once Batches 36-39 land:
- All TIER A and B items closed (real launch + compliance gates)
- All TIER C items closed (real product impact)
- All TIER D-shippable items closed (iOS polish)
- TIER E + F documented as accepted backlog
- D4 (W.2) parked for owner

**No more audits.** Pick a launch date.

---

## Provenance + integrity

This plan was built from:
- The 3-agent re-verification dispatched 2026-04-25 (file:line evidence per item, sourced from current `main` at `5ad6ad4`)
- Cross-check against `EXT_AUDIT_TRIAGE_2026-04-24.md` Buckets 4 (deferred) and 5 (in flight)
- Owner's locked decisions in `memory/project_locked_decisions_2026-04-25.md`

Items already shipped silently (caught by re-verification): A.2 security-critical layer (closed by H4 quiz pre-check), X.1 bookmarks UNIQUE (constraint exists in DB).

Items the original audit got wrong (caught by re-verification): L.3 (hallucinated permission key), U.6 (no DELETE was deliberate), W.7 (4 callers exist), EE.1 (Swift `static let` is race-safe by language guarantee), BB.1 (mechanism claim wrong).
