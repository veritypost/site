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

**Recommendation:** A — apply the SQL block in `CONSOLIDATED_SQL.md` (slot 144,
landing as `schema/144_drop_orphan_tables.sql`).

**Owner pick:** [ ] A drop all 9 &nbsp;&nbsp; [ ] B drop only `device_profile_bindings` &nbsp;&nbsp; [ ] C defer

### 1.2 Five "parent" tables flagged for next-session sweep

`access_codes`, `campaigns`, `cohorts`, `sponsors`, `expert_discussions` are
strongly suspected dead but were out of Wave 2 scope. Adding them to a Stream-3
follow-up sweep (next session) gives the same level of verification before
dropping.

**Owner pick:** [ ] A schedule sweep next session &nbsp;&nbsp; [ ] B drop now blind &nbsp;&nbsp; [ ] C defer indefinitely

### 1.3 Bookmark page — empty state inline vs. shared `EmptyState` component

`/bookmarks` re-implements the EmptyState pattern (title + description + CTA)
inline rather than importing `@/components/admin/EmptyState`. Functionally
identical, visually identical, but two source-of-truth.

**Recommendation:** B — defer to a small consolidation pass (would also catch
`/messages` "No conversations yet" inline and any other one-offs). Not blocking.

**Owner pick:** [ ] A do now &nbsp;&nbsp; [ ] B defer to next session

### 1.4 timeAgo string drift — web `2m` vs iOS `2m ago`

Web `CommentRow.timeAgo()` returns `2m`, iOS `Theme.timeAgo()` returns `2m ago`.
Both flow on production; both are valid social conventions. Twitter uses no
"ago" suffix; Reddit uses "ago". We've shipped both for months without complaint.

**Recommendation:** B — leave as-is. This is the cheapest item on the board
and the call has aesthetic-only impact.

**Owner pick:** [ ] A unify to `2m` (web style) &nbsp;&nbsp; [ ] B unify to `2m ago` (iOS style) &nbsp;&nbsp; [ ] C leave both

---

## 2. Schema items needing consolidation

### 2.1 Apply `schema/144_drop_orphan_tables.sql` (this session)

See §1.1. SQL inlined in `CONSOLIDATED_SQL.md`. Bumps no `perms_global_version`
(no permission impact); no FK cascade affects live data (all 9 tables are 0-row).

**Owner pick:** [ ] A apply now &nbsp;&nbsp; [ ] B defer

### 2.2 `00-M` — `schema/106_kid_trial_freeze_notification.sql`

**STATUS UPDATE:** Verified live via MCP this session — `freeze_kid_trial(uuid)`
in prod matches `schema/106` 1:1 (notification block present). The FIX_SESSION_1
entry is stale and should be marked SHIPPED. No owner action needed.

**Owner pick:** [ ] mark SHIPPED in FIX_SESSION_1 next session

### 2.3 `00-N` — DR migration list reconciliation (13 live migrations missing
from repo)

Operational hygiene. Live DB has 13 migrations applied that aren't in the
`schema/` folder (legacy hot-fixes from earlier sessions). Without
reconciliation, `reset_and_rebuild_v2.sql` does not faithfully reproduce prod.

**Recommendation:** B — schedule for the post-launch DR pass. Owner can
manually export the missing migrations from Supabase dashboard and check them
into `schema/` numbered 100A through 100M (or similar).

**Owner pick:** [ ] A do now &nbsp;&nbsp; [ ] B post-launch &nbsp;&nbsp; [ ] C scrap

### 2.4 Permission key cleanup — duplicate keys deactivated in `schema/142`

`schema/142` deactivated 4 duplicate keys (kept canonical, copied grants,
zeroed old). After Apple ships and the matrix is stable for ~30 days, those
old rows can be DELETEd entirely.

**Owner pick:** [ ] A schedule a 30-day-after-launch cleanup &nbsp;&nbsp; [ ] B forget; the deactivated rows are harmless

### 2.5 `xlsx ↔ DB` reconciliation after `schema/142` direct edits

