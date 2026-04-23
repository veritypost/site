# Owner Questions — 2026-04-23 (Wave 1 + Wave 2 close-out)

Decisions Wave 1 / Wave 2 agents could not make unilaterally. Each section
numbered; mark each ✓ / ✗ or pick A/B inline. The recommended path + rationale
is provided so you only need to confirm or override.

---

## 1. Decisions deferred during the 10-commit ship

### 1.1 Drop the 9 confirmed-dead orphan tables (DB cleanup)

Wave 2 Stream 3 verified 10 candidate tables: 9 are 0-row, no code refs, no
inbound FKs. 1 (`search_history`) is referenced by `Future Projects/views/web_search.md`
so it stays.

| Table | Why dead | Rec |
|---|---|---|
| `access_code_uses` | scrapped access-code feature; parent `access_codes` likely also dead | DROP |
| `behavioral_anomalies` | anti-fraud, never wired | DROP |
| `campaign_recipients` | parent `campaigns` likely also dead | DROP |
| `cohort_members` | parent `cohorts` likely also dead | DROP |
| `consent_records` | superseded by kid pair-code flow | DROP |
| `device_profile_bindings` | matches the 7 RPCs already dropped in `schema/140` — finishes that cleanup | DROP |
| `translations` | i18n never started | DROP |
| `sponsored_quizzes` | concept dropped; parent `sponsors` likely also dead | DROP |
| `expert_discussion_votes` | voting on expert discussions never built | DROP |

**Recommendation:** A — apply the SQL block in `CONSOLIDATED_SQL.sql` (slot 144,
landing as `schema/144_drop_orphan_tables.sql`).

**Owner pick:** [x] A drop all 9 &nbsp;&nbsp; [ ] B drop only `device_profile_bindings` &nbsp;&nbsp; [ ] C defer

### 1.2 Five "parent" tables flagged for next-session sweep

`access_codes`, `campaigns`, `cohorts`, `sponsors`, `expert_discussions` are
strongly suspected dead but were out of Wave 2 scope. Adding them to a Stream-3
follow-up sweep (next session) gives the same level of verification before
dropping.

**Owner pick:** [x] A schedule sweep next session &nbsp;&nbsp; [ ] B drop now blind &nbsp;&nbsp; [ ] C defer indefinitely

### 1.3 Bookmark page — empty state inline vs. shared `EmptyState` component

`/bookmarks` re-implements the EmptyState pattern (title + description + CTA)
inline rather than importing `@/components/admin/EmptyState`. Functionally
identical, visually identical, but two source-of-truth.

**Recommendation:** B — defer to a small consolidation pass (would also catch
`/messages` "No conversations yet" inline and any other one-offs). Not blocking.

**Owner pick:** [ ] A do now &nbsp;&nbsp; [x] B defer to next session

### 1.4 timeAgo string drift — web `2m` vs iOS `2m ago`

Web `CommentRow.timeAgo()` returns `2m`, iOS `Theme.timeAgo()` returns `2m ago`.
Both flow on production; both are valid social conventions. Twitter uses no
"ago" suffix; Reddit uses "ago". We've shipped both for months without complaint.

**Recommendation:** B — leave as-is. This is the cheapest item on the board
and the call has aesthetic-only impact.

**Owner pick:** [ ] A unify to `2m` (web style) &nbsp;&nbsp; [ ] B unify to `2m ago` (iOS style) &nbsp;&nbsp; [x] C leave both

---

## 2. Schema items needing consolidation

### 2.1 Apply `schema/144_drop_orphan_tables.sql` (this session)

See §1.1. SQL inlined in `CONSOLIDATED_SQL.sql`. Bumps no `perms_global_version`
(no permission impact); no FK cascade affects live data (all 9 tables are 0-row).

**Owner pick:** [x] A apply now &nbsp;&nbsp; [ ] B defer

### 2.2 `00-M` — `schema/106_kid_trial_freeze_notification.sql`

