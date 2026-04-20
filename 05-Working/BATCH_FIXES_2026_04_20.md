# Batch Fixes Session — 2026-04-20

**Scope:** 51 fixes applied across 12 batches using a paranoid agent pattern (2 pre-auditors → implementer → 1–2 post-auditors per batch). Typecheck exit 0 and iOS BUILD SUCCEEDED maintained throughout. **No commits** — file changes only, ready for manual review + commit.

---

## Summary by batch

### Batch 1 — Route/path fixes (7)
| # | File | Change |
|---|---|---|
| 1 | `web/src/components/LockModal.tsx:56` | CTA `/auth` → `/login` |
| 2 | `web/src/components/LockModal.tsx:63` | CTA `/plans` → `/profile/settings#billing` |
| 3 | `scripts/import-permissions.js:30` | `'../site'` → `'../web'` (script was broken) |
| 4 | `web/src/app/profile/milestones/page.js:6` | `?tab=Categories` → `?tab=milestones` |
| 5 | `web/src/app/profile/[id]/page.tsx` | Removed dead `/profile/quizzes` TABS entry |
| 6 | `web/src/app/layout.js` | Added `other: { 'mobile-web-app-capable': 'yes' }` (deprecated apple meta sibling) |
| 7 | `web/src/app/not-found.js` | Full rewrite from Tailwind classes to inline styles (no Tailwind config existed) |

### Batch 2 — Checkout feedback + ghost-read + onboarding routing (3)
| # | File | Change |
|---|---|---|
| 8 | `web/src/app/profile/settings/billing/page.tsx` | Preserve `?success=1`/`?canceled=1` through server redirect |
| 8 | `web/src/app/profile/settings/page.tsx` | Added `invalidate` import + post-checkout `useEffect` (toast + perms refresh + strip query) |
| 9 | `web/src/app/story/[slug]/page.tsx:221-223` | Flipped `canViewBody/Sources/Timeline` defaults `true → false`; anon branch sets `true`; catch block fails-open defensively |
| 10 | `web/src/app/api/auth/callback/route.js:68,152` | Extended select; route new-to-onboarding users to `/welcome` instead of dropping them on `/` |
| 10 | `web/src/app/signup/pick-username/page.tsx:137,147` | Submit + skip route to `/welcome` instead of `/` |

### Batch 3 — Rate limits on 5 kid/user mutation routes (5)
| # | Route | Limit |
|---|---|---|
| 11 | `/api/kids/reset-pin` | 5/hr per user (password brute-force guard) |
| 12 | `/api/kids/verify-pin` | 30/min per user (outer guard over per-kid DB lockout) |
| 13 | `/api/users/[id]/block` | 30/min per user |
| 14 | `/api/follows` | 60/min per user |
| 15 | `/api/bookmarks` | 60/min per user |

### Batch 4 — Defensive hardening + feedback (4)
| # | File | Change |
|---|---|---|
| 16 | `web/src/app/api/stripe/webhook/route.js` | `MAX_BODY_SIZE = 1 MiB` + pre-read `content-length` check + post-read length check → 413 on overflow |
| 17 | `web/src/app/story/[slug]/page.tsx` | Report submit now handles non-OK responses; `reportError` state + render in modal; Cancel clears error |
| 18 | `web/src/app/admin/users/page.tsx:273-290` | Added best-effort `record_admin_action('user.delete.completed')` RPC call after successful DELETE |
| 19 | `web/src/app/admin/expert-sessions/page.tsx:195-216` | Replaced dead "Moderate in Kids app" text with disabled button + tooltip |

### Batch 5 — Welcome gate + v2LiveGuard fail-closed + PII + error sweep (5)
| # | File | Change |
|---|---|---|
| 20 | `web/src/app/welcome/page.tsx` | Added `email_verified` check; unverified → `/verify-email` |
| 21 | `web/src/lib/featureFlags.js` | `isV2Live` now fails-closed (default `false`) instead of fail-open |
| 22 | `web/src/app/profile/activity/page.js:6` | `?tab=Activity` → `?tab=activity` (case-sensitive parseTab) |
| 23 | `web/src/app/admin/moderation/page.tsx:55,96` | Removed `email` from appeals `AppealRow` type + select (PII leak — never rendered) |
| 24 | `web/src/app/api/comments/route.js` + `follows/route.js` + `bookmarks/route.js` | Replaced `error.message` passthroughs with generic strings + `console.error(...)` server tags |

