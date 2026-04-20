# Deploy-prep checklist — owner-side tasks

Consolidates every remaining P0 that requires the owner (dashboard
toggles, SQL execution, env vars, article publishing) plus the four
seed SQLs from the 2026-04-20 session. Runnable as a single sitting —
roughly 45-60 minutes including verification.

**Current state at time of writing:** 20 commits ahead of
`origin/main` on `main`, not yet pushed. `tsc --noEmit` green at every
commit. Seed SQLs in `schema/101..104_*.sql`. See `/DONE.md` for the
shipped log.

---

## 0. Recommended order

1. Apply the 4 seed SQLs (§1)
2. Set Vercel env vars (§2)
3. Flip HIBP toggle (§3)
4. Rotate secrets (§4 — deferred last because rotation invalidates live sessions)
5. Reconcile migration disk↔live (§5)
6. Publish real articles (§6)
7. Push the 20 commits + redeploy (§7)

Each section is independent; you can skip ahead if one is already
done. Sections §2, §3, §4 are the true launch blockers.

---

## 1. Seed SQLs — 4 files, idempotent

Run all four in Supabase SQL editor (Project → SQL → New query →
paste → Run). Each uses `ON CONFLICT ... DO UPDATE` or `DO NOTHING`,
so re-running is safe.

- [ ] `schema/101_seed_rate_limits.sql` (T-003) — 31 rate-limit
      policies covering every `checkRateLimit()` call-site. Without
      this, limits fall back to hardcoded defaults baked into route
      files (which still works — the code is fail-open on missing
      DB rows).
- [ ] `schema/102_seed_data_export_ready_email_template.sql` (T-012)
      — adds the missing `email_templates` row referenced by the
      send-emails cron. Without it, data-export notifications are
      silently dropped.
- [ ] `schema/103_seed_reserved_usernames.sql` (T-014) — 76 names
      (admin/root/system/owner/verity/…). Without it, signup accepts
      these as usernames.
- [ ] `schema/104_seed_blocked_words.sql` (T-015) — ~35 starter
      profanity words with severity + action classifications. Without
      it, the comment profanity filter is inert.

**Verify (each):** after running, spot-check row counts:
```sql
SELECT COUNT(*) FROM rate_limits;        -- expect ≥ 31
SELECT 1 FROM email_templates WHERE key = 'data_export_ready';
SELECT COUNT(*) FROM reserved_usernames; -- expect ≥ 76
SELECT COUNT(*) FROM blocked_words;      -- expect ≥ 35
```

---

## 2. Vercel env vars

### T-009: Sentry DSN

Vercel → Project → Settings → Environment Variables, add to
**Production + Preview**:

- [ ] `SENTRY_DSN` = your Sentry project's DSN
- [ ] `NEXT_PUBLIC_SENTRY_DSN` = same value (exposed to the client)

**Without these:** `npm run build` hard-fails per `web/next.config.js`
lines 61-68. That means any redeploy will 500 until the env is set.

### T-010: Site URL

- [ ] `NEXT_PUBLIC_SITE_URL` = `https://veritypost.com` (Production)
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://<preview-domain>` (Preview)

**Without this:** `lib/siteUrl.js` (shipped in the T-010 dev half)
throws in prod → signup, password-reset, and OAuth callback all
return 500. Dev keeps using the `http://localhost:3333` fallback.

**Verify:** redeploy, then:
- Signup with a test email → verification email should land with
  `https://veritypost.com/api/auth/callback?code=...` (not localhost).
- Trigger a Sentry test event (e.g., visit a non-existent route with
  error logging) and confirm it shows up in your Sentry dashboard.

---

## 3. HIBP compromised-password toggle (T-007)

Supabase → Authentication → Providers → Email → scroll to **Password
strength** → enable **"Prevent use of compromised passwords"**.

**Verify:** signup with a known-leaked password like `password123`
returns an error instead of succeeding.

---