Migration 142 directly UPDATEd `permissions.requires_verified` for the 2
canonical keys. Per CLAUDE.md rule, the xlsx must be updated to match in the
same session, or a reconcile item opened. **No reconcile item exists.** Next
`scripts/import-permissions.js --apply` may revert these flips.

**Owner pick:** [ ] A run `--apply` after manually flipping the xlsx (you, ~5 min) &nbsp;&nbsp; [ ] B agent regenerates the xlsx from current DB state next session

---

## 3. Apple submission gates still pending

These are App Store Connect actions only the owner can take. None block
development; all block publishing.

### 3.1 Apple Developer account enrollment (`00-I`)

Status: not started. Cost $99/yr. ~15 min to start, then 24-48hr review.

**Owner pick:** [ ] start this week &nbsp;&nbsp; [ ] start before next session &nbsp;&nbsp; [ ] later

### 3.2 App Store Connect product setup (after 3.1 lands)

Once the developer account is active:
- Create both apps (`com.veritypost.adult`, `com.veritypost.kids`)
- Configure 8 IAP products (Verity / Pro / Family / Family XL × monthly+annual)
- Generate APNs `.p8` auth key
- Upload `apple-app-site-association` to Vercel
- Configure TestFlight builds

All code paths are wired and ready. No Wave-1/Wave-2 follow-up required from
the agents.

**Owner pick:** [ ] confirm understanding &nbsp;&nbsp; [ ] need agent to create a Day-1 runbook

### 3.3 Universal Links — kid app fallback URL

`KidsAppLauncher.swift` has a TODO for a fallback URL when the kids app isn't
installed. Currently silently no-ops if the user taps a kid link without the
app. Apple-block until the developer account is active and we can publish a
real `apple-app-site-association`.

**Owner pick:** [ ] confirm understanding (no action this session)

---

## 4. Product calls to make (features mentioned but not built)

### 4.1 Quiz content — `00-L` (LAUNCH-BLOCKING)

Status: 0 of 16 published articles have ≥10 quiz questions. Product spine
("comments unlock at 3/5") is functionally inaccessible until at least one
article has the full set. **Hard block on web launch.** No agent can resolve —
this is editorial work or a one-time AI-generation pass.

**Owner pick:** [ ] A I'll write quizzes manually &nbsp;&nbsp; [ ] B run the F7 pipeline to generate quizzes for the existing 16 articles &nbsp;&nbsp; [ ] C lower the gate from 5 quiz questions to 3 (matches current count)

**Recommendation:** B — F7 pipeline already includes a quiz step. Run it
against the 16 existing articles in batch. ~10 min of compute, ~$1 in LLM
cost per article = $16 total.

### 4.2 Running stories / "Developing" story type

`StoryDetailView.swift:334` has a `DEVELOPING` badge that renders if
`story.isDeveloping`. The DB column exists; no admin UI sets it; no editorial
flow uses it. Either build the toggle (~30 min in `/admin/stories`) or remove
the dead branch.

**Owner pick:** [ ] A add admin toggle &nbsp;&nbsp; [ ] B remove the badge (and DB column on next migration cycle)

### 4.3 `ParentalGate` modal — defined, zero callers

`VerityPostKids/ParentalGateModal.swift` exists but no kid view invokes it.
COPPA spec calls for a parental gate before any external link / external
purchase / age-gated action. Either:

A. Identify the 1-2 surfaces that need it and wire up.
B. Confirm the kid app has no surfaces requiring a parental gate (current
   IAP flow goes through the parent app, not the kid app — likely the case).

**Owner pick:** [ ] A wire it &nbsp;&nbsp; [ ] B remove the unused file

---

## 5. Test data state — what's needed for full E2E demo

### 5.1 Kid articles

Kid app's article list reads from `articles WHERE audience = 'kid'`. Live count:
**0**. Without kid articles, the kids app shows an empty feed on first launch.

