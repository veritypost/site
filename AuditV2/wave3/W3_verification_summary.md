# Wave 3 Verification Summary

(Done in main thread; Wave 2 agents hit org budget cap so Wave 3 was scoped to highest-leverage spot-checks.)

## Confirmed via DB queries

### settings table (30 rows, full dump)
Pipeline cost-cap IS DB-driven (refines W2-02 finding):
- `pipeline.daily_cost_usd_cap = 10`
- `pipeline.per_run_cost_usd_cap = 0.50`
- `pipeline.daily_cost_soft_alert_pct = 50`

Adult quiz threshold is NOT in settings (still hardcoded `>= 3` in RPC).
Kid quiz threshold IS DB-driven: `kids.quiz.pass_threshold_pct = 60`.
Streak config IS DB-driven: `streak.freeze_max_kids = 2`.
Comment config IS DB-driven: `comment_max_depth = 2`, `comment_max_length = 4000`.
Pipeline operations all DB-driven (cluster_lock_minutes, cluster_overlap_pct, plagiarism_*, etc.).

### ai_models (4 rows, all is_active=true)
- anthropic/claude-sonnet-4-6 ($3.00/$15.00 per 1M tokens)
- anthropic/claude-haiku-4-5-20251001 ($1.00/$5.00)
- openai/gpt-4o ($2.50/$10.00)
- openai/gpt-4o-mini ($0.15/$0.60)

### Tables without RLS policies
Only **`events`** parent table — partitioned, RLS enabled but no policies (intentional; writes via service role only). `events_*` partitions have RLS disabled (correct PostgreSQL pattern).

**Wave A's "35 tables" claim and Wave B's "1 table no RLS + 14 RLS-no-policies" claim are BOTH wrong.** Only 1 table qualifies, and it's intentional.

### tsconfig.json strict
`"strict": true` (line 7). **PM_PUNCHLIST line 60 claim "strict: false" is WRONG** — refuted.

## Confirmed via grep

### roles.js verified clean
Exports OWNER_ROLES, ADMIN_ROLES, EDITOR_ROLES, MOD_ROLES, EXPERT_ROLES. Plus `getRoles()` cached helper that reads DB. No drift.

### Comment status `'published'` writes
**Zero hits** in web/src/app/api/comments/ or web/src/app/api/admin/moderation/. Wave A's "comment_status enum drift `'visible'` vs `'published'`" is **refuted** — the live system is consistent on `'visible'`/`'hidden'`. The 6/6 audit consensus was a false alarm.

### kids/trial route gate
`requirePermission('kids.parent.view')` — properly gated.

### Wave B "registerIfPermitted never called"
Function does NOT exist anywhere in `web/src` — refuted (zero grep hits).

### Wave B "/api/access-request no auth"
Route is a 410 stub since 2026-04-25 owner decision (Ext-AA1) — refuted.

### Wave B "handlePaymentSucceeded missing perms_version bump"
Bump IS wired at `api/stripe/webhook/route.js:846` — refuted.

### F2 reading-receipt code
`reading_log` table is actively used (8 rows). API at `/api/stories/read`, admin reader/stories/analytics pages, profile + kids pages all consume it. **F2 is built, not just hidden.** Wave 3 caveat: separate the data layer (built) from the UI surface (may be hidden).

## Findings that remain unresolved (need owner decision or further work)

1. **Charter retired-but-still-cited** (W2-08 Q5) — owner decision: resurrect 4 docs OR mass-edit 6 citing docs.
2. **Story-manager vs F7 articles/[id]/{review,edit}** (W2-02 Q3) — keep parallel admin or deprecate legacy?
3. **kids-story-manager (1037 LOC) vs story-manager (1229 LOC)** — merge with kid filter or keep parallel?
4. **F1-F4 vs PRELAUNCH_UI_CHANGE scope diff** — Wave 3 needs side-by-side reading.
5. **47 NOTIFICATION_DIGEST lens findings** — sweep needed (post-2026-04-24 work likely closed many).
6. **15 O-DESIGN-* + Tiers A-D items** — classify against PRELAUNCH_UI_CHANGE.
7. **xlsx ↔ DB row diff** — needs Python/Node xlsx reader.
8. **AuditV1 vs AuditV2** — archive AuditV1 once V2 final.
9. **PROFILE_FULL_FLOW.md** — read it to decide promotion to Reference/.
10. **`is_active=false` on verity_family_annual + family_xl plans** — intentional or oversight?

## Other Wave 3 spot-confirmations applied to AuditV2

- W2-02 cost-cap finding **partially wrong** — costs ARE in DB settings; but `web/src/lib/pipeline/cost-tracker.ts` likely reads them. Verify in synthesis.
- W2-09 settings table has 30 rows (not 24 as list_tables said).
- Adult quiz threshold IS hardcoded in `user_passed_article_quiz` RPC — confirmed (`>= 3`), confirmed no `quiz_*` setting exists for adults.
