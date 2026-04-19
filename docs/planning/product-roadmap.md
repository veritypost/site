# Product Roadmap — Verity Post

**As of:** 2026-04-19

Four surfaces, one backend, one admin console. Shipping sequence is owner-pace but the dependencies below are hard — you can't ship kids-iOS before adult-iOS TestFlight exists, for example.

---

## The surfaces

| Surface | Code today | State | Launch sequence |
|---|---|---|---|
| **Adult web** (desktop + mobile) | `site/` (Next.js 14) | Capstone-verified ship-ready. Owner-side blockers only. | **P1 — first to launch** |
| **Adult iOS app** | `VerityPost/` (unified with kid mode today) | Code-complete. Blocked on Apple DUNS. | **P2 — after DUNS** |
| **Kids iOS app** | Doesn't exist yet — kid mode lives inside adult iOS app | Need to split from unified app. COPPA-category Apple review. | **P3 — after adult iOS TestFlight** |
| **Kids web** (redirects to kids app) | `site/src/app/kids/*` routes exist | Becomes a 308 redirect when kids app has an App Store link. | **P3 — piggyback on kids-iOS launch** |
| **Admin console** | `site/src/app/admin/*` + `site/src/app/api/admin/*` | Locked + shipped. 39 pages + 27 DS components `@admin-verified`. | Evolves continuously with all three products. |

---

## P1 — Adult web launch

**Critical path, closest to ready. Most blockers are owner-side and fast.**

### Owner-side (minutes to hours each)
1. **HIBP toggle** in Supabase Auth dashboard. Clickpath in `99-Archive/2026-04-19-prelaunch-sprint/round_g_owner_action.md`.
2. **Rotate live secrets** per `05-Working/ROTATE_SECRETS.md`. Stripe live secret + webhook secret + Supabase service-role key are in plaintext `site/.env.local` today.
3. **Set Sentry DSN** (`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`) in Vercel. Prod build fails without.
4. **Confirm `NEXT_PUBLIC_SITE_URL`** in Vercel.
5. **Set `EMAIL_FROM`** in Vercel (Resend sender).
6. **Verify Resend sending domain** in Resend dashboard.
7. **Register Stripe webhook endpoint** + capture signing secret (if not already done).