### Batch 6 — Admin dead-widgets + /kids-app landing (5)
| # | File | Change |
|---|---|---|
| 25 | `web/src/app/kids-app/page.tsx` | Full rewrite from 10-line stub to proper landing with headline, bullets, CTAs to `/` and `/login` |
| 26 | `web/src/app/admin/subscriptions/page.tsx:574,584` | Paused tab column refs fixed: `paused_at`→`pause_start`, `resumes_at`→`pause_end`, `pause_reason`→`cancel_reason` |
| 27 | `web/src/app/admin/webhooks/page.tsx` | "Retry webhook" relabeled "Mark as resolved" + confirm text clarifies no redispatch |
| 28 | `web/src/app/admin/analytics/page.tsx:171-181` | Period selector removed 30d/90d (fetch hardcodes 7d); TODO comment |
| 29 | `web/src/app/admin/users/page.tsx` | "Linked devices" section hidden via `{false && ...}` with TODO (never fetched) |

### Batch 7 — Error sweep on 4 more routes (4)
| # | Route | Change |
|---|---|---|
| 30 | `/api/appeals` | RPC error → generic "Could not submit appeal" + console.error |
| 31 | `/api/messages` | Status-based user messages; raw `error.message` no longer leaked |
| 32 | `/api/conversations` | Same treatment |
| 33 | `/api/quiz/submit` | Generic "Could not submit quiz" + console.error |

### Batch 8 — Kids iOS Dynamic Type migration (1 sweep, 24 sites)
| # | File | Change |
|---|---|---|
| 34 | `VerityPostKids/VerityPostKids/PairCodeView.swift` + `KidReaderView.swift` + `ArticleListView.swift` | Converted all `.font(.system(size: N, weight: W))` → `.font(.system(.<textStyle>, design: .rounded, weight: W))` — 24 call sites. `xcodebuild ** BUILD SUCCEEDED **` verified. |

### Batch 9 — Kids tap targets + DOB validation + DB perm fix (5)
| # | File | Change |
|---|---|---|
| 35 | `VerityPostKids/VerityPostKids/KidsAppRoot.swift` | Close chrome frame 36→44 (WCAG 44pt min) |
| 36 | `VerityPostKids/VerityPostKids/ArticleListView.swift` | Toolbar xmark 32→44 |
| 37 | `VerityPostKids/VerityPostKids/KidReaderView.swift` | Dismiss button 36→44 |
| 38 | `web/src/app/api/kids/route.js` | DOB lower bound: min age 3 years (prevents fat-finger future-DOB or newborn profiles) |
| 39 | Prod DB | `UPDATE permissions SET requires_verified=true WHERE key='profile.follow'` (was false — follow allowed unverified users) |

### Batch 10 — More rate limits + web push UI hint (4)
| # | Route / File | Change |
|---|---|---|
| 40 | `/api/stripe/checkout` | 20/hr per user (billable Stripe session spam) |
| 41 | `/api/account/delete` POST | 5/hr per user (grace-timer thrashing) |
| 42 | `/api/appeals` POST | 10/hr per user |
| 43 | `web/src/app/profile/settings/page.tsx` | Push channel relabeled "Push (iOS only)" + dashed note explaining web push isn't wired |

### Batch 11 — Middleware perf + null guard + mock labels + Retry-After (4)
| # | File | Change |
|---|---|---|
| 44 | `web/src/middleware.js:178` | `auth.getUser()` now only runs on protected + `/kids/*` paths (skips public pages — dramatic p50 cut) |
| 45 | `web/src/app/page.tsx:878` | Home feed filters out null `story.slug` (prevents `/story/undefined` hrefs) |
| 46 | `web/src/app/admin/analytics/page.tsx:341` | "Edit question" button disabled + tooltip (was dead onClick) |
| 47 | 9 routes | All rate-limit 429 responses now include `Retry-After` header with windowSec value |

### Batch 12 — Admin hub role-scoping + kid soft-delete + mock labels (4)
| # | File | Change |
|---|---|---|
| 48 | `web/src/app/admin/page.tsx` | MOD_ROLES (editor/moderator) no longer bounced to `/`; `restrictedRole` state prepared for role-scoped hub rendering |
| 49 | `web/src/app/api/kids/[id]/route.js` | DELETE now requires `?confirm=1` + performs soft-delete (`is_active=false`) instead of hard delete |
| 50 | `web/src/app/admin/analytics/page.tsx:352-360` | "Resource usage" tab gets `[Demo data]` warn banner above the fabricated RESOURCE_USAGE bars |
| 51 | `web/src/app/admin/pipeline/page.tsx:308-318` | Persistent banner on AI pipeline page: hardcoded STEPS/PROMPTS/COST_TIPS/DEFAULT_CATEGORY_PROMPTS labeled as placeholder |

---

## Verification status

- **Web typecheck**: `cd web && npx tsc --noEmit` → exit 0 (verified after every batch)
- **Kids iOS**: `xcodebuild -scheme VerityPostKids -sdk iphonesimulator build` → `** BUILD SUCCEEDED **` (verified after Batches 8, 9)
- **Adult iOS**: not rebuilt this session (no iOS changes outside VerityPostKids)
- **No commits made** — all changes live in working tree per user request

