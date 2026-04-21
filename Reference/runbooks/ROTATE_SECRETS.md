# Secret Rotation Checklist — F-001 (owner-driven)

Triggered by Fresh Audit finding F-001 and Deep Audit cross-ref. Live secret
material was found in `web/.env.local` on disk (plaintext, 4,261 bytes, last
modified 2026-04-17 06:49). No git history exists in this tree yet (no `.git/`
at root and no `.gitignore` prior to Chunk 1). The file has not been pushed
anywhere from this tree, but the values must still be treated as disclosed
because:

1. The file sat on a developer workstation in plaintext with no access control
   beyond macOS file permissions.
2. Any build tool, script, or editor plugin that scans `.env*` could have
   transmitted the values.
3. The Fresh Audit agent read the file — so at minimum one non-owner process
   has seen the secrets within the audit trail.

## Keys to rotate (and where to rotate each)

Rotate every key below, in this order. The order matters because Stripe and
Supabase use different rekeying paradigms and iOS will hard-crash on a bad
Supabase key during launch (F-027).

### 1. SUPABASE_SERVICE_ROLE_KEY (`sb_secret_...`)

- Supabase dashboard → Project settings → API → **Reset service role key**.
- New value goes into Vercel env (Production / Preview / Development) for
  `SUPABASE_SERVICE_ROLE_KEY`. Do NOT place it back in `web/.env.local`.
- For local dev use a separate dev project's service key, kept in
  `web/.env.local` only on machines that need it; never the prod key.
- After rotation: Vercel "Redeploy" latest production deployment so functions
  pick up the new key. Crons will begin using the new key on the next fire.
- Verify: hit `/api/health` (or another service-role route) post-deploy.

### 2. STRIPE_SECRET_KEY (`sk_live_...`)

- Stripe dashboard → Developers → API keys → **Roll** on the live secret.
- Stripe shows a one-time 12h overlap where the old key still works; use
  that window to deploy the new key without downtime.
- Update Vercel env `STRIPE_SECRET_KEY`; redeploy.
- Verify: create a test checkout session via `/api/stripe/checkout` and
  confirm the response includes a session id.

### 3. STRIPE_WEBHOOK_SECRET (`whsec_...`)

- Stripe dashboard → Developers → Webhooks → select the production endpoint
  → **Roll signing secret**. Copy the new value.
- Update Vercel env `STRIPE_WEBHOOK_SECRET`; redeploy.
- Verify: Stripe dashboard → Webhooks → Send test event
  (`checkout.session.completed`); confirm 200 at `/api/stripe/webhook` and
  that the event row appears in `webhook_log`.

### 4. Any other secrets in `web/.env.local`

Open `web/.env.local` and rotate every credential present. Candidates to
audit:

- `RESEND_API_KEY` — Resend dashboard → API keys.
- `OPENAI_API_KEY` — OpenAI dashboard → API keys.
- `APNS_AUTH_KEY` — Apple Developer → Keys (regenerate the p8). Update
  `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` if those need to change.
- `CRON_SECRET` — generate a new 32-byte random value:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- Any `*_SECRET`, `*_KEY`, `*_TOKEN`, `*_PASSWORD` in the file.

Supabase `anon` / publishable key does not need rotation (public by design)
unless you have a policy against reusing it.

## After rotation

1. Delete `web/.env.local` from disk (or truncate it to only non-secret
   local-dev values).
2. Create `web/.env.example` with variable names and placeholder comments
   but no values. This is the onboarding reference.
3. Confirm `.gitignore` at repo root lists `.env*` and `web/.env.*` — covered.
4. Before `git init`, run `grep -R "sb_secret\|sk_live\|whsec_" .` from repo
   root to sanity-check no other plaintext secrets remain.
5. Re-deploy to Vercel and run the full auth + checkout + webhook smoke path
   end-to-end.

## Detection / monitoring

- Watch Stripe event log for unknown requests in the 24h after rotation.
- Watch Supabase logs for unauthenticated service-role calls.
- If any of the old keys is found to have been used post-rotation window,
  file a P0 incident and notify affected users.

## Owner sign-off

- [ ] Supabase service role rotated
- [ ] Stripe live secret rotated
- [ ] Stripe webhook secret rotated
- [ ] Resend / OpenAI / APNs / CRON secrets rotated (or confirmed not in file)
- [ ] `web/.env.local` deleted (or reduced to dev-only values)
- [ ] `site/.env.example` created
- [ ] Vercel redeployed; smoke test passed
- [ ] `grep` for old prefixes returns empty across repo