**STATUS UPDATE:** Verified live via MCP this session — `freeze_kid_trial(uuid)`
in prod matches `schema/106` 1:1 (notification block present). The FIX_SESSION_1
entry is stale and should be marked SHIPPED. No owner action needed.

**Owner pick:** [x] mark SHIPPED in FIX_SESSION_1 next session

### 2.3 `00-N` — DR migration list reconciliation (13 live migrations missing
from repo)

Operational hygiene. Live DB has 13 migrations applied that aren't in the
`schema/` folder (legacy hot-fixes from earlier sessions). Without
reconciliation, `reset_and_rebuild_v2.sql` does not faithfully reproduce prod.

**Recommendation:** B — schedule for the post-launch DR pass. Owner can
manually export the missing migrations from Supabase dashboard and check them
into `schema/` numbered 100A through 100M (or similar).

**Owner pick:** [ ] A do now &nbsp;&nbsp; [x] B post-launch &nbsp;&nbsp; [ ] C scrap

### 2.4 Permission key cleanup — duplicate keys deactivated in `schema/142`

`schema/142` deactivated 4 duplicate keys (kept canonical, copied grants,
zeroed old). After Apple ships and the matrix is stable for ~30 days, those
old rows can be DELETEd entirely.

**Owner pick:** [x] A schedule a 30-day-after-launch cleanup &nbsp;&nbsp; [ ] B forget; the deactivated rows are harmless

### 2.5 `xlsx ↔ DB` reconciliation after `schema/142` direct edits

Migration 142 directly UPDATEd `permissions.requires_verified` for the 2
canonical keys. Per CLAUDE.md rule, the xlsx must be updated to match in the
same session, or a reconcile item opened. **No reconcile item exists.** Next
`scripts/import-permissions.js --apply` may revert these flips.

**Owner pick:** [ ] A run `--apply` after manually flipping the xlsx (you, ~5 min) &nbsp;&nbsp; [x] B agent regenerates the xlsx from current DB state next session

---

## 3. Apple submission gates still pending

These are App Store Connect actions only the owner can take. None block
development; all block publishing.

### 3.1 ~~Apple Developer account enrollment (`00-I`)~~ — DONE 2026-04-23

Owner's developer account was approved this session. Mark `00-I` SHIPPED in
FIX_SESSION_1 next session.

**Owner pick:** [x] DONE — account approved 2026-04-23

### 3.2 App Store Connect product setup (after 3.1 lands)

Once the developer account is active:
- Create both apps (`com.veritypost.adult`, `com.veritypost.kids`)
- Configure 8 IAP products (Verity / Pro / Family / Family XL × monthly+annual)
- Generate APNs `.p8` auth key
- Upload `apple-app-site-association` to Vercel
- Configure TestFlight builds

All code paths are wired and ready. No Wave-1/Wave-2 follow-up required from
the agents.

**Owner pick:** [ ] confirm understanding &nbsp;&nbsp; [x] need agent to create a Day-1 runbook

### 3.3 Universal Links — kid app fallback URL

`KidsAppLauncher.swift` has a TODO for a fallback URL when the kids app isn't
installed. Currently silently no-ops if the user taps a kid link without the
app. Apple-block until the developer account is active and we can publish a
real `apple-app-site-association`.

**Owner pick:** [x] confirm understanding (no action this session)

---

## 4. Product calls to make (features mentioned but not built)

### 4.1 ~~Quiz content — `00-L`~~ — N/A 2026-04-23

Owner is wiping all existing articles before launch. Every post-wipe article
will come through the F7 pipeline, which generates quizzes inline. Backfill
gap closes itself. Mark `00-L` N/A in FIX_SESSION_1.

**Follow-up flagged:** when owner is ready to wipe, prep an FK-safe truncate
sequence (`articles`, `article_quizzes`, `article_clusters`, `quiz_attempts`,
`comments`, `bookmarks`, `reading_progress`, etc.) as its own SQL.

**Owner pick:** [x] N/A — articles will be wiped pre-launch

### 4.2 Running stories / "Developing" story type

