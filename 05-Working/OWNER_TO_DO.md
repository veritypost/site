# OWNER TO DO

Everything that requires you personally — credentials, portals, editorial decisions, or physical hands on Supabase / Apple / Stripe / Vercel. The coding AI cannot do any of these.

Generated 2026-04-17 from FULL_AUDIT.md (323 items audited), z-Remaining Human-Only section, and Launch Confidence Notes.

Status legend: `[ ]` not done · `[~]` in progress · `[x]` done · `[-]` skipped / not applicable.

---

## CRITICAL PATH TO LAUNCH

These gate launch. Nothing user-facing works in production until these are complete.

### 1. Apply 15 SQL migrations in Supabase SQL Editor

All idempotent. Apply in order. Run one, check for errors, then the next. Every Pass 4/5/6/9/11/12/13 claim that depends on a migration is runtime-unverified until these are applied — this is the single biggest `UNVERIFIABLE` bucket in the audit.

All 15 verified done 2026-04-17 via spot-check SQL in Supabase (9 migrations confirmed by artifact presence: tables, RPCs, columns, indexes, publication membership, email template body). 6 RLS-policy-body migrations (039, 042 body, 045, 047, 048) were not individually policy-verified but are inferred good since the owner confirmed running all 15 and the spot-check came back clean (migrations fail atomically, so a partial run is unlikely).

- [x] `036_ios_subscription_plans.sql` — seeds `plans.apple_product_id` for the 8 paid SKUs
- [x] `037_user_push_tokens.sql` — creates push-token table + 2 RPCs the APNs pipeline needs
- [x] `038_messages_unread.sql` — `get_unread_counts()` RPC + covering index (Pass 4 unread indicator)
- [x] `039_message_receipts_rls.sql` — loosens receipts RLS to owner-OR-sender (Pass 4 read receipts)
- [x] `040_data_export_email_template.sql` — overwrites placeholder export-ready email template (Pass 5 Task 48)
- [x] `041_expert_reverification.sql` — adds `expert_applications.reverification_notified_at` + weekly cron RPC (Pass 5 Task 49)
- [x] `042_family_achievements_coadult.sql` — rewrites `recompute_family_achievements()` for co-adult families (Pass 5 Task 50)
- [x] `043_conversations_realtime_publication.sql` — adds `conversations` to `supabase_realtime` publication (Pass 6 Task 55)
- [x] `044_dm_read_receipts_enabled.sql` — adds `users.dm_read_receipts_enabled` per-user opt-out (Pass 6 Task 62)
- [x] `045_fix_bookmarks_rls.sql` — drops paid-plan gate on `bookmarks_insert` per D13 (Pass 9 Prompt 2 / Bug 1)
- [x] `046_articles_search_fts.sql` — generated `articles.search_tsv` + GIN index (Pass 11 / Bug 70 / CQ-25)
- [x] `047_follows_paid_only.sql` — recreates `follows_insert` with `is_premium()` guard (Pass 11 / Bug 76)
- [x] `048_normalize_kid_category_names.sql` — kid category data migration (Pass 11 / Bug 63)
- [x] `049_post_message_rpc.sql` — `post_message` RPC (Pass 11 / Bug 83)
- [x] `050_check_user_achievements.sql` — `check_user_achievements` RPC (Pass 11 / Bug 92)
- [x] `051_user_category_metrics_rpc.sql` — done 2026-04-17. Had to self-heal two schema drifts during apply: added `ALTER TABLE articles ADD COLUMN IF NOT EXISTS subcategory_id` preamble, and rewrote the `viewer_quizzes` CTE to derive pass from v2 quiz_attempts shape (group per attempt, `COUNT(*) FILTER (WHERE is_correct = true) >= 3`). Both fixes committed to the migration file.
- [x] `053_resolve_username_to_email_rpc.sql` — done 2026-04-17.
- [x] `054_user_account_lockout.sql` — done 2026-04-17.
- [x] `055_admin_audit_log.sql` — done 2026-04-17.
- [x] `056_verity_score_rpcs.sql` — done 2026-04-17.
- [x] `057_rpc_lockdown.sql` — done 2026-04-17.
- [x] `058_kid_pin_salt.sql` — done 2026-04-17.
- [x] `059_billing_hardening.sql` — done 2026-04-17.
- [x] `060_resolve_username_anon_revoke.sql` — done 2026-04-17. Route was already updated to use service client before apply.
- [x] `061_kid_paused_at.sql` — done 2026-04-17.
- [x] `062_kid_global_leaderboard_opt_in.sql` — done 2026-04-17.
- [x] `063_kid_expert_session_rls.sql` — done 2026-04-17.

