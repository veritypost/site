# W2-07: MASTER_TRIAGE Accuracy

## File metrics (verified)

- 256 lines total
- **39 numbered table-row items** (`^| N | ...`)
- **72 lines containing "SHIPPED 2026"** (some items have multi-line SHIPPED blocks; SHIPPED count >= 39 - open - stale)
- **15 items marked STALE 2026-04-24** (later re-classified as never-was-bugs)
- **9 truly open items** (no SHIPPED, no STALE)
- 4 H2 section headings (Tier 0/1/2/3 etc.)

(Z02 said "67 items" — the actual numbered-table count is 39. Z02 may have included Round-3/Round-4 sub-items not in the main table, OR items in lettered prefixes K/B/AD that aren't in the `^| N` regex.)

## CLAUDE.md FALLBACK_CATEGORIES claim — STALE

CLAUDE.md repo-tree comment: `page.tsx home feed (FALLBACK_CATEGORIES hardcode still there — tracked in MASTER_TRIAGE_2026-04-23.md)`.

Verified:
- `grep -c "FALLBACK_CATEGORIES" web/src/app/page.tsx` → **0** (does not exist)
- `grep "FALLBACK_CATEGORIES" Current Projects/MASTER_TRIAGE_2026-04-23.md` → **0 hits**
- page.tsx reads from `articles.hero_pick_for_date` directly (verified line 89, 202-203).

**Action:** delete the FALLBACK_CATEGORIES comment from CLAUDE.md (currently misleading future agents that the constant exists).

## Items 1-9 are the genuine open list

The 9 truly open items are:
1. `/api/admin/users/[id]/roles/route.js:130` — DELETE calls undefined `assertActorOutranksTarget` (every revoke 500s)
2. `/api/admin/billing/cancel/route.js:37 + freeze/route.js:35` — `actor.id` ReferenceError
3. `/api/auth/email-change/route.js:44-51` — flips email_verified=false BEFORE auth.resend
4. `VerityPost/StoryDetailView.swift:1855` — quiz-pass 70% integer-math vs server 60%
5. `profile/[id]/page.tsx:353-411` — direct RLS writes (RESOLVED-BY-9, file replaced with stub)
6. `profile/settings/page.tsx:2196-2204` — PasswordCard signInWithPassword bypasses rate limit
7. `components/Ad.jsx:148-152` — `<a href>` from DB with no scheme validation (javascript: vector)
8. `profile/settings/page.tsx:1788, 1847` — backgroundImage CSS-injection vector
9. `profile/[id]/page.tsx:76-80, 631-657` — Tab nav hardcoded to viewer's own profile

Item 5 is "RESOLVED-BY-9" (file replaced with under-construction stub). Effectively item-5 is closed by item-9's fix; the table has it inline-noted but doesn't have a `SHIPPED` block. Could move to Closed section.

## STALE-marked items — confirmed not bugs

15 items marked STALE 2026-04-24 (per Z07's "4-of-8 OWNER_QUESTIONS picks were stale" finding from Day-3 session). Examples:
- #23, #28: signInWithPassword anti-pattern → "ephemeral-client pattern already in place"
- #29: existingSub lookup → "defense-in-depth user_id guard already exists at route.js:184" (matches W2-06 Q4 verification)
- #32: iOS /api/auth/login bypass → "intentional / by design"
- #35: cron CRON_SECRET in URL → "read from Authorization header"
- #37: /u/[username] mention 404 → "route exists; PUBLIC_PROFILE_ENABLED kill-switch"
- #38: /profile/settings/data 404 → "route exists as redirect"

These should be moved to a "Resolved-as-Stale" section so the active item count is clear.

## Cross-link with MASTER_FIX_LIST_2026-04-24

Per Z03 (audit topline): MASTER_FIX_LIST has 71 items (28C / 27H / 17M); 65 PASS in Phase 8; 3 regressions fixed by `07c9d29`; C26 + M13 deferred.

Per Z03: GG.3 / C26 / R-12-UB-03 are the same fix tracked under three IDs. **Reconcile:** pick one canonical ID (recommend C26 since Audit_2026-04-24 is the most recent), mark the others as cross-references.

OWNER_ACTIONS_2026-04-24 ↔ OWNER_TODO_2026-04-24 — Z03 said duplicate 8-9 infra tasks. These are two views of the same list. **Recommend consolidating** OWNER_ACTIONS into OWNER_TODO and deleting the former.

## Items SHIPPED-but-broken — DEFERRED to Wave 3

Spot-checking 72 SHIPPED claims line by line is Wave 3 work. Spot-test selection:
- #12 (`update_own_profile` username freeze, schema/152) — high-value, verify schema/152 exists and DB matches.
- #19 (avatar bucket missing) — verify storage bucket state via Supabase MCP.
- #20 (users select(*)) — should be SHIPPED, but worth grep'ing for any remaining `select('*').from('users')` calls.
- #34 (SVG avatar reject) — verify upload validation code.

## Tier counts

The H2 sections are 4. Z02 said "Tiers 0-4 + Round 3 + Round 4" — that's 6+ groupings. The actual file may use H3/H4 sub-headings within H2 tiers; need to read full file (Wave 3).

## Confirmed duplicates
- Same fix under 3 IDs: GG.3 / C26 / R-12-UB-03 (per Z03)
- OWNER_ACTIONS ↔ OWNER_TODO (per Z03 — duplicate 8-9 tasks)

## Confirmed stale
- CLAUDE.md "FALLBACK_CATEGORIES" comment (no such constant exists)
- 15 items already marked STALE 2026-04-24 in MASTER_TRIAGE
- Item 5 effectively closed by item 9 but not formally marked

## Confirmed conflicts
- Z02 reported "67 items" but actual numbered count is 39 — possible scope confusion (Round 3 + Round 4 may have separate numbering not captured)

## Unresolved (Wave 3)
- Spot-check 72 SHIPPED claims for accuracy
- Reconcile MASTER_TRIAGE numbered count vs Z02's claim of 67 items
- Confirm storage buckets for #19 (avatars / banners / data-exports)
- Tier H2 / H3 / H4 inventory

## Recommended actions
1. **P0:** Delete the FALLBACK_CATEGORIES comment from CLAUDE.md repo-tree section.
2. **P1:** Move STALE items into a "Resolved-as-Stale" section so active count is clearly 9.
3. **P1:** Mark item 5 as SHIPPED with reference to item 9's commit.
4. **P1:** Pick canonical ID (C26) for the GG.3/C26/R-12-UB-03 trio; mark others as `→ C26`.
5. **P1:** Consolidate OWNER_ACTIONS_2026-04-24 into OWNER_TODO_2026-04-24; archive OWNER_ACTIONS.
6. **P2:** Spot-check the 72 SHIPPED items in Wave 3 for any partial fixes / regressions.
