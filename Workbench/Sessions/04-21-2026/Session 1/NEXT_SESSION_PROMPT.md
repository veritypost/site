# Next-session handoff prompt

Paste the contents of this file into the first message of your next Claude Code session. It briefs the PM on where Session 1 (2026-04-21) left off, what shipped, what's waiting, what's parked, and what's open.

---

## Start here

You are the Verity Post project manager. Read these in order before doing anything:

1. `Reference/PM_ROLE.md` — your role brief (precedence clause in §1: when `PM_ROLE.md` and `CLAUDE.md` conflict on scope, PM_ROLE wins)
2. `Reference/CLAUDE.md` — project constitution (codebase, architecture, conventions)
3. `~/.claude/projects/-Users-veritypost-Desktop-verity-post/memory/MEMORY.md` — cross-session memory index; read every linked feedback/project memory file
4. `Current Projects/FIX_SESSION_1.md` — canonical 35-item audit tracker; each item has SHIPPED / PARKED / OPEN status inline
5. `Sessions/04-21-2026/Session 1/SESSION_LOG_2026-04-21.md` — full narrative of the 2026-04-21 session
6. This file

Then say "Ready" and wait for direction. Do NOT start work until the owner speaks.

## What shipped in Session 1 (2026-04-21)

### AdSense approval path (verification complete, serving pending Google-side)

- `ads.txt` populated with real publisher ID `ca-pub-3486969662269929` (commit `1e27318`)
- `<meta name="google-adsense-account" content="ca-pub-3486969662269929">` added to root layout via Next.js metadata API `other` field as verification fallback (commit `cbf1875`)
- `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` set in Vercel Production env, then redeployed twice — first time hit an env-var-name typo (owner had `EXT_PUBLIC_...` missing the `N`), second time redeployed without build cache. Trailing space in value also trimmed.
- AdSense site ownership **verified in Google's console** via meta tag
- Google CMP wizard: 3-choice message pattern (Consent / Do not consent / Manage) picked for site + future sites; full publish is gated behind AdSense approval
- Privacy policy section 6 "Advertising & Cookies" added at `web/src/app/privacy/page.tsx` with AdSense mention + cookie disclosure + Google policy links (commit `91055cc`). COPPA / Your Rights / Contact renumbered 6→7, 7→8, 8→9.

### Signup race-condition fix