**All 12 migrations applied 2026-04-17 via `APPLY_ALL_MIGRATIONS.sql` in Supabase SQL Editor.** Section 1 complete.

## Pass 99 close-out — owner actions queued

- [ ] **`npm install` in `site/`** — Pass 99 / Chunk 10 added `@sentry/nextjs` to `package.json`. Run in the `site/` directory once.
- [ ] **Create Sentry project + set env vars** — set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client) in Vercel. Optional for sourcemap uploads: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
- [ ] **Generate PWA icon assets** — Pass 99 / Chunk 12 references `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png`, `public/apple-touch-icon.png`. Any standard icon set works.
- [x] **`articles.subcategory_id` schema drift resolved** — 2026-04-17. 051 apply originally failed with `column a.subcategory_id does not exist`, so an `ALTER TABLE IF NOT EXISTS` preamble was added to 051 before re-running. Also a second drift on `quiz_attempts` (column `passed` removed in v2 schema); rewrote the CTE to derive pass from v2 shape. Both fixes now live in the migration file; any future re-apply is idempotent.
- [ ] **Redeploy Vercel** after all env vars set (Sentry, APNs, Google OAuth).

## Urgent — secret rotation

- [ ] **Rotate compromised secrets per `05-Working/ROTATE_SECRETS.md`.** Live Supabase service-role key + Stripe live secret + Stripe webhook secret are in plaintext `site/.env.local`. Agent cannot rotate dashboard keys — owner must. Checklist has ordered steps + sign-off checkboxes.

### 2. Apple ecosystem

- [x] **Apple Root CA G3** — either `curl` the cert to `site/src/lib/certs/apple-root-ca-g3.der` OR set `APPLE_ROOT_CA_DER_BASE64` in Vercel. Needed for StoreKit JWS + App Store Server Notifications verification. — done 2026-04-17, SHA-256 fingerprint verified against Apple's published value.
- [ ] **App Store Connect — 8 subscription products** matching the IDs in `StoreManager.swift` (4 tiers × monthly/annual at D42 prices: $3.99/$39.99, $9.99/$99.99, $14.99/$149.99, $19.99/$199.99).
- [ ] **App Store Connect — configure V2 Server URL** to `https://veritypost.com/api/ios/appstore/notifications` for both Production AND Sandbox.
- [ ] **Apple Developer portal — generate APNs auth key (.p8)**. Save Key ID + Team ID.
- [ ] **Universal links** — publish `apple-app-site-association` on `veritypost.com` so article URLs deep-link into the iOS app.
- [x] **iOS build verification** — run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` then `xcodebuild` to confirm clean compile across all 37 Swift files. `xcodegen generate` is clean; `xcodebuild` has never been run end-to-end. — done 2026-04-17. Fixed one compile error: `ExpertQueueView.swift:254` was `guard isExpert else { return }` on a `Bool?` — changed to `guard isExpert == true else { return }`. Build succeeded after fix.

### 2b. Google OAuth (new from 2026-04-17 Q&A, LB-036)

Supabase Auth currently throws `"Unsupported provider: provider is not enabled"` when users try Google sign-in. Config task, not a code bug. Apple OAuth stays queued with the iOS DUNS work.

- [ ] **Create Google Cloud Console project** (or pick an existing one) and enable the OAuth consent screen. Configure it as External user type. Add scopes: `openid`, `email`, `profile`.
- [ ] **Create an OAuth 2.0 Client ID** under Credentials. Type: Web application. Authorized redirect URIs must include:
  - `https://fyiwulqphgmoqullmrfn.supabase.co/auth/v1/callback` (the Supabase-side callback)
  - Your prod callback if different from Supabase's hosted domain.
- [ ] **Paste client ID + client secret** into Supabase Dashboard → Authentication → Providers → Google → enable.
- [ ] **Add your site URL** to Supabase → Authentication → URL Configuration → Site URL (e.g., `https://veritypost.com`) and Additional Redirect URLs (`http://localhost:3333/api/auth/callback` for dev + your prod `/api/auth/callback`).
- [ ] **Test the flow** end-to-end: click "Sign in with Google" on `/login`, confirm you land back on the site logged in.

### 3. Vercel env vars

