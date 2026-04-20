# Verity Post — Production Cutover Runbook

Ordered operations checklist for pushing v2 to prod. Every step is idempotent or has a clear rollback.

---

## 0 — Prerequisites (one-time)

**Stripe (live mode)**

1. Create products + prices in the Stripe dashboard for each paid plan. Match names exactly:
   - `verity_monthly` (mo, $3.99), `verity_annual` (yr, $39.99)
   - `verity_pro_monthly`, `verity_pro_annual` ($9.99 / $99.99)
   - `verity_family_monthly`, `verity_family_annual` ($14.99 / $149.99)
   - `verity_family_xl_monthly`, `verity_family_xl_annual` ($19.99 / $199.99)
2. Copy each `price_...` ID into the matching row in `plans.stripe_price_id`:
   ```sql
   UPDATE plans SET stripe_price_id = 'price_LIVE_...' WHERE name = 'verity_monthly';
   -- ...etc for all 8 paid rows
   ```
3. Add webhook endpoint in Stripe dashboard:
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` in Vercel env

**Resend**

1. Verify the sending domain in Resend.
2. Set `RESEND_API_KEY` + `EMAIL_FROM` in Vercel env.

**Vercel env vars**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (live key, `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM` (e.g. `no-reply@veritypost.com`)
- `CRON_SECRET` — generate with `openssl rand -hex 32`
- `NEXT_PUBLIC_SITE_URL`

**Vercel cron**

The site's `vercel.json` declares three schedules:
- `/api/cron/freeze-grace` — hourly (D40 grace → freeze sweeper)
- `/api/cron/sweep-kid-trials` — daily at 03:00 UTC (D44 kid trial expiry)
- `/api/cron/send-emails` — every 10 minutes (notification email delivery)

Each route requires `Authorization: Bearer $CRON_SECRET`. Vercel automatically injects this when it's set as an env var — no extra wiring.

---

## 1 — Backup prod (ALWAYS)

```bash
# In Supabase dashboard → Database → Backups → Create point-in-time snapshot.
# Or via CLI:
pg_dump "$DATABASE_URL" | gzip > verity-prod-backup-$(date +%Y%m%d-%H%M).sql.gz
```

Store the backup outside the prod environment.

---

## 2 — Rehearsal against staging

Do this **twice** before touching prod.

```bash
# Point to staging.
export STAGING_DB_URL="postgres://...staging..."

# Apply every migration in order.
for f in 011_phase3_billing_helpers.sql \
         012_phase4_quiz_helpers.sql \
         013_phase5_comments_helpers.sql \
         014_phase6_expert_helpers.sql \
         015_phase7_helpers.sql \
         016_phase8_trust_safety.sql \
         017_phase9_family.sql \
         018_phase10_ads.sql \
         019_phase11_notifications.sql \
         020_phase12_cutover.sql; do
  echo "=== $f ==="
  psql "$STAGING_DB_URL" -f "$f" || exit 1
done

# Pre-flight verifies every RPC, setting, seed row, and env var.
node scripts/preflight.js

# End-to-end smoke exercises the full v2 flow against staging.
node scripts/smoke-v2.js
```

Both scripts must exit 0 before proceeding.

---

## 3 — Apply migrations to prod

```bash
export DATABASE_URL="postgres://...prod..."

psql "$DATABASE_URL" -f 011_phase3_billing_helpers.sql
psql "$DATABASE_URL" -f 012_phase4_quiz_helpers.sql
psql "$DATABASE_URL" -f 013_phase5_comments_helpers.sql
psql "$DATABASE_URL" -f 014_phase6_expert_helpers.sql
psql "$DATABASE_URL" -f 015_phase7_helpers.sql
psql "$DATABASE_URL" -f 016_phase8_trust_safety.sql
psql "$DATABASE_URL" -f 017_phase9_family.sql
psql "$DATABASE_URL" -f 018_phase10_ads.sql
psql "$DATABASE_URL" -f 019_phase11_notifications.sql
psql "$DATABASE_URL" -f 020_phase12_cutover.sql
```

Re-running any of these is safe — every statement is `CREATE OR REPLACE` / `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.

---

## 4 — Seed `plans.stripe_price_id` for live mode