- `web/src/app/signup/page.tsx` (commit `b7996ee`) — two-tier duplicate-email detection. Signup route returns generic HTTP 400 for all Supabase GoTrue errors (including duplicate email — audit's "missing 409" was wrong; API returns 400, not 409). Client now: (a) uses the existing on-blur `emailCheck` probe state if already flagged `'taken'`, (b) otherwise on 400 with a valid-looking email, re-probes `/api/auth/check-email` to confirm availability before changing copy. Shows "An account with this email already exists. Sign in instead." + link to `/login?email=<addr>` (prefill param accepted-ignored by login page today; activates gracefully if `/login` ever learns to read it).

### Supabase infrastructure

- Applied `schema/106_kid_trial_freeze_notification.sql` via Supabase SQL Editor. Verified via MCP: `freeze_kid_trial` function body contains `create_notification` call, 1641 chars. Kid-trial → Family conversion funnel notification path is live.
- `pg_cron` extension enabled (Database → Extensions → pg_cron, schema locked to `pg_catalog`)
- Two `events-maintenance` cron jobs registered:
  - `events-create-next-partition` (jobid 1) — `5 0 * * *` — creates tomorrow's `events` partition nightly
  - `events-drop-old-partitions` (jobid 2) — `15 0 * * *` — drops partitions older than 90 days
- **Durable gotcha:** MCP `execute_sql` runs in a read-only transaction — cannot register cron jobs or do any mutation. For mutations: either owner runs in SQL Editor, or dispatch agent using `mcp__supabase__apply_migration` (write-capable). Known issue; don't re-discover next time.

### Research artifacts (saved to `Sessions/04-21-2026/Session 1/`)

- **`REMAINING_ITEMS_RELATIONSHIP_MAP_2026-04-21.md`** — 4-agent relationship map of the 35 remaining FIX_SESSION_1 items (file+DB+env adjacency, 9 natural clusters, hard+soft sequencing, silent-conflict risks). Has a "Session-end status" appendix at the bottom showing which launch-critical items closed during Session 1.
- **`KILL_SWITCH_INVENTORY_2026-04-21.md`** — 11 launch-hide catalog with path:line, current state, exact flip pattern, user-visible effect, prerequisites, cross-refs, and 4-phase flip-order proposal for launch day. Key entries: quiz + discussion at `page.tsx:977` kill-switched via `{false && (isDesktop || showMobileDiscussion)}`; bottom nav kill-switched via `SHOW_BOTTOM_NAV = false` in `NavWrapper.tsx:89`; etc.
- **`ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md`** — 75-route compliance breakdown against CLAUDE.md mutation contract. Per-route verdict (COMPLIANT / MINOR / MAJOR / BROKEN) with path:line violations.

### Owner-dashboard actions (no commit)

- **Vercel team:** confirmed only owner account (`admin-13890452`). 00-J closed as not applicable (no ex-dev to remove).
- **Apple Developer:** enrollment submitted under **Organization** track (business — Verity Post LLC, matches commit `cbdea50` legal-pages LLC naming). On Apple's multi-week approval clock. Gates: App Store Connect, APNs `.p8` key, `apple-app-site-association`, provisioning, TestFlight, submission of both iOS apps.
- **Google Search Console:** sitemap `sitemap.xml` submitted. Owner verified under a previously-linked email (auto-verification). Indexing active.
- **Stripe 3-check:** Live mode confirmed. All three checks clean (one webhook endpoint pointing to `veritypost.com/api/stripe/webhook`; no unauthorized Connect accounts; no ex-dev on team).
- **AdSense application:** submitted and in Google's review queue (3-14 days typical). Do NOT resubmit — resets queue position.

### Docs + state hygiene

- `archive/` → `Archived/` path patches landed in 4 live docs (Reference/CLAUDE.md, Reference/README.md, Reference/runbooks/CUTOVER.md, Unconfirmed Projects/product-roadmap.md)
- `Reference/STATUS.md` "Ignored Build Step ON — manual redeploy only" line corrected (was stale; git pushes auto-deploy as of latest Vercel config)
- `.env.example` lines 34-41 — 8 commented-out Stripe price ID lines deleted
- `Reference/PM_ROLE.md` drift cleanup (commit `6dcde8a`): CLAUDE precedence clause added in §1, §2 repo tree rewritten post-reorg, §3 design-doc paths updated (proposedideas/ → Current Projects/ + Reference/), §5 session-log naming convention documented, §6 line-range refs → section-heading refs, `VerityPostKids` SDK claim corrected ("Zero third-party SDKs" was FALSE — actual state is `supabase-swift only`, verified via `project.pbxproj`)
- `Reference/CLAUDE.md` "What you always know" rewritten to point at real canonical paths (old `/TASKS.md`, `/DONE.md`, `05-Working/BATCH_FIXES_2026_04_20.md` all dead; replaced with `Current Projects/FIX_SESSION_1.md` + session-log convention)
- `.mcp.json` added to `.gitignore` under Claude Code section (local MCP config, no secrets, machine-specific path)
- `schema/107_seed_rss_feeds.sql` committed (renamed from prior 105_ prefix collision; 234 rows already applied to live DB)

### Memory (added this session)

- `feedback_no_assumption_when_no_visibility.md` — don't pass agent defensive hedges as launch-critical when Vercel/Supabase/Apple/AdSense dashboards are invisible; verify from code or live behavior first, then flag "can't see X, can you check"
- `feedback_update_everything_as_you_go.md` — always update state artifacts in-flight, same turn the finding lands; don't batch bookkeeping
- `project_launch_model.md` — owner's "launch" = get through AdSense + Apple reviewer gates with everything not-ready kill-switched; drops 00-L quiz content + F2/F3 + 00-M from launch-blocking for the approval phase

## What's waiting on external parties (nothing to do)

- **AdSense approval** — 3-14 days typical, currently in queue. Review checks site quality signals (content, policies, navigation) which are clean. Full CMP publish + real ad_unit row creation in `/admin/ad-placements` both happen post-approval.
- **Apple Dev enrollment approval** — 1-3+ weeks for Organization track (DUNS + business verification). Post-approval unblocks App Store Connect IAP, APNs `.p8`, Universal Links, TestFlight, submission.
- **Google Search Console indexing** — days for first crawls to reflect.

## What's parked (trigger-based resume; DO NOT start without a trigger event)

### Admin route compliance sweep — `FIX_SESSION_1.md` § "Pre-Launch — Parked (trigger-based resume)"

Full 75-route sweep against CLAUDE.md mutation contract. Includes:
- Helper bug fix at `web/src/lib/adminMutation.ts:63-80` (recordAdminAction wrapper omits `p_ip` + `p_user_agent` — 2 of 8 required RPC params)
- 5 broken-route focus pass (settings, ad-placements, permission-sets/role-wiring + 2 more)
- Rate-limit sweep across 73 routes (97% missing rate limits — biggest hole)
- Audit-call sweep across 52 routes (69% missing `record_admin_action` via SECDEF RPC)
- `Retry-After` header sweep across 8 routes
- 3-tier rate-limit proposal (Strict 10/60s for user-targeting, Medium 30/60s for content, Lenient 60/60s for read-likes)
- Decisions already locked: `@admin-verified` blanket approval for scope, commit cadence per subgroup, ship pattern (4+2 for helper, per-route for Phase 1, subgroup for Phases 2-3), all 3 required RPCs verified present on live DB

**5 trigger events — any fires = schedule sweep:**
1. Onboarding a second admin (mod, editor, expert, journalist). Plan sweep BEFORE onboard.
2. Real EU traffic at scale + first GDPR Data Subject Access Request.
3. Real COPPA-relevant Kids iOS traffic + first compliance inquiry.
4. 3-month mark (~2026-07-21, adjust for actual launch date).
5. Reactive incident requiring audit-trail forensics we cannot reconstruct.

Audit artifact: `Sessions/04-21-2026/Session 1/ADMIN_ROUTE_COMPLIANCE_AUDIT_2026-04-21.md`

### HIBP leaked-password protection (00-O)

Supabase Pro-plan gated. Park for Supabase Pro upgrade. Collects alongside any other Pro-gated items as they accumulate.

### CMP wizard final publish

Gated behind AdSense approval. Resume when AdSense approves.

## What's open and autonomous (safe to pick up next session)

Review `Current Projects/FIX_SESSION_1.md` for the canonical status of every item. As of Session 1 close, these are the remaining autonomous candidates that aren't blocked by external parties or parked:

- **#20 ESLint + Prettier + Husky setup** — no current tooling in `web/`. Add `web/eslint.config.js`, `web/prettier.config.js`, `.husky/pre-commit`, `package.json` scripts (lint, format, lint:fix). First run will surface 50-200 lint errors; scope decision needed (fix all in-session vs. surface + triage). ~1-2 hrs. No admin-lockdown, no public-surface risk. Cleanest next pick.
- **#16 `as any` cleanup** (19 sites in `web/src/app/admin/`, concentrated in `admin/subscriptions/page.tsx`) — blocks #17. Admin-lockdown applies. If the owner parked the admin compliance sweep under the reviewer-approval launch model, this likely inherits the same parking logic. Ask before starting.
- **#17 TypeScript strict mode** — after #16. Flips `strict: true` + three `noUnused*` in `web/tsconfig.json`. Expect errors across ~250 files. Bigger refactor; scope decision needed.
- **00-N DR migration reconciliation** — 13 live-DB migrations exist but are missing as files in `schema/`. Reconstruct DDL from live state (MCP) or git history, file into `schema/`, patch `schema/reset_and_rebuild_v2.sql`. ~1-2 hrs. No public-surface risk.
- **#11 error-state polish remaining 8 sites** — #11 signup-409 sub-item SHIPPED (b7996ee). 8 sites remain (page.tsx:225, 345, 350-366; story:326, 396, 409-429; welcome:95; PermissionsProvider:47-49, 58-60; error.js:9-19; global-error.js:10-20). **AdSense-review timing warning:** touches public-facing code; consider waiting until AdSense approves to avoid any mid-review regression risk.
- **Icon assets (#12-icons)** — needs design deliverables from owner before wiring. Drop PNGs (favicon, apple-touch-icon-180, icon-192, icon-512) in `web/public/`, then wire metadata block in `layout.js` + `manifest.js`. ~15 min once assets exist. Blocked on owner.
- **F7 pipeline restructure** — 8 owner decisions pending before start. Defer until owner has bandwidth to answer.

## Open owner-decisions (nothing autonomous can address)

- **#6 bottom nav direction** — `SHOW_BOTTOM_NAV = false` currently. Two-part decision: (1) turn it back on, (2) if yes, what tabs. See `KILL_SWITCH_INVENTORY_2026-04-21.md`.
- **F3 kill-switch flip** (`page.tsx:939`) — when to enable quiz + discussion UI. Gates F3 refinements + F2 + all "earned comments" work.
- **F4 vs F5 phase decision** — F4 pre-launch quiet aesthetic vs. F5 monetization post-launch. Share `page.tsx:858-862` line range.
- **F7 §12 decisions** — 8 pending (page renames, kids data model single-row vs. separate, model provider, cron cadences, cost cap, workbench scope).
- **#14 reserved-usernames scope** — SSA name-list size, match policy (bounded default), review-note field yes/no.

## Contradictions / loose ends flagged for owner attention

- **`Future Projects/` folder** at repo root exists with 8 strategy docs (`00_CHARTER.md` through `07_KIDS_DECISION.md`) + `README.md` + `db/` + `views/` subfolders, all untracked in git. `CLAUDE.md` and `PM_ROLE.md` `§2` repo tree diagrams do NOT reference `Future Projects/` as a live folder; 2026-04-21 reorg commit `974cefd` describes dissolving that folder. Either it was re-created (by owner or a tool), never fully dissolved, or appeared during this session outside PM visibility. **Owner needs to decide:** commit it into git, move contents into `Current Projects/` or `Unconfirmed Projects/`, or delete. Not resolved in Session 1.
- **Environment note:** trailing-space bug in `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` was flagged mid-session and fixed (owner trimmed it). Verify in Vercel → Settings → Environment Variables if anything looks off in Googlebot-view HTML.

## Durable gotchas discovered this session

- Vercel `NEXT_PUBLIC_*` env vars bake into JS bundle at build time — editing an env var without a fresh build (with "Use existing Build Cache" unchecked) doesn't propagate. This bit the AdSense pub ID twice.
- Supabase MCP `execute_sql` is read-only — cannot register cron jobs, insert, update, or do any mutation. Use `mcp__supabase__apply_migration` for mutations or have owner run SQL in Supabase dashboard.
- Vercel Deployments UI labels git-driven deploys as "by <github-username>" and manual redeploys as "by <vercel-display-name>" — not proof of multiple team members. Verify team membership via Settings → Team email column, not deploy labels.
- `@admin-verified` markers in `web/src/app/admin/**` imply "verified correct/complete" but the full compliance audit showed 52/75 routes are missing the `record_admin_action` calls the marker implies. The marker is a permissions-lockdown flag, not a compliance certificate. Treat with appropriate skepticism.
- Google AdSense CMP console is mostly gated behind account approval. Site-verification flow is pre-approval; full Privacy & Messaging + vendor list + publish is post-approval.

## Final commit chain (Session 1 end state)

`main` at `63b9be9`, 14 commits ahead of `0c37d5b` (session start). All auto-deployed to Vercel. Working tree clean except untracked `Future Projects/` (see contradiction above).

## Do not re-raise without regression evidence

Everything marked SHIPPED in `FIX_SESSION_1.md` or logged in `COMPLETED_TASKS_2026-04-21.md` is closed. If you think something's broken, prove it from current code + live behavior — don't cite the audit file and assume.