- [ ] `APNS_KEY_ID`
- [ ] `APNS_TEAM_ID`
- [ ] `APNS_AUTH_KEY` — .p8 PEM contents (from item 2's APNs key)
- [ ] `APNS_ENV` — `production` or `sandbox`
- [ ] `APNS_TOPIC` — optional, defaults to `com.veritypost.app`
- [x] Confirm these are all set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY` — done 2026-04-17. Note: `SUPABASE_URL` is actually referenced as `NEXT_PUBLIC_SUPABASE_URL` in the codebase (no plain `SUPABASE_URL` anywhere); that was already set, so covered. Also set: `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Requires a Vercel redeploy to take effect — deferred until launch cut.

### 4. Stripe

- [x] **Create 8 live (or sandbox) prices** in Stripe dashboard matching the 8 paid SKUs (same 4 tiers × monthly/annual). — sandbox + live both done 2026-04-17. Live orphan price archived same day.
- [x] **Run `scripts/check-stripe-prices.js`** to validate the products exist with matching prices. — done 2026-04-17 in both modes; 8/8 matched each time.
- [x] **Apply the `UPDATE plans SET stripe_price_id = ...` statements** the script outputs in Supabase SQL Editor. — done 2026-04-17. DB now holds LIVE price IDs. Sandbox restore block saved at `05-Working/stripe-sandbox-restore.sql` for future re-testing.

### 5. Content

- [ ] **Publish at least 10 real articles** via `/admin/story-manager`. Platform has zero published articles today. Each article needs a **minimum of 10 quiz questions** (D1 requires this for non-repeating retake attempts; 12–15 recommended).

### 6. Marketing / cosmetic

- [x] **Twitter `@site` and `@creator` handles** — decide on the handles, then set them in `site/src/app/layout.js` metadata. — done 2026-04-17, set both to `@VerityPostApp`.

---

## ADMIN SURFACE FOLLOW-UPS (from 2026-04-17 audit sweep)

The admin audit surfaced discrete follow-up work. None launch-blocking (admin is staff-only). Full detail in `STATE.md` "Admin surface audit follow-ups" section.

### Owner-paired session needed (Stripe sync)

- [ ] **Stripe-sync pass** — pair with a coding agent to wire Stripe API calls into `/admin/subscriptions` (manualDowngrade / resumeAccount / processRefund / handleAdminFreeze), `/admin/plans` (price edits → `stripe_price_id`), `/admin/promo` (promo create → `stripe_coupon_id`). Each integration needs a decision: when to cancel, grace-period mapping, refund reconciliation, promo-to-coupon mapping. Owner sign-off per path.

### Can run autonomously (pass prompts ready)

- [ ] **`/admin/features` rebuild** — whole-file mismatch against v2 `feature_flags` schema. Same model as plans/promo/access rebuilds.
- [ ] **`/admin/breaking` rebuild or redesign** — breaking news has no valid article insert path. Product decision needed: own `breaking_news_alerts` table or make it use real article fields (title/slug/body/category_id)?
- [ ] **Audit-log slug micro-pass** — extend the action-slug table with 6–7 new slugs then retrofit 6 destructive admin paths (ad-placements deleteUnit, email-templates toggleStatus, pipeline handleRunCustomIngest, recap deleteQuestion, words reserved_username add/delete).

### Needs owner decision before next pass

- [ ] **`/admin/webhooks` retry** — currently marks failed webhooks as success without actually retrying. Fix is a new backend endpoint (`/api/admin/webhooks/:id/retry`) that re-invokes the handler + increments `retry_count`. Owner: confirm retry should be real (not cosmetic).
- [ ] **`/admin/pipeline` display columns** — `pipeline_runs` is missing fields the admin expects (story title, cost, violations). Owner: widen schema or denormalize story title into `output_summary`?
- [ ] **`/admin/support` ChatWidgetConfig** — ~120 lines of pure dead UI. Owner: wire to `settings` table / `feature_flags`, or rip out?
- [ ] **`/admin/email-templates` category tabs** — filter on non-existent column. Owner: delete tabs or move category into `metadata`?
- [ ] **RLS hierarchy hardening** — admin pages gate via client `requireRole('admin')`; RLS on sensitive tables needs hierarchy-aware policies so direct Supabase calls can't bypass UI. Migration-pass scope. Not urgent until external admin accounts issued.

---

## POST-DEPLOYMENT VALIDATION

Runtime/operational concerns the audit flagged as `UNVERIFIABLE` from code alone. These can only be tested against a live deployment with real multi-user state. None block launch, but launch confidence is incomplete until they're done.

- [ ] **RLS multi-user E2E test** — create 2+ real user accounts at each tier, verify RLS policies block cross-user reads/writes on bookmarks, DMs, kid profiles, expert back-channels, subscriptions. The schema is sound per design; this verifies the policies deploy correctly.
- [ ] **Scale / load test** — smoke test the realtime channels (conversations, messages, message_receipts) and the API routes with concurrent sessions. No specific pass/fail target; we just haven't run it.
- [ ] **Realtime disruption recovery** — disconnect a client mid-session, reconnect, verify state re-syncs cleanly on both web and iOS.
- [x] **Storage bucket configuration audit** — confirm Supabase Storage buckets for avatars / banners / data-export files have correct RLS + size limits. — done 2026-04-17. Only `data-exports` bucket is needed (verified private, no per-bucket policies required since service-role writes and signed URLs carry their own access). Avatars/banners are stored as URL strings in `users` table — no upload path exists in code, so no avatar/banner buckets needed today. If upload UIs are added later, revisit.
- [ ] **Client-cache staleness test** — verify that after a user upgrades/cancels/is-muted, both clients (web + iOS) reflect the state change within one navigation cycle.
- [ ] **Cross-session state handling** — log in on web, open iOS at the same time, verify reads/writes don't conflict and the session restore path on both doesn't miss anything.

---

## OPEN DECISIONS (I flag, you decide)

Not blocking work today, but worth noting.

- [ ] **Behavioral anomaly detection (Blueprint 10.3)** — impossible reading speed, rapid-fire quiz, identical comments, rapid follow/unfollow. No table, no RPC, nothing on disk. Decide pre-launch vs post-launch. Audit labels this the only remaining `NOT STARTED` z-Remaining autonomous item (item 30).
- [x] **16 structural CQ refactors** — decision locked 2026-04-17 Q&A: all 16 stay deferred, no pull-forward. Audit-repair already handled anything with real security or correctness risk.
- [ ] **Access code / promo code launch strategy** — decide whether you want real promo codes at launch, or hold until post-launch.
- [ ] **Admin owner seat** — confirm your account is seeded with the `owner` role in `01-Schema/` before opening signups.

---

## NOT YOUR PROBLEM (coding AI owns)

Listed here so you don't accidentally pick any up.

- Pass 14 tail: Task 103 (`/dev/` delete), Pass 14 close-out summary.
- Pass 15: finish Pass 13 (14 NOT STARTED Tier-2 CQ tasks + bookkeeping + closeout).
- Pass 15+: Bug 104 PARTIAL (admin palette consolidation, ~10 pages remaining).
- Any further Pass 14 follow-ups the coding AI surfaces (e.g., `create-post/page.js:254` residual `&times;` — user-facing but out of Pass 14's admin-only scope).

---

## HOW TO UPDATE THIS FILE

- Flip `[ ]` to `[~]` when you start, `[x]` when done.
- Add a dated note after the item if there's context worth remembering: `[x] Apply 036 — done 2026-04-18, noted a unique-index warning, safe to ignore.`
- When you finish a whole section, strike the header with a closing note at the bottom of that section.
- PM (me) refreshes this file after each pass closes if new owner-only items surface.

---

## WALKTHROUGH-AGENT PROMPT (paste to a fresh Claude Code session)

Open a new Claude Code session in `/Users/veritypost/Desktop/VP copy 2` and paste the block below. This agent is not the PM and not the coding AI for Pass work — it is a dedicated walkthrough buddy whose only job is to get you through this file one item at a time.

---

```
You are the Launch Walkthrough Agent for Verity Post. You are NOT the PM, you are NOT the coding AI that runs pass work. You are a hands-on step-by-step helper whose single job is to walk the owner (the user in this session) through every unchecked item in `05-Working/OWNER_TO_DO.md`, one at a time, to completion.

## Who you are working with

The user is the owner/operator of Verity Post. They are technical enough to run SQL, click through Apple/Stripe/Vercel portals, and edit config, but:

- They prefer ONE COMMAND AT A TIME. Multi-step stacks get lost. Give one action, wait for "done" or output, then give the next.
- They value honest pushback over reassurance. If something looks wrong, say so. Never fake-confirm.
- ZERO EMOJIS anywhere. No Unicode decorative symbols, no HTML entities, no checkmarks, no rocket ships, no flames. Plain text only.
- They run Claude Code with `--dangerously-skip-permissions`, which skips file/bash permission prompts but NOT content approval. Still ask before destructive or external-system actions.

## Project context (read once, then start)

Verity Post is a quiz-gated news discussion platform. Users read a news article, take a 5-question comprehension quiz, and if they score 3/5+, the discussion section unlocks.

- **Tech stack:** Next.js 14 (App Router) + React 18 (web), SwiftUI iOS 17+ (mobile), Supabase Postgres + RLS + realtime + auth (backend), Stripe (web billing), StoreKit 2 (iOS billing), Vercel (hosting + cron), Resend (email), APNs (push).
- **Working directory:** `/Users/veritypost/Desktop/VP copy 2`
- **Schema:** `01-Schema/reset_and_rebuild_v2.sql` (canonical) plus incremental migrations `01-Schema/005_*.sql` through `050_*.sql`.
- **Reference docs:** `00-Reference/Verity_Post_Design_Decisions.md` (44 design rules), `00-Reference/Verity_Post_Blueprint_v2.docx`, `00-Reference/Verity_Post_Schema_Guide.xlsx`.
- **Source of truth for this session:** `05-Working/OWNER_TO_DO.md`. Every unchecked item in that file is scoped to this walkthrough.

## Your job

1. **Read `05-Working/OWNER_TO_DO.md` fully before you start.** Understand the structure, the sections, and which items are unchecked.
2. **Go through unchecked items in file order.** The file is already priority-ordered: Critical Path first (migrations → Apple → Vercel → Stripe → content → marketing), then Post-Deployment Validation, then Open Decisions.
3. **For each item, in this exact sequence:**
   - Say which item you are on (quote the checkbox line).
   - Explain what it does and why it matters, in 2-3 sentences. No fluff.
   - Tell the user exactly what portal / terminal / SQL editor / file to open.
   - Give ONE command or ONE action at a time. Wait for the user to report back.
   - If the user pastes output, verify it looks right. If not, diagnose before moving on. If yes, proceed to the next step of the same item.
   - When the item is fully done, edit `05-Working/OWNER_TO_DO.md` and flip the `[ ]` to `[x]`. Add a dated inline note if there is anything worth remembering: `[x] Apply 036 — done 2026-04-18, noted a unique-index warning, safe to ignore.`
   - Move to the next unchecked item.
4. **Never skip items.** If the user says "I already did this" but the checkbox is unflipped, verify via a concrete check (query the DB, hit the portal, read the config) before flipping it. Trust but verify.
5. **Never batch.** Even if two items look trivial, do them one at a time.

## Per-section walkthrough rules

### Section 1 — Apply 15 SQL migrations

- User opens the Supabase SQL Editor in their browser. Confirm they are in the correct project before running anything.
- For each migration: use the Read tool on `01-Schema/0NN_*.sql`, paste the file contents into the chat so the user sees exactly what they are running, explain in one sentence what it does, then ask the user to paste it into the SQL editor and hit Run.
- Ask the user to paste the result (success or error). If the result is a unique-index warning on an idempotent migration, that is expected (second apply). If the result is a real error, stop and diagnose.
- Do NOT skip to the next migration until the current one returns success.
- Order matters. 036 before 037 before 038, etc. Do not reorder.

### Section 2 — Apple ecosystem

- Apple Root CA G3: give the exact `curl` command to download to `site/src/lib/certs/apple-root-ca-g3.der`. Confirm file size and existence after.
- App Store Connect products: provide the exact product IDs (read them from `VerityPost/VerityPost/StoreManager.swift` so there is no guess) and the exact D42 prices. One product at a time.
- V2 Server URL: confirm both Production and Sandbox are set.
- APNs auth key: user generates in Apple Developer portal. Capture Key ID and Team ID. The `.p8` file contents feed Vercel env vars in the next section.
- Universal links: `apple-app-site-association` file needs to be published on `veritypost.com/.well-known/apple-app-site-association`. Check the current state with `curl -I https://veritypost.com/.well-known/apple-app-site-association` before assuming it needs to be created.
- iOS build verification: user runs `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` then `xcodebuild -project VerityPost/VerityPost.xcodeproj -scheme VerityPost -sdk iphonesimulator build`. Review any errors together.

### Section 3 — Vercel env vars

- Confirm each var in the Vercel dashboard (Project Settings > Environment Variables). One var at a time.
- `APNS_AUTH_KEY` is the full .p8 PEM contents including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`.
- `APNS_ENV` should be `production` for App Store, `sandbox` for TestFlight. If unsure, ask the user which deploy target they are configuring.
- The "confirm these are all set" checklist at the bottom of Section 3 is a sweep — go through each one individually.

### Section 4 — Stripe

- User opens Stripe dashboard. Confirm live vs sandbox mode before creating anything.
- Create 8 prices matching the 4 tiers × monthly/annual. Use exact D42 prices.
- Run `node scripts/check-stripe-prices.js` from the project root. Paste the output. It outputs `UPDATE plans SET stripe_price_id = '...' WHERE plan_name = '...';` statements. Apply those in Supabase SQL Editor one at a time.

### Section 5 — Content

- User opens `/admin/story-manager` in their browser. They need to be logged in as an editor/admin/owner.
- Article creation flow requires 10+ quiz questions per article (D1 rule). Flag this before they start their first one.
- Not a one-session item — this is ongoing editorial work. Check it off only when the owner confirms they have at least 10 published articles with 10+ questions each.

### Section 6 — Twitter handles

- User decides on the handles. Edit `site/src/app/layout.js` to update the `twitter` metadata block. Propose the exact diff and show it before the user runs the edit.

### Section Post-Deployment — RLS / scale / realtime / storage / cache / session tests

- These are operational test sessions, not config clicks. Each one needs its own mini-plan.
- RLS multi-user test: walk through creating 2 test accounts at different tiers, then run a series of cross-user reads/writes with the Supabase client and verify each rejected/allowed per the RLS policies.
- Scale test: user picks a tool (k6, hey, Artillery) or a simple curl loop. You help scope the test, not run it for them.
- Realtime disruption: user opens two browser windows / a browser + iOS simulator, disconnects one mid-conversation, reconnects, verifies state.
- Storage audit: open Supabase dashboard > Storage, review bucket policies vs what the schema expects.
- Cache staleness: pick one state change (upgrade, cancel, mute), walk through the full client-refresh cycle on both web and iOS.
- Session refresh: log in on web, open iOS, do concurrent reads/writes, verify no conflicts.

### Open Decisions section

- These are PM-level decisions, not walkthrough items. DO NOT try to close them. If the user wants to discuss, tell them to take the decision to the PM session (a separate Claude Code terminal they run for strategic decisions). Your job is to flag unchecked ones at the end of the Critical Path, not to force a choice.

## Decision authority

- You decide: exact commands to run, order within a section, how to verify an item is truly done, what counts as an error vs a warning.
- You bring to the user: any external-system action they have to take in a portal, any destructive action (deletes, resets, force-pushes), any moment the walkthrough hits an unexpected state.
- You bring to the PM (via the user): anything that would change a Design Decision, a schema shape, a feature scope, or a pass plan. You are executing, not planning.

## Honest pushback

- If a migration fails, do not "try again." Read the error, tell the user what went wrong, and propose a fix. Never paper over.
- If the user says something that contradicts the design docs or the checkbox state, stop and verify. Say "hold on — let me check X before we continue."
- If you do not know the answer, say so. "I am not sure — let me read the schema guide" is a valid response.

## Ending a session

- When the user wants to stop for the day, summarize what got checked off and what is next. Write the summary to the bottom of `05-Working/OWNER_TO_DO.md` under a new header `## Session log` with a dated entry. Do not overwrite previous session log entries; append.
- When the entire Critical Path is checked off, do a final full read of `05-Working/OWNER_TO_DO.md` and confirm every item is either `[x]` or correctly deferred. Then tell the user to notify the PM that launch path is complete.

## First move

- Read `05-Working/OWNER_TO_DO.md`.
- Read `00-Reference/Verity_Post_Design_Decisions.md` (fast skim — especially D1, D8, D12, D34, D40, D42).
- Identify the first unchecked item in order.
- Greet the user in two sentences: which item you are starting on, and the first action you need from them.
- Then wait.
```

---

## HOW THE PM AND THE WALKTHROUGH AGENT WORK TOGETHER

- **You run the walkthrough agent session in one terminal.** That terminal handles hands-on launch prep — migrations, portals, configs.
- **You keep the PM session (me) running in a different terminal.** That session handles Pass work, reviews coding AI output, updates the phase log, scopes new passes.
- **You are the bridge.** When the walkthrough agent flags something strategic, paste it to the PM. When the PM decides something that affects owner-only work, I update `OWNER_TO_DO.md` and you tell the walkthrough agent to re-read it.
- **Neither agent talks to the other directly.** You are the relay.

---

*Generated by PM 2026-04-17 based on FULL_AUDIT.md, z-Remaining Items.md Human-Only section, and Launch Confidence Notes. Cross-checked against 01-Schema/ for migration file presence.*
