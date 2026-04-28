# Session 8 — Profile + Settings + Redesign + Public Profile

**Owns (strict):**
- `web/src/app/profile/**`
- `web/src/app/redesign/**`
- `web/src/app/u/[username]/`

**Created:** 2026-04-27. **Self-contained.** Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — every owner-pending decision relevant to this session is locked below with the senior-developer / UI-UX-mastermind default. Every file path, line number, RPC name, and cross-session coordination contract you need to ship lives inside this document.

---

## 0. Operating manual

### 0.1 Hermetic file ownership

This session edits ONLY paths under the three roots above. Anything else is out-of-scope. If a fix appears to need an off-domain edit, defer the item, write a one-line note in the affected item, and surface the cross-session coordination point at the top of your shipping commit.

Adjacent sessions and what they own:
- **S1** — `Ongoing Projects/migrations/**` (SQL only). Drafts and ships RPCs that this session calls. S8 never writes SQL.
- **S3** — `web/src/middleware.js`, `web/src/app/login/**`, `web/src/app/api/auth/**`. Owns the `:3333` middleware logic that T357 needs dropped; S8 cannot edit `middleware.js`.
- **S5** — comments / votes / follows / DMs / notifications API + `web/src/components/CommentRow.tsx`. Owns RLS-relevant freeze checks (T346 enforcement).
- **S6** — `web/src/app/api/expert/**`, `web/src/app/admin/**`, AI pipeline lib. Builds `/api/expert/vacation` route that the redesign already calls.
- **S7** — `web/src/app/page.tsx`, `web/src/app/layout.js`, footer. Owns home-feed-preferences read-side verification (T19) and footer GPC link (I7).
- **S9** — iOS adult app. Owns the iOS slice of T49 username-edit and T358 redesign port.
- Shared: `web/package.json` is touched by whichever session needs it first. T357 needs the `dev:3333` script removed; coordinate with whoever holds the `package.json` write-lock that day.

### 0.2 Multi-agent ship pattern (mandatory for non-trivial items)

Per memory `feedback_4pre_2post_ship_pattern` + `feedback_genuine_fixes_not_patches`:
1. **4 pre-impl agents** — investigator (read current code, verify the audit claim against the live source), planner (design the change), big-picture reviewer (cross-file impact, types/callers/data-flow), independent adversary (find ways the plan breaks).
2. **N implementers in parallel** with isolated file ownership per memory `feedback_batch_mode_4_parallel_implementers`. T357 alone wants 4 implementers (legacy delete + redesign move + middleware/package coordination + T334 caller migration).
3. **2 post-impl reviewers** — one independent code reviewer, one security/correctness reviewer. The security reviewer earns its keep on T363 (public PII surface), T49 (audit-log shape), and T334 (lockdown_self caller).
4. **Divergence resolution per memory `feedback_divergence_resolution_4_independent_agents`** — when reviewers disagree, dispatch 4 fresh independent agents on the disputed point. Don't bring technical disputes to the owner.
5. **Genuine-fix discipline.** Kill the thing being replaced. No parallel paths. No TODOs / HACKs / force-unwraps-as-crutch. Types, callers, and data flow stay coherent. If a patch is the only viable option, surface the tradeoff before shipping.

### 0.3 Verification authority

You verify everything firsthand. Open the actual file. Read the actual line range. Query the live DB via Supabase MCP when claim is schema- or RPC-shaped. Per memory `feedback_verify_audit_claims_against_current_code` and `feedback_mcp_verify_actual_schema_not_migration_log`:
- ~5/35 audit claims drift in any given session. Quote current source before acting.
- `supabase_migrations` log lies. Use `information_schema`, `pg_proc`, `pg_constraint` directly.
- When you cannot see something (Vercel dashboard, Stripe dashboard, AdSense console), say so and ask. Do not pass agent defensive hedges through as launch-critical findings.

### 0.4 No-user-facing-timelines rule (memory `feedback_no_user_facing_timelines`)

Banned strings, anywhere user-visible, anywhere this session edits:
- "coming soon", "Check back soon", "we're working on it", "actively working", "before launch", "finishing the polish", "in a future pass", "launches soon", "will be available", "soon"