**Owner pick:** [ ] A run F7 pipeline in kid mode against ~5 published articles &nbsp;&nbsp; [ ] B ship adult-feed-mirror as fallback (already designed in `feed_clusters` tabs) &nbsp;&nbsp; [ ] C ship without kid content for first review

### 5.2 More test accounts

Current: 19 test + 30 community + 2 kids (`Emma`, `Liam` under `test_family`).
Plenty for adult flow. For kids flow: only 2 kid profiles, both bound to the
same family. Need a second test family to verify cross-family RLS isolation
end-to-end.

**Owner pick:** [ ] A agent creates `test_family_2` + 2 kids next session &nbsp;&nbsp; [ ] B current test data sufficient

### 5.3 `seed-test-accounts.js` script — path-broken (FIX_SESSION_1 #2)

Script references a path that doesn't exist post-restructure. Either fix or
retire (we now seed manually via SQL).

**Owner pick:** [ ] A fix the script &nbsp;&nbsp; [ ] B retire it (manual SQL is fine)

---

## 6. Wave 1 + Wave 2 agent flags for owner awareness

### 6.1 Pre-existing tsc errors in `.next/` cache

`web/.next/types/app/api/admin/{send-email,stories}/route.ts` reference 2
deleted route files. Caused by a pre-existing working-tree deletion from
another session. `npx tsc --noEmit` flags 4 errors in those auto-generated
files. Will auto-clear on the next `npm run build` after the cache is wiped.

**Owner pick:** [ ] A I'll wipe `.next/` and rebuild &nbsp;&nbsp; [ ] B agent does it next session &nbsp;&nbsp; [ ] C ignore (cache is excluded from CI)

### 6.2 `--breaking` color introduced this session

C10 introduced a new CSS var `--breaking: #ef4444` (web) plus iOS `VP.breaking
= #ef4444` so the BREAKING banner stays the saturated alert red while
`--danger` / `VP.danger` move to `#b91c1c` for AA-contrast error text. iOS
HomeView + StoryDetailView and web home + story-page BREAKING badges all
swapped to the new token. No design-review needed unless you disagree with
the split.

**Owner pick:** [ ] A approved &nbsp;&nbsp; [ ] B revert the split, use one token

### 6.3 Vercel / Supabase / Apple dashboards remain agent-invisible

Per memory note `feedback_no_assumption_when_no_visibility.md`, agents have no
direct dashboard access. Items that need owner-side dashboard checks this
session: `00-C` (Supabase URL typo), `00-J` (remove ex-dev from Vercel team).
If you've already done these, reply with the SHA / date and the corresponding
FIX_SESSION_1 entry will get a SHIPPED block next session.

**Owner pick:** [ ] mark `00-C` done &nbsp;&nbsp; [ ] mark `00-J` done &nbsp;&nbsp; [ ] both still open

### 6.4 `@admin-verified` markers bumped on 77 files (Wave 2 Stream 4)

Status: edits applied, **not committed**. Single-line date bump per file
(2026-04-22 → 2026-04-23). Wave 2 stream coordinator left commit batching to
the closing pass. If you want to land them, I can stage + commit as a single
`chore(admin-verified): bump 77 markers to 2026-04-23` ref'd at FIX_SESSION_1
new item.

**Owner pick:** [ ] A commit now &nbsp;&nbsp; [ ] B revert (you don't want the bump) &nbsp;&nbsp; [ ] C commit with a different commit message

---

## Summary

- **Section 1 (deferred decisions):** 4 items. Recommended path A on §1.1 +
  §1.2; defer §1.3, §1.4.
- **Section 2 (schema):** 5 items. §2.1 + §2.5 want action this week.
- **Section 3 (Apple):** 3 items. §3.1 is the critical chain-starter.
- **Section 4 (product):** 3 items. §4.1 (quiz content) is launch-blocking.
- **Section 5 (test data):** 3 items. §5.1 (kid articles) blocks full demo.
- **Section 6 (FYI):** 4 items.

After answering, the next session's first move is to honor your picks and
land the items in a single coordinated pass.
