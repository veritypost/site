# Round 3 — Post-Phase-5 cleanup — Prep Doc

**Purpose:** scope the next non-overlapping pass into 4 execution tracks. Execution agents follow this doc literally.

**Working dir:** `/Users/veritypost/Desktop/verity-post`
**Supabase project:** `fyiwulqphgmoqullmrfn`
**Date:** 2026-04-18

---

## Part 1 — Discovery (raw findings)

### 1.1 Remaining web `.js` / `.jsx` pages under `site/src/app/`

`find site/src/app -type f \( -name '*.js' -o -name '*.jsx' \)` returns **27 files** once the `api/**` routes (which are a separate universe and already carry markers) are excluded. Broken out by category:

**A — Framework plumbing (no gate possible, markers not meaningful):** 11 files — `robots.js`, `manifest.js`, `sitemap.js`, `not-found.js`, `error.js`, `global-error.js`, `browse/loading.js`, `profile/error.js`, `profile/loading.js`, `story/[slug]/error.js`, `story/[slug]/loading.js`. No auth, no data, no gates. Marker-only migration optional; can be skipped or batch-tagged.

**B — Thin redirect shells (no gate possible):** 2 files — `profile/activity/page.js` (3-line `redirect('/profile?tab=Activity')`), `profile/milestones/page.js` (3-line `redirect('/profile?tab=Categories')`). Marker-only.

**C — Already migrated + sealed (both markers on disk):** 4 files — `card/[username]/layout.js`, `card/[username]/page.js`, `card/[username]/opengraph-image.js`, `profile/card/page.js`. All carry `@migrated-to-permissions 2026-04-18` + `@feature-verified shared_components 2026-04-18` (verified via grep). Nothing to do.

**D — True remaining migrations (gate logic present):** 1 file — `NavWrapper.js`. Line 67 selects `plan_status, email_verified, plan_grace_period_ends_at` etc from `users` and line 71-78 joins `user_roles`→`roles` to produce a `roles[]` array, then line 123 uses `roles?.some((r) => ['owner','admin','superadmin'].includes(r))` to decide whether to render the Admin-nav link. Hard-coded role name array. Needs migration to `hasPermission('admin.surface.access')` or nearest equivalent.

**E — Candidates for TSX conversion + marker (no hardcoded gate, but in the migration path):**
- `layout.js` — root layout, imports `NavWrapper` and `PermissionsProvider`. No gate, but the whole tree depends on it. **Leave alone** (convert later or never; TSX conversion not in scope).
- `logout/page.js` — sign-out flow, no gates. Marker-only candidate.
- `verify-email/page.js` — email-verify poll UI, selects `email_verified` but that is a user-state field, not a role/plan gate. Marker-only.
- `category/[id]/page.js` — category feed, prose comment at line 10 mentions "paid-tier territory per D5 and not in this scope." No active role/plan gate. Marker-only.
- `profile/category/[id]/page.js` — per-category drill-in on own profile. No gates. Marker-only.
- `profile/contact/page.js` — contact form. No gates. Marker-only.
- `story/[slug]/layout.js` — article layout shell. No gates. Marker-only.
- `story/[slug]/opengraph-image.js` — OG image generator. No gates. Marker-only.
- `u/[username]/layout.js` — public profile layout. No gates. Marker-only.

**E subtotal: 9 files**, each marker-only. None have role/plan gates — they slipped the net because they were created before markers became standard, not because they have stale auth logic.

**TSX with both markers sealed (51 files):** every non-admin `.tsx` under `site/src/app/` has both `@migrated-to-permissions` and `@feature-verified`. Zero unmigrated TSX pages found. Admin `.tsx` files (39) carry `@admin-verified` (LOCK) instead — intentional and correct.

### 1.2 Remaining iOS views

`find VerityPost -type f -name '*.swift'` returns 38 files. 16 carry `@feature-verified`. The 22 without break down as:

**A — Pure infra (no view surface, no gate possible):** 10 files — `Keychain.swift`, `Log.swift`, `Models.swift`, `Password.swift`, `PermissionService.swift` (this IS the permission system — it uses keys, doesn't need to be gated), `SupabaseManager.swift`, `Theme.swift`, `VerityPostApp.swift` (app entrypoint), `SettingsService.swift`, `StoreManager.swift`. No markers needed.

**B — Auth / onboarding / pre-login views (first marker present, no permission semantics):** 8 files — `AuthViewModel.swift` (no marker yet — bare auth state machine), `ContentView.swift` (no marker — root router), `ForgotPasswordView.swift`, `LoginView.swift`, `SignupView.swift`, `ResetPasswordView.swift`, `VerifyEmailView.swift`, `WelcomeView.swift`. Pre-auth forms. Candidate for `@feature-verified system_auth` marker (matches the web system-auth track).

**C — Feature views that have `@migrated-to-permissions` but not `@feature-verified`:** 4 files — `HomeFeedSlots.swift`, `LeaderboardView.swift`, `ProfileView.swift`, `ProfileSubViews.swift`. All four scanned for hardcoded tier/plan/role checks — grep of `userTier|plan_id|plan_status|PAID_TIERS|tier ==|.role ==` returns **zero hits** on every one. They already use `PermissionStore.shared.has("key")` (or at least consume `PermissionService`) and just need the second marker written to the file header.

**Scope surprise:** brief said "remaining iOS views — find Swift files without `@feature-verified`." Of the 22 unverified files, only 4 are actual feature views needing the marker pair completed; 10 are infra (no marker needed); 8 are pre-auth forms (marker-only with `system_auth` category).

### 1.3 Tracker drift sweep

**Method:** parsed `05-Working/PERMISSION_MIGRATION.md` for every `- [x] <path>` entry. For each file still on disk, checked whether it carries BOTH `@migrated-to-permissions` and `@feature-verified` (except admin-LOCKED files, which carry `@admin-verified` instead). Known deletions (5 files from Round 2 — `QuizPoolEditor.jsx`, `profile/settings/page.js`, `PermissionGate.jsx` replaced by `.tsx`, etc.) excluded.

**Summary:**
```
total_claimed_entries      = ~162 unique file paths
admin_locked (expected @admin-verified only) = 39
sealed_both_markers                           = 118
tracker_claims_both_but_on_disk_missing_one   = 0
tracker_claims_marker_only_(not_feature-verified) = 4 iOS views from 1.2C + 9 JS shells from 1.1E
admin_api_marker_gaps                         = 0 (all 37 routes have both markers post-Track M)
```

**Real tracker drift: 0 files.** Every file that the tracker explicitly calls out as both-markers-sealed carries both markers on disk. The three REFERENCE.md §12 files that were drift-flagged at the end of Round 2 (`api/admin/subscriptions/[id]/manual-sync/route.js`, `api/admin/users/[id]/permissions/route.js`, `api/admin/users/[id]/roles/route.js`) now carry `@admin-verified 2026-04-18` — Track M folded that marker write into its pass per the Round 2 recommendation.

**Soft drift (not tracker-claimed-sealed, but worth noting):**
- The 4 iOS feature views from 1.2C are listed in the 2D tracker section but their tracker rows are worded as "marker only" or brief migration notes. The tracker does **not** claim the second marker, so strictly these are not tracker drift — they are legitimate single-marker files. But they are the last 4 iOS feature views that need sealing for completeness.
- The 9 non-admin JS shells from 1.1E aren't mentioned in the tracker at all. They never went through a migration pass because they have no gates.

**Track S's charter:** verify zero drift remains, add any missing markers to the above classes (1.1E + 1.2C + 1.2B), and cross-reference the final tracker text against disk one more time.

### 1.4 Subscription key-naming spec-vs-DB drift

**Where the 7 stale key names appear outside active code:**
- `00-Where-We-Stand/REFERENCE.md` §6 item #8 — explicitly calls out the drift as "spec-doc issue only" and lists the canonical `billing.*` names. Prose is correct but phrasing is defensive; with the live keys now deactivated (`billing.cancel`, `billing.invoices.view` → `is_active=false` per Phase 5 Track P) the paragraph should be rewritten to describe a resolved state rather than an open issue.
- `05-Working/PERMISSION_MIGRATION.md` lines 388-392 — "Missing permission keys (flagged, NOT created)" list under Track I (subscription). This is a historical note from Round 2's closure of Track I.
- `05-Working/_round2_prep.md` line 332 — Round 2 Track P item. Historical.
- `site/src/app/admin/subscriptions/page.tsx:222` — `action: 'subscription.cancel'` is an **audit log action string**, not a permission key. It is written into the `audit_log.action` column alongside `targetTable`/`oldValue`/`newValue` for the admin action history. Different concern entirely — do not touch.

**DB reality check (required before Track T rewrites docs):** run the following on the `fyiwulqphgmoqullmrfn` project to confirm the canonical state:
```sql
SELECT key, is_active, description
FROM permissions
WHERE key IN (
  'billing.cancel', 'billing.cancel.own',
  'billing.invoices.view', 'billing.invoices.view_own',
  'billing.resubscribe', 'billing.change_plan',
  'billing.upgrade.checkout', 'billing.stripe.checkout',
  'billing.portal.open', 'billing.stripe.portal'
)
ORDER BY key;
```
Expected: `billing.cancel` and `billing.invoices.view` → `is_active=false`; the other 8 → `is_active=true`.

**Track T recommendation (per brief):** option (a) — rename the spec docs to match DB reality. Do NOT create alias keys. Replace stale key names in REFERENCE.md §6 item #8 with a resolved-state paragraph that names the 8 canonical billing keys. The 7 stale semantic aliases (`subscription.cancel/resume/upgrade/downgrade`, `plan.switch`, `checkout.initiate`, `billing.view.invoices`) should be listed only once per doc as "historical / deprecated" so a future reader knows what the old spec said.

**No other spec docs mention these keys:** `00-Reference/Verity_Post_Design_Decisions.md`, `05-Working/PERMISSIONS_AUDIT.md`, and every other `.md` under `00-*` + `05-Working/**` were grep-checked; zero hits for the 7 stale names outside the three docs above.

### 1.5 Remaining admin API routes — slipthrough check

Command: `grep -rL "requirePermission\|requireAuth" site/src/app/api/admin/ --include='*.js' --include='*.ts'` — returns **zero files**. Every admin API route under `site/src/app/api/admin/**` (37 total) now gates on either `requirePermission` or `requireAuth`. Track M's 54-call-site migration holds clean.

Of the 37 admin API routes, **37/37 carry `@migrated-to-permissions 2026-04-18` AND `@feature-verified admin_api 2026-04-18`.** Track M's marker pass was exhaustive. 3 of those 37 additionally carry `@admin-verified 2026-04-18` (the §12 drift files — everything correct).

**No admin API slipthrough.** Separately flagged: the 37 admin API routes that have both migration markers but **no `@admin-verified` LOCK marker** (34 files). Adding `@admin-verified` to every admin API route would extend the Round 1 LOCK from 39 page/component files to ~73 files. **Do NOT do that automatically** — LOCK is an owner-authorized seal; the brief did not delegate that authority. Track S leaves the admin-API LOCK question for an owner decision (flagged, not actioned).

---

## Part 2 — 4-track split

All four tracks are independent and can run fully in parallel. Zero serial gates.

### Track Q — Remaining web public pages + TSX-page marker audit

**Owns (files edited):**

Group Q.1 — `NavWrapper.js` (the only remaining file with a hardcoded role gate):
- `site/src/app/NavWrapper.js` — convert to `NavWrapper.tsx`. Replace the `user_roles → roles(name)` join on line 71-78 + the `['owner','admin','superadmin']` array check on line 123 with `hasPermission('admin.surface.access')` hydrated via `refreshAllPermissions`/`refreshIfStale`. Preserve the rest of the file's logic (account-state banner wiring, `deletion_scheduled_for` select — already fixed in Round 2 per tracker line 417). Add both markers.

Group Q.2 — Marker-only migrations for JS files with no gate logic (add `@migrated-to-permissions 2026-04-18` + `@feature-verified <category> 2026-04-18`):
- `site/src/app/logout/page.js` — category: `system_auth`
- `site/src/app/verify-email/page.js` — category: `system_auth`
- `site/src/app/category/[id]/page.js` — category: `home_feed` (matches the category drill-in flow)
- `site/src/app/profile/category/[id]/page.js` — category: `profile_card` (own-profile surface)
- `site/src/app/profile/contact/page.js` — category: `shared_components`
- `site/src/app/story/[slug]/layout.js` — category: `article_reading`
- `site/src/app/story/[slug]/opengraph-image.js` — category: `article_reading`
- `site/src/app/u/[username]/layout.js` — category: `profile_card`
- `site/src/app/profile/activity/page.js` — category: `profile_card` (redirect shell; marker for completeness)
- `site/src/app/profile/milestones/page.js` — category: `profile_card` (redirect shell)

Group Q.3 — Framework files (optional, safe to skip — document either way):
- `site/src/app/robots.js`, `manifest.js`, `sitemap.js`, `not-found.js`, `error.js`, `global-error.js`, `browse/loading.js`, `profile/error.js`, `profile/loading.js`, `story/[slug]/error.js`, `story/[slug]/loading.js`. **Recommendation:** leave unmarked. These are framework conventions, not features. The marker grep audit should explicitly exclude files matching `(robots|sitemap|manifest|loading|error|not-found|global-error)\.(js|tsx|ts)$`.

Group Q.4 — Root layout (edge case):
- `site/src/app/layout.js` — the root layout wires `PermissionsProvider` and `NavWrapper`. Convert to `.tsx` IF convenient alongside NavWrapper; otherwise leave (no gate logic). Recommendation: defer unless NavWrapper conversion makes leaving `layout.js` as JS awkward.

**Must not touch:**
- Any `@admin-verified` file under `site/src/app/admin/**/*.tsx` or `site/src/components/admin/**`.
- Any `.tsx` file under `site/src/app/` that already carries both markers (all 51 are sealed).
- Anything iOS-side (Track R).
- Any API route (Track M/P already closed these; Track S may add markers on iOS-adjacent API if needed but not Q).
- `site/src/lib/**` (Phase 5 closed these).

**Dependencies:** none. Fully parallel with R, S, T.

**Flip-test plan:**
- `NavWrapper`: flip-test `admin.surface.access` (or the chosen key) on `admin@veritypost.com`:
  - baseline → admin nav link renders.
  - insert `permission_scope_overrides` with `override_action='block'` → admin nav link hidden.
  - delete override → link returns.
- **Marker-only migrations:** no flip-test needed; verify by grep that both markers are present.

**Key candidates for NavWrapper:** check DB first for `admin.surface.access`, `admin.dashboard.view`, `admin.console.access`. If none exist, use `admin.users.view` or `admin.settings.view` as the "can see admin nav" heuristic (whichever is broadest). Prefer to not create a new key; if truly needed, bind to `moderator|editor|admin|owner` sets.

**Expected size:** ~1 full conversion (NavWrapper, ~260 lines), 10 marker-only headers (2-line prepend each), optional skip of 11 framework files. Total ~280 lines touched.

---

### Track R — Remaining iOS views

**Owns (files edited):**

Group R.1 — Feature views needing second marker (no gate changes — all four verified to have zero hardcoded tier/plan/role checks):
- `VerityPost/VerityPost/HomeFeedSlots.swift` — add `@feature-verified home_feed 2026-04-18`.
- `VerityPost/VerityPost/LeaderboardView.swift` — add `@feature-verified home_feed 2026-04-18` (leaderboard is bound to the home-feed feature area per the web counterpart at `site/src/app/leaderboard/page.tsx` which uses `@feature-verified home_feed`... verify category by grepping the web file's header first; if it uses a different category, match it).
- `VerityPost/VerityPost/ProfileView.swift` — add `@feature-verified profile_settings 2026-04-18` (profile tab surface; has sub-nav that maps to settings rows, matches iOS `SettingsView` category).
- `VerityPost/VerityPost/ProfileSubViews.swift` — add `@feature-verified profile_settings 2026-04-18` (tab bodies for ProfileView).

Group R.2 — Pre-auth / onboarding views (add both markers if missing; category = `system_auth`):
- `VerityPost/VerityPost/AuthViewModel.swift` — no marker yet; add `@migrated-to-permissions 2026-04-18` + `@feature-verified system_auth 2026-04-18`. File is 520 lines and owns the entire auth state machine, but grep shows zero permission/tier/plan/role hardcoding (auth state fields only).
- `VerityPost/VerityPost/ContentView.swift` — no marker; add both with `system_auth` category. Root router — grep-verify no gate logic (296 lines).
- `VerityPost/VerityPost/ForgotPasswordView.swift`, `LoginView.swift`, `ResetPasswordView.swift`, `SignupView.swift`, `VerifyEmailView.swift`, `WelcomeView.swift` — each already has `@migrated-to-permissions`; add `@feature-verified system_auth 2026-04-18` alongside.

Group R.3 — Pure infra (no markers needed, document the exclusion):
- `Keychain.swift`, `Log.swift`, `Models.swift`, `Password.swift`, `PermissionService.swift`, `SupabaseManager.swift`, `Theme.swift`, `VerityPostApp.swift`, `SettingsService.swift`, `StoreManager.swift` — leave unmarked. Add an exclusion note to the tracker's 2D section stating that these 10 files are infrastructure and intentionally unmarked.

**Must not touch:**
- Any `.swift` file that already carries `@feature-verified` (16 files — see 1.2 for the list).
- Anything web-side.
- `PermissionService.swift` itself — it is the permission system, not a feature-gated surface.

**Dependencies:** none. Fully parallel with Q, S, T.

**Flip-test plan:**
- None needed: every file in R is marker-only. Verification is:
  1. `grep -L "@feature-verified" $(find VerityPost -type f -name '*.swift')` returns only the 10 infra files from R.3.
  2. Spot-check each R.1 file by running a permission-change sweep on `free@test.veritypost.com` — e.g. scope-block `recap.list.view`, confirm `HomeFeedSlots.swift` RecapCard slot respects the change (it already does per tracker line 229; this is a smoke test for the sealed claim).

**Category mapping verification required before writing markers:** run `grep -n "@feature-verified" VerityPost/VerityPost/HomeView.swift` to confirm the iOS home-feed category used; match that string exactly when marking `HomeFeedSlots.swift` and `LeaderboardView.swift`. Same logic for `SettingsView.swift` / `ProfileView.swift`. Consistency matters — the review agent greps by exact category string.

**Expected size:** ~12 marker-only headers (2-line prepend each), 0 body changes. Total ~24 lines added, 0 removed.

---

### Track S — Tracker-drift fix + completeness audit

**Owns:**

Group S.1 — Final-pass drift audit script: for every `- [x] <path>` entry in `05-Working/PERMISSION_MIGRATION.md`, verify the file on disk carries the marker set the tracker claims. Output a drift report at `05-Working/_round3_drift_report.md` (or append to the tracker's "Gaps flagged" footer — pick one; recommend the latter, under a new `### Round 3 drift audit` subheading).

Group S.2 — Add any markers that Track Q and Track R didn't cover, arising from the drift audit. Given 1.3 shows zero real drift, this group is likely empty. Run the audit regardless.

Group S.3 — Tracker-text sync: after Q and R land, update the tracker's 2A and 2D sections with the new sealed files. Add the Q.2 marker-only entries to section 2A's bullet list and the R.1 + R.2 entries to section 2D's bullet list. Format matches existing entries (`- [x] <path> — <note>`).

Group S.4 — Framework-file exclusion note: add a paragraph to the tracker's scope table noting that framework files (`robots.js`, `manifest.js`, `sitemap.js`, `not-found.js`, `error.js`/`loading.js` at any level, `global-error.js`) and pure-infra Swift files (10 from 1.2 R.3) are intentionally unmarked. This prevents future drift audits from flagging them.

Group S.5 — Admin-API-LOCK question: add a flagged-for-owner note to REFERENCE.md §6 or the tracker's Phase 5 footer asking whether the 34 admin API routes that carry both migration markers should also receive `@admin-verified`. Do NOT act on the question — surface it.

**Must not touch:**
- Source code (unless drift audit surfaces a real missing marker — unlikely per 1.3).
- Any TSX/Swift body (marker writes only if discovered).
- DB / migrations (that's Track T).

**Dependencies:** S.3 has a soft dependency on Q and R completing (tracker updates summarize their work). Can start the drift audit in parallel; finish the tracker-text updates last. If running all four tracks simultaneously, S should be the last to wrap. If running sequentially, S after Q and R.

**Verification plan:**
- Run the drift script. Expected output: zero real drift; 4 iOS R.1 files and 10 JS Q.2 files transition from "soft drift" to "sealed" after Q and R run.
- `grep -L "@feature-verified" $(find site/src/app -type f -name '*.tsx' -not -path '*/admin/*')` — expect zero post-Q.
- `grep -L "@feature-verified" $(find VerityPost -type f -name '*.swift' -not -name 'Keychain.swift' -not -name 'Log.swift' -not -name 'Models.swift' -not -name 'Password.swift' -not -name 'PermissionService.swift' -not -name 'SupabaseManager.swift' -not -name 'Theme.swift' -not -name 'VerityPostApp.swift' -not -name 'SettingsService.swift' -not -name 'StoreManager.swift')` — expect zero post-R.

**Expected size:** ~60 lines of tracker text added (entries + Round 3 drift audit subsection + framework-exclusion note + admin-API-LOCK question flag). Zero source-code changes.

---

### Track T — Spec/DB reconciliation (subscription key-naming drift)

**Owns:**

Group T.1 — DB reality check (read-only):
- Run the SQL in 1.4 against `fyiwulqphgmoqullmrfn`. Confirm `billing.cancel` + `billing.invoices.view` are `is_active=false`; the 8 canonical keys are `is_active=true`. Record the output as a code block in the updated REFERENCE.md paragraph.

Group T.2 — REFERENCE.md §6 item #8 rewrite:
- Replace the current paragraph that starts "**Subscription spec-vs-DB drift** — spec docs reference ..." with a resolved-state paragraph. Template:

  > **~~Subscription spec-vs-DB drift.~~ RESOLVED 2026-04-18.** Phase 5 closed this. Canonical billing keys now in use: `billing.cancel.own`, `billing.resubscribe`, `billing.change_plan`, `billing.upgrade.checkout`, `billing.stripe.checkout`, `billing.portal.open`, `billing.stripe.portal`, `billing.invoices.view_own`. The two legacy duplicates (`billing.cancel`, `billing.invoices.view`) are `is_active=false` as of migration `deactivate_duplicate_billing_keys_2026_04_18`. The seven stale semantic aliases that appeared in early spec drafts (`subscription.cancel`, `subscription.resume`, `subscription.upgrade`, `subscription.downgrade`, `plan.switch`, `checkout.initiate`, `billing.view.invoices`) were never created in DB and are not referenced anywhere in code; they stay un-created per the prep-doc recommendation that spec docs follow DB.

- Move item #8 from the "Open issues" list to the "Recently fixed (2026-04-18)" section §12. Preserve the other Open Issues numbering (renumber 9, 10 → 8, 9).

Group T.3 — Tracker comment sync:
- In `05-Working/PERMISSION_MIGRATION.md`, at the Track I "Missing permission keys (flagged, NOT created)" block (lines 387-392 per the Round 2 layout), add a trailing line noting "RESOLVED by Round 3 Track T — spec docs updated to match canonical billing keys."

Group T.4 — No alias keys created:
- Do NOT create `subscription.cancel`, `subscription.resume`, etc. The brief recommends option (a): "spec docs should follow DB." Honor that.

Group T.5 — `billing.stripe.portal` vs `billing.portal.open` — out of scope:
- The product decision on whether `/api/stripe/portal` should gate on the broader `billing.portal.open` is still pending owner sign-off (per REFERENCE.md §6 item #9 and Round 2 prep 1.4). **Do NOT touch in Track T.** Leave item #9 as-is in Open Issues.

**Must not touch:**
- DB permission keys themselves (no `INSERT`/`UPDATE` on `permissions`, `permission_set_permissions`, `permission_scope_overrides`).
- Source code (Track T is docs-only).
- `billing.stripe.portal` / `billing.portal.open` — product-decision item, not a Track T concern.

**Dependencies:** none. Fully parallel with Q, R, S.

**Flip-test plan:**
- No flip-test needed (docs only).
- Verification: grep `subscription\.cancel\|subscription\.resume\|plan\.switch\|checkout\.initiate\|billing\.view\.invoices` across the whole repo — after Track T, remaining hits should only be: (a) the historical migration tracker notes at 05-Working/PERMISSION_MIGRATION.md lines 387-392 (documenting the old names); (b) the resolved-state paragraph in REFERENCE.md §12 that names them as "historical"; (c) the audit-log action string `subscription.cancel` at `admin/subscriptions/page.tsx:222` which is NOT a permission key (audit-log column). Zero hits elsewhere.

**Expected size:** ~30 lines rewritten in REFERENCE.md (one paragraph moved + renumbered), ~2 lines appended to PERMISSION_MIGRATION.md. Total ~35 lines changed, 0 code touched.

---

## Part 3 — Sequencing

**Recommended: dispatch all 4 tracks in parallel.** No inter-track dependencies beyond Track S's soft preference to finish the tracker-text sync after Q and R land (which it can do by watching their completion, or by running fourth in a sequential cadence).

**Alternative — 2-wide cadence:**
1. Wave A: Q, T (Q hits code, T hits docs — zero overlap).
2. Wave B: R, S (R hits iOS only, S hits docs only — zero overlap; S can now absorb the final Q and R completions into its text sync).

Either ordering works. Brief says "likely none this round, all parallel-safe" — confirmed.

---

## Part 4 — Review criteria (for Round 3 REVIEW AGENT)

After all 4 tracks land, the review agent must verify:

1. **NavWrapper migrated.** `site/src/app/NavWrapper.tsx` exists; the old `.js` is deleted. `grep -rn "roles?.some" site/src/app/NavWrapper*` returns zero. A `hasPermission('admin.surface.access')` (or chosen key) call is present. Flip-test the key: admin nav link respects scope overrides.
2. **All 10 JS marker-only files carry both markers.** Grep-verified.
3. **All 4 iOS R.1 feature views carry `@feature-verified`** with a category string that matches the corresponding iOS or web feature track.
4. **All 8 iOS R.2 pre-auth views carry both markers** under the `system_auth` category.
5. **AuthViewModel.swift and ContentView.swift have both markers added** — these were the two iOS files with no marker at all.
6. **10 iOS infra files remain intentionally unmarked** and are documented in the tracker's 2D section as excluded.
7. **11 web framework files remain intentionally unmarked** and are documented in the tracker's 2A section as excluded.
8. **REFERENCE.md §6 item #8 rewritten** to the resolved-state paragraph. Item moved to §12. Items #9 and #10 renumbered.
9. **Zero real tracker drift.** Drift audit (per 1.3 methodology) over the post-Q/R state returns zero `missing_feature_marker_only` outside the documented exclusions.
10. **No new DB permission keys created.** `SELECT COUNT(*) FROM permissions WHERE key IN ('subscription.cancel','subscription.resume','subscription.upgrade','subscription.downgrade','plan.switch','checkout.initiate','billing.view.invoices')` → 0.
11. **No admin-API `@admin-verified` seal added proactively.** The question is flagged for owner, not executed.
12. **`cd site && npx tsc --noEmit` → EXIT=0.**
13. **Spot-check regression:** flip-test 3 random sealed features from Rounds 1-2 — one key each. All round-trip clean.

---

## Part 5 — Surprises / scope notes

1. **Round 3 is small by design.** Rounds 1+2 were 39+4-track passes. Round 3 is a completion + hygiene pass. Expected total edits: ~280 lines (mostly NavWrapper) + ~36 marker-only prepends + ~65 doc lines.
2. **Track M's marker pass was exhaustive.** All 37 admin API routes carry both migration markers; zero slipthrough. The §12 drift files now carry `@admin-verified` too. No follow-up Track-M-style migration needed.
3. **The "handful" of real remaining migrations is one file.** `NavWrapper.js` is the last hardcoded-role-array check in `site/src/app/`. After it migrates, the non-admin web surface is 100% permission-driven.
4. **iOS auth surface should get a `system_auth` category** to mirror the web system-auth track. Track R.2 establishes this.
5. **Framework files need an explicit exclusion note** (Track S.4). Otherwise every future drift audit will re-flag them as "missing markers." A one-paragraph tracker addition permanently resolves the category.
6. **Admin-API-LOCK is a real decision to surface.** Currently 39 admin files are LOCKED but 34 admin API routes are not. If admin API is equally "frozen," owner should seal them; if admin API is allowed to drift, the asymmetry should be documented. Track S flags this; does not act.
7. **Track T is the cheapest deliverable.** One paragraph rewrite + one renumbering. Do not over-engineer.
8. **Brief's expected deliverables vs actual discovery:**
   - "Remaining web pages" — 1 real migration + 10 marker-only + 11 framework exclusions.
   - "Remaining iOS views" — 4 real + 8 pre-auth + 10 infra exclusions.
   - "Tracker drift" — zero real drift (one prior drift set was already closed mid-Track M).
   - "Subscription key-naming drift" — one paragraph rewrite; zero live keys renamed.
   - "Admin API slipthrough" — zero.
9. **No new DB migrations required this round.** Track T is docs-only; Q/R/S are code + tracker only.

---

End of prep doc.