`StoryDetailView.swift:334` has a `DEVELOPING` badge that renders if
`story.isDeveloping`. The DB column exists; no admin UI sets it; no editorial
flow uses it. Either build the toggle (~30 min in `/admin/stories`) or remove
the dead branch.

**Owner pick:** [x] A add admin toggle &nbsp;&nbsp; [ ] B remove the badge (and DB column on next migration cycle)

**Why A over B:** memory `feedback_launch_hides.md` says don't delete state
for launch-hidden features — keep it alive for one-line unhide. Completing
the feature (~30 min) turns a partial build into a complete one.

### 4.3 `ParentalGate` modal — defined, zero callers

`VerityPostKids/ParentalGateModal.swift` exists but no kid view invokes it.
COPPA spec calls for a parental gate before any external link / external
purchase / age-gated action. Either:

A. Identify the 1-2 surfaces that need it and wire up.
B. Confirm the kid app has no surfaces requiring a parental gate (current
   IAP flow goes through the parent app, not the kid app — likely the case).

**Owner pick:** [ ] A wire it &nbsp;&nbsp; [x] B remove the unused file

**Why B:** kid IAP flow goes through the parent app, not the kid app. No
external links in current kid surfaces. Without a real surface needing it,
the file is dead code. Recreate when an actual kid-app external action ships.

---

## 5. Test data state — what's needed for full E2E demo

### 5.1 Kid articles

Kid app's article list reads from `articles WHERE audience = 'kid'`. Live count:
**0**. Without kid articles, the kids app shows an empty feed on first launch.

**Owner pick:** [x] N/A — owner handling article seeding later

Owner deferred §5.1 in conversation: "ILL HANDLE THAT LATER AND WILL POPULATE
THEM AT SOMEPOINT." Pipeline-side verification (one E2E test article through
the kid pipeline) scheduled for next session per §5.2 verbal answer.

### 5.2 More test accounts

Current: 19 test + 30 community + 2 kids (`Emma`, `Liam` under `test_family`).
Plenty for adult flow. For kids flow: only 2 kid profiles, both bound to the
same family. Need a second test family to verify cross-family RLS isolation
end-to-end.

**Owner pick:** [x] A agent creates `test_family_2` + 2 kids next session &nbsp;&nbsp; [ ] B current test data sufficient

### 5.3 `seed-test-accounts.js` script — path-broken (FIX_SESSION_1 #2)

Script references a path that doesn't exist post-restructure. Either fix or
retire (we now seed manually via SQL).

**Owner pick:** [ ] A fix the script &nbsp;&nbsp; [x] B retire it (manual SQL is fine)

---

## 6. Wave 1 + Wave 2 agent flags for owner awareness

### 6.1 Pre-existing tsc errors in `.next/` cache

`web/.next/types/app/api/admin/{send-email,stories}/route.ts` reference 2
deleted route files. Caused by a pre-existing working-tree deletion from
another session. `npx tsc --noEmit` flags 4 errors in those auto-generated
files. Will auto-clear on the next `npm run build` after the cache is wiped.

**Owner pick:** [ ] A I'll wipe `.next/` and rebuild &nbsp;&nbsp; [ ] B agent does it next session &nbsp;&nbsp; [x] C ignore (cache is excluded from CI)

### 6.2 `--breaking` color introduced this session

C10 introduced a new CSS var `--breaking: #ef4444` (web) plus iOS `VP.breaking
= #ef4444` so the BREAKING banner stays the saturated alert red while
`--danger` / `VP.danger` move to `#b91c1c` for AA-contrast error text. iOS
HomeView + StoryDetailView and web home + story-page BREAKING badges all
swapped to the new token. No design-review needed unless you disagree with
the split.

**Owner pick:** [x] A approved &nbsp;&nbsp; [ ] B revert the split, use one token

### 6.3 Vercel / Supabase / Apple dashboards remain agent-invisible

Per memory note `feedback_no_assumption_when_no_visibility.md`, agents have no
direct dashboard access. Items that need owner-side dashboard checks this
session: `00-C` (Supabase URL typo), `00-J` (remove ex-dev from Vercel team).
If you've already done these, reply with the SHA / date and the corresponding
FIX_SESSION_1 entry will get a SHIPPED block next session.

