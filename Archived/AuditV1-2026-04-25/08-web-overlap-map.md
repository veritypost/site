# Session 8 — `web/` source + config + tests overlap map

**Scope:** `web/` config files (package.json, tsconfig, eslint, prettier, husky, vercel, next.config, playwright, sentry), `web/src/middleware.js`, top-level pages (page.tsx, story, settings), the `lib/` machinery (auth, permissions, plans, rateLimit, adminMutation, pipeline/), the API surface (200 routes), the admin surface (46 pages + 87 routes), shared components, tests/e2e (29 specs + fixtures).

**Read end-to-end / sampled:**

- **Config:** `package.json` (full 65 lines), `tsconfig.json` (full 28 lines), `next.config.js` (full 86 lines), `.env.example` (full 129 lines), `.gitignore` (full 20 lines, just `node_modules/`).
- **Middleware:** `web/src/middleware.js` (full 368 lines).
- **Key pages:** `page.tsx` (head + grep — 692 lines), `story/[slug]/page.tsx` (1752 lines, grep for launch-hides), `profile/settings/page.tsx` (5247 lines, count only), `layout.js` (215 lines, count only).
- **Lib:** `auth.js` (head 80 + grep), `permissions.js` (60-170 + grep), `plans.js` (grep + counts — 265 lines), `rateLimit.js` (head 60 — 180 lines), `adminMutation.ts` (full 180 lines), `pipeline/` directory (14 files listed).
- **API surface:** directory listing of `/api/` (40 top-level dirs) + `/api/admin/` (30 subdirs); 200 total `route.*` files counted; 87 admin route files.
- **Admin pages:** 46 page files counted across 41 admin route segments.
- **Components:** directory listing of `web/src/components/` (24 top-level + admin/ + kids/ subkits).
- **Tests:** all 29 spec filenames + line counts (2,733 total spec lines), `_fixtures/` listing (cleanup, createUser, run-seed, seed, setup), README head (40 lines).
- **Public:** `web/public/` contains only `ads.txt` — no robots, no sitemap, no icons.
- **Cross-zone hooks resolved via grep:** FALLBACK_CATEGORIES (0 hits in page.tsx), `front_page_state` vs `hero_pick_for_date` (page.tsx:17-19 names the bridge), `SHOW_BOTTOM_NAV` (now `true`), `PUBLIC_PROFILE_ENABLED` (still `false`), `LAUNCH_HIDE_RECAP` (still `true`), `LAUNCH_HIDE_ANON_INTERSTITIAL` (still `true`), `bump_user_perms_version` in webhook (line 846 — wired), `@admin-verified` markers (only 2 string hits remain — both comment text).

**Anchor SHA at session open:** `5ad6ad4`.

---

## Overlap map by topic

### T1 — Config layer is consistent and well-documented

`package.json`, `tsconfig.json`, `next.config.js`, `.eslintrc.json`, `.prettierrc.json`, `.prettierignore`, `vercel.json`, `playwright.config.ts`, `sentry.client.config.js`, `sentry.shared.js`, `.husky/pre-commit` form a coherent stack. `next.config.js` has a load-bearing prod-build guard: refuses to build without `@sentry/nextjs` available + production env vars set. `tsconfig.json` line 7: **`"strict": true`** — confirms Session 1 + Session 5 cross-zone open question (PM_PUNCHLIST_2026-04-24 line 60 claim "strict: false" was wrong).

`web/.gitignore` is 20 bytes (just `node_modules/`); the substantive gitignore lives at repo root. That's correct — single source of truth.

### T2 — Middleware is the single most load-bearing file in `web/src/`