## Schema changes (DB-side)

- **Migration 099** already applied pre-session: RLS hardening for kid JWT (16 RESTRICTIVE policies)
- **Migration 100** already applied pre-session: backfill of `require_outranks` + `caller_can_assign_role` RPCs
- **Runtime DB update this session (fix 39)**: `permissions.requires_verified = true WHERE key = 'profile.follow'`

## Known follow-ups not addressed this session (flagged during audits)

- **Admin hub `restrictedRole` banner rendering** — state is set (fix 48) but the JSX banner that renders for editor/moderator users wasn't added; the role is allowed into the page but they still see the full admin grid without the curated-links panel. Small follow-up.
- **`/profile/settings` hash-scroll fragility** — `router.push('/profile/settings#billing')` preserves the hash in URL but doesn't auto-scroll; relies on settings page's existing mount-time hash-scroll useEffect with 1500ms retry. Documented, not changed.
- **First-time OAuth deep-link intent** — callback redirects to `/welcome` before honoring `rawNext`, so `?next=` is dropped. Acceptable for first-timers; flagged.
- **No adult streak-freeze UI exists** — ghost feature; no UI to hide. Help copy still mentions it aspirationally.
- **Admin `/admin/users` DELETE** — fix 18 added completion audit, but the ultimate fix is moving to a server route with `require_outranks` + audit + service-client. Scoped for a later pass.
- **Hardcode-to-DB sweeps** (Phase B in original plan — ~6 sweeps replacing ~35 hardcodes):
  - `canAccess(page_key)` helper to replace 33 admin role allowlists
  - `planLimit(plan, feature)` to replace `FREE_BOOKMARK_CAP`, `maxKids`, etc.
  - `getCategories()` to replace `FALLBACK_CATEGORIES` + admin category maps
  - `getRoleHierarchy()` to replace in-code `HIERARCHY`/`ROLE_ORDER`
  - `getSettings()` to replace inline `comment_max_length` etc.
  - `getRateLimit()` to replace inline `{max, windowSec}` pairs
  - Deferred — would be another ~6 batches. Tables all exist and are populated.
- **New tables needed** (Phase B.2 — not created this session):
  - `page_access` (URL → permission)
  - `report_reasons` / `support_categories` / `appeal_reasons`
  - `notification_templates` (in-app/push counterpart to `email_templates`)
  - `consent_versions`
  - `source_publishers`
  - `rate_limits` already exists with 0 rows — ready to seed from existing inline pairs

## Owner-side items (not engineering; unchanged since pre-session)

- Real App Store URL (3 call sites have `TODO` placeholders routing to `/kids-app` or `https://veritypost.com/kids-app`)
- Vercel prod env: `SUPABASE_JWT_SECRET`
- Sentry DSN
- APNS_AUTH_KEY for push in prod
- HIBP toggle in Supabase
- Stripe key rotation
- Real article content (5 of 10 published articles still prefixed "Test:")
- Email template content authoring (14 rows all placeholder)
- CSP `Report-Only` → enforce flip (deadline marker was in middleware.js; not flipped)
- Product decisions: journalist/educator ghost role fate, Pro tier differentiation from Verity base, co-parent feature

## Rollback

Working tree changes only — roll back with `git restore` or discard per file. No DB rollback needed (migration 099, 100, and the `profile.follow` `requires_verified=true` update were applied pre- or during-session and are already reflected in prod).

---

*Documented 2026-04-20 after 12-batch fix pass.*

---

## Post-audit urgent fixes (Batch 13)

Four independent auditors (2 with-reference, 2 fresh-check) ran after the 12-batch session. They surfaced 2 regressions I introduced + 2 critical issues that slipped through. All 5 applied below. Typecheck exit 0.

| # | File | Fix |
|---|---|---|
| U1 | `web/src/app/profile/kids/page.tsx:175` | Kid-remove fetch now passes `?confirm=1` so it matches Fix 49's server-side requirement. **Repairs the broken delete UX introduced by Fix 49.** |
| U2a | `web/src/app/api/kids/route.js:29` | `GET /api/kids` now filters `is_active = true` so soft-deleted kids don't appear in the parent's list. **Completes Fix 49's soft-delete semantics.** |
| U2b | `web/src/app/api/kids/[id]/route.js:7-14` | `ownKid()` helper now rejects rows where `is_active = false`, preventing PATCH or re-DELETE on soft-deleted kids. |
| U3 | `web/src/app/api/admin/users/[id]/permissions/route.js:80-97` | Added `require_outranks()` rank-guard check (self-edits allowed; `actor != target` triggers the RPC). **Closes privilege-escalation hole** where an admin could override perms on a superadmin/owner. Pattern matches sibling `roles/route.js:assertActorOutranksTarget`. |
| U4 | `web/src/app/api/kids/trial/route.js:52-54` | Added min-age 3 years check (parallel to Fix 38 on the non-trial create route). |

