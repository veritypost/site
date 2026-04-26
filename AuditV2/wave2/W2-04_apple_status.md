# W2-04: Apple Developer Status + Apple-Block Punch List

## Q1: Does owner have an Apple Developer account? — YES, AS OF 2026-04-25 (CLAUDE.md IS STALE)

Three sources, three timestamps:

| Source | Date | Says |
|---|---|---|
| `Reference/CLAUDE.md` line 35 | mtime 2026-04-24 17:10 | "owner does not yet have an Apple Developer account" |
| `Reference/ROTATIONS.md` line 17 + 43 | mtime 2026-04-23 07:52 | `APPLE_TEAM_ID=FQCAS829U7` — runbook treats account as active |
| `~/.claude/.../memory/project_apple_console_walkthrough_pending.md` | 2026-04-25 (today) | "Owner is enrolled in Apple Developer Program. Account active; APNs / SIWA / signing keys all present. Apple block lifted — BBB.* items are now code-shippable." |

**Resolution:** the most recent signal (memory, dated today) wins. **Owner has the account.** ROTATIONS.md was correct as a forward-looking runbook (Team ID was reserved). CLAUDE.md is stale by ~24 hours.

**Action:** rewrite CLAUDE.md "Current Apple block" paragraph (lines 35-39) to:
- Owner is enrolled in Apple Developer Program (Team FQCAS829U7).
- Console walkthrough (bundle IDs + capabilities + IAP product creation) is owner-paced, not auto-queued. Don't trigger unless owner says "let's do Apple console now."
- BBB.* code items (entitlements, AppIcon, etc.) are now plain code changes — ship them in normal triage batches.

## Q2: Bundle IDs (per memory)
- Adult: `com.veritypost.VerityPost`
- Kids: `com.veritypost.VerityPostKids`

(Z18 said `com.veritypost.kids` — possibly a transcription artifact; pbxproj is canonical. Wave 3 should confirm by reading both pbxproj files.)

## Q3: Sign-In with Apple
- ROTATIONS.md describes the Client Secret JWT rotation runbook (every 6 months) — implies SIWA wiring exists.
- `scripts/generate-apple-client-secret.js` exists (per Z19).
- Adult-iOS code references `applesignin` entitlement (Z17 said it's missing). With account active, this is the next concrete fix.

## Q4: APNs
- Adult: **`aps-environment` entitlement MISSING** (Z17). Code calls `registerForRemoteNotifications`. Must add entitlement.
- Kids: **`aps-environment=development`** (Z18). Should be `production` for App Store builds; "development" for TestFlight is fine but flag.
- Server: `web/src/lib/apns.js` exists (Z12). Reads `APNS_TOPIC` (env var). `.env.example` declares `APNS_BUNDLE_ID` instead — dead env var (W2-01 carryover).

## Q5: AASA / Universal Links
- Z16 confirmed `web/public/` has only `ads.txt` — **no `apple-app-site-association` file**.
- AASA either needs to be a static file at `/.well-known/apple-app-site-association` OR served by a Next.js route handler.
- Z16 says no route handler appears to exist for it.
- **Action:** create `web/src/app/.well-known/apple-app-site-association/route.ts` returning the appropriate JSON, or add the file to `web/public/.well-known/`.

## Q6: KidsAppLauncher fallback URL parity — VERIFIED CONSISTENT
- iOS adult side `KidsAppLauncher.swift` (Z17): `https://veritypost.com/kids-app` ✓
- Web side `kids/OpenKidsAppButton.tsx` (Z16): App Store URL is a placeholder
- After App Store live: replace placeholder with real App Store URL.

## Q7: AppIcon — BLOCKER
- Z17: `AppIcon.appiconset` has no PNG. App Store rejects builds without icons.
- **Action:** generate icon set (1024×1024 master + standard size variants).

## Q8: CFBundleVersion
- Z17: never bumped from `1`. App Store Connect rejects identical CFBundleVersion across uploads.
- **Action:** decide pattern (manual bump, agvtool, CI).

## Q9: App Store URL placeholders
- `kids/OpenKidsAppButton.tsx` — placeholder string per Z16 (Apple-block).
- After publish: real URL `https://apps.apple.com/app/idXXXXXXXXX`.

## Q10: APP_STORE_METADATA path drift
- Z02: APP_STORE_METADATA uses outdated `site/...` paths (vs current `web/`).
- Edit before submission.

## Q11: OWNER_TODO ↔ CLAUDE.md Apple parity

OWNER_TODO_2026-04-24 TODO-4 ("Start Apple Developer enrollment") → **DONE per 2026-04-25 memory**. OWNER_TODO is also stale.

CLAUDE.md Apple-block paragraph + OWNER_TODO TODO-4 should both be updated.

## Confirmed duplicates
- (none in this thread)

## Confirmed stale
- `Reference/CLAUDE.md:35-39` — owner Apple-Dev claim (account is active as of 2026-04-25)
- `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md:33` TODO-4 — Apple enrollment is done
- `kids/OpenKidsAppButton.tsx` placeholder URL (waits on App Store live)

## Confirmed conflicts
- CLAUDE.md vs memory vs ROTATIONS — three timestamps, three slightly different framings; net "account active" wins
- Adult `aps-environment` missing while code calls `registerForRemoteNotifications`

## Unresolved (Wave 3)
- pbxproj bundle ID exact strings
- Whether SIWA is wired in `web/src/app/api/auth/*`
- AASA file vs route-handler decision

## Recommended actions
1. **P0:** Update `Reference/CLAUDE.md` lines 35-39 (Apple paragraph)
2. **P0:** Update `Current Projects/Audit_2026-04-24/OWNER_TODO_2026-04-24.md` TODO-4
3. **P0:** Add adult `aps-environment` + `applesignin` + `associated-domains` entitlements
4. **P0:** Generate AppIcon set (1024 master + variants)
5. **P0:** Establish CFBundleVersion bump pattern
6. **P1:** Create AASA file/route
7. **P1:** Switch kids `aps-environment` to `production` for App Store builds
8. **P1:** Fix `APNS_BUNDLE_ID` vs `APNS_TOPIC` env-var mismatch (decide canonical, update both .env.example and apns.js)
9. **P2:** Update APP_STORE_METADATA `site/` → `web/`
10. **P2:** Replace App Store URL placeholders after publish