`middleware.js` (368 lines) handles:
- Request-id propagation (DA-141, line 56-61).
- Per-request CSP nonce minting (H-05/L-02, lines 70-78).
- Two CSP policies emitted in parallel: primary (Report-Only by default; flips to enforce via `CSP_ENFORCE=true`) + secondary `Content-Security-Policy-Report-Only` carrying a stricter style-src for migration planning.
- CORS allow-list for `/api/*` (M-17, lines 144-175) — gates 5 origins (PROD_ORIGIN + canonical prod + www + 2 localhost ports).
- Coming-soon redirect (T-046, lines 268-299) — gated on `NEXT_PUBLIC_SITE_MODE=coming_soon`, bypassed via `vp_preview=ok` cookie set by `/preview?token=`.
- F7 legacy-shell 301 redirects (`/admin/pipeline` + `/admin/ingest` → `/admin/newsroom`).
- Skip-`getUser()`-on-public-routes optimization (line 337-338) — perf cut for unauthenticated home/story/api requests.
- `/kids/*` redirect (line 355-360): authed → `/profile/kids`; anon → `/kids-app`.
- `PROTECTED_PREFIXES` (lines 30-42): 9 prefixes (matches Session 6's 04-24 L1 work that opened `/browse /category /card /search /u`).

CSP defaults to Report-Only for both headers; the second strict-style header is always Report-Only even when `CSP_ENFORCE=true` (intentional per the comment lines 192-197). Owner has the env switch when ready.

### T3 — `web/src/lib/` is the machinery layer; matches CLAUDE.md tree

CLAUDE.md "Machinery" section matches the actual `lib/` contents. New since CLAUDE.md was written: `pipeline/` subfolder with 14 files (F7 AI pipeline). All 14 files match `Sessions/04-22-2026/Session 1/SESSION_LOG_2026-04-22.md` Phase 1-3 ship list.

`lib/auth.js` exports `getUser`, `requireAuth`, `requireVerifiedEmail`, `requireNotBanned`, `getUserRoles`, `hasRole`, `assertPlanFeature`, `getPlanFeatureLimit`, `requirePermission`, **`hasPermissionServer`** (line 201).

`lib/permissions.js` exports `invalidate`, `fetchVersion`, `refreshIfStale`, `refreshAllPermissions`, `getCapabilities`, `hasPermission`, `getPermission`, `getCapability`, **`hasPermissionServer`** (line 207), `hasPermissionFor`, plus a re-export of `SECTIONS, DENY_MODE, LOCK_REASON`.

**`hasPermissionServer` is exported from BOTH files with different semantics**: `auth.js:201` resolves via `compute_effective_perms` RPC; `permissions.js:207` resolves via `has_permission` RPC. **Confirms AuditV2 D1.** Different files, different behavior, same name — real collision risk.

### T4 — `lib/permissions.js` L2 hard-clear policy is documented and shipped

Lines 64-99: on a perms version bump, the cache is hard-cleared BEFORE awaiting the refetch. Synchronous readers during the refetch window get deny-all (fail-closed). Comment explicitly justifies the asymmetric posture: "deny is always safe; grant requires positive confirmation."

This **resolves the Session 5 / earlier "stale-fallthrough on revoke" risk** flagged in the Session 04-23 NEXT_SESSION_HANDOFF (item L2 in the queue) — verified shipped per Session 04-24 commit `0493050`.

### T5 — `lib/plans.js` hardcodes TIERS + PRICING + TIER_ORDER

Lines 12, 14, 101: `TIER_ORDER` const, `TIERS` map, `PRICING` map. CLAUDE.md "DB is the default, always" rule says this should be DB-backed. **Corroborates AuditV2 C23 + D16 (Sprint 2 fix #15) + Sessions 04-24 DEFERRED (L12) decision** — kept open as architectural follow-up because callers span checkout + admin + settings.

The same file does have a **DB-backed cached helper layer at lines 145+** (`getPlans`, `getWebVisibleTiers`, `getPlanLimit`, `getPlanLimitValue`, `getPlanByName`, `getPlanById`, `resolveUserTier`) — partial migration. Not a full DB-default yet.

### T6 — `lib/adminMutation.ts` documents the canonical admin-mutation shape and ships the helpers

Lines 1-88 are a canonical-pattern docstring (importable copy-paste skeleton). Lines 89-180 ship `requireAdminOutranks`, `recordAdminAction`, `permissionError`. The docstring at lines 84-88 explicitly notes: **"FOLLOW-UP (not in scope of audit-sweep B-C): recordAdminAction does not yet pass `p_ip` / `p_user_agent` through to the RPC."**

Verified at line 138-155 — the helper does NOT pass `p_ip` / `p_user_agent`. **Corroborates AuditV2 C8 (Sprint 2 fix #10) + Session 5 ADMIN_ROUTE_COMPLIANCE_AUDIT finding** ("recordAdminAction wrapper omits `p_ip` + `p_user_agent` — 2 of 8 required RPC params").

### T7 — `lib/rateLimit.js` ships fail-closed in prod (DA-031/F-018/F-019); fail-open in dev requires explicit env opt-in

Lines 8-47 document the pre-fix non-atomic + fail-open hole and the migration-057 SECDEF RPC fix. Lines 33-47 (L8) tightened dev-mode fail-open to require `NODE_ENV=development AND RATE_LIMIT_ALLOW_FAIL_OPEN=1`. CLAUDE.md "fail-closed in prod, fail-open in dev" matches — but the dev path now requires explicit opt-in too. Owner direction needed if any local-dev workflows depend on the old implicit-fail-open.

### T8 — Counts of files vs CLAUDE.md / earlier-doc claims

| Claim source | Claim | Verified |
|---|---|---|
| CLAUDE.md tree | "the 3800-line settings page" | settings/page.tsx is now **5247 lines** — file grew |
| CLAUDE.md tree | "FALLBACK_CATEGORIES hardcode still there" in page.tsx | **0 hits** — comment is stale (also in AuditV2 §2.A) |
| CLAUDE.md tree | "23 rules-of-hooks disables" | **25 disables** in app/{recap,welcome,u}/... per AuditV2 §2.A |
| CLAUDE.md tree | "ParentalGate has zero callers (T-tbd)" | File exists in VerityPostKids/; full call-count check deferred to Session 9 — Session 04-23 OWNER_QUESTIONS §4.3 noted 4 live callers via .modifier syntax |
| Session 5 doc | "75 admin mutation routes" (2026-04-21) | **87 admin route files** today |
| Session 5 doc | "40+ admin pages" | **46 admin pages** today |
| Session 5 doc | "100+ API routes" | **200 total API routes** |
| AuditV2 C28 | "27 .jsx admin component files" | confirmed: total 27 .jsx in web/src |
| AuditV2 C29 | "218 .js files in web/src" | **confirmed: 218** |
| Session 4/Session 5 | `front_page_state` vs `hero_pick_for_date` bridge | verified: page.tsx still uses `hero_pick_for_date`; comment line 19 "Phase-1 proxy for the front_page_state table — see schema/144" |

### T9 — KILL_SWITCH_INVENTORY (Session 5) current state

| Item | KILL_SWITCH_INVENTORY 2026-04-21 | Current state |
|---|---|---|
| `SHOW_BOTTOM_NAV` (NavWrapper.tsx:89/104) | `false` | **`true` — flipped on** (line 104). Resolves a Session 1/5 owner-decision item. |
| `PUBLIC_PROFILE_ENABLED` (u/[username]/page.tsx) | parked behind `<UnderConstruction>` | **still `false`** at line 21 (kill-switched per Session 04-23 commit `11986e8`) |
| `LAUNCH_HIDE_RECAP` (recap/page.tsx) | hidden | **still `true`** (line 41) |
| `LAUNCH_HIDE_ANON_INTERSTITIAL` (story/[slug]/page.tsx) | hidden | **still `true`** (line 80) |
| Mobile tab bar `{false && !isDesktop && (` | hidden | **still `{false && ...}`** (line 1182) |
| Mobile timeline `{false && showMobileTimeline && ...}` | hidden | **still `{false && ...}`** (line 1552) |
| Desktop timeline `{false && isDesktop && canViewTimeline}` | hidden | **still `{false && ...}`** (line 1572) |

5 of the 11 kill-switches in the inventory are still hidden — including the bottom 3 in the story page that gate quiz + discussion + timeline. The bottom-nav decision (item 1 in inventory) shipped. Cross-zone hook **CZ-G resolved**: 5/11 still hidden, 1 flipped on, the rest from the 11-item inventory live in iOS / kids surfaces (defer to Session 9).

### T10 — ADMIN_ROUTE_COMPLIANCE_AUDIT (Session 5) current state — only spot-checked

The 2026-04-21 audit found 52/75 routes (69%) missing `record_admin_action`, 73/75 (97%) missing rate-limit. Re-running the full audit is its own project (the script `scripts/check-admin-routes.js` exists for this, but isn't wired into CI per Session 7 finding T7).

Spot-checks done in Session 8:
- `/api/admin/users/[id]/role-set/route.js` — uses canonical pattern (`requirePermission` + `createServiceClient` + `checkRateLimit` + `recordAdminAction` + `safeErrorResponse`). Compliant.
- `/api/admin/billing/...` (per session-04-24 commit `4eb37b4`) — billing audit gate added.
- `/api/admin/promo` (per session-04-25 commit `97b7074`) — return 409 on duplicate (compliant pattern).

Cross-zone hook **CZ-H** — improved meaningfully but not measured. Re-running the script + diffing 87 vs 75 routes is a discrete follow-up (could be a Session 11 sub-task or its own action item).

### T11 — `web/public/` is bare; only `ads.txt` exists

No `robots.txt`, no `sitemap.xml`, no favicons (`icon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`). Per AuditV2 C44, `JsonLd.tsx` references `/icon.svg` which is missing. The robots and sitemap are served by route handlers (`web/src/app/robots.js`, `web/src/app/sitemap.js`) per Next.js convention — confirmed both exist as files.

But the favicon / icon files do need to exist as static assets per Next.js metadata API conventions (or be generated by the App Router `icon` / `apple-icon` route handlers — none of those exist either).

**Corroborates AuditV2 C44.** Not a runtime crash, but a visible gap (no favicon in browser tab).

### T12 — Tests folder: 29 specs (~2733 lines) covering most surfaces; 04-25 deep specs are recent additions

| Spec | Lines | Surface |
|---|---|---|
| admin-deep-batch2.spec.ts | 382 | admin routes batch 2 |
| admin-deep.spec.ts | 263 | admin routes high-risk |
| seeded-roles.spec.ts | 194 | per-role smoke |
| kids-deep.spec.ts | 175 | parent-side kid CRUD + pair |
| social-deep.spec.ts | 168 | follows/comments/messages/reports |
| expert-deep.spec.ts | 160 | ask/claim/answer/approve |
| profile-settings-deep.spec.ts | 148 | account/preferences/data |
| auth-edge-cases.spec.ts | 123 | auth flows |
| seeded-reader-flow.spec.ts | 107 | anon view, bookmark, quiz-gated comment |
| security-headers.spec.ts | 96 | CSP/CORS/HSTS |
| admin-surface.spec.ts | 78 | admin shell |
| billing-flows.spec.ts | 76 | Stripe |
| seo-meta-jsonld.spec.ts | 74 | metadata |
| api-health-and-public.spec.ts | 60 | health |
| permissions-isolation.spec.ts | 59 | permission walks |
| anon-golden-path.spec.ts + coming-soon-mode.spec.ts | 53 each | anon paths |
| messages-notifications.spec.ts + quiz-and-comments.spec.ts | 50 each | feature paths |
| Other 11 specs | 33-44 each | one-flow each |

The 8 "deep" specs + the 5 `_fixtures/` files (cleanup, createUser, run-seed, seed, setup) shipped 2026-04-25 per Session 5 read. Test infrastructure now includes deterministic seed orchestration with bypass-cookie + 10-role coverage.

The README has good operator docs (browser modes, base-URL override, coming-soon mode handling, seed key requirements).

### T13 — `pipeline/` subfolder ships F7 in 14 files

`call-model.ts`, `clean-text.ts`, `cluster.ts`, `cost-tracker.ts`, `editorial-guide.ts` (the verbatim-prompt port), `errors.ts`, `logger.ts`, `persist-article.ts`, `plagiarism-check.ts`, `prompt-overrides.ts`, `redact.ts`, `render-body.ts`, `scrape-article.ts`, `story-match.ts`. All 14 match Session 04-22 SHIPPED list. Cross-zone hook **CZ-A (F7 V4 vs F7-DECISIONS-LOCKED)** unresolved at the pipeline-source level — `editorial-guide.ts` ships the prompts that were ported in Phase 1 Task 1 (Session 04-22). Whether they match `Future Projects/24_AI_PIPELINE_PROMPTS.md` V4 is an owner-call (the V4 doc is exploratory; the shipped pipeline is canonical).

### T14 — Webhook bump-on-plan-change is wired

`web/src/app/api/stripe/webhook/route.js:846` calls `bump_user_perms_version`. **Confirms AuditV2 wave3 W3-summary** ("Wave B `handlePaymentSucceeded missing perms_version bump` — refuted: Bump IS wired at api/stripe/webhook/route.js:846"). Older audit claim was wrong.

### T15 — `@admin-verified` markers — 2 code-side string hits remain (both comment text)

Grep returns:
- `web/src/middleware.js` — comment string "Both legacy pages carried @admin-verified markers" inside the F7 redirect docstring (line 256).
- `web/src/app/admin/pipeline/runs/page.tsx` — per AuditV2 C24, contains a residual marker line.

The marker was retired 2026-04-23 per memory. Code-side cleanup is essentially complete; only doc-side residuals (per AuditV2 C24 list of 7) and the 1 page.tsx residual remain.

### T16 — `.env.example` has `APNS_BUNDLE_ID` + `APNS_TOPIC` both naming the same bundle

Lines 52-56: `APNS_BUNDLE_ID=com.veritypost.app` (active), `# APNS_TOPIC=com.veritypost.app` (commented as override). Code in `lib/apns.js` reads one of them (per AuditV2 C34 the env var name doesn't match the code). Resolves to a naming inconsistency, not a runtime bug — both vars equal the same value if both set.

### T17 — Cross-zone hook resolutions

| Hook | From session | Status |
|---|---|---|
| **CZ-A** F7 V4 vs F7-DECISIONS-LOCKED | S2/S3/S4/S5/S6/S7 | Pipeline shipped per F7-DECISIONS-LOCKED (Session 04-22 commits); 24_AI_PIPELINE_PROMPTS V4 is exploratory. Owner-call needed: V4 = next-cycle iteration or stale? |
| **CZ-D** front_page_state vs hero_pick_for_date | S4 | **RESOLVED** — page.tsx still uses `hero_pick_for_date`; comment names the bridge. front_page_state table not yet shipped. |
| **CZ-G** KILL_SWITCH_INVENTORY 11 items | S5 | **PARTIALLY RESOLVED** — 5 web-side items still hidden, 1 flipped on (`SHOW_BOTTOM_NAV`); rest are iOS / cross-app — defer to Session 9. |
| **CZ-H** ADMIN_ROUTE_COMPLIANCE_AUDIT 52/75 | S5 | **PARTIALLY RESOLVED** — spot-checks compliant; full re-run is its own project. Script exists but isn't wired into CI. |
| **CZ-I** TODO_2026-04-21.md unchecked items | S5 | Not addressed in Session 8 — defer to Session 11. |
| **CZ-L** AuditV2 P0 runtime bugs (cleanup_rate_limit_events, schema/092/093/100, import-permissions RPC) | S7 | DB / schema items — defer to Session 10. import-permissions confirmed broken in Session 7. |
| **CZ-M** Proposed Tree adoption requires CLAUDE.md rewrite | S7 | Owner-decision item — Session 11. |

---

## Confident bucket (ready for cleanup decisions)

**C-1.** `lib/auth.js:201` and `lib/permissions.js:207` both export `hasPermissionServer` with different semantics. Rename one (per AuditV2 D1: `permissions.js` → `hasPermissionClient`).

**C-2.** `lib/adminMutation.ts:138-155` `recordAdminAction` does not pass `p_ip` / `p_user_agent`. The docstring at lines 84-88 already flags this as a follow-up. Wire it through to close the DA-119 gap.

**C-3.** CLAUDE.md tree comment "FALLBACK_CATEGORIES hardcode still there" is stale — 0 hits in page.tsx. Delete the comment.

**C-4.** CLAUDE.md tree describes settings/page.tsx as "the 3800-line settings page" — file is now 5247 lines. Update or remove the size annotation.

**C-5.** `lib/plans.js` hardcodes TIER_ORDER, TIERS, PRICING (lines 12-100). Already half-migrated — DB helpers exist at lines 145+. Finish the migration (replace const reads with cached helper reads at the call sites).

**C-6.** `lib/permissions.js:207` `hasPermissionServer` is dead-or-redundant if the canonical server-side gate is `auth.js#requirePermission`. Audit call sites; remove the duplicate or document why both exist.

**C-7.** `web/public/` is bare. No favicon files. `JsonLd.tsx` references `/icon.svg`. Either drop the icon assets in `public/` or wire `web/src/app/icon.tsx` / `apple-icon.tsx` route handlers.

**C-8.** `.env.example` lines 52-56 — `APNS_BUNDLE_ID` and `APNS_TOPIC` both refer to the same bundle. Pick one name + remove the other (AuditV2 C34).

**C-9.** `web/src/app/admin/pipeline/runs/page.tsx` carries a residual `@admin-verified` marker line. Sweep per AuditV2 C24.

**C-10.** Bottom of `KILL_SWITCH_INVENTORY` is partially actioned (`SHOW_BOTTOM_NAV` flipped on). The remaining 5 web-side launch-hides need explicit owner direction on prelaunch flip-order.

**C-11.** `scripts/check-admin-routes.js` exists but isn't in CI. Wiring it would catch admin-route drift automatically. Carry-over from Session 7.

---

## Inconsistent bucket (project-itself-is-inconsistent — flag for resolution session)

**I-1.** `hasPermissionServer` exported from two libs with different RPCs (CZ-resolved per AuditV2). The fact that both exist and have the same name means callers are using whichever they imported — no telling which until the call sites are walked. Resolve before the next perms work lands.

**I-2.** `lib/plans.js` is half-DB-half-hardcoded. Mid-migration state is dangerous because there's no enforcement that new callers use the DB helper. Either complete the migration or document the active source for each kind of read.

**I-3.** CLAUDE.md repo-tree section is mid-drift: stale FALLBACK_CATEGORIES note, undercount on settings page lines, ParentalGate "zero callers" claim contradicted by Session 04-23 OWNER_QUESTIONS §4.3, mention of retired `@admin-verified` rules. The tree section reads as historical at this point.

**I-4.** F7 docs in Future Projects vs shipped pipeline (CZ-A). The owner needs to either retire `Future Projects/24_AI_PIPELINE_PROMPTS.md` or make it the next-cycle spec with a SUPERSEDED note pointing back at `F7-DECISIONS-LOCKED.md` for current state. (Same finding as Session 4 / 6 / 7.)

**I-5.** Story-page (1752 lines) carries 3 `{false && ...}` launch-hides + 1 `LAUNCH_HIDE_*` const. The kill-switches are intentional per memory — but the combined complexity of the file means a future "unhide all" sweep will need a careful per-block plan, not a single grep-and-replace. Cross-reference KILL_SWITCH_INVENTORY against this file before any unhide work.

---

## Open questions (need owner direction)

**Q-1.** `lib/plans.js` hardcoded TIERS/PRICING — finish the DB migration this sprint, or defer to a dedicated "config-in-DB" effort?

**Q-2.** Story page launch-hides — what's the order: enable timeline first? quiz + comments first? mobile tab bar first? CLAUDE.md doesn't specify; KILL_SWITCH_INVENTORY proposes a 4-phase flip-order.

**Q-3.** `web/public/` favicons — generate the icon set + drop in public, OR write the App Router icon.tsx + apple-icon.tsx + manifest icons handlers?

**Q-4.** Wire `scripts/check-admin-routes.js` into CI? (Carry from Session 7.)

---

## Cross-zone hooks (carried forward)

- **CZ-A** (continued): F7 prompts — owner-call needed.
- **CZ-G** (continued): KILL_SWITCH_INVENTORY remaining iOS-side items resolve in Session 9.
- **CZ-H** (continued): ADMIN_ROUTE_COMPLIANCE — full re-run is its own project; tracked as an action item.
- **CZ-I** (continued): TODO_2026-04-21.md unchecked items — defer to Session 11.
- **CZ-L** (continued): AuditV2 P0 runtime bugs in DB / schema — Session 10.
- **CZ-M** (continued): Proposed Tree adoption — Session 11.
- **CZ-N** (new): `hasPermissionServer` dual-export — track until rename + caller sweep.
- **CZ-O** (new): `lib/plans.js` half-migrated state — track until DB-first migration completes.

---

## Plan for Session 9

`VerityPost/` (adult iOS) + `VerityPostKids/` (kids iOS).

Approach:
1. List both Xcode project trees.
2. Read each Swift file end-to-end.
3. Verify `ParentalGate` call-count (Session 04-23 OWNER_QUESTIONS §4.3 said 4 live callers via `.parentalGate(...)` modifier syntax; AuditV2 said the file exists with no body callers — reconcile).
4. Verify Apple block items: `aps-environment`, `applesignin`, `associated-domains`, `AppIcon.appiconset`, `apple-app-site-association`, `CFBundleVersion`, kids `aps-environment` `production` vs `development` (AuditV2 C4/C35-C37/C42/C43).
5. Verify launch-hide remaining: `KidsAppLauncherButton` fallback URL, `BadgeUnlockScene` orphan reach, `QuizPassScene` orphan, expert Q&A `#if false`, AlertsView Manage tab gating, kids `KidsAppState` in-memory state vs DB.
6. Verify CFBundleVersion drift, App Store metadata path drift.
7. Verify HTML/JSX mockups in `VerityPost/possibleChanges/` (AuditV2 C42) — if they ship as Resources, mark for removal.
8. Cross-reference `Future Projects/views/ios_*` claims against actual ship state (Session 4 hooks).
9. Write `AuditV1/09-ios-overlap-map.md`.
10. Update `AuditV1/00-README.md`.
