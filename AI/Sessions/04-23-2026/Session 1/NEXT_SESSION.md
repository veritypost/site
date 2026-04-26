# Next Session — Queued Items

Authored 2026-04-23 at the close of OWNER_QUESTIONS.md execution. Each entry
references the OWNER_QUESTIONS section the pick came from so context is one
click away.

## Bundle 1 — DB hygiene

### B1.1 Verify-and-drop sweep for 5 parent tables (§1.2)
Verify 0-row + 0 code refs + 0 inbound FKs for: `access_codes`, `campaigns`,
`cohorts`, `sponsors`, `expert_discussions`. Use the same Stream-3 rigor as
the 9 confirmed-dead orphans (which turned out to already be dropped — see
`feedback_verify_audit_findings_before_acting.md`). Author
`schema/144_drop_orphan_tables_round_2.sql` only if all 5 verify clean.

### B1.2 xlsx ↔ DB reconciliation after schema/142 (§2.5)
Migration 142 directly UPDATEd `permissions.requires_verified` for 2 canonical
keys. The xlsx was not flipped to match. Next `--apply` would revert. Agent
regenerates `permissions.xlsx` from current live DB state via
`scripts/import-permissions.js --export` (or equivalent) so the file matches
prod 1:1.

## Bundle 2 — Apple submission readiness

### B2.1 Day-1 Apple Console runbook (§3.2)
Author a step-by-step runbook covering everything that happens between "owner
approves dev account" (already done 2026-04-23) and "TestFlight build
installable on owner's phone." Cover: bundle ID registration for both apps,
capability enablement (push + SIWA + Associated Domains), APNs `.p8` key
creation, SIWA Service ID linkage, IAP product setup with canonical tier IDs
(`verity` / `verity_pro` / `verity_family` / `verity_family_xl`),
`apple-app-site-association` upload to Vercel, TestFlight internal testing
group config. Save as `Reference/APPLE_DAY_1_RUNBOOK.md`.

### B2.2 1Password ROTATIONS entry for APNs + SIWA `.p8` keys (§6.2)
Once the keys are generated during the §6.1 walkthrough (owner-paced), update
`Reference/ROTATIONS.md` with: 1Password entry name, key ID, team ID, issue
date, 6-month rotation deadline (matches Apple SIWA requirement; APNs is
indefinite but rotate-on-suspicion). One-line per key.

## Bundle 3 — UX / consolidation

### B3.1 EmptyState consolidation pass (§1.3)
Refactor `/bookmarks` to import `@/components/admin/EmptyState`. Same sweep
catches `/messages` "No conversations yet" inline + any other one-off
EmptyState reimplementations. Single commit.

## Bundle 4 — Admin / pipeline verification

### B4.1 Kid pipeline E2E verification (§5.2 verbal)
Run one test article through the full F7 pipeline with kid audience selected
via `/admin/newsroom`. Observe all 12 steps land cleanly + audience-safety
check passes + article persists to kid feed cluster. Delete the test article
after. Confirms kid pipeline works before owner populates real content.

### B4.2 Test family 2 + 2 kid profiles (§5.2)
Create `test_family_2` adult account + 2 kid profiles bound to it via SQL.
Verifies cross-family RLS isolation end-to-end. Document in
`test-data/accounts.json`.

## Bundle 5 — Long-tail (post-launch / scheduled)

### B5.1 DR migration list reconciliation (§2.3, post-launch)
13 live-DB migrations missing from `schema/` folder. Reconstruct DDL from
live state, commit numbered files, patch `reset_and_rebuild_v2.sql`. Owner
preference: post-launch (not blocking ship).

### B5.2 30-day post-launch perm cleanup (§2.4)
After Apple ships and the matrix is stable for ~30 days, DELETE the 4
deactivated duplicate keys from `schema/142`. Currently inactive (zero risk)
but clean removal is good hygiene.

## Bookkeeping for the open session

OWNER_QUESTIONS.md execution discovered that **4 of 8 picks** were stale at
execution time:
- §1.1 — 9 orphan tables already dropped from prod (no SQL needed)
- §4.2 — Developing badge admin toggle already exists at
  `/admin/story-manager/page.tsx:828-832` and `/admin/kids-story-manager`
- §4.3 — `ParentalGateModal.swift` has 3 live COPPA callers via
  `.parentalGate(...)` view modifier (PairCodeView mail composer,
  ProfileView unpair, ProfileView legal links). The audit's "zero callers"
  claim missed the modifier syntax. File is RESTORED, kept.
- §5.3 — `scripts/seed-test-accounts.js` was already deleted from disk

Memory `feedback_verify_audit_findings_before_acting.md` saved as a guard
against the same drift in the next pass.