Rewrite each occurrence to:
- Describe present state ("This feature is unavailable on web"), OR
- Render a clean unavailable empty state (greyed control + a sentence that's true today).

Never use a softer-timeline replacement. "Check back later" is also banned. Strip entirely.

### 0.5 No-color-per-tier rule (memory `feedback_no_color_per_tier`)

Tier (Free / Pro / Family) renders as **plain text in `vpInkMuted`** (or the equivalent muted-ink token). No distinct hue, no gradient, no muted ramp, no rainbow. Reject any reviewer / agent suggestion otherwise. T357 redesign Hero, T363 public profile Hero, and PlanSection all comply. The CommentRow Pro-pride pill (Q4.9) renders as a plain-text pill in muted ink — no color tint.

### 0.6 No-keyboard-shortcuts rule (memory `feedback_no_keyboard_shortcuts`)

Don't propose or build keyboard shortcuts / hotkeys / command palettes for any profile or settings flow. Click-driven only.

### 0.7 Best-practice locks summary (this session's items)

| Item | Decision | Source |
|---|---|---|
| T19 home feed preferences | DELETE the toggles entirely | OWNER-ANSWERS Q4.3 |
| T49 username edit contract | CHANGEABLE, once per 90 days, audit log every change | OWNER-ANSWERS Q4.6 |
| T308 admin manual-sync downgrade | CLEAR `frozen_at` on admin downgrade | OWNER-ANSWERS Q4.7 |
| T346 freeze scope | CONTENT LOCKOUT (B) — `frozen_at IS NULL` in comment INSERT RLS, vote/follow/message routes | OWNER-ANSWERS Q4.8 |
| T357 web profile cutover | SHIP the moment T4.8 redesign TS errors clear | This file |
| T360 CategoriesSection + MilestonesSection components | BUILD as autonomous presentational components under `redesign/profile/_sections/`; spec-locks the iOS port (S9-T358) | TODO2 line 378 |
| T363 public profile rebuild | BUILD under `/redesign/u/[username]/` first; co-ship with T357; gate on T330+T331+T359 before flipping `PUBLIC_PROFILE_ENABLED=true` | OWNER-ANSWERS Q4.13 |
| T79 settings split into 11 sub-routes | SKIP — T357 redesign cutover replaces the monolith | This file |
| A98 admin palette on ProfilePage | BUNDLE INTO T357 (the real fix) | This file |
| A47-profile banned timeline copy | STRIP entirely; describe present state OR render unavailable state | OWNER-ANSWERS / `feedback_no_user_facing_timelines` |
| E18 OpenDyslexic toggle | WIRE `@font-face` (S7 layout) + conditional class via settings | This file |
| E19 High-contrast mode | WIRE CSS variables for high-contrast palette; toggle reads from settings | This file |
| E24 family achievements surface | RENDER in `web/src/app/profile/family/` (parent dashboard) | This file |
| §A1 caller (`/api/expert/vacation`) | VERIFY call-site shape after S6 ships the route | This file |
| §I7 GPC client-side handler | SETTINGS toggle for "Do Not Sell" preference; coordinate with S7 footer link | This file |
| T308 admin file (S6-owned) | OUT OF SCOPE for edit; S8 verifies UI representation post-S6 fix | This file |
| T346 freeze enforcement | OUT OF SCOPE for edit; S8 verifies profile UI doesn't surface frozen-state-dependent actions inappropriately | This file |

---

## 1. Workstream items

Each item below has 11 fields:

1. **Status** — open / shipped / blocked.
2. **Source** — where the original audit claim came from.
3. **Decision lock** — locked default + rationale.
4. **Files (in scope)** — exact paths this session edits.
5. **Files (cross-session)** — paths another session edits; coordination contract.
6. **Verification** — what to prove against current code before acting.
7. **Implementation steps** — ordered, concrete.
8. **Coordination** — explicit cross-session waits / handoffs.
9. **Risk + rollback** — what breaks if the change is wrong, how to undo.
10. **Smoke test** — what passes proves the ship.
11. **Commit tag** — per index rule.

---

### S8-T357 — Web profile redesign cutover

1. **Status:** 🟩 SHIPPED 2026-04-28 (commit `0f62802`, mislabeled by automation as `[S5-T25]` but the diff is the T357 cutover: 7,085 legacy lines deleted, 45 redesign files moved into `/profile/`, `redesign/` tree gone, preview/demoUser scaffolding stripped from `ProfileApp`, `:3333` perms-all-true branch removed). Follow-ups in `7380e0d` (billing-redirect → `?section=plan`) and `9306c43` (anchor-link migration across AccountStateBanner / family / card / kids).
2. **Source:** TODO2 T357. Verified 2026-04-27 against:
   - `web/src/app/profile/page.tsx` (legacy: 1,898 lines)
   - `web/src/app/profile/settings/page.tsx` (legacy: 5,187 lines)
   - `web/src/app/redesign/` (45 files including `_components`, `_sections`, `profile/`, `settings/_cards/`, `preview/`, `u/`)
   - `web/src/middleware.js:159-449` (`:3333` host-check / `_isRedesignPort` rewrite block intact)
   - `web/package.json` (`dev:3333` script intact)
3. **Decision lock — best-practice default:** Ship the cutover as a single coordinated PR the moment T4.8 redesign TS errors clear. Once merged, redesign is live; pre-merge, both surfaces coexist on `:3000` and `:3333`. The `PUBLIC_PROFILE_ENABLED` flag flip is a separate decision — see T363 below — and gated on T330 + T331 + T359 (iOS hidden audit) all being in place. **Why ship this fast:** the legacy tree is a 7,200-line maintenance overhang; every other profile-domain task wants to land in the redesign tree and is held back by parallel-path ambiguity.
4. **Files (in scope):**
   - DELETE `web/src/app/profile/page.tsx` (1,898 lines)
   - DELETE `web/src/app/profile/settings/page.tsx` (5,187 lines)
   - DELETE 12 redirect-shim subpages under `web/src/app/profile/` (`activity/`, `bookmarks/` if shim, `card/`, `category/`, `contact/`, `family/` if shim, `[id]/` if shim, `kids/` if shim, `milestones/`, `settings/` non-monolith subdirs that are pure redirect shims, `error.js`/`loading.js` as appropriate). Run `grep -l "redirect(" web/src/app/profile/**/*.tsx` to enumerate; delete shims, preserve pages that hold real UI (e.g., `family/page.tsx` and `kids/page.tsx` may not be shims).
   - MOVE 45 files from `web/src/app/redesign/profile/` → `web/src/app/profile/`:
     - `redesign/profile/page.tsx` → `profile/page.tsx`
     - `redesign/profile/settings/page.tsx` → `profile/settings/page.tsx`
     - `redesign/profile/_components/ProfileApp.tsx` → `profile/_components/ProfileApp.tsx`
     - `redesign/profile/_components/AvatarEditor.tsx` → `profile/_components/AvatarEditor.tsx`
     - All 16 `redesign/profile/_sections/*.tsx` → `profile/_sections/*.tsx`
     - All 8 `redesign/profile/settings/_cards/*.tsx` → `profile/settings/_cards/*.tsx`
   - DROP dev-only artifacts:
     - `web/src/app/redesign/_lib/demoUser.ts` — delete file
     - `web/src/app/redesign/preview/page.tsx` — delete
     - `web/src/app/redesign/u/` — delete entire directory
     - `web/src/app/redesign/_components/`, `web/src/app/redesign/_sections/` — delete after confirming everything `profile/` depended on is moved
     - `web/src/app/redesign/page.tsx` — delete
   - Strip `isPreviewHost()` calls and `preview` prop plumbing from every moved file. Grep `isPreviewHost\|previewHost\|preview\?:` across the new `profile/` tree post-move.
   - Co-ship T334 caller migration in `profile/settings/_cards/PrivacyCard.tsx` (was `redesign/profile/settings/_cards/PrivacyCard.tsx`): replace the two-statement client flow with a single `lockdown_self()` RPC call. RPC migration is owned by S1 — this caller change waits on S1's `lockdown_self()` shipping (migration drafted at `Ongoing Projects/migrations/2026-04-27_T334_lockdown_self_rpc.sql`).
5. **Files (cross-session):**
   - **S3 owns the middleware edit.** Drop `_isRedesignPort`, host-check, rewrite block, and `:3333` `ALLOWED_ORIGINS` entry from `web/src/middleware.js`. S8 opens an issue / PR comment requesting this; ships its own cutover commit at the same time so the redesign tree lands on `:3000`.
   - **Shared `web/package.json`:** drop the `dev:3333` script. Whichever session writes `package.json` that day handles it; T357 PR description names this dependency. If S8 takes the package.json edit (because no other session needs it that day), the commit message tags `[S8-T357]` and notes the cross-session implication.
   - **S1** owns `lockdown_self()` migration. T357 caller migration in `PrivacyCard.tsx` waits on S1.
   - **S6** owns `/api/expert/vacation` (see §A1 below). The moved `_sections/ExpertProfileSection.tsx:121` keeps calling that endpoint; verify S6 has shipped before T357 lands.
6. **Verification (run before edit):**
   - `wc -l web/src/app/profile/page.tsx web/src/app/profile/settings/page.tsx` — confirm 1,898 + 5,187.
   - `find web/src/app/redesign -type f | wc -l` — confirm 41-45 files.
   - `grep -rn "isPreviewHost\|previewHost" web/src/app/redesign` — enumerate dev artifacts.
   - `grep -rn "_isRedesignPort\|3333" web/src/middleware.js` — confirm the host-check block still exists.
   - `grep "dev:3333" web/package.json` — confirm the script.
   - Check T4.8 status (redesign TS errors). If any TS error remains in `redesign/profile/`, defer T357 until T4.8 is closed.
   - Check `lockdown_self` RPC presence: `mcp__supabase__execute_sql "SELECT proname FROM pg_proc WHERE proname='lockdown_self'"`. If absent, S1 hasn't shipped — defer the PrivacyCard caller change but T357 itself can still ship (PrivacyCard keeps two-statement client flow for one cycle, then post-S1 a small follow-up commit migrates it). Tag the follow-up `[S8-T334-caller]`.
7. **Implementation steps (ordered):**
   1. Stage a fresh feature branch off main: `git checkout -b s8-t357-redesign-cutover`.
   2. Delete legacy `profile/page.tsx` + `profile/settings/page.tsx`. Run `next build` — expect import errors from any redirect shims, fix or delete those.
   3. Enumerate and delete redirect-shim subpages (run `grep -l "permanentRedirect\|redirect(" web/src/app/profile/**/page.{tsx,js}`). Preserve real UI pages (family, kids, activity if non-shim).
   4. Move the 45 redesign files in batches: components, sections, cards, top-level pages. After each batch, run `next build`.
   5. Strip `isPreviewHost`, `previewHost`, `preview` prop. Grep across the new `profile/` tree.
   6. Delete `redesign/_lib/`, `redesign/preview/`, `redesign/u/`, `redesign/_components/`, `redesign/_sections/`, `redesign/page.tsx`. Confirm `web/src/app/redesign/` is empty, then `rmdir`.
   7. Co-ship T334 PrivacyCard migration: replace the two-statement client flow (which previously did `update users set ... ; insert into audit_log ...`) with a single `await supabase.rpc('lockdown_self')`. Verify the RPC returns the same shape the UI consumed (typed as `{ success: boolean, locked_at: timestamptz }` per S1's draft).
   8. Run cross-file import sweep: `grep -rn "from ['\"]@/app/redesign" web/src` — every hit must be deleted or rewritten. The redesign tree is going away.
   9. Build, type-check, lint. Run `npm run build`. Zero errors.
   10. Coordinate with S3 to land the middleware edit in the same deploy window. Coordinate with shared package.json edit (drop `dev:3333`).
   11. Smoke test (see §10).
   12. Commit `[S8-T357] redesign cutover — delete legacy profile, move redesign tree, drop dev artifacts`.
8. **Coordination:**
   - S3 middleware edit: same deploy. Communicate via PR description.
   - S1 `lockdown_self()` migration: caller migration ships post-RPC.
   - S6 `/api/expert/vacation`: caller already exists in moved `ExpertProfileSection.tsx`; verify S6 has shipped.
   - T363 must ship same window if `PUBLIC_PROFILE_ENABLED` is going to flip; otherwise public-profile path stays kill-switched and ships separately.
9. **Risk + rollback:**
   - Risk: a moved file has a stale import to `@/app/redesign/_lib/demoUser` that wasn't caught. Mitigation: type-check before deploy.
   - Risk: middleware edit ships before S8 PR — `:3333` traffic 404s. Mitigation: land middleware edit AFTER S8 file moves are merged, OR same commit. PR description spells out the order.
   - Risk: `PUBLIC_PROFILE_ENABLED` flips before T363 + T330 + T331 + T359 — leaks public PII or surfaces incomplete UI. Mitigation: flag stays `false` until T363's gating items all ship; covered in T363 below.
   - Rollback: `git revert` the cutover commit; restore the redesign tree from git history; re-add `dev:3333` to package.json. Both legacy + redesign trees were live in parallel pre-cutover; reverting restores both.
10. **Smoke test:**
    - `/profile` renders the redesign profile shell (master/detail with section list).
    - `/profile/settings` renders the redesign settings cards.
    - `/profile/settings` privacy-lockdown click → `lockdown_self` RPC fires (Network tab) → user sees lockdown confirmation, audit_log row exists.
    - `/profile/family` (if preserved) renders family dashboard; if shimmed, deletion is clean.
    - All 11 cross-surface anchor links from Story / Bookmarks / Messages / Notifications still resolve to `/profile/settings#anchor`.
    - `next build` clean. `next lint` clean. No `redesign/` directory exists in `web/src/app/`.
    - `:3333` no longer exists as a dev port (post-S3 middleware edit).
11. **Commit tag:** `[S8-T357]`

---

### S8-T360 — CategoriesSection + MilestonesSection autonomous components

1. **Status:** 🟩 SHIPPED 2026-04-28 (commit `1827116`). Both sections refactored to expose pure presentational `CategoriesSection` / `MilestonesSection` exports (props in, JSX out, no supabase / fetch) plus `*Connected` wrappers that handle the data load. ProfileApp uses the connected variants; the iOS port (S9-T358) reads the pure exports. Preview-fixture branches dropped post-cutover. Locked-list "More milestones coming." replaced with present-state copy.
2. **Source:** TODO2 line 378 (`T357 unblocks T358 and T360`). Cited as a blocker by `Session_09_iOS_Adult.md` S9-T358 ("Blocked by S8 T357 stabilization + S8 T360 (CategoriesSection + MilestonesSection)") — without this item the iOS port has no spec-locked component shapes to mirror.
3. **Scope:** Build autonomous `CategoriesSection.tsx` + `MilestonesSection.tsx` components in `web/src/app/redesign/profile/_sections/` (post-T357 path: `web/src/app/profile/_sections/`) so the iOS port (S9-T358) has spec-locked component shapes to mirror. **Pure presentational components.** No internal data fetching — props in, JSX out.
4. **Files (in scope):**
   - NEW `web/src/app/redesign/profile/_sections/CategoriesSection.tsx` (post-T357 path: `web/src/app/profile/_sections/CategoriesSection.tsx`)
   - NEW `web/src/app/redesign/profile/_sections/MilestonesSection.tsx` (post-T357 path: `web/src/app/profile/_sections/MilestonesSection.tsx`)
   - Touch `web/src/app/redesign/profile/_components/ProfileApp.tsx` (or post-T357 the moved `ProfileApp.tsx`) to render at least one instance of each in the hero/below-fold composition so the components are exercised in the build.
5. **Files (cross-session):**
   - **S9-T358** mirrors both component shapes 1:1 in SwiftUI. The web file is the spec — the iOS port reads the props interface, the slot layout, and the empty-state copy.
6. **Acceptance:**
   - Both component files exist on disk under the agreed path.
   - Both are pure presentational components — zero `supabase` / `fetch` / network calls inside; props typed; no internal state beyond pure render.
   - Both are used at least once in the redesigned ProfilePage hero/below-fold composition (i.e., imported and rendered, not orphaned).
   - Tier label inside `CategoriesSection` and any rank/badge inside `MilestonesSection` render as plain text per `feedback_no_color_per_tier` — no hue tied to tier identity.
   - No user-facing timelines copy per `feedback_no_user_facing_timelines` — empty states describe present state.
7. **Verification:**
   - `ls web/src/app/redesign/profile/_sections/CategoriesSection.tsx web/src/app/redesign/profile/_sections/MilestonesSection.tsx` (or post-T357 paths) — both exist.
   - `grep -rn "from ['\"].*CategoriesSection['\"]" web/src/app/` — at least one import.
   - `grep -rn "from ['\"].*MilestonesSection['\"]" web/src/app/` — at least one import.
   - `grep -E "supabase|fetch\(" web/src/app/redesign/profile/_sections/CategoriesSection.tsx web/src/app/redesign/profile/_sections/MilestonesSection.tsx` — zero hits.
8. **Coordination:**
   - **S9-T358** waits on this file landing. The iOS implementer reads both files as the spec. Any prop rename here is a breaking change for S9 — coordinate via PR description.
9. **Risk + rollback:** Pure additive — both files are new. Rollback is `git rm` both files + revert the ProfileApp render edit.
10. **Commit tag:** `[S8-T360]`

---

### S8-T363 — Public profile redesign placeholder needs full rebuild

1. **Status:** 🟩 SHIPPED 2026-04-28 (commit `7dcb718`). The kill-switched `/u/[username]/page.tsx` already had a full implementation; T363 deltas applied: tier renders as plain text in muted ink (no color tint per `feedback_no_color_per_tier`), "Member since <Month YYYY>" appended to @username, `created_at` pulled off `public_profiles_v`. The redesign placeholder under `redesign/u/` was deleted by T357. Page stays gated by `PUBLIC_PROFILE_ENABLED=false` until T331 + S9-T359 land.
2. **Source:** TODO2 T363. Verified 2026-04-27 against `web/src/app/redesign/u/[username]/page.tsx` (84-line static placeholder) + `web/src/app/u/[username]/page.tsx:22` (`PUBLIC_PROFILE_ENABLED=false`).
3. **Decision lock — OWNER-ANSWERS Q4.13:** Build under `/redesign/u/[username]/` first; co-ship with T357 cutover. The redesign Hero adapts the user-own-profile shape for public-vs-own. **Why:** redesign tree already exists; building under `/redesign/u/` is the lowest-friction path. Co-shipping with T357 keeps all profile cutovers in one window. **Tier renders as plain text** per `feedback_no_color_per_tier`. **Cutover gating:** T330 (already shipped 'hidden' check at line 204-206 of `web/src/app/u/[username]/page.tsx`) AND T331 + T359 (iOS hidden audit, S9-owned) all in place before flipping `PUBLIC_PROFILE_ENABLED=true`.
4. **Files (in scope):**
   - `web/src/app/redesign/u/[username]/page.tsx` — replace 84-line placeholder with full implementation. Note: this file gets deleted by T357's redesign cleanup; the build target is therefore `web/src/app/u/[username]/page.tsx` post-T357. Build pre-T357 under `/redesign/u/` only if T357 is delayed.
   - `web/src/app/u/[username]/page.tsx` — current kill-switched shell. Replace with rebuilt page.
   - Any new components needed (`web/src/app/u/[username]/_components/PublicHero.tsx`, `_components/FollowList.tsx`, `_components/ReportSheet.tsx`, `_components/BlockButton.tsx`).
5. **Files (cross-session):**
   - **S5** owns `web/src/lib/reportReasons.js` — read-only. Use `PROFILE_REPORT_REASONS` export.
   - **S5** owns `/api/users/[id]/block/**` — public block action calls this.
   - **S5** owns `/api/reports/**` — public report submission posts here.
   - **S1** owns the `public_profiles_v` view. If the rebuild needs new whitelist columns (e.g., `is_pro` for the Q4.9 Pro-pride pill), S1 ships the view migration; S8 reads after.
   - **S9** owns iOS hidden audit (T359). T363 cannot flip the launch flag until S9 ships.
6. **Verification (run before edit):**
   - `cat web/src/app/u/[username]/page.tsx` — confirm `PUBLIC_PROFILE_ENABLED=false` at top, confirm T330's 'hidden' check at lines 204-206.
   - `cat web/src/app/redesign/u/[username]/page.tsx` — confirm 84-line placeholder.
   - `grep "PROFILE_REPORT_REASONS" web/src/lib/reportReasons.js` — confirm export exists.
   - `mcp__supabase__execute_sql "SELECT column_name FROM information_schema.columns WHERE table_name='public_profiles_v'"` — confirm view shape, decide if `is_pro` needs to be added (Q4.9).
   - `grep -rn "PUBLIC_PROFILE_ENABLED" web/src` — find every flag reference; document the flip plan.
   - Confirm T330 status (shipped per memory).
   - Confirm T331 status. Confirm S9 has T359 in flight or shipped.
7. **Implementation steps (ordered):**
   1. Build `_components/PublicHero.tsx` — display_name, @username, member-since (formatted from `users.created_at`), verification badge (from `is_verified_public_figure`), expert badge with org (from `expert_title` + `expert_organization`). Tier rendered as plain text in `vpInkMuted`.
   2. Build `_components/FollowList.tsx` — paginated followers/following lists with cursor-based pagination. 20 per page. Click-to-view-profile.
   3. Build `_components/ReportSheet.tsx` — open via "Report" button. Renders `PROFILE_REPORT_REASONS` from `lib/reportReasons`. POSTs to `/api/reports` with `target_type='profile'`, `target_id=<userId>`, `reason=<value>`, `note=<optional text>`. Confirms server response, closes sheet, toasts confirmation.
   4. Build `_components/BlockButton.tsx` — POSTs to `/api/users/[id]/block`. Shows confirmation modal first. On success, redirects to `/` and surfaces "User blocked" toast on home.
   5. Replace `u/[username]/page.tsx` body — fetch `public_profiles_v` row by `username`, compose Hero + FollowList tabs + Report + Block actions. Honor `profile_visibility='hidden'` early-return (T330 logic preserved). Honor `PUBLIC_PROFILE_ENABLED` flag at the top.
   6. Delete `redesign/u/[username]/page.tsx` (gets cleaned up in T357's redesign-tree purge anyway).
   7. Decide flag flip — see Coordination.
   8. Smoke test (see §10).
8. **Coordination:**
   - **Do NOT flip `PUBLIC_PROFILE_ENABLED=true` until:**
     - T330 web hidden check (already shipped per memory).
     - T331 (likely a public-profile-related preflight; verify against TODO2 if any S8 follow-up is implied).
     - T359 iOS hidden audit (S9-owned; ships when S9 lands the iOS profile redesign port).
   - Until those three are in place, the rebuilt page stays in code with `PUBLIC_PROFILE_ENABLED=false`. Owner can preview by overriding the env var in dev.
   - Co-ship with T357 if T357 is in the same deploy window. Otherwise build under `/redesign/u/[username]/` and rename when T357 lands.
9. **Risk + rollback:**
   - Risk: leaks PII for hidden-visibility users. Mitigation: T330's check is preserved verbatim at top of new page. Smoke test specifically against a `profile_visibility='hidden'` test user — must 404.
   - Risk: report sheet sends an invalid `reason` string. Mitigation: enum-driven dropdown, server-side `assertReportReason` validation.
   - Risk: block-from-public hits a user who's already blocked → 409. Mitigation: BlockButton checks current block state before showing button (or shows "Unblock" variant).
   - Risk: `is_pro` exposure (Q4.9) leaks plan_id. Mitigation: Q4.9 is locked at the view-derivation level; raw `plan_id` never reaches the client. If S1 hasn't shipped the view migration, the Pro-pride pill in CommentRow waits — that's S5's surface, not S8.
   - Rollback: keep `PUBLIC_PROFILE_ENABLED=false`. Page remains a placeholder.
10. **Smoke test:**
    - `/u/<existing-public-user>` renders Hero + Follow tabs + Report + Block.
    - `/u/<hidden-visibility-user>` 404s (or returns the same generic "user not found" copy as a non-existent username, no oracle).
    - Click Report → sheet opens → pick "Harassment" → submit → server returns 200 → toast → audit_log row.
    - Click Block on a not-yet-blocked user → confirm modal → confirm → POST → 200 → redirect home with "User blocked" toast.
    - Pagination on /followers (20 per page) loads next page on cursor.
    - Tier (Free/Pro/Family) renders as plain text in muted ink. NO color tint.
    - Expert badge with org renders only when `is_expert AND expert_title NOT NULL`.
11. **Commit tag:** `[S8-T363]`

---

### S8-T19 — Home feed preferences are decorative — DELETE the toggles

1. **Status:** 🟩 SHIPPED 2026-04-28 (commit `cf9adee`). The legacy toggle UI lived in `profile/settings/page.tsx` which T357 deleted entirely. The remaining ProfileApp `LinkOutSection` "Feed preferences" pointed at a route that no longer exists; that section dropped too. No DB writes happen for `users.metadata.feed.*` from any client surface.
2. **Source:** TODO2 T19. Verified 2026-04-27 against `web/src/app/profile/settings/page.tsx:2587-2600` (writes `users.metadata.feed.*` flags) + `web/src/app/page.tsx` (zero reads of those flags).
3. **Decision lock — OWNER-ANSWERS Q4.3:** **B — delete the toggles entirely.** Save-success toast that lies to the user is worse than no preferences UI. **Why:** decorative state is the kind of seam future agents drift on. Personalization ships when there's an actual personalization backend.
4. **Files (in scope):**
   - `web/src/app/profile/settings/page.tsx:2587-2600` — toggle UI block. Delete the entire card section, including the related state, effect handlers, and save call. Sweep imports for any types or helpers used only by this card.
   - Post-T357: same toggle UI lives in the redesign tree at `web/src/app/redesign/profile/settings/_cards/` — confirm via grep, delete from there too. After T357 cutover, the card lives at `web/src/app/profile/settings/_cards/`.
5. **Files (cross-session):**
   - **S7** owns `web/src/app/page.tsx`. Per audit, `page.tsx` has zero reads of `metadata.feed.*` — there's nothing for S7 to remove. S7's verification step: `grep "metadata.feed" web/src/app/page.tsx` — must return zero. Coordinate the audit, then ship S8's deletion.
6. **Verification:**
   - `grep -n "metadata.feed\|feed.cats\|feed.kidSafe\|feed.minScore\|feed.hideLowCred\|feed.showBreaking\|feed.showTrending\|feed.showRecommended" web/src/app/profile/settings/page.tsx` — find all references in settings.
   - `grep -rn "metadata.feed" web/src/app/page.tsx` — must return zero (S7's job; verify before S8 ships so coordination is clean).
   - `grep -rn "metadata.feed" web/src` — find any other reader; if found, surface to the owning session.
7. **Implementation steps:**
   1. Delete the toggle card UI block (lines ~2587-2600) and any related state (`useState`, `useEffect`, save handler, toast call).
   2. Delete imports that become orphan after the deletion.
   3. Remove any DB write call that updates `users.metadata.feed.*` — this is dead state; removing the writer is the right call. The DB column stays (don't drop schema; that's S1's call), but no client surface writes to it.
   4. Run `next build`, lint, type-check.
   5. Sweep the redesign tree for the same UI block — if it was ported to a `_cards/*Card.tsx`, delete it there too.
   6. Smoke test.
8. **Coordination:**
   - S7 confirms zero reads in `page.tsx` before S8 ships.
   - S1 may want to follow up with a migration that nulls/drops `users.metadata.feed.*` — flag for S1, not S8's job.
9. **Risk + rollback:**
   - Risk: a preview / dev tool reads the flags. Mitigation: grep across `web/src` returns zero non-settings hits.
   - Risk: an S8 commit deletes the toggle UI but leaves the save-handler firing dead. Mitigation: implementation step 1 explicitly removes the handler.
   - Rollback: revert the commit; the card returns to its previous decorative state (still lying to the user, but at least visible).
10. **Smoke test:**
    - `/profile/settings` no longer shows the home-feed-preferences card.
    - `next build` clean.
    - `grep "metadata.feed" web/src` returns zero (or only S1-managed schema references).
11. **Commit tag:** `[S8-T19]`

---

### S8-T49 — Username editable contract (web copy + content lockout coordination)

1. **Status:** 🟥 BLOCKED 2026-04-28. `change_username` RPC is NOT installed (`SELECT proname FROM pg_proc WHERE proname='change_username'` returns empty). `users.username_changed_at` column does NOT exist (`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='username_changed_at'` returns empty). Both gates are S1-owned. S8 ships the caller (copy + handler) the moment the RPC + column land.
2. **Source:** TODO2 T49. Verified 2026-04-27 against `web/src/app/profile/settings/page.tsx:1716-1720` (web copy: "Usernames cannot be changed.") + iOS counterpart in `VerityPost/VerityPost/SettingsView.swift:1290-1294` (iOS editable, S9-owned).
3. **Decision lock — OWNER-ANSWERS Q4.6:** **B — changeable, with rate limit (once per 90 days), audit log every change with prior + new username for ban-evasion review.** **Why:** industry norm (Reddit, Twitter, Instagram). Immutability is hostile UX for a typo or rebrand. Free-edit without audit trail is a ban-evasion gift. 90-day rate limit balances UX with abuse pressure.
4. **Files (in scope):**
   - `web/src/app/profile/settings/page.tsx:1716-1720` — replace "Usernames cannot be changed." copy with editable field; show countdown to next eligible edit if within cooldown ("You can change your username again in N days"). Validation copy: "Username must be 3-20 chars, letters/numbers/underscore."
   - Post-T357: equivalent UI lives at `web/src/app/profile/settings/_cards/IdentityCard.tsx` (moved from redesign). Update there.
5. **Files (cross-session):**
   - **S1** owns the RPC. Required: `change_username(p_new_username text)` SECURITY DEFINER, validates the cooldown (`SELECT username_changed_at FROM users WHERE id=auth.uid()`; reject if `< now() - interval '90 days'`), validates uniqueness via existing UNIQUE constraint, validates pattern, writes prior+new to `audit_log` with action `username_change` and metadata `{prior, new}`, updates `users.username` and `users.username_changed_at`. Returns `{success, next_eligible_at}`. Migration also adds the `users.username_changed_at` column if missing.
   - **S9** owns the iOS slice — `SettingsView.swift:1290-1294` — same RPC call, same cooldown UX. Coordinate via the shared RPC contract; S9 reads this section.
   - **S6** does NOT own this — username admin override (if needed) lives in admin/users; not S8.
6. **Verification:**
   - `cat web/src/app/profile/settings/page.tsx` lines 1700-1730 — confirm current copy.
   - `mcp__supabase__execute_sql "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='username_changed_at'"` — confirm column existence; if absent, S1 adds it.
   - `mcp__supabase__execute_sql "SELECT proname FROM pg_proc WHERE proname='change_username'"` — confirm RPC presence; if absent, wait for S1.
7. **Implementation steps:**
   1. Wait for S1 to ship `change_username` RPC + `username_changed_at` column.
   2. Replace the "Usernames cannot be changed." copy with an editable field.
   3. Wire the change handler: read current username, allow inline edit, show "Save" + "Cancel" buttons.
   4. On save, call `supabase.rpc('change_username', { p_new_username })`.
   5. Handle responses:
      - `{success: true, next_eligible_at}` → toast "Username updated. You can change it again on <date>."
      - error code `username_taken` → inline error "Username taken. Try another."
      - error code `cooldown_active` → inline error "You can change your username again in N days."
      - error code `invalid_pattern` → inline error "Username must be 3-20 chars, letters/numbers/underscore."
   6. Read `users.username_changed_at` on settings load; if `now() - username_changed_at < 90d`, render the field disabled with "You can change your username again in N days" copy.
   7. Smoke test.
8. **Coordination:**
   - S1 RPC + migration (blocks this item).
   - S9 iOS slice ships independently against the same RPC.
9. **Risk + rollback:**
   - Risk: a username taken between availability check and save. Mitigation: server-side UNIQUE constraint catches it; UX shows inline error.
   - Risk: an admin-driven rename (different code path) doesn't update `username_changed_at`. Mitigation: S1's migration handles it OR audit-log review covers admin renames separately.
   - Rollback: revert the copy change (back to "Usernames cannot be changed."); RPC stays installed unused.
10. **Smoke test:**
    - User changes username → success → toast → next-eligible-at shown.
    - User attempts change within 90d → blocked with cooldown message.
    - User picks a taken username → inline error.
    - User picks "abc" (invalid) → inline error.
    - audit_log row exists with prior + new.
11. **Commit tag:** `[S8-T49]`

---

### S8-T79 — Settings split into 11 sub-routes — SKIP

1. **Status:** ⏭ SKIPPED 2026-04-28 (per session decision-lock). T357 cutover replaced the monolith with the redesign card-based shell; splitting the now-deleted monolith into sub-routes would have been wasted work.
2. **Source:** TODO2 T79. Verified 2026-04-27: `web/src/app/profile/settings/page.tsx` is currently 5,187 lines; 11 sub-route stub directories exist under `web/src/app/profile/settings/`.
3. **Decision lock — best-practice default:** SKIP. The redesign cutover (T357) replaces the monolith with a card-based shell. Splitting the legacy monolith into 11 sub-routes only to delete the result one cycle later is wasted work. **Why:** the redesign tree already does the equivalent IA shift; doing both is parallel-path drift.
4. **Files (in scope):** None.
5. **Files (cross-session):** None.
6. **Verification:** Confirm T357 is on the near roadmap. If T357 is deferred more than 2 cycles, revisit this skip.
7. **Implementation steps:** None.
8. **Coordination:** Document the skip in CHANGELOG-AUTONOMOUS so future agents don't re-pick it.
9. **Risk + rollback:** Zero (no edit).
10. **Smoke test:** N/A.
11. **Commit tag:** N/A.

---

### S8-A98 — ProfilePage uses ADMIN palette + admin component wrappers — BUNDLED INTO T357

1. **Status:** 🟩 SHIPPED inside T357 (commit `0f62802`). The legacy `profile/page.tsx` that imported the ADMIN_C palette + admin-domain Button/Badge/Spinner/PageSection wrappers was deleted; the new `profile/page.tsx` (moved from `redesign/profile/page.tsx`) uses the redesign-native palette tokens exclusively. Grep confirmation: `grep "ADMIN_C" web/src/app/profile` returns zero.
2. **Source:** TODO A98. Verified 2026-04-27: `web/src/app/profile/page.tsx:14-34` imports `ADMIN_C` palette + admin `Button`/`Badge`/`Spinner`/`PageSection` components.
3. **Decision lock — best-practice default:** BUNDLE INTO T357 (the real fix). Interim swap to consumer chrome is wasted effort because T357 deletes `profile/page.tsx` outright and the redesign tree (which mounts at `:3333`) already uses consumer chrome (`vpInk*` palette tokens, redesign-native components).
4. **Files (in scope):** None standalone — the legacy `profile/page.tsx` gets deleted by T357.
5. **Files (cross-session):** None.
6. **Verification:**
   - Confirm `web/src/app/redesign/profile/page.tsx` does NOT use `ADMIN_C` (it shouldn't — it's the redesign).
   - `grep "ADMIN_C" web/src/app/redesign/profile/page.tsx` — must return zero.
   - If the redesign accidentally pulled `ADMIN_C` (drift), surface that as a sub-task inside T357 implementation.
7. **Implementation steps:** Handled inside T357. No standalone work.
8. **Coordination:** None.
9. **Risk + rollback:** N/A.
10. **Smoke test:** Post-T357, `/profile` renders with consumer chrome (no admin palette).
11. **Commit tag:** Folded into `[S8-T357]`.

---

### S8-A47-profile — Banned timeline copy purge in profile + settings + kids

1. **Status:** 🟩 SHIPPED 2026-04-28 (commit `73ae4a0`). All settings/page.tsx occurrences vanished with T357's monolith deletion. The two kids/page.tsx occurrences ("Coming soon to the App Store" body + button label) replaced with present-state copy: "The Verity Kids iOS app is not yet available. Pair codes from this page link the account once the app is installed." / "App not yet available". Plus `[S8-T360]` swept the `MilestonesSection` "More milestones coming." soft-timeline. Final grep across `web/src/app/profile/` for the banned-phrase regex returns zero non-comment hits.
2. **Source:** TODO A47. Verified 2026-04-27 against:
   - `web/src/app/profile/settings/page.tsx:3186, 3192, 3199, 4837, 4839, 4915` (e.g., "Coming soon — backend wiring")
   - `web/src/app/profile/kids/page.tsx:694, 735`
3. **Decision lock — `feedback_no_user_facing_timelines`:** Strip every banned phrase. Rewrite to either describe **present state** OR render a clean **unavailable empty state**. No softer-timeline replacement ("Check back later" is also banned). **Why:** owner-locked rule, App Store reviewer surfaces, paid/legal-adjacent screens.
4. **Files (in scope):**
   - `web/src/app/profile/settings/page.tsx` — lines 3186, 3192, 3199, 4837, 4839, 4915 (and grep for any new occurrences).
   - `web/src/app/profile/kids/page.tsx` — lines 694, 735 (and grep).
   - Post-T357: same copy may live in moved `_cards/*Card.tsx` files; sweep again.
5. **Files (cross-session):**
   - S7 owns the cross-cutting purge of `UnderConstruction.tsx` and recap copy. Not S8's edits.
   - S9 owns the iOS slice (`AlertsView.swift:318` etc.). Not S8.
6. **Verification:**
   - For each line above, open the file at that line, read the surrounding 5 lines of context.
   - `grep -n "coming soon\|check back soon\|we're working on it\|actively working\|finishing the .* polish\|launches\? \(soon\|next\|in\)\|will be available\|in a future pass" web/src/app/profile/` — exhaustive sweep.
7. **Implementation steps:**
   1. For each occurrence, decide: is the feature present-state-describable, or unavailable?
   2. **Present-state rewrite example:** "Coming soon — backend wiring" → "Email notifications are sent for security events only (sign-in, password change, account deletion)." (per memory `project_email_notifications_scope`).
   3. **Unavailable-state rewrite example:** "Subscription manager coming soon" → "This feature is unavailable on web." (or remove the section entirely if it's structural-only).
   4. For `profile/kids/page.tsx:694, 735` — the kids surface needs careful copy. If the feature genuinely doesn't ship pre-launch, render an empty card with "Family achievements are calculated daily and will appear here once your family has activity." (this is present-tense and accurate per E24).
   5. Sweep redesign tree (`_cards/*Card.tsx`) for the same patterns post-T357 cutover.
   6. Add a CI lint rule (S7's job — coordinate). Per A47 main item, the regex is documented in TODO_READ_ONLY_HISTORICAL.md.
   7. Smoke test.
8. **Coordination:**
   - CI lint rule lands in S7 or wherever lint config lives.
9. **Risk + rollback:**
   - Risk: present-state rewrite drifts from actual behavior (e.g., copy says "calculated daily" but cron isn't actually running). Mitigation: verify each copy edit against actual code/cron behavior before shipping.
   - Rollback: restore prior copy (still violates the rule but is reversible).
10. **Smoke test:**
    - Grep-after-ship: `grep -n "coming soon\|check back soon\|we're working on it" web/src/app/profile/` returns zero.
    - Each modified screen renders without breaking.
11. **Commit tag:** `[S8-A47]`

---

### S8-§A1-caller — `/api/expert/vacation` call site verification

1. **Status:** 🟨 WAITING on S6 ship of `/api/expert/vacation/route.ts`. Current `_sections/ExpertProfileSection.tsx:121` call survives T357 unchanged. Verify after S6 lands.
2. **Source:** PotentialCleanup §A1. Verified 2026-04-27 against `web/src/app/redesign/profile/_sections/ExpertProfileSection.tsx:121` — `await fetch('/api/expert/vacation', { ... })`. The route does NOT currently exist (`web/src/app/api/expert/` has only `apply/`, `ask/`, `queue/`, `back-channel/`).
3. **Decision lock — best-practice default:** S6 builds the route handler with the documented behavior (set/unset `expert_vacation` on the user/expert profile). S8 verifies the call site shape matches what S6 ships. **Why:** keeping the feature is the right call (vacation toggle is a real expert affordance); deleting the call site is wasted work since S6 is building anyway.
4. **Files (in scope):**
   - `web/src/app/redesign/profile/_sections/ExpertProfileSection.tsx` (post-T357: `web/src/app/profile/_sections/ExpertProfileSection.tsx`) — verify lines 121-ish call site shape (HTTP method, body shape, response handling) matches S6's route signature.
   - Comment cleanup at line 3 (`/* the existing /api/expert/apply + /api/expert/vacation endpoints */`) — once route ships, comment is accurate; no edit needed.
5. **Files (cross-session):**
   - **S6** owns `/api/expert/vacation/route.ts` build. S6 ships first; S8 verifies after.
6. **Verification (post-S6 ship):**
   - `cat web/src/app/api/expert/vacation/route.ts` — confirm method (likely POST) + body shape (likely `{ active: boolean }`).
   - Compare against the call site at `ExpertProfileSection.tsx:121` — fix any shape mismatch.
7. **Implementation steps:**
   1. Wait for S6 to ship `/api/expert/vacation`.
   2. Read S6's route handler.
   3. If call-site shape mismatches, fix the call site to match. If it matches, no edit needed; confirm and close.
8. **Coordination:** S6 ships first.
9. **Risk + rollback:** Low. Route 404s today, so any shipped state is improvement.
10. **Smoke test:**
    - Expert user clicks vacation toggle → POST to `/api/expert/vacation` → 200 → DB `users.expert_vacation` flips → UI reflects new state.
11. **Commit tag:** `[S8-A1]` (only if any caller edit needed)

---

### S8-§I7 — GPC ("Do Not Sell") settings handler

1. **Status:** 🟥 BLOCKED 2026-04-28. `users.gpc_opt_out` column does NOT exist (verified via information_schema). Migration is S1-owned. S8 ships the toggle + copy the moment the column lands.
2. **Source:** PotentialCleanup §I7. Activates on AdSense rollout per audit.
3. **Decision lock — best-practice default:** Settings toggle for "Do Not Sell" preference + automatic GPC header detection. Persists user choice in `users.gpc_opt_out=true`. **Why:** CCPA / GPC compliance is a launch-time requirement; handling it in settings (user-facing toggle) plus automatic GPC header detection (browser-native signal) is industry standard (CNN, NYT, Substack do this).
4. **Files (in scope):**
   - `web/src/app/profile/settings/page.tsx` — privacy section. Add a "Do Not Sell My Personal Information" toggle with explanatory copy. On change, write `users.gpc_opt_out` via existing settings save handler.
   - Post-T357: same toggle in `_cards/PrivacyCard.tsx`.
5. **Files (cross-session):**
   - **S7** owns the footer link ("Do Not Sell My Personal Information") that links to `/profile/settings#privacy` (or `/dnt-info` if owner wants a separate explainer page; default to anchor link).
   - **S1** owns the migration to add `users.gpc_opt_out boolean default false` if not present.
   - **S6 / S7** owns the layout-level GPC header parsing — `Sec-GPC: 1` request header from browser → server-side flips a session flag → ad-targeting code reads flag.
6. **Verification:**
   - `mcp__supabase__execute_sql "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='gpc_opt_out'"` — if absent, defer until S1 migration.
   - Identify where the existing settings save handler writes to `users` — match the pattern.
7. **Implementation steps:**
   1. Wait for S1 to add `users.gpc_opt_out` column.
   2. Add the toggle to the privacy section of settings.
   3. Write copy: "When enabled, Verity Post will treat your data as 'Do Not Sell or Share' under CCPA. We will also honor the Global Privacy Control browser signal automatically."
   4. Wire to settings save handler.
   5. Smoke test.
8. **Coordination:**
   - S1 column migration.
   - S7 footer link.
   - S6/S7 server-side GPC header parsing (separate from S8's surface).
9. **Risk + rollback:** Low. Toggle is independent; surface is settings only.
10. **Smoke test:**
    - User toggles "Do Not Sell" on → save → DB `users.gpc_opt_out=true`.
    - User toggles off → DB `users.gpc_opt_out=false`.
11. **Commit tag:** `[S8-I7]`

---

### S8-E18 — OpenDyslexic toggle wired

1. **Status:** 🟥 BLOCKED 2026-04-28. `users.dyslexic_font` column does NOT exist (verified via information_schema). Migration is S1-owned; `@font-face` declaration is S7-owned. S8 wires the toggle once both land.
2. **Source:** PotentialCleanup E18. Verified 2026-04-27 against `/admin/reader/page.tsx:35` (admin declares the setting; no @font-face wired).
3. **Decision lock — best-practice default:** Wire `@font-face` in S7's layout (`web/src/app/layout.js`) + conditional class on `<body>` root via user setting fetched in settings layout. Toggle in settings reads from `users.dyslexic_font` (or `users.metadata.a11y.dyslexic`). When enabled, a `body.font-dyslexic` class loads OpenDyslexic over the default serif/sans stacks.
4. **Files (in scope):**
   - `web/src/app/profile/settings/page.tsx` accessibility section — add the toggle (or wire existing toggle if already declared).
   - Post-T357: lives in `_cards/AccessibilityCard.tsx` or the relevant card.
5. **Files (cross-session):**
   - **S7** owns `web/src/app/layout.js` — adds `@font-face { font-family: OpenDyslexic; src: url(/fonts/opendyslexic.woff2) }` and `<body className={user.dyslexic_font ? 'font-dyslexic' : ''}>`. Public OpenDyslexic webfont licensed for redistribution.
   - **S6** owns `/admin/reader/page.tsx:35` (admin-declared setting). Only needs to align if admin lets ops toggle it on or off; no S8 edit.
   - **S1** owns the column migration if `users.dyslexic_font` doesn't exist (it may live in `users.metadata` jsonb instead — verify and align).
6. **Verification:**
   - `cat web/src/app/admin/reader/page.tsx` line 35 — confirm declaration.
   - Identify where the user-settings save handler writes; align the new toggle.
   - Confirm font asset path; if `/public/fonts/opendyslexic.woff2` doesn't exist, S7 adds it.
7. **Implementation steps:**
   1. Coordinate with S7 to land `@font-face` + body class.
   2. Add the toggle to settings; persist on `users.dyslexic_font` (or jsonb path).
   3. The body class flip happens at S7's render (server reads user.dyslexic_font in layout).
   4. Smoke test.
8. **Coordination:** S7 layout edit; S1 column (if needed).
9. **Risk + rollback:** Low. Font swap is reversible.
10. **Smoke test:**
    - Toggle on → reload → page renders in OpenDyslexic.
    - Toggle off → reload → page renders in default font.
11. **Commit tag:** `[S8-E18]`

---

### S8-E19 — High-contrast mode wired

1. **Status:** 🟥 BLOCKED 2026-04-28. `users.high_contrast` column does NOT exist (verified via information_schema). Migration is S1-owned; CSS variable overrides are S7-owned. S8 wires the toggle once both land.
2. **Source:** PotentialCleanup E19. Verified 2026-04-27 against `profile/settings/page.tsx:3098` (admin-declared; palette-swap CSS not wired).
3. **Decision lock — best-practice default:** Wire CSS variables for a high-contrast palette + conditional class on `<body>` root via user setting. When `users.high_contrast=true`, `body.high-contrast` class swaps `--vp-ink`, `--vp-ink-soft`, `--vp-ink-muted`, `--vp-bg`, `--vp-accent`, `--vp-danger` to a high-contrast variant (max-contrast text on max-contrast backgrounds; WCAG AAA palette).
4. **Files (in scope):**
   - `web/src/app/profile/settings/page.tsx:3098` and surrounding accessibility section — wire the toggle to persist `users.high_contrast`.
   - Post-T357: lives in `_cards/AccessibilityCard.tsx`.
5. **Files (cross-session):**
   - **S7** owns `web/src/app/layout.js` (or globals.css). Adds the `body.high-contrast` CSS variable overrides.
   - **S1** column migration if needed.
6. **Verification:**
   - `cat web/src/app/profile/settings/page.tsx` line 3098 — confirm declaration.
   - Audit the redesign palette tokens (`vpInk*`, etc.) and design the high-contrast variant in collaboration with S7.
7. **Implementation steps:**
   1. Coordinate with S7 to define and ship the high-contrast palette tokens.
   2. Wire toggle to persist `users.high_contrast`.
   3. Smoke test.
8. **Coordination:** S7 CSS edit; S1 column.
9. **Risk + rollback:** Low. Palette swap is reversible.
10. **Smoke test:**
    - Toggle on → reload → palette shifts to high-contrast variant.
    - Toggle off → reload → palette returns to default.
    - Confirm WCAG AAA contrast on key surfaces.
11. **Commit tag:** `[S8-E19]`

---

### S8-E24 — Family achievements surface in `/profile/family/`

1. **Status:** 🟩 ALREADY SHIPPED. Verified 2026-04-28 against current `web/src/app/profile/family/page.tsx:50-132`: the page already loads `/api/family/achievements` (gated by `family.shared_achievements` or `kids.achievements.view` permission) and renders earned + in-progress achievements. RLS confirmed (`family_achievement_progress_select_owner`). No further S8 edit needed — the gap audit cited was stale per `feedback_verify_audit_findings_before_acting`.
2. **Source:** PotentialCleanup E24. Verified 2026-04-27: `family_achievements` + `family_achievement_progress` tables computed daily by cron (per audit) but never surfaced in any UI.
3. **Decision lock — best-practice default:** Render in `web/src/app/profile/family/` (Family dashboard for parent users). Pull `family_achievement_progress` for the current parent, render a list of completed and in-progress achievements. **Why:** the data exists; surfacing it closes a wired-but-not-rendered gap and adds a soft retention loop for family-plan parents.
4. **Files (in scope):**
   - `web/src/app/profile/family/page.tsx` (or current family dashboard file) — add an "Achievements" section that fetches from `family_achievements` joined with `family_achievement_progress`.
   - Post-T357: family dashboard moves into the redesign IA; the section may live as `_sections/FamilyAchievementsSection.tsx`.
5. **Files (cross-session):**
   - **S1** owns the underlying tables. Confirm RLS allows parent to read their own family's rows.
   - **S2** owns the daily cron that computes progress. No S8 edit.
6. **Verification:**
   - `mcp__supabase__execute_sql "SELECT * FROM family_achievements LIMIT 1"` — confirm shape.
   - `mcp__supabase__execute_sql "SELECT * FROM family_achievement_progress LIMIT 1"` — confirm shape.
   - Confirm RLS via `pg_policy` query on both tables.
7. **Implementation steps:**
   1. Read the table shapes; design the section UI.
   2. Server-side fetch in the family page.
   3. Render: completed achievements (with date), in-progress achievements (with progress bar), no-data empty state ("Family achievements are calculated daily and will appear here once your family has activity.").
   4. Smoke test.
8. **Coordination:** S1 RLS confirmation; S2 cron behavior (read-only).
9. **Risk + rollback:** Low. Read-only surface.
10. **Smoke test:**
    - Parent with active family + completed achievements → section renders the achievements.
    - Parent with no progress yet → empty-state copy.
    - Non-parent (no family plan) → section doesn't render.
11. **Commit tag:** `[S8-E24]`

---

### S8-T308 — Admin manual-sync downgrade `frozen_at` — VERIFY-ONLY (S6-owned)

1. **Status:** 🟩 VERIFIED 2026-04-28. S6 shipped commit `25db3a2` `[S6-T308] manual-sync downgrade — clear frozen_at + capture in audit (Q4.7)` per Q4.7 lock. AccountStateBanner copy already keys off `is_frozen` not the prior plan_id, so a downgraded user no longer surfaces the frozen banner once `frozen_at` clears. No S8 edit needed.
2. **Source:** TODO2 T308. Verified 2026-04-27 against `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js:100-150`.
3. **Decision lock — OWNER-ANSWERS Q4.7:** **A — clear `frozen_at` on admin-driven downgrade.** **Why:** frozen+free is logically incoherent. Admin downgrade is an explicit action; the freeze that triggered the gate doesn't survive plan-loss.
4. **Files (in scope):** None standalone. The fix is in a S6-owned route file.
5. **Files (cross-session):**
   - **S6** owns `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js`. S6 makes the edit (clear `frozen_at` on downgrade).
6. **Verification (post-S6 ship):**
   - Confirm S6's commit hash.
   - Verify in profile UI that a downgraded user no longer surfaces a frozen-state banner.
   - Verify `AccountStateBanner` priority: post-S6, a downgraded-and-was-frozen user should render the "free" banner-equivalent (or no banner), not the "frozen" variant.
7. **Implementation steps:** None standalone.
8. **Coordination:** S6 ships first.
9. **Risk + rollback:** N/A.
10. **Smoke test (post-S6):**
    - Admin downgrades a frozen user → DB `frozen_at` is NULL → profile UI renders no frozen banner.
11. **Commit tag:** N/A standalone.

---

### S8-T346 — Freeze scope (content lockout) — VERIFY-ONLY (S5/S1-owned)

1. **Status:** 🟨 WAITING on S5 + S1 ship of `frozen_at IS NULL` write-path gates + RLS migration. AccountStateBanner copy is already in place for the frozen-state surface. Re-verify when S5/S1 land.
2. **Source:** TODO2 T346. Verified 2026-04-27.
3. **Decision lock — OWNER-ANSWERS Q4.8:** **B — content lockout.** Add `frozen_at IS NULL` to comment INSERT RLS, vote routes, follow routes, message routes. **Why:** if a user's payment is disputed enough to trigger a freeze, they shouldn't be active in community.
4. **Files (in scope):** None standalone.
5. **Files (cross-session):**
   - **S5** owns `web/src/app/api/comments/`, `web/src/app/api/votes/` (or `/api/comments/[id]/upvote`, `/downvote`), `web/src/app/api/follows/`, `web/src/app/api/messages/`. Adds explicit `frozen_at IS NULL` checks at write paths.
   - **S1** owns the RLS migration that adds the same check at the DB layer.
6. **Verification (post-S5/S1 ship):**
   - Confirm RLS policies via `mcp__supabase__execute_sql "SELECT * FROM pg_policy WHERE tablename IN ('comments','votes','follows','messages')"`.
   - Verify in profile UI that a frozen user does NOT see a stub "comment" / "follow" / "message" button on their own profile or in the social tabs that's enabled but server-rejects (UX should pre-render disabled or a banner).
   - **S8's specific surface check:** `/profile` for a frozen user shows the AccountStateBanner with frozen-state copy ("Your account is frozen. Comments, votes, follows, and messages are disabled until your billing is resolved."). The banner already exists; verify copy matches the new content-lockout scope.
7. **Implementation steps:**
   1. Wait for S5 + S1 ship.
   2. In `_components/ProfileApp.tsx` (post-T357), confirm AccountStateBanner copy reflects content-lockout scope.
   3. If a profile-side action button (e.g., follow button on own profile) doesn't pre-disable for frozen users, add the gate. Most action buttons live in S5's components, not S8.
8. **Coordination:** S5 + S1 ship first.
9. **Risk + rollback:** Low — verify-only.
10. **Smoke test (post-S5/S1):**
    - Frozen user attempts to comment → 403 from API + UI shows banner.
    - Frozen user's profile page shows accurate banner copy.
11. **Commit tag:** `[S8-T346]` if any S8-side copy edit; else N/A.

---

## 2. Out of scope (this session)

- **Admin pages (S6)** — including `/admin/users`, `/admin/subscriptions`, `/admin/reader`, expert vacation route build.
- **Social surfaces (S5)** — comments, votes, follows, DMs, notifications, blocked users API. CommentRow Pro-pride pill (Q4.9) is S5's surface.
- **Login / auth pages (S3)** — `/login`, `/signup`, `/forgot-password`, `/verify-email`, middleware.
- **iOS profile views (S9)** — including T49 iOS slice, T358 iOS redesign port, T359 iOS hidden audit.
- **Public-non-profile pages (S7)** — home, story, browse, leaderboard, footer, layout (including the `@font-face` declaration for E18, the high-contrast CSS variable definitions for E19, the GPC footer link for I7).
- **DB migrations / RPCs (S1)** — `lockdown_self()`, `change_username()`, `users.username_changed_at` column, `users.gpc_opt_out` column, `users.dyslexic_font` column, `users.high_contrast` column, RLS on `family_achievements*`.
- **Cron (S2)** — daily achievement progress computation.
- **Pipeline / AI / Newsroom (S6)** — including AR1 multi-week pipeline rewrite.
- **Kids iOS app (S10)** — including kids waitlist + pair API.

---

## 3. Cross-session dependency map

| S8 item | Waits on | Why |
|---|---|---|
| T357 | T4.8 (TS errors) | TypeScript must be green before cutover |
| T357 PrivacyCard caller | S1 `lockdown_self()` migration | RPC must exist before client calls it |
| T357 middleware drop | S3 middleware edit | S3 owns the file; coordinate same deploy |
| T357 package.json | Shared | Whichever session writes that day |
| T363 launch flag flip | T330 (web hidden — shipped) + T331 + T359 (S9 iOS) | Public PII gating |
| T363 view shape | S1 `public_profiles_v` view migration if `is_pro` needed | Q4.9 cross-cuts |
| T49 username edit | S1 `change_username` RPC + `username_changed_at` column | RPC + column gate |
| T49 iOS slice | S9 | Cross-platform parity |
| §A1 caller | S6 `/api/expert/vacation` route build | Endpoint must exist |
| §I7 GPC toggle | S1 `users.gpc_opt_out` column + S7 footer link + S7 server-side header parse | Surface depends on column + ecosystem |
| E18 OpenDyslexic | S7 `@font-face` in layout + S1 column | Font + setting |
| E19 High-contrast | S7 CSS variables + S1 column | Palette + setting |
| E24 Family achievements | S1 RLS confirmation + S2 cron behavior | Read-only surface |
| T308 verify | S6 fix | Fix is in S6-owned file |
| T346 verify | S5 + S1 fix | RLS + write-path enforcement |

---

## 4. Final completion checklist

Run before declaring S8 done. Each line is a deliberate gate.

### 4.1 Code-level

- [ ] Legacy `web/src/app/profile/page.tsx` (1,898 lines) DELETED.
- [ ] Legacy `web/src/app/profile/settings/page.tsx` (5,187 lines) DELETED.
- [ ] All redirect-shim subpages under `web/src/app/profile/` DELETED.
- [ ] `web/src/app/redesign/` directory does NOT exist (`ls web/src/app/redesign` returns "No such file").
- [ ] All 45 redesign files moved into `web/src/app/profile/` and rendering on `:3000`.
- [ ] `isPreviewHost`, `previewHost`, `preview` prop plumbing fully stripped (`grep -rn "isPreviewHost\|previewHost" web/src/app/profile` returns zero).
- [ ] `_lib/demoUser.ts` deleted; no callers remain.
- [ ] PrivacyCard uses `lockdown_self()` RPC (single statement) — assuming S1 has shipped.
- [ ] `/profile/u/[username]/` (post-rename) renders the rebuilt public profile when `PUBLIC_PROFILE_ENABLED=true` (or the gate kept false until S9 lands).
- [ ] T19 home-feed-preferences toggle UI deleted from settings; no DB writes happen for feed.* metadata.
- [ ] T49 username field is editable (post S1 RPC); cooldown UX honors 90d window.
- [ ] T79 SKIPPED (documented in CHANGELOG).

### 4.2 Banned-copy purge

- [ ] `grep -in "coming soon\|check back soon\|we're working on it\|actively working\|finishing the .* polish\|launches\? \(soon\|next\|in\)\|will be available\|in a future pass" web/src/app/profile/` returns zero non-comment hits.
- [ ] `grep -in "coming soon\|check back soon" web/src/app/redesign/` returns zero (and the directory should already be deleted).
- [ ] Each replaced copy describes present state OR renders a clean unavailable state.

### 4.3 No-color-per-tier

- [ ] Tier (Free/Pro/Family) renders as plain text in `vpInkMuted` everywhere in profile + public profile.
- [ ] No CSS class, hex, or token applies a per-tier hue.
- [ ] PlanSection / Hero / public profile Hero / settings → all checked.

### 4.4 Coordination ground-truth

- [ ] S3 middleware edit shipped same deploy as T357 (`:3333` block gone).
- [ ] `dev:3333` removed from `web/package.json`.
- [ ] S1 has shipped `lockdown_self()`, `change_username()`, and any required column migrations.
- [ ] S6 has shipped `/api/expert/vacation` and admin-manual-sync downgrade clears `frozen_at`.
- [ ] S5 has shipped freeze-aware comment INSERT / vote / follow / message gates AND the public block / report endpoints used by T363.
- [ ] S7 has shipped `@font-face`, high-contrast CSS variables, GPC footer link, GPC server-side header parsing, home-feed `metadata.feed.*` zero-reads.
- [ ] S9 iOS T49 username edit + T359 hidden audit + T358 redesign port shipped before `PUBLIC_PROFILE_ENABLED=true`.

### 4.5 Smoke tests passing

- [ ] `/profile` renders the redesign shell without errors.
- [ ] `/profile/settings` renders all cards; PrivacyCard `lockdown_self` flow works end-to-end (or two-statement fallback if S1 deferred).
- [ ] `/u/<username>` renders the rebuilt page (or kill-switched placeholder if flag off).
- [ ] `/u/<hidden-visibility-user>` 404s (or returns the same generic copy as a non-existent user — no oracle).
- [ ] T49 username change → success + audit_log row.
- [ ] T49 username change within 90d → blocked with cooldown message.
- [ ] OpenDyslexic toggle on/off works (post S7 + S1).
- [ ] High-contrast toggle on/off works (post S7 + S1).
- [ ] GPC toggle on → `users.gpc_opt_out=true` (post S1).
- [ ] Family achievements section renders for parent with progress; empty-state for parent without.

### 4.6 Build + lint

- [ ] `npm run build` clean.
- [ ] `npm run lint` clean.
- [ ] No TypeScript errors anywhere in `web/src/app/profile/`.
- [ ] No `redesign/` import paths surviving anywhere in the codebase (`grep -rn "from ['\"]@/app/redesign" web/src` returns zero).

### 4.7 Commit hygiene

- [ ] Each ship tagged `[S8-Tnnn]` per index rule (`[S8-T357]`, `[S8-T363]`, `[S8-T19]`, `[S8-T49]`, `[S8-A47]`, `[S8-I7]`, `[S8-E18]`, `[S8-E19]`, `[S8-E24]`).
- [ ] T79 skip + A98 bundle into T357 documented in CHANGELOG-AUTONOMOUS.
- [ ] T308 + T346 + §A1 caller verifications recorded in commit messages where any S8-side edit landed; otherwise documented as "verified post-Sx ship, no S8 edit needed."

### 4.8 Memory + status update

- [ ] `Reference/STATUS.md` updated with S8 closeout state.
- [ ] `Ongoing Projects/CHANGELOG-AUTONOMOUS.md` records each shipped item with commit hash + date.
- [ ] `Ongoing Projects/Sessions/00_INDEX.md` table marks S8 items shipped per memory `feedback_update_everything_as_you_go`.
- [ ] If any item deferred (e.g., T49 waiting on S1), the deferral is recorded with the named upstream blocker.

---

## 5. Notes on ordering

If running S8 standalone (not in a parallel-sessions wave):

1. Start with **A47 banned-copy purge** — smallest scope, builds confidence.
2. Then **T19** — single-card deletion, sets up the redesign-cutover mindset.
3. Then **T363** — build under `/redesign/u/[username]/` with flag off. Self-contained until launch.
4. Then **T357** — once T4.8 is green and S1 + S3 + S6 dependencies have shipped. Largest, most coordination.
5. After T357, sweep **T49**, **§I7**, **E18**, **E19**, **E24** in any order against the new redesign tree.
6. Verify-only items (**T308**, **T346**, **§A1**) closed last, after their owning sessions have shipped.

If running in parallel with other sessions:
- A47, T19, T363 can ship same-cycle.
- T357 waits for T4.8 + S1 `lockdown_self()` + S3 middleware edit ready.
- T49, E18, E19, I7 wait for their S1 column migrations.
- E24 ships standalone (read-only).
- Verify-only items close as upstream sessions land.

---

End of Session 8 manual.