```sql
UPDATE plans SET stripe_price_id = 'price_LIVE_VERITY_MONTHLY'          WHERE name = 'verity_monthly';
UPDATE plans SET stripe_price_id = 'price_LIVE_VERITY_ANNUAL'           WHERE name = 'verity_annual';
UPDATE plans SET stripe_price_id = 'price_LIVE_VERITY_PRO_MONTHLY'      WHERE name = 'verity_pro_monthly';
UPDATE plans SET stripe_price_id = 'price_LIVE_VERITY_PRO_ANNUAL'       WHERE name = 'verity_pro_annual';
UPDATE plans SET stripe_price_id = 'price_LIVE_FAMILY_MONTHLY'          WHERE name = 'verity_family_monthly';
UPDATE plans SET stripe_price_id = 'price_LIVE_FAMILY_ANNUAL'           WHERE name = 'verity_family_annual';
UPDATE plans SET stripe_price_id = 'price_LIVE_FAMILY_XL_MONTHLY'       WHERE name = 'verity_family_xl_monthly';
UPDATE plans SET stripe_price_id = 'price_LIVE_FAMILY_XL_ANNUAL'        WHERE name = 'verity_family_xl_annual';
```

---

## 5 — Pre-flight against prod

```bash
node scripts/preflight.js
```

Must exit 0. Warnings about runtime env (`STRIPE_SECRET_KEY` etc.) are informational if those are set in Vercel rather than locally.

---

## 6 — Deploy the site

```bash
# From site/:
vercel --prod
```

After deploy, hit the health endpoint:

```bash
curl -s https://<your-domain>/api/health | jq
```

Expected: `{"ok":true,"checks":{"db":"ok","stripe_secret":"present",...}}`

---

## 7 — Post-deploy smoke

1. **Auth** — sign up a new test account, verify the email arrives (Resend inbox).
2. **Quiz** — open an article with a populated pool, take the quiz, confirm pass unlocks discussion.
3. **Comments** — post a top-level comment, reply, upvote, tag as context.
4. **Billing** — click an upgrade button in `/profile/settings/billing`. Should redirect to Stripe Checkout.
   - Complete the checkout with a test card in live mode (or use Stripe's `4242 4242 4242 4242` if you kept test mode).
   - Confirm the webhook fires: `webhook_log` table gets a row with `processing_status='processed'`.
   - Confirm `users.stripe_customer_id` is now set and `plan_id` points to the purchased plan.
5. **Cron** — wait for the hourly mark (or manually trigger):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/freeze-grace
   ```
   Should return `{"frozen_count":0,...}` if nothing is overdue.
6. **Email** — trigger a weekly report:
   ```sql
   SELECT create_notification(
     '<some-paid-user-id>'::uuid,
     'weekly_reading_report',
     'Your Verity Post week',
     'Recap',
     '/recap',
     NULL, NULL,
     'normal',
     '{"articles_read":5,"quizzes_completed":3,"verity_score":420,"streak":2,"recap_url":"/recap"}'::jsonb
   );
   ```
   Then hit the cron manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/send-emails
   ```
   Verify `email_sent=true` on the notification row and the email arrives.

---

## 8 — Monitor (first 24h)

Watch in the Supabase dashboard:
- `webhook_log` for `processing_status='failed'` rows (anything > 0 = investigate).
- `notifications` for rows where `email_sent=false` and `metadata ? 'email_error'` (stuck in the queue).
- `auth.users` for sustained signup volume.

Watch in Vercel:
- `/api/stripe/webhook` — 500s mean signature failures or RPC errors.
- `/api/cron/*` — should all return 200 with their schedule cadence.
- `/api/auth/**` — error rate should be near zero.

---

## 9 — Rollback

If something's on fire:

1. **Kill switch (no deploy needed):**
   ```sql
   UPDATE feature_flags SET is_enabled = false WHERE key = 'v2_live';
   ```
   Surfaces that check `isV2Live()` fall back to maintenance mode.

2. **Full revert:**
   ```bash
   # Restore the backup from step 1.
   psql "$DATABASE_URL" < verity-prod-backup-YYYYMMDD-HHMM.sql
   # Redeploy the previous Vercel deployment.
   vercel rollback
   ```

---

## 10 — Post-cutover cleanup (defer to Phase 13)

**Do NOT do these in this cutover.** Wait at least 72h of clean prod before executing:

- `DROP TABLE reactions, community_notes, community_note_votes` (after confirming zero queries reference them).
- Delete `reset_and_rebuild.sql` (v1 file).
- Delete `admin/notes/page.js` if still present.
- Remove any remaining v1 code references surfaced by `grep -r "verity_tier\|reaction_count"`.