## 4. Rotate live secrets (T-008)

Follow the existing detailed runbook at
`docs/runbooks/ROTATE_SECRETS.md`. Summary:

- [ ] Supabase service-role key
- [ ] Stripe live secret key (`sk_live_...`)
- [ ] Stripe webhook signing secret

Each rotation has its own Vercel env update + redeploy step. Do the
rotations **after** §2 so the new deploy picks up all the new secrets
together.

**Timing:** rotate the day you plan to push/redeploy. Stripe gives a
12-hour overlap; Supabase rotation is instant and invalidates live
sessions, so expect users to be logged out.

---

## 5. Migration disk↔live reconcile (T-004)

Several migrations landed directly on the live DB without a matching
file in `schema/`. The disk-to-prod gap means a fresh environment
rebuilt from `schema/` would be missing state. Fix:

Step 1 — list the gap:
```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Cross-reference with `ls schema/`. Known-missing (see previous
handoff notes):
- `grant_anon_free_comments_view`
- `create_banners_storage_bucket`
- `deactivate_unused_ios_keys`
- `drop_ticket_messages_body_html`
- `add_require_outranks_rpc`
- `092_rls_lockdown`, `092b_rls_lockdown_followup`
- `093_rpc_actor_lockdown`
- `095_banners_bucket_lockdown`
- `096_function_search_path_hygiene` appears twice at different
  timestamps — one becomes `096_..._v2.sql`.

Step 2 — for each missing, pull the statements:
```sql
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
WHERE name = '<name>';
```

Step 3 — create `schema/<NNN>_<name>.sql` on disk with the
statements. Use the next available number sequence. Rename the
duplicate 096 to `096_function_search_path_hygiene_v2.sql`.

**Verify:** `ls schema/` line count matches the live migration count
(minus the legacy `reset_and_rebuild_v2.sql` + any RESERVED stubs).

---

## 6. Publish real articles (T-011)

Current state (2026-04-19 capstone):
- 6 articles published
- 5 of them titled `Test: ...`

Fix:
- [ ] Retire the 5 `Test:` articles (admin/stories → unpublish or
      delete).
- [ ] Publish ≥10 real articles with quiz pools populated.

**Verify:**
```sql
SELECT COUNT(*) FROM articles
WHERE status = 'published' AND title NOT ILIKE 'test%';
-- expect ≥ 10

SELECT COUNT(*) FROM articles
WHERE status = 'published' AND title ILIKE 'test%';
-- expect 0
```

---

## 7. Push the 20 commits + redeploy

Once §1-§6 are done:

```bash
cd /Users/veritypost/Desktop/verity-post
git log --oneline origin/main..HEAD | head -25   # sanity check
git push origin main
```

Then Vercel → Deployments → "Redeploy" the latest production. Ignore
the "Ignored Build Step" warning (that's the per-STATUS.md auto-deploy
disable; manual redeploy overrides it).

**Smoke-test matrix after deploy:**
- Signup → check verification email lands with real domain.
- Password-reset → check email lands with real domain.
- Login → session works.
- Admin hub → categories, features, rate-limits pages all render.
- One admin page mutation (e.g., toggle a feature flag) → verify it
  lands in `admin_audit_log`:
  ```sql
  SELECT action, created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 5;
  ```
- Paid-tier lock — navigate to a paid feature while on free tier →
  LockModal renders.

---

## What this does NOT cover

- **Apple Developer account** — gate on iOS publishing; not a web
  launch blocker. See CLAUDE.md "Current Apple block" section and
  TASKS.md T-033 through T-038.
- **Stripe V2 server URL** (T-033) — Stripe dashboard config for
  webhooks; handled during §4 rotation.
- **Google OAuth** (T-038) — GCP + Supabase wiring; not gate on
  launch but add before first OAuth user.

---

*Doc written 2026-04-20 during Batch D of the 2026-04-20 late-evening
session. Author: Claude Opus 4.7 (1M context).*