### Code hygiene (quick)
8. **Commit migrations 092/093** — copy from `99-Archive/2026-04-19-prelaunch-sprint/round_{a,b}_migration.sql` into `01-Schema/092_*.sql` and `093_*.sql`. Regenerate `reset_and_rebuild_v2.sql`. Protects disaster-recovery replay.
9. **Create `site/public/`** with PWA icons (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`).
10. **Run `npm install`** in `site/` (Round F added `@sentry/nextjs`).
11. **CSP Report-Only → Enforce flip** in `site/middleware.js:139,160` — after 48h soak.

### Bug triage (owner decides scope)
12. **Decide on 5 OPEN LBs** — ship with them, or close first?
    - LB-006 notifications empty (P1, web, RLS bug)
    - LB-010 expert-apply strands user (P2, web, UX)
    - LB-013 Stripe checkout off-site (P1, Embedded Checkout swap — product decision)
    - LB-016 feed card without headline (P2, data + render guard)
    - LB-034 sessions dropping (P1, needs telemetry to diagnose)

### Content (hard requirement)
13. **Publish 10+ real articles** in `/admin/story-manager`. Each needs 10 quiz questions (D1 rule). Replace the 5 current `Test:` placeholders.

### Cutover
14. **Unhide Vercel auto-deploy** (currently Ignored Build Step = skip all).
15. **Run `node scripts/preflight.js`** → must exit 0.
16. **Take Supabase backup** (point-in-time snapshot from dashboard).
17. **Manual `vercel --prod` deploy.**
18. **Post-deploy smoke test** per `04-Ops/CUTOVER.md` §7 — auth, quiz, comments, billing, cron, email.

**Rough effort:** 1–2 weeks owner-side actions + whatever bug-fix pace you pick.

---

## P2 — Adult iOS launch

**Starts when:** Apple Developer Enrollment DUNS number is approved.

### DUNS-gated prerequisites (owner + Apple turnaround)
1. **Apple Developer Enrollment** completed (business DUNS approved)
2. **Apple Root CA G3** already in place ✓

### App Store Connect setup (1-2 sessions)
3. **Create 8 subscription products** matching `StoreManager.swift` IDs (4 tiers × monthly/annual at D42 prices)
4. **Configure V2 Server URL** = `https://veritypost.com/api/ios/appstore/notifications` (Production + Sandbox)
5. **Set Privacy Nutrition Labels** — what data collected, linked to user, tracked
6. **Set ATT description** (app tracking transparency prompt copy)
7. **Create App Store listing** — name, subtitle, keywords, description, screenshots (6.7", 6.5", 5.5"), preview video (optional)

### Apple Developer portal
8. **Generate APNs auth key (.p8)** — capture Key ID + Team ID
9. **Universal Links** — publish `apple-app-site-association` on `veritypost.com/.well-known/apple-app-site-association` so article URLs deep-link into the app

### Vercel env vars
10. **`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` (.p8 PEM), `APNS_ENV` (`sandbox` for TestFlight, `production` for App Store), `APNS_TOPIC`** (= bundle ID)
11. **Redeploy Vercel** to pick up APNs env.

### Build + submit (1-3 sessions)
12. **Xcodebuild verify** clean compile (already done once — redo before submit)
13. **Archive + upload to TestFlight** (internal testing first, then external beta)
14. **TestFlight external** — minimum a week of real-user testing before submitting for review
15. **Submit for App Store review** — typical turnaround 1-3 days, can be days longer if review questions
16. **Release**

### Post-launch iOS work
17. **Fix iOS-deferred LB entries** (LB-028, LB-031, LB-032, LB-033, LB-037 — all iOS UI issues already documented)
18. **ATT prompt + PrivacyInfo.xcprivacy manifest** polish
19. **VPUser D40 fields** (queued for dedicated iOS pass)

**Rough effort:** 4–8 weeks from DUNS approval. DUNS itself can take 2-4 weeks of business verification.

---

## P3 — Kids iOS app + kids web redirect

**Starts when:** adult iOS is in TestFlight (need to validate shared Swift code in production-like conditions first) AND owner has bandwidth for the split.

**This is a new product build, not just a code reshuffle.** Apple's Kids Category has stricter rules than general apps.

### Pre-split architecture (required before split)
1. **Extract shared Swift code** into a Swift Package at `packages/ios-core/` (per structure synthesis). Models, `SupabaseManager`, `PermissionService`, `Keychain`, `AuthViewModel`, `TTSPlayer`, `Theme`, `Log`, `Password`, `PushRegistration`. Unified app consumes the package — prove the boundary while app still builds before splitting.

### Kids app split
2. **Create `apps/ios-kids/`** Xcode project with XcodeGen config. New bundle ID `com.veritypost.kids`. Adult keeps `com.veritypost.app`.
3. **Route kid-only views into kids app:** `KidViews.swift`, `FamilyViews.swift`, kid leaderboard, kid story flow.
4. **Route adult-only views into adult app:** all the rest.
5. **Both targets depend on `packages/ios-core`** for shared logic.
6. **Verify both build** + both hit the same Supabase project + same `kid_profiles` table.

### COPPA + Apple Kids Category compliance (dedicated work)
7. **No third-party analytics/ads/tracking in kids app.** Strip Sentry or use child-safe mode if available.
8. **Parental gate on every external link** — standard Apple requirement (arithmetic challenge or similar).
9. **Privacy Nutrition Labels** tuned for Kids Category (stricter than general apps).
10. **Review notes explicitly addressing COPPA data handling.**
11. **Screenshots showing ONLY kid UI** (no adult content leak).
12. **Age rating** — 4+ or 9+ depending on content.

### App Store Connect for kids
13. **New App Store Connect record** for `com.veritypost.kids`
14. **Submit to Made for Kids track** — different review queue, stricter reviewers, longer turnaround (often 2 weeks first submission)
15. **In-app purchases** — check if Kids Category allows them. If not, kids app is free + family-plan gate happens on parent's account via adult app or web.

### Kids web redirect (piggyback)
16. **Middleware rule in adult-site** — `kids.veritypost.com` (or `/kids` path) 308s to the kids App Store link.
17. **Keep existing `/kids/*` routes alive** for search-engine-indexed URLs; redirect them to app store too.

**Rough effort:** 2-3 months end to end. The split alone is 1-2 sessions if pre-split package extraction is done cleanly. COPPA review is the unpredictable part.

---

## Admin console — evolves continuously

**Lives in `site/src/app/admin/*` (adult-web). One deploy, one auth surface. Changes affect all three products via shared DB.**

### Ongoing
- **Admin API LOCK asymmetry** — 15/50 routes have `@admin-verified`. Decide: extend to all 50 (freeze) or accept (UI frozen, API evolves).
- **4 page rebuilds still queued:**
  - `/admin/features` — v2 `feature_flags` schema mismatch
  - `/admin/breaking` — no valid article insert path (product decision needed)
  - `/admin/webhooks` retry — cosmetic today, should be real?
  - `/admin/support` ChatWidgetConfig — wire or rip?
- **Stripe-sync pass** — manualDowngrade / resumeAccount / processRefund / plan-price edit / promo-create integrations with Stripe API. Owner-paired session per path.

### Future decision point
- **Split admin to its own app?** (`admin.veritypost.com`) Only if:
  - A bad admin deploy takes down public site too often
  - Admin needs independent scaling
  - You want separate auth boundaries
- For now: **stays bundled**. Document as first ADR if you adopt that pattern.

---

## Shared / platform infrastructure

**Single Supabase project (`fyiwulqphgmoqullmrfn`) powers everything.** Kids app, adult app, adult web, admin all hit the same DB. Permission engine is the same for all.

### What's already shared
- `users` table, `kid_profiles` table, `permissions` table (928 active), `permission_sets` (10), `compute_effective_perms` resolver RPC
- Auth (Supabase Auth email/password, Google OAuth pending, Apple OAuth DUNS-gated)
- Stripe (web billing — iOS uses StoreKit separately via App Store Server Notifications)
- APNs pipeline (shipped in `/api/ios/appstore/notifications`)

### What needs to stay in sync across products
- **Permission keys** — single source `permissions.xlsx` (currently on owner's Desktop — bring into repo)
- **Design decisions D1–D44** — live in `00-Reference/Verity_Post_Design_Decisions.md`
- **Feature ledger** — `00-Where-We-Stand/FEATURE_LEDGER.md`
- **Schema migrations** — `01-Schema/` (005–094). Apply to Supabase in order, numbered; `reset_and_rebuild_v2.sql` is the replay-of-record.

### Ops/deploy
- **Vercel** — one project today (adult-web). When kids web redirect lands, same project.
- **GitHub** — monorepo at `veritypost/site` (or similar). iOS code is in the same repo under `VerityPost/`.
- **Supabase CLI** — local linked to VP Project.

---

## Launch sequence (recommended)

```
Week 0 (now)          — Owner-side blockers + content (P1)
Week 1-2              — Adult web launch (P1 completes)
Week 2-4              — DUNS in flight; iOS App Store setup starts
Week 4-8              — Adult iOS TestFlight → submission → release (P2)
Week 8-12             — Pre-split Swift package extraction; kids app design work
Week 12-20            — Kids iOS build + COPPA submission + review (P3)
Week 20+              — Kids web redirect goes live with kids app
```

Rough timeline. Adjust to owner pace.

---

## Decisions the owner needs to make (in order of when they gate work)

1. **Ship adult web with the 5 OPEN bugs, or close them first?** (Gates P1.)
2. **Embedded Checkout swap yes/no?** (LB-013 — gates P1 bug decision.)
3. **Holding-page blueprint — implement, keep, or drop?** (Affects whether there's maintenance-mode infra before P1 cutover.)
4. **When to apply for DUNS if not already in flight?** (Gates P2 entirely. 2-4 weeks turnaround.)
5. **Shared Swift package extraction timing** — before adult iOS TestFlight, or after? (My take: before — gives kids split a proven foundation. But adds 1-2 sessions to P2.)
6. **Kids app in-app purchases** — allowed by Kids Category? If yes, build StoreKit flow. If no, family plan handled externally.
7. **Admin API LOCK** — extend to all 50 routes, or accept asymmetry? (Not launch-blocking; decide at leisure.)
8. **Behavioral anomaly detection** (Blueprint 10.3) — pre-launch or post-launch? (Pre = more work pre-launch, post = accept some fraud risk at launch.)
9. **Post-deployment validation** — pre-launch scope or post-launch?
10. **Access code / promo code launch strategy** — real codes at launch, or hold?

---

## Risk flags

- **Kids Category App Store review is slow and strict.** First submission often rejected for privacy label nuances, parental-gate wording, or screenshots. Budget 2-3 iterations.
- **DUNS application** can surface unexpected issues (business name mismatch, address verification) — start early.
- **Stripe Embedded Checkout** (LB-013 fix) requires Stripe account eligibility check — not all accounts can use it.
- **Sentry DSN env var** is a hard build-fail gate — don't set it, nothing deploys.
- **Migration 092/093 gap** — disaster recovery is broken until committed; ship is fine but any `reset_and_rebuild_v2.sql` replay would miss the RLS lockdown.
- **iOS app split** could surface shared-state bugs you didn't see in the unified app (e.g., kid profile switching logic). TestFlight adult first, split after you trust the foundation.

---

## How this maps to WORKING.md

Everything in this roadmap is actionable. The **immediate next steps** are already captured in `/WORKING.md`:

- P1 owner-side items → "LAUNCH BLOCKERS — owner-side" section
- P2 Apple items → "LAUNCH BLOCKERS — pre-capstone" Apple section
- Open bugs → "OPEN BUGS — 5 LBs" section
- Open decisions → "OPEN DECISIONS" section

This doc is the strategic view; WORKING.md is the per-session checklist.