**Owner pick:** [ ] mark `00-C` done &nbsp;&nbsp; [ ] mark `00-J` done &nbsp;&nbsp; [ ] both still open

### 6.4 ~~`@admin-verified` markers bumped on 77 files~~ — VOID

**Resolved 2026-04-23 (mid-walkthrough):** premise was hallucinated. Verified
via `git log --since=2026-04-23 --name-only` that **zero** `admin/` paths were
touched in this session's 10-commit ship. 52 files in the codebase carry the
marker (not 77); none were edited today. No bumps were ever pending.

**Owner pick:** [x] A void this question (recorded 2026-04-23)

---

## 7. Owner-raised: `@admin-verified` marker is too much ceremony

**Owner verbatim 2026-04-23:** "ALSO ADMIN IDK WHY ITS SO CRAZ WITH @ADMIN
IT SHOULD JUST BE OH ADMIN OR AT LEAST OWNER HAS INFINITE POWER"

### Today's policy
- 52 files in `web/src/app/admin/*` + `web/src/app/api/admin/*` carry
  `@admin-verified <date>` markers.
- Per CLAUDE.md: marker = **LOCKED, no edits without approval**.
- In practice, owner approves work via wave/sprint go-aheads; the marker
  creates per-file friction even after a wave is approved. Owner already
  flagged this in verbal §3.2 = B (wave-level approval covers all files
  in the wave's scope).

### Why the marker exists
Admin = highest blast radius — wrong permission grant, wrong ban, wrong
billing toggle visible to non-admins. The marker was a friction layer added
before the 6-agent ship pattern (`feedback_4pre_2post_ship_pattern.md`) was
established. The 4+2 review pattern now handles the same risk categorically.

### Choices
- **A.** Drop `@admin-verified` markers entirely. CLAUDE.md replaces with
  one rule: "Admin code requires the 6-agent ship pattern (4 pre-impl + 2
  post-impl), no exceptions." Cleaner; relies on the existing well-trusted
  review pattern. ~10 min sweep removes 52 markers.
- **B.** Keep markers but downgrade to **informational** (no friction, just
  signals "this is admin code"). Agents read them but don't gate on them.
- **C.** Keep markers as-is (status quo, with verbal §3.2 = B applied:
  wave-level approval covers all marked files in scope).
- **D.** Replace marker with a simpler convention (`// ADMIN — high blast
  radius`) that conveys the intent without the lock semantics.

### My recommendation: A.
Owner has unbounded authority by definition; admin role implicitly does too.
The marker creates a parallel approval system that hasn't pulled its weight
since the 6-agent pattern landed. Drop the marker, move the safety into the
review pattern (where it already lives in practice), let admin code be admin
code without ceremony. Net: 52 fewer markers to maintain, one canonical rule
in CLAUDE.md, same safety.

**Owner pick:** [x] A drop entirely &nbsp;&nbsp; [ ] B downgrade to informational &nbsp;&nbsp; [ ] C status quo &nbsp;&nbsp; [ ] D replace with simpler convention

**Confirmed 2026-04-23.** Next-session execution: (1) sweep 52 `@admin-verified`
comment lines, (2) edit CLAUDE.md to remove the marker rule + add one line
"Admin code = highest blast radius. Every change runs the 6-agent ship pattern
(4 pre + 2 post). No exceptions, no special markers." (3) Save as a feedback
memory so future sessions don't reintroduce the convention.

---

## Summary

All recommendations pre-marked [x] per owner's "JUST DO ALL RECOMMEND
CHANGES" instruction (2026-04-23). Owner reviews and overrides any picks
they disagree with; remaining items execute next session.

