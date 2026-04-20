# TODO

Two lists: what the owner still needs to do, and what I'm still working on autonomously.

When something ships: delete the block. Git log is history.

---

## Owner to-do

Ordered roughly by urgency relative to launch. Pick them off at your own pace.

### 1. Start the Apple Developer account enrollment
developer.apple.com → Enroll → $99/year. Individual is fastest; Organization needs a DUNS number and takes 2+ weeks. Start now even though web launches first — approval lead-time is multi-day and it unblocks everything iOS (App Store products, APNs, Universal Links, TestFlight). No code ships until this lands.

### 2. Remove ex-dev from Vercel team (30 seconds)
Vercel dashboard → Settings → Team → remove the account. Key rotation doesn't kick someone out of the team — while they're still on it, they could deploy a branch that overwrites env vars and bypass your rotation.

### 3. Stripe 3-check (2 minutes)
Key rotation closed the signing path, but any of these three could still be live:
1. Developers → Webhooks — only one endpoint, pointing at `veritypost.com/api/stripe/webhook`?
2. Connect → Accounts — none you didn't create?
3. Settings → Team — ex-dev removed?

If all three look clean, the deeper audit can wait.

### 4. Publish ≥10 real articles; remove the 5 `Test:` placeholders
Easiest via `/admin/story-manager` on the deployed site once it's running. Each article needs a quiz pool of ≥10 questions or the comment section stays hidden (per D1).

**Verify:** `select count(*) from articles where is_published=true and title not ilike 'test%'` ≥ 10.

### 5. Apply `schema/106_kid_trial_freeze_notification.sql` to live DB
Paste the contents of `schema/106_kid_trial_freeze_notification.sql` into Supabase → SQL Editor → Run. It's one `CREATE OR REPLACE FUNCTION`; PostgREST doesn't accept DDL so I can't apply it for you. Extends the kid-trial cron to notify the parent when a trial freezes (D44).

### 6. (Optional) Migration list for DR replay
Paste this into Supabase SQL Editor and send me the output:
```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```
Once I have the list, I commit the missing migrations on disk and patch `schema/reset_and_rebuild_v2.sql` so a from-scratch replay reproduces live. You can launch without this; skipping it means disaster-recovery replay is incomplete until you run it.

### 7. Enable HIBP (leaked-password check) in Supabase Auth
Authentication → Policies → toggle "Leaked password protection" on. Blocks signup with known-breached passwords. Flip before opening signups to real volume — the pre-launch test-account cohort doesn't warrant it but real users do.

### 8. Full Vercel audit
Settings → Environment Variables → "View History" on each row. Look for unexpected edits in the last few months. Settings → Git / Deployment Protection should be on for production.

### 9. Full Stripe audit
Developers → Webhooks (enabled endpoints), API keys (including restricted keys), Connect accounts, team members. Anything the ex-dev may have added that a key rotation didn't cover.

### 10. Enable Sentry error tracking
1. Create Sentry project at sentry.io; copy DSN.
2. Vercel env → set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (same value) in production + preview.
3. Optional: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source-map upload.
4. Redeploy.

All the code is already wired (instrumentation.ts, client config, PII scrubber) — the env vars are the only switch. Value scales with traffic; pre-launch doesn't need it, real-user traffic does.

---

## What I'm still working on

6 autonomous items remain. None are launch-blockers; most are hygiene.

### #23 — Admin audit backfill for 12 remaining routes
ad-campaigns / ad-placements / ad-units / recap / sponsors admin routes don't write audit_log rows yet. Config-level mutations, not security-critical. Mechanical sweep, ~30 min.

### #31 — Admin `as any` cleanup (~20 sites)
Concentrated in `admin/subscriptions/page.tsx`. Replace with proper types from `web/src/types/database.ts`. Unblocks #32.

### #32 — Turn on TypeScript strict mode
`web/tsconfig.json` has `strict: false`. Flip on + add `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Fix whatever surfaces. Best after #31.

### #35 — ParentalGate lockout → Keychain
Currently in UserDefaults (bypassable via uninstall/reinstall). Keychain-survives-reinstall requires iCloud Keychain flag + encoding Date. Complex; worth doing before App Store submission but not gating.

### #46 — Pre-launch holding page (optional)
`docs/planning/PRELAUNCH_HOME_SCREEN.md` blueprint: middleware.ts + /preview bypass route + env toggle `NEXT_PUBLIC_SITE_MODE=coming_soon`. 30 min. Only needed if you want a public "coming soon" during final QA.

### #49 — Lint / format config
Repo has no ESLint or Prettier. Minimal config + pre-commit hook would catch several classes of the issues found in this audit. Quality-of-life, not correctness.