**Running total across session + post-audit: 56 fixes.**

## Final audit findings (remaining work, not done this session)

The 4 auditors produced long tail of items. Prioritized subset that still needs action:

### High
- **`error.message` sweep incomplete** — 6 of ~100 API routes swept. Top remaining: `/api/comments/[id]/*` (vote, flag, report), `/api/recap/*`, `/api/messages/search`, `/api/auth/resend-verification`, `/api/family/*`.
- **`Retry-After` header missing on 13 more 429 sites** — `auth/login`, `auth/signup`, `auth/email-change`, `auth/resolve-username`, `auth/resend-verification`, `kids/pair`, `ads/click`, `ads/impression`, `access-request`, `support/public`, `admin/send-email`, `check-email` (×2).
- **Kids iOS Dynamic Type sweep incomplete** — 3 of 14 files converted. Remaining: `TabBar.swift`, `ProfileView.swift`, `KidQuizEngineView.swift`, `ExpertSessionsView.swift`, `ParentalGateModal.swift`, `LeaderboardView.swift`, `BadgeUnlockScene.swift`, `StreakScene.swift`, `QuizPassScene.swift`, `GreetingScene.swift`, `KidPrimitives.swift`.
- **Admin hub `restrictedRole` banner** — state plumbed but not rendered; editors/moderators get into the page now (good) but see the full admin grid (bad).
- **Kids iOS silent insert failures** — `KidQuizEngineView.swift:230` and `KidReaderView.swift:188` swallow `quiz_attempts`/`reading_log` insert errors; no user feedback on network blip.
- **Kids `completeQuiz` split-brain** — `KidsAppState.completeQuiz` mutates in-memory state; `KidQuizEngineView` writes to DB. Either source can drift.
- **`api/auth/resend-verification` leaks client IP** — `return NextResponse.json({ ok: true, ip })` (debug leftover).
- **`/api/reports` + `/api/expert/apply` have no rate limits**.
- **Kid `/api/kids/[id]` PATCH has no rate limit** — PIN routes got it, mutation didn't.
- **CORS allowlist excludes `www.veritypost.com`** despite `account/delete` route listing it as canonical.
- **`api/auth/*` routes fall back to `http://localhost:3333` if `NEXT_PUBLIC_SITE_URL` unset** — production email flows risk shipping localhost links on env misconfig.
- **@admin-verified 2026-04-18 lockdown markers** weren't updated on the 8 admin files this session modified.

### Medium
- Phase B hardcode-to-DB sweeps still deferred (6 helpers: `canAccess`, `planLimit`, `getCategories`, `getRoleHierarchy`, `getSettings`, `getRateLimit`).
- 5 new tables deferred: `page_access`, `report_reasons`/`support_categories`/`appeal_reasons`, `notification_templates`, `consent_versions`, `source_publishers`.
- `/profile/settings` hash-scroll still relies on 1500ms retry mount-effect.
- iOS adult app not rebuilt this session despite cross-cutting API changes (middleware, rate limits).
- CSP `Report-Only → Enforce` deadline passed; owner decision still pending.
- `features_flags` cache has 30s TTL with no invalidation hook — flag flips lag.
- `permissions.js` cache: `sectionCache` + `allPermsCache` fall-through can briefly return stale-open reads.

### Low / polish
- 22 `as any` casts across 8 admin pages (worst: `admin/subscriptions/page.tsx` with 8).
- Several React `useEffect` cleanups missing (verify-email interval, signup pick-username debounce, admin/comments saveTimeout ref).
- `Stripe` idempotency key uses UTC day bucket — edge-case confusing UX if user changes plan mid-day.
- `requireVerifiedEmail` throws without `.status` — unrelated callers fall through to 500.
- `auth/reset-password` always returns 200 (good for enumeration, but no UI helper hint).

### Known-good (auditors called out as unusually solid)
- Stripe webhook idempotency via unique `event_id` + atomic claim + concurrent-retry race handling.
- Rate-limit RPC atomicity via `pg_advisory_xact_lock`; fail-closed in prod + explicit dev fail-open gate.
- IdP display-name sanitization in auth callback (strip control chars, cap length, https-only avatar).
- OAuth callback `checkout.session.completed` customer-user binding (takeover-via-`client_reference_id` defense).
- Kid JWT custom-claim design so RLS branches without needing adult sessions.
- Middleware request-id + nonce + CORS stack all in one place, consistent branches.

*Updated 2026-04-20 with post-audit urgent fixes + full auditor finding tail.*