- **§1.1** [x] A drop 9 orphan tables (already approved verbally; SQL ready)
- **§1.2** [x] A schedule sweep next session for 5 parent tables
- **§1.3** [x] B defer EmptyState consolidation to next session
- **§1.4** [x] C leave timeAgo as-is
- **§2.1** [x] A apply 144 SQL this session
- **§2.2** [x] mark `00-M` SHIPPED
- **§2.3** [x] B post-launch DR pass for migration list reconciliation
- **§2.4** [x] A schedule 30-day-after-launch perm cleanup
- **§2.5** [x] B agent regenerates xlsx from current DB state next session
- **§3.1** [x] DONE — Apple Dev account approved 2026-04-23
- **§3.2** [x] need agent to create Day-1 runbook
- **§3.3** [x] confirm understanding (no action this session)
- **§4.1** [x] N/A — articles being wiped pre-launch
- **§4.2** [x] A add admin toggle for Developing badge (~30 min)
- **§4.3** [x] B remove unused ParentalGate file
- **§5.1** [x] N/A — owner handling article seeding later
- **§5.2** [x] A agent creates `test_family_2` + 2 kids next session
- **§5.3** [x] B retire seed-test-accounts.js
- **§6.1** [x] C ignore `.next/` cache errors
- **§6.2** [x] A approved — `--breaking` color split stays
- **§6.3** owner-only: `00-C` + `00-J` need owner dashboard checks
- **§6.4** voided — phantom in original draft
- **§7** [x] A drop 52 `@admin-verified` markers + replace CLAUDE.md rule
  with one-liner about the 6-agent pattern (confirmed 2026-04-23)

**Owner action:** review, override anything you disagree with, then say "go"
to execute. Picks marked [x] are recommendations, not yet acted on.

---

## Execution log — owner said "go" 2026-04-23

**Pre-flight verification surfaced 4 stale picks:**
- §1.1 9 orphan tables — already dropped from prod (verified via
  `pg_tables`). Migration 144 not authored — nothing to drop.
- §4.2 Developing badge admin toggle — already exists at
  `/admin/story-manager/page.tsx:828-832` and `/admin/kids-story-manager`.
  Both persist `is_developing` via `updateStory(...)` + save payload.
  Nothing to wire.
- §4.3 ParentalGate file — has 3 live COPPA callers via `.parentalGate(...)`
  view modifier (PairCodeView mail composer + ProfileView unpair +
  ProfileView legal links). Audit's "zero callers" claim missed the
  modifier syntax. File deleted then restored when xcodebuild surfaced 2
  compilation errors.
- §5.3 seed-test-accounts.js — already deleted from disk. STATUS.md
  reference updated.

**Actually executed:**
- §7 — 77 `@admin-verified` markers stripped from
  `web/src/app/admin/`, `web/src/app/api/admin/`, `web/src/components/admin/`,
  `web/src/middleware.js`. CLAUDE.md + STATUS.md rewritten. Memory
  `feedback_admin_marker_dropped.md` saved.
- §2.2 — `00-M` marked SHIPPED in FIX_SESSION_1 (verified live via MCP).
- §3.1 — `00-I` marked SHIPPED in FIX_SESSION_1 (Apple Dev account
  approved).
- §4.1 — `00-L` marked N/A in FIX_SESSION_1 (articles being wiped
  pre-launch).
- Memory `feedback_verify_audit_findings_before_acting.md` saved as guard
  against future audit-drift.

**Queued for next session (see `NEXT_SESSION.md`):**
- §1.2 verify-and-drop sweep for 5 parent tables
- §2.5 xlsx ↔ DB reconciliation after schema/142
- §3.2 Day-1 Apple Console runbook
- §6.2 1Password ROTATIONS entry (after §6.1 walk-through)
- §1.3 EmptyState consolidation pass
- §5.2 verbal — kid pipeline E2E verification
- §5.2 — test family 2 + 2 kid profiles
- §2.3 (post-launch) DR migration list reconciliation
- §2.4 (post-launch) 30-day perm cleanup

**Still owner-only:**
- §6.3 — `00-C` (Supabase URL typo) and `00-J` (remove ex-dev from Vercel
  team) need owner dashboard checks. Reply with `done` / `still open`.
