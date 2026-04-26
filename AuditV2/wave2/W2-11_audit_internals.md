# W2-11: Audit_2026-04-24 Internal Coherence

## Q1: Duplicate-IDs across the audit

Confirmed (per Z03):
- **GG.3 / C26 / R-12-UB-03** — same fix tracked under three IDs
- **OWNER_ACTIONS_2026-04-24 ↔ OWNER_TODO_2026-04-24** — duplicate 8-9 infra tasks (two views of the same list)
- **15 STALE-marked items** in MASTER_TRIAGE (per W2-07) overlap with audit "QUESTIONABLE_ITEMS" + "Q_SOLO_VERIFICATION"

**Wave 3 should:** map every audit ID against MASTER_TRIAGE numbered items + QUESTIONABLE list to surface all duplicates.

## Q2: OWNER_ACTIONS vs OWNER_TODO — CONSOLIDATE

Z03 confirmed they're "two views of the same 8-9 infra tasks". OWNER_TODO_2026-04-24 includes the canonical Apple-Dev item (TODO-4, now stale per W2-04) plus Vercel typo, ex-dev removal, pg_cron, Stripe audit, migration-state SQL paste.

**Action:** keep `OWNER_TODO_2026-04-24.md` as canonical; move OWNER_ACTIONS to Archived.

## Q3: BUCKET5_TRACKER stale "queued" entries

Per Z03: "queued" items closed by Batches 28-35 but never struck-through. Wave 3 should sweep.

## Q4: 47 lens findings only in NOTIFICATION_DIGEST (8 missing lenses)

Per Z05 + Z11 audit topline. The 8 unwritten lenses are L01, L02, L04, L08, L11, L12, L13, L15.

Out of 47 findings, sample resolutions confirmed elsewhere:
- L08-001 ("kid RLS blocks writes") — refuted by W2-03 Q5/Q6 (live RLS verified correct)
- L06-001 ("cross-provider duplicate rows") — not currently reproducing in prod (W2-06 Q8)

The remaining ~45 lens findings need to be triaged in Wave 3. Many will likely be already-shipped or stale because the digest is from 2026-04-24 and significant work has shipped since.

## Q5: L08-001 vs C15 contradiction — RESOLVED in W2-03 Q6

Live kid_* RLS verified. L08-001 framing was inaccurate; C15 was closer.

## Q6: Wave A vs Wave B disputes — RESOLVED PARTIALLY

Per Z04:
- **permissions.js dual-cache fallthrough**: Wave 1 final 4 vs 1 said "bug". Wave 3 should confirm by reading `permissions.js` cache logic and tracing what happens on stale-fallthrough.
- **RLS table-count claim**: Wave A "35 tables" was narrowed by Wave B to "1 table no RLS + 14 RLS-no-policies". Verifiable via:
  ```sql
  SELECT tablename FROM pg_tables WHERE schemaname='public' 
  AND tablename NOT IN (SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public');
  ```
  This finds tables without policies. Wave 3 should run.
- **vpSubscriptionDidChange**: resolved correctly wired (W2-06 Q5).

## Q7: Wave B-critical findings — VERIFIED

| Finding | Status |
|---|---|
| `/api/access-request` no auth | **STALE** — route is a 410 stub since 2026-04-25 owner decision (Ext-AA1). No auth needed because no functional behavior. |
| `registerIfPermitted` never called | **NOT FOUND** — function does not exist anywhere in `web/src` (verified grep). Either renamed or never existed. |
| `handlePaymentSucceeded` missing perms_version bump | **REFUTED** — bump is wired at `api/stripe/webhook/route.js:846` (W2-06 Q6). |
| `ExpertWatchlist concurrent-write clobber` | **PARTIAL** — `profile/settings/page.tsx:2732` has a comment about concurrent A11yCard / ExpertWatchlistCard saves. Wave 3 should read that block + the ExpertWatchlistCard at line 4892 to confirm if the clobber is mitigated or just acknowledged. |

**Net:** 3 of 4 Wave B "critical" findings are stale or refuted; 1 is partial.

## Q8: Q-SOLO-01 + Q-SOLO-05 unresolved — DEFERRED

Wave 3 should read `Q_SOLO_VERIFICATION.md` directly and attempt resolution by code/DB.

## Q9: C26 14-table RLS owner pasteback pending

Wave 3 should run the pg_policies query (Q6 above) and complete the classification automatically; the "owner pasteback" framing is no longer necessary if the data is queryable.

## Q10: O-DESIGN-* + Tiers A-D in EXT_AUDIT_FINAL_PLAN

Per Z03: "All 15 O-DESIGN-* items still open. Tiers A-D in FINAL_PLAN open."

Wave 3 should:
- For each O-DESIGN-* item: classify "still relevant" vs "shipped" vs "superseded by PRELAUNCH_UI_CHANGE"
- Tiers A-D items: same classification

Many are likely now superseded by PRELAUNCH_UI_CHANGE_2026-04-25 (the design doc dated today).

## Confirmed duplicates
- GG.3 / C26 / R-12-UB-03 (same fix, 3 IDs)
- OWNER_ACTIONS ↔ OWNER_TODO

## Confirmed stale
- Wave B "/api/access-request no auth" — route is now a 410 stub
- Wave B "registerIfPermitted never called" — function doesn't exist (search returned 0 hits)
- Wave B "handlePaymentSucceeded missing bump" — bump IS wired
- Most likely: many of the 47 NOTIFICATION_DIGEST lens findings are stale post-2026-04-24 work

## Confirmed conflicts
- (no internal audit contradictions beyond what Wave 1 already surfaced)

## Unresolved (Wave 3)
- 47 lens findings each need a status: shipped / stale / still-open
- 15 O-DESIGN-* + Tiers A-D items
- ExpertWatchlistCard concurrency mitigation status
- BUCKET5_TRACKER stale "queued" entries
- Q_SOLO_VERIFICATION resolutions
- permissions.js dual-cache stale-fallthrough trace
- pg_policies sweep for tables without policies (RLS table count)

## Recommended actions
1. **P1:** Pick canonical ID (C26) for the trio; mark others as `→ C26`.
2. **P1:** Consolidate OWNER_ACTIONS_2026-04-24 → OWNER_TODO_2026-04-24; archive OWNER_ACTIONS.
3. **P1:** Mark Wave B's 3 stale critical findings as resolved/refuted.
4. **P2:** Wave 3 sweeps NOTIFICATION_DIGEST 47 findings.
5. **P2:** Wave 3 runs pg_policies query for table-count truth.
6. **P2:** Wave 3 reads ExpertWatchlistCard concurrency code.
