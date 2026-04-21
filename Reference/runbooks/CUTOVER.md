# Production Cutover

Ordered checklist for deploying Verity Post to production. Every step is idempotent or has a rollback.

Prior runbook was based on the v1→v2 migration phase and referenced the deleted `site/` folder + an incomplete migration list; archived as `archive/2026-04-20-consolidation/CUTOVER.md.old`.

---

## 0 — Prerequisites (one-time)

Confirm all OWNER items in `/TODO.md` §OWNER are closed before starting:
- #1 seed SQLs 101–104 applied
- #2 secrets rotated (Supabase service-role, Stripe live, Stripe webhook)
- #3 Vercel env vars set (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_JWT_SECRET`)
- #4 HIBP enabled in Supabase Auth
- #5 ≥10 real articles published, all `Test:` placeholders removed
- #5b `streak.freeze_max_kids` setting seeded
- #6 admin/owner seats audited, no stragglers
- #7 Stripe dashboard audited (webhooks, keys, Connect)
- #8 Vercel team + env-var history audited

---

## 1 — Backup prod (always)

```bash
# Supabase dashboard → Database → Backups → create point-in-time snapshot.
# Or via CLI:
pg_dump "$DATABASE_URL" | gzip > verity-prod-backup-$(date +%Y%m%d-%H%M).sql.gz
```

Store the dump outside the prod environment. Retain for at least 30 days.

---

## 2 — Apply any unapplied disk migrations to prod

Migrations live in `schema/NNN_*.sql`. Apply in numeric order.

```bash
export DATABASE_URL="postgres://...prod..."

for f in schema/1[0-9][0-9]_*.sql; do  # or a specific range
  echo "=== $f ==="
  psql "$DATABASE_URL" -f "$f" || exit 1
done
```

Every migration is `CREATE OR REPLACE` / `IF NOT EXISTS` / `ON CONFLICT`, so re-running is safe.

Note: `schema/reset_and_rebuild_v2.sql` is the DR-replay canonical, not a cutover step. See TODO #16 for outstanding reconciliation.

---

## 3 — Run preflight against prod

```bash
cd /path/to/verity-post
node scripts/preflight.js
```

Must exit 0. Preflight verifies:
- Supabase reachable
- All Phase 3–11 RPCs exist
- Seed data present (9 plans, 8 roles, ≥3 email templates, admin/owner exists)
- All 9 Vercel crons scheduled
- All paid plans have `stripe_price_id`
- Settings seeds present

Runtime env warnings (STRIPE_SECRET_KEY etc.) are informational if those are in Vercel rather than local `.env.local`.

---

## 4 — Deploy web

```bash
cd web
vercel --prod
```

Note: Vercel's Ignored Build Step is ON by default for this project, so auto-deploy on push is disabled. Manual `vercel --prod` is the only way to ship.

After deploy:

```bash
curl -s https://veritypost.com/api/health | jq
```

Expected: `{"ok":true, "checks": {...}}`.

---

## 5 — Post-deploy smoke

**TBD — smoke test needs redesign.** The prior walkthrough (`docs/runbooks/TEST_WALKTHROUGH.md`, retired 2026-04-21 to `Archived/_retired-2026-04-21/TEST_WALKTHROUGH.md`) relied on 18+ seeded test accounts that the owner wiped from live DB on 2026-04-21. A replacement admin-only or single-user smoke test must be authored before production cutover. Until then, verify the critical paths below manually with the admin user and fresh test content.

Critical paths to cover once a new walkthrough exists:
- Signup → verify email → welcome → home feed
- Quiz pass → comment unlocks
- Stripe checkout → webhook fires → plan flips
- Admin hide/penalty → audit_log row lands
- Kid pair code → iOS JWT session works
- Crons: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/send-emails` → 200

---

## 6 — Monitor (first 24h)

**Supabase dashboard:**
- `webhook_log` → `processing_status='failed'` count should stay 0
- `notifications` → rows with `email_sent=false` + `metadata ? 'email_error'` should stay 0
- `auth.users` → signup volume sane

**Vercel / Sentry:**
- `/api/stripe/webhook` → no 5xx
- `/api/cron/*` → all return 200 at their cadence
- `/api/auth/**` → error rate near zero
- Sentry inbox → triage any new issues; PII scrubber (see #33 work) strips emails/IPs but not error shapes

---

## 7 — Rollback

If something's on fire:

**Kill switch (no deploy):**
```sql
UPDATE feature_flags SET is_enabled = false WHERE key = 'v2_live';
```
Surfaces that check `isV2Live()` return 503.

**Full revert:**
```bash
# Restore from step 1 backup.
psql "$DATABASE_URL" < verity-prod-backup-YYYYMMDD-HHMM.sql

# Roll back Vercel deploy.
vercel rollback
```
