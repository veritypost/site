# QA — Role × Page Sweep

Single source of truth for the pre-launch QA pass. Replaces `QA_SESSIONS.md`, `Owner_Changes.md`, `Owner_Audit_Finds.md`.

Pick a session shape (§1). Run it. Every fix passes the **True-Fix Gate** (§7). Locked surfaces (§7.6) are frozen.

---

## 0. Current task — the anchor

The single in-flight task for the active session. Owner sets this; agents update it as state changes; nobody starts a new branch of work without retiring or parking the current one.

```
CURRENT: <one-sentence description of what we're doing right now>
SHAPE:   <surface | role | flow | fix-cluster | other>
TARGET:  <route(s) / role / flow / cluster being touched>
STATUS:  <picking-page | local-QA | finding-logged | running-fix-gate | committing | pushed | pending-prod-confirm | locked | done>
NOTES:   <one line — anything the next turn needs to know>
```

**Active:**

```
CURRENT: Discovery scraper layer — Phase C shipped (polish + hardening pass). Five fixes + one operator surface land on top of A + B: (1) singleflight enforcement via partial unique index pipeline_runs_singleflight_ingest with in-route orphan-reaper at 10m + HTTP 409 on collision returning runningRunId; (2) heuristic tightening — looksLikeNumericId rejects bare year segments (length>6 + 30%+ digit ratio + alphanum-hyphen-only); looksLikeSlug rejects digit-heavy (>50%) + bare-year segments; 12-case // VERIFY array hand-traced; (3) cross-feed dedup attribution — feeds.metadata.zero_results_streak (jsonb integer) increments per feed when ok-fetched-but-zero-unique-after-dedup, resets on any non-zero contribution; staleStreaks[] returned in response capped at 25 sorted DESC; "no unique items 3+ runs" badge on /admin/feeds rows where streak >= 3; (4) GET /api/admin/pipeline/health ingest-only scoped (admin.pipeline.run_ingest gate) feeds the Discovery tab Last-run pill; (5) cron parity — confirmed no /api/cron/ingest exists, single source of truth, no refactor needed; (6) /admin/feeds Reclassify wizard — page-header button opens modal with URL-shape preview, Apply hits POST /api/admin/feeds/reclassify (admin.feeds.manage), per-row audit log, server-side heuristic re-check before update.
SHAPE:   fix-cluster (admin chrome + pipeline-data — not on §8.4 lock list, free to edit)
TARGET:  /api/newsroom/ingest/run · web/src/app/api/newsroom/ingest/run/route.ts (singleflight 409 + orphan-reap + insertedByFeed/streak/staleStreaks) + web/src/lib/pipeline/scrape-discovery.ts (heuristic tightening + 12-case // VERIFY) + web/src/app/api/admin/pipeline/health/route.ts (NEW) + web/src/app/api/admin/feeds/reclassify/route.ts (NEW) + web/src/app/admin/feeds/_ReclassifyModal.tsx (NEW) + web/src/app/admin/feeds/page.tsx (Reclassify button + streak badge column) + web/src/app/admin/newsroom/page.tsx (health pill + 409 toast) + supabase/migrations/20260504180000_pipeline_runs_singleflight_index.sql
STATUS:  pending-prod-confirm
NOTES:   CLI-side gates green — tsc 0 errors, lint 0 errors on touched files, build clean (`✓ Compiled successfully`). Migration applied to fyiwulqphgmoqullmrfn; singleflight collision verified (duplicate INSERT raised 23505). Adversary review surfaced 8 findings; 3 P1s fixed in slice (health endpoint scoped to pipeline_type='ingest' to prevent generate-pipeline error_message leak, feed→rss alias requires urlLooksRss URL match, migration adds post-create indexdef assertion DO block); 5 P2s left (raceDeduped comment slightly stale under singleflight, kill-switch 60s cache pre-existing, priority-weight vs source_class sort doc clarification, VERIFY array as comment-not-test, tightened heuristic still accepts year-prefixed slugs like /best-of-2024 by spec — all non-blocking, none new). Cross-platform: web admin only — N/A iOS / kids.

Known limits / future phase scope (none committed):
  - Heuristic tightening is segment-level — year-prefixed article slugs (/best-of-2024) still accepted, by spec.
  - VERIFY array is doc-only; future heuristic edits won't break a build until a Vitest harness wires it up.
  - Streak counter is read-modify-write; safe under singleflight (one ingest run at a time) but a daily cron pipeline-cleanup at 6am could in principle run concurrently — pipeline-cleanup only resets pipeline_runs/discovery_items/locks, not feeds.metadata, so no real conflict.

Smoke checklist (owner runs on veritypost.com/admin/newsroom + /admin/feeds while signed in as admin@veritypost.com):
  1. /admin/newsroom Discovery tab → on load, see new "Last run: <m>m ago, <s>s, <N> items" pill next to the Run Feed button (only renders if a prior run exists).
  2. /admin/newsroom → click Run Feed → toast "Feeds refreshed", pill updates with new duration + count.
  3. /admin/newsroom → click Run Feed twice fast (within ~3s) → second click: HTTP 409 returns toast "Another ingest run is already in progress. Wait for it to finish, then try again."
  4. /admin/feeds → page-header "Reclassify" button next to "Add feed" → click → modal opens with preview table of feeds whose URL shape disagrees with feed_type. If preview is empty: modal copy reads "Every active feed's URL shape agrees with its current feed_type. No changes needed."
  5. /admin/feeds → in modal with non-empty preview, click "Apply N reclassifications" → server applies, toast confirms, feed list reloads. Verify a single row's feed_type changed via /admin/feeds drawer + admin_audit_log entry has action=feed.reclassify with old + new feed_type.
  6. /admin/feeds → if any feed exists with metadata.zero_results_streak >= 3 (set manually for visual smoke: UPDATE feeds SET metadata = jsonb_set(coalesce(metadata,'{}'::jsonb),'{zero_results_streak}','3') WHERE id=...), the Source column row shows the "no unique items 3+ runs" pill next to the outlet name.
  7. After a real Run Feed cycle: response includes staleStreaks: [{feed_id, name, source_class, streak}] for any feed contributing zero unique items 3+ consecutive runs (sorted DESC by streak, capped at 25).
```

**Parking lot** (intent the owner mentioned but didn't switch to — pulled from here after CURRENT closes):

- iOS path B parity slice for ads (decoder fix in `HomeFeedSlots.swift` + 3 article slots in `StoryDetailView.swift` + `home_feed` placement seed). Prereq: 3 ad-seed migrations applied. Plan owned by `project_verity_monthly_stripe_pending` memory adjacent.
- Verity Monthly Stripe price minting — credential-gated, owner-action-only, tracked in memory `project_verity_monthly_stripe_pending`.

**Recently closed** (last ~5; trims as new ones land):

- 2026-05-04 — Discovery scraper Phase C (this commit) — pending owner prod smoke per Finding #22
- 2026-05-04 — Discovery scraper Phase B (commit `c3ab23c`) — pending owner prod smoke + env-var setup per Finding #21
- 2026-05-04 — Discovery scraper Phase A (commits `5627445` scraper, `e7c6000` domain-drift docfix) — pending owner prod smoke per Finding #20
- 2026-05-04 — /admin/feeds rebuild (commits `aee2701` rebuild, `da49459` bookkeep, `4558b82` tier-1 anchor seed) — pending owner prod smoke per Finding #19
- 2026-05-04 — /browse redesign + audit fixes (commits `5e4beee` redesign, `4120b89` strip-mock, `8bdb0b2` search subtitle/excerpt, `360a1e4` audience filter + iOS dark-mode, `9b10fff` AbortController, `db64f1c` inclusive UTC date filter)

---

## 1. Session-start — trigger phrase

Just say it. Anything matching `QA <X>`, `let's start QA <X>`, `QA the <X>`, etc. starts a session targeting `<X>`. The agent infers everything else from QA.md.

What the agent does on hearing the trigger:

1. Read QA.md end to end (§0–§10).
2. Infer the session shape from `<X>`:
   - A page or path (`login page`, `/browse`, `the article reader`) → **Surface session**.
   - A role (`as admin`, `pro role`) → **Role session**.
   - A flow (`signup flow`, `request-access`) → **Flow session**.
   - A cluster name from §7 (`dark-mode`, `auth fixes`) → **Fix session** (run §7 directly).
   - Ambiguous → ask one short clarifying question.
3. Set §0 Current task: write CURRENT / SHAPE / TARGET / STATUS / NOTES based on §X. If §8 has open findings on the same surface, name them in NOTES.
4. Start the dev server (§3) if not already running. Confirm `localhost:3000` is up.
5. Walk the surface / role / flow at `localhost:3000`. Log `[BUG]`s under §8 with the §8.1 template. Don't fix yet.
6. Update §6 matrix and §0 STATUS the same turn each cell flips.
7. When ready to ship fixes: run §7 True-Fix Gate per finding. Respect §7.6 locks absolutely.
8. Push at session end (commit message names finding numbers).

Examples:

- `lets start QA login page` → Surface session on `/login`.
- `QA the article reader as anon` → Surface + role hint; treats as Surface session with anon as the auth state.
- `QA admin newsroom` → Surface session on `/admin/newsroom` (admin/owner only).
- `QA the dark-mode cluster` → Fix session on the dark-mode cluster (§7).

If `<X>` is unclear or could mean two things → one-sentence clarification, then proceed. Don't write a multi-step plan back at the owner.

## 1.5. Expert panel — runs on every owner-facing question

Before bringing any decision to the owner — UI/UX best-practice call, legal/compliance question, conflicting requirements, ambiguous spec, anything where the right answer isn't already locked — dispatch an expert panel.

**The panel is non-optional.** No "I'll just ask the owner directly" shortcut. The owner gets one consolidated answer informed by 3–5 experts, not a dump of options.

### How to run it

1. **Pick the lenses.** 3–5 experts, each with a different background relevant to the question. Examples by question type:
   - **UI/UX best practice** → newspaper editorial UX expert · accessibility expert · mobile-web layout expert · engagement / retention expert · journalism reader-flow expert.
   - **Legal / compliance** → privacy lawyer (general) · COPPA / kids-online lawyer (kids surfaces only) · ad / sponsorship compliance · accessibility law (ADA / EAA) · platform-policy reviewer (Apple App Store / Google Play if iOS scope).
   - **Conflicting requirements** → product strategist · existing-decision archivist (reads §5 and prior locked decisions) · adversary (paranoid reviewer) · domain expert in the affected surface · UX-tradeoff arbiter.
   - **Auth / RBAC / payments / kid safety** → security architect · RBAC specialist · payments compliance (if money) · adversary · accessibility (login flow).
2. **Brief each expert with the same context block:**
   - Site overview: what Verity Post is (newspaper-style platform, free + paid + family + kids tiers, Early Access launch posture, kids product is iOS-only).
   - The current question — one sentence, plain English.
   - What the owner / user has already said about it (quote it).
   - What the user *should* see according to §5 Ground truth (or "no ground truth set yet — that's part of what we're deciding").
   - Relevant prior owner decisions (§5 + §8.4 lock log) that touch this surface.
   - The kill-switch inventory (CLAUDE.md) so they don't suggest something the launch posture rules out.
   - Any locked surfaces (§8.4) — they CANNOT recommend changes that would touch a locked surface without an unlock request.
3. **Run them independently first.** Each expert returns a short take in their own voice — under 200 words — saying what they recommend and the main tradeoff. No cross-talk yet.
4. **Then converge.** Either the takes already align (one consolidated recommendation) or they disagree. On disagreement: dispatch one more round where each expert sees the others' takes and says whether they want to change their position or hold. Final consolidated recommendation is whichever survives the round.
5. **Bring ONE answer to the owner.** Plain English. One sentence question + one sentence recommended answer + one sentence why. Cite the panel implicitly ("3 experts converged on…"); don't dump full transcripts unless asked. Memory: `feedback_spec_session_plain_language_qa`.
6. **Owner decides.** If owner picks the panel's recommendation, lock it into §5 and proceed. If owner overrides, lock the override into §5 with a one-line "owner-override" note. Either way: doc updates the same turn (§1 universal rule).

### When to skip the panel

Only skip if the question is already answered:
- Owner already locked it in §5 Ground truth or §8.4 lock log.
- It's a trivial micro-decision (e.g. "before or after this button" — the §7 pre-impl planner agent's recommendation is enough).
- It's a runtime-diagnosis question (Findings #6, #7) — that's a capture exercise, not a decision.

When unsure whether to skip: run the panel. The cost is small; missing a needed expert pass is expensive.

### Where panel output goes

- The consolidated recommendation gets written into the relevant finding (§8) under `Notes for next agent:` so future sessions can see what was decided and why.
- If the panel surfaced something that should become a permanent ground-truth rule (e.g. "all article surfaces in dark mode must use `--p-ink`"), promote it into §5 with the date.
- Don't store full per-expert transcripts in QA.md — they balloon the doc. Summary only.

---

## 1B. Session-start — explicit shapes (for when the trigger isn't enough)

Three session shapes. Pick whichever matches what you want to test. None is mandatory; you can mix in later sessions.

### A. Surface session (role-invariant — easiest to start with)

Test something that looks the same for everyone — global chrome, dark mode, the footer, a static legal/info page, copy that doesn't gate on role.

```
QA session — surface: <chrome | dark-mode | footer | /about | /terms | /help | /pricing | ...>

Read QA.md end to end. Then:
1. Start the dev server (§3).
2. Walk the surface at localhost:3000 — open the route(s) listed in §5.6 Role-invariant surfaces, exercise the obvious interactions.
3. Mark [OK] or [BUG] in §6 (use the row's first non-SKIP cell, or add a single "all roles" note in the row's "Notes" column for surface sessions).
4. Log every [BUG] under §8 with the template. Don't fix yet — fixes go through the True-Fix Gate (§7).
5. When ready to fix, pick one cluster, run §7 per finding.

Hard nos: §7.2. Lock rule: §7.6. Same as below.
```

### B. Role session

Log in as one role, walk every page in that role's column.

```
QA session — role: <anon | free | pro | family | expert | moderator | editor | admin | owner>

Read QA.md. Then:
1. Start the dev server (§3).
2. Open §6 Page matrix; pick up at the first non-[OK]/non-[FIXED]/non-[LOCKED] cell in this role's column.
3. Load each page as this role at localhost:3000. Compare to §5 Ground truth. Mark [OK] / [BUG].
4. Log [BUG]s under §8. Don't fix until the True-Fix Gate (§7).
5. After QA pass (or when context gets heavy): pick a cluster, run §7 per finding.

Hard nos: §7.2. Lock rule: §7.6.
```

### C. Flow session

Test one user flow end-to-end (e.g. signup, checkout, expert verification, request-access queue → admin grant).

```
QA session — flow: <signup | checkout | request-access | expert-verify | family-add-kid | ...>

Read QA.md. Walk the flow at localhost:3000 across whatever roles are involved. Log [BUG]s under §8. §7 for fixes. §7.6 for locks.
```

### Universal rules (apply to all three shapes)

- **Talk to owner in plain English.** Don't recite file paths, DB tables, function names, or migration IDs. Say what is broken, what should change, what the call is — like you're describing it over coffee. The doc captures the technical detail; the owner doesn't need it in chat. *Do still update §6 / §8 / §8.4 with the technical cites — that's where engineers will read them. Just keep the chat plain.*
- **Local first, always.** localhost:3000 is the verification surface (§3, Owner Change #14). Nothing pushes until local is good.
- **Promotion pipeline** (§7.5): local-pass → push → Vercel → owner-confirms-on-prod → `[LOCKED]`. Do not skip steps.
- **Doc updates first, action second.** When the owner expresses new intent that conflicts with QA.md (a new ground-truth decision, a new finding, a new flow, a changed scope, a new lock, a parking-lot item), update QA.md THAT TURN before acting on it. The doc is the source of truth; if it falls behind reality, the next session works the wrong list.
- **Update §0 (Current task), §6 (matrix), and §8 (findings) the same turn each state change happens.** Bookkeeping lag = next session works the wrong list.
- **Push at session end** (memory `feedback_always_push_after_commits`).
- **Lock rule (§7.6) is absolute.** No edits to `[LOCKED]` surfaces without an owner-written `UNLOCKED` line in §8.4.
- **Expert panel on every owner-facing question** (§1.5).

### Drift handling — when owner intent shifts mid-session

The owner will drift off the in-flight task. That's expected — it's how product gets refined. The doc and the agent absorb drift without breaking the current task:

1. **Capture the new intent into QA.md the same turn it lands.** Where it goes depends on type:
   - New product decision (changes what a role *should* see) → §5 Ground truth, with a date and a one-line reason.
   - New finding (something else is broken) → §8 Active findings, `Status: new`.
   - New lock / unlock from owner → §8.4 Lock log.
   - New flow or surface to test → §5.6 (if invariant) or a note on the matrix row.
   - Process / strategy / out-of-scope thought (Early Access, launch posture, future feature) → §0 Parking lot.
2. **Re-anchor on §0 CURRENT.** After capturing, ask: *switch focus to the new thing, finish CURRENT first, or park it?* Don't silently abandon CURRENT.
3. **Default behavior on ambiguity:** keep CURRENT on rails, drop the new thing in Parking lot, surface it after CURRENT closes. Only switch focus on an explicit owner switch.
4. **One CURRENT at a time.** If the owner says "do this instead" without retiring CURRENT, ask which one wins before acting. Two parallel CURRENTs = lost context.
5. **Don't argue with drift.** If owner declares a §5 decision now contradicts an earlier one, update §5 + add a one-line "supersedes" note. Don't hold them to old text.

---

## 2. Roles

Owner picks where to start. No prescribed order — surface, role, or flow, whatever the owner wants.

- **anon** — no account, no session
- **free** — logged in, free plan
- **pro** — Verity Pro
- **family** — Verity Family (adult seat)
- **expert** — expert role
- **moderator** — moderator role
- **editor** — editor role
- **admin** — admin role
- **owner** — owner role

Test accounts: one per role (Owner Change #5). If a needed account is missing, stop and create it before continuing — don't substitute roles.

---

## 3. Dev server — start first, every session

```
cd /Users/veritypost/Desktop/verity-post/web && npm run dev
```

Run in the background. Stays up for the session. If port 3000 is already in use: either reuse, or `lsof -ti:3000 | xargs kill`. **Test against `localhost:3000`, never against production** (Owner Change #14). Only push when the fix is confirmed locally.

---

## 4. Status key

- `[ ]` untested
- `[~]` in progress (local QA in flight)
- `[OK]` tested locally, matches ground truth — eligible for prod-verify push
- `[BUG]` broken — see findings log
- `[FIXED]` was broken, now fixed locally (commit SHA in findings) — eligible for prod-verify push
- `[PROD]` deployed to Vercel, awaiting owner prod confirmation
- `[LOCKED]` owner-confirmed on prod — UI/UX is frozen; any change requires explicit unlock per §7.6
- `[SKIP]` not applicable to this role
- `[KILL]` kill-switched per `CLAUDE.md` — don't test

---

## 5. Ground truth — what each role SHOULD see

Locked owner decisions. If QA observed behavior conflicts with this list, that's a `[BUG]`. If code matches but the decision is unimplemented, log it as a finding (cluster: `decision-pending`).

**Reading & access**

- **Anonymous reads every article.** No read cap, no registration wall, no `vp_anon_reads` cookie counter, no `AnonArticleCtaBanner`. (Owner Change #1) — implementation will require: removing `WALL_THRESHOLD` / `getAnonReadCount` from `web/src/app/[slug]/page.tsx`, deleting `web/src/lib/anonReadCounter.ts` and `web/src/components/article/AnonArticleCtaBanner.tsx`, disabling `RegistrationWall` for the article path, and flipping `is_public = true` on `article.view.*`, `browse.article.anon_read`, `browse.view`, `home.anon.view`, `home.feed.view`, `article.feed.view`, `article.summary.view`, `article.category_feed.view` in the permissions table.
- **Free sees the global leaderboard read-only**, plus their own radar / scores / achievements. **Free does NOT see** other people's scores/radar/activity, follow/unfollow, DMs, or full source trails. Free's leaderboard rank is shown as a bucketed range ("top 12%"); paid sees exact rank + points-gap to person above. (Owner Change #3)
- **Source trail depth is paid.** Free sees a top-line credibility label only; paid sees the full source list with reliability data per article. Permission `article.view.sources` flips: full = paid, summary = free.
- **Following page is removed.** `/following` is deleted; reading-history / followed-stories merge into the **search overlay's empty-state stacks** ("Your reads" + "Following"). Nav bar entry removed. /browse also deleted 2026-05-04; the home shell is the universal browsing surface. (Owner Change #2 — retargeted from /browse → search overlay 2026-05-04)

**Plans**

- **Family (adult seat):** parent dashboard with each child's reading activity, quiz scores, knowledge progress.
- **Pro:** exact rank + points-gap visible.

**Branding & launch posture**

- **"Early Access," not "Beta."** All site copy, UI components, email templates. (Owner Change #9) — grep "Beta" before declaring this clean.
- **Public landing stays as-is during Early Access** — request-access queue is the sign-up path; admin grants entries. Invite/verification code path also still works as a bypass (Owner Change #15, #16).
- **No user-facing timelines.** No "coming soon," no "in the next pass" copy anywhere shippable (memory rule).
- **/login during Early Access = access-code-only gate.** No "having trouble / get help" affordance, no contact-support link, no recovery flow on /login. The only paths off /login are: enter a valid code → in; or "request access" → /request-access. There's no other supported route — if you don't have a code, you're not getting in. Removed 2026-05-03 per owner: the old "having trouble? get help →" link to /contact (which the beta gate blocked anyway). iOS adult `LoginView.swift` mirrors. (locked decision 2026-05-03)
- **/login stays a real page after Early Access — just not the default landing.** Returning users still log in there (typing the URL, following a nav link, hitting a "sign in" CTA). What changes when Early Access ends: anonymous visitors are no longer auto-redirected TO /login from `/` — they land on the public home. Login remains fully functional as a destination. Implementation flip lands when Early Access closes.
- **/login chrome — Email Address everywhere, no H1, no field labels.** Email-only single-door. No H1 ("Sign in" deleted), no visible `<label>Email</label>` (input carries `aria-label="Email address"` for screen readers). Placeholder is the literal string `"Email Address"` — not `you@example.com`, not `name@domain.com`, not any clever variant. Same convention applies to the request-access form and the iOS LoginView/SignupView. (locked 2026-05-03)
- **T&C consent line — "By continuing, you agree to our Terms and Privacy Policy."** Centered, fontSize 12, dim color, below the submit button on /login + /request-access. iOS LoginView mirrors with markdown links to /terms + /privacy, tinted with `VP.accent`. iOS SignupView already carries the COPPA-gated checkbox with the same Terms + Privacy links — DO NOT add a second consent line on signup. (locked 2026-05-03)
- **Notice copy — no obvious imperatives.** /login session-expired / link-expired / missing-params / link-deprecated notices state what happened only ("Your session expired."). They no longer instruct "Enter your email below…" — the form is right there. (locked 2026-05-03)
- **/request-access is the canonical URL for Early Access signup.** Was a 308 stub redirecting to /login?mode=request; flipped 2026-05-03. /login?mode=request and /login?mode=waitlist are dead query params (silently ignored, render the default sign-in form). The signup flow lives at /request-access; /login is for returning users only. Callers updated: beta-locked, signup/_AccessFlow. (locked 2026-05-03)
- **Waitlist == request-access — one product, one URL, one form.** The "join the waitlist" / "you're on the list" UI variant was deleted (`_WaitlistForm.tsx` removed). Single backend endpoint (`/api/access-request`), single canonical URL (`/request-access`). Future "waitlist" framing is forbidden — same product, called Early Access. (locked 2026-05-03)
- **Request-access form — single field only.** Only ask for email. The "what should we call you?" name field and "what brought you here?" reason textarea are permanently deleted; do not reintroduce. H1 is `request early access` (lowercase). Submit button stays `send it →`. (locked 2026-05-03)
- **Beta-gate allowlist must include /terms + /privacy.** Legal pages must be reachable from any consent line. Adding /contact or /help to the allowlist requires owner sign-off; default is NOT in allowlist during Early Access. (locked 2026-05-03)

**Architecture / infra (UI-adjacent, cross-route)**

- **CSP nonce flow lives at the layout level.** `RootLayout` (`web/src/app/layout.js`) is `async`, reads `x-nonce` via `next/headers`, threads `nonce={...}` to the inline theme `<script>` and to `<ConsentedScripts nonce={...} />`. `ConsentedScripts.tsx` accepts a `nonce?: string` prop and forwards it to all 3 `next/script` tags (GA4 loader, GA4 init, AdSense). Calling `headers()` in the root layout opts every route into dynamic rendering — required by `'strict-dynamic'` CSP. **Do NOT add per-page `export const dynamic = 'force-dynamic'` server wrappers** — they're redundant once the layout reads the nonce, and create maintenance debt across 19 client pages. Verdict locked 2026-05-03 by a 4-fresh-agent divergence panel (4/4). (locked 2026-05-03)
- **Marketing pages (/about, /pricing, /how-it-works) lose static prerender** as a side-effect of the layout-level dynamic opt-in. Acceptable cost for an auth-heavy app already gated by middleware. If static caching is ever required for a specific route, factor it into a sibling route group with its own non-CSP layout. Don't try to add `dynamic = 'force-static'` per route — it'll fight the root layout's dynamic opt-in. (locked 2026-05-03)
- **CSP `connect-src` GA4 origin set:** `https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://region1.google-analytics.com https://www.googletagmanager.com`. Added 2026-05-03 once nonces unblocked the gtag.js loader. `tpc.googlesyndication.com` is **permanently excluded** until a non-personalized AdSense (`npa=1`) gate is in place — pre-consent fingerprinting endpoint. AdSense origins are NOT yet in CSP — add them in a one-line follow-up the day Google approves `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID`. Required additions when that lands: `script-src` += `https://pagead2.googlesyndication.com`; `connect-src` += `https://pagead2.googlesyndication.com`; `frame-src` += `https://googleads.g.doubleclick.net https://*.safeframe.googlesyndication.com`. (locked 2026-05-03)
- **NavWrapper bottom-nav `loggedIn` flag flips on auth presence, not on profile fetch completion.** `setLoggedIn(true)` + `setAuthLoaded(true)` are hoisted above the `users` SELECT + `refreshAllPermissions()` awaits in `loadProfile()`. The "Sign up" → "Profile" label swap fires the same tick as `getUser()` resolves. Avatar / tier / permissions fill in on subsequent ticks. Reverting this would re-introduce the 1-2s lag observed 2026-05-03. (locked 2026-05-03)

**Kids**

- **Kids web = kids articles + iOS app signup link.** Nothing else. (Owner Change #4) — kids product is iOS-only; kids web is redirect/promo only.

**Out of scope for this QA pass**

- Owner Changes #6, #7, #8, #10, #11, #12, #13 are process/launch-plan items, not behavior the QA matrix tests.

### 5.6. Role-invariant surfaces (pick from these for a Surface session)

Surfaces that look the same for everyone (or where role only changes auth state in the chrome — not the surface's content):

- **Global chrome** — `web/src/app/NavWrapper.tsx` top bar + bottom nav + footer (account-state banner is the only role-aware piece). Render check: load any public route and any authed route.
- **Dark mode** — globals.css token resolution across body, chrome, article surface. Toggle theme; sweep `/`, `/browse`, an article, `/leaderboard`, `/about`.
- **Footer** — global footer rendered inside NavWrapper.
- **Static info pages** — `/about`, `/how-it-works`, `/methodology`, `/help`, `/contact`, `/corrections`, `/editorial-standards`, `/terms`, `/privacy`, `/privacy/kids`, `/cookies`, `/dmca`, `/accessibility`, `/kids-app`. Content is the same for every role; only the chrome differs by auth state.
- **Pricing** — `/pricing`. Plan cards are the same for everyone (CTAs may vary by auth state).
- **Request-access** — `/request-access`. Same surface for anon and authed during Early Access.
- **Login / signup** — `/login`, `/signup`, `/welcome`. Anon-only by definition.
- **404 / error states** — any route hit with a bad slug.

When testing a role-invariant surface, mark `[OK]` / `[BUG]` once for the surface and call it out in the row's *Notes* in §6. Don't pretend to test it 9 times.

---

## 6. Page matrix

### Public / no-auth surfaces

| Page | anon | free | pro | family | expert | mod | editor | admin | owner | Notes |
|------|------|------|-----|--------|--------|-----|--------|-------|-------|-------|
| `/` (home) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/browse` | [WIP] | [WIP] | [WIP] | [WIP] | [WIP] | [WIP] | [WIP] | [WIP] | [WIP] | merged-following surface · UX redesign in flight 2026-05-03 (Finding #11) |
| `/[slug]` (article) | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | anon = no wall |
| `/story/[slug]` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/category/[id]` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/leaderboard` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | free=bucketed, paid=exact |
| `/search` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/login` | [FIXED] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | Find #7 shipped 2026-05-03 `4c3e702`+`97f11f7`+`ce3e72f` — awaits prod confirm |
| `/signup` | [ ] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [SKIP] | |
| `/request-access` | [FIXED] | [FIXED] | [FIXED] | [FIXED] | [FIXED] | [FIXED] | [FIXED] | [FIXED] | [FIXED] | canonical URL flip + form simplified — shipped 2026-05-03 `4c3e702` |
| `/pricing` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | "Early Access" copy |
| `/about` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/how-it-works` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/methodology` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/help` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/contact` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/corrections` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/editorial-standards` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/terms` | [FIXED] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | beta-gate allowlist 2026-05-03 — anon now reachable |
| `/privacy` | [FIXED] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | beta-gate allowlist 2026-05-03 — anon now reachable |
| `/privacy/kids` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/cookies` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/dmca` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/accessibility` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/kids-app` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | kids articles + iOS signup |
| `/u/[username]` | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | |
| `/card/[username]` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |

### Auth-required surfaces

| Page | anon | free | pro | family | expert | mod | editor | admin | owner | Notes |
|------|------|------|-----|--------|--------|-----|--------|-------|-------|-------|
| `/profile` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/profile/[id]` | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | [KILL] | |
| `/profile/card` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/profile/contact` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/profile/category/[id]` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/profile/settings` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/profile/settings/billing` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/profile/settings/expert` | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [ ] | [SKIP] | [SKIP] | [ ] | [ ] | Expert+ only |
| `/profile/family` | [SKIP] | [SKIP] | [SKIP] | [ ] | [SKIP] | [SKIP] | [SKIP] | [ ] | [ ] | Family plan only |
| `/profile/kids` | [SKIP] | [SKIP] | [SKIP] | [ ] | [SKIP] | [SKIP] | [SKIP] | [ ] | [ ] | Family plan only |
| `/profile/kids/[id]` | [SKIP] | [SKIP] | [SKIP] | [ ] | [SKIP] | [SKIP] | [SKIP] | [ ] | [ ] | Family plan only |
| `/bookmarks` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/notifications` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/messages` | [SKIP] | [SKIP] | [ ] | [ ] | [SKIP] | [ ] | [ ] | [ ] | [ ] | Pro/Family + roles |
| `/following` | [SKIP] | [DEL] | [DEL] | [DEL] | [DEL] | [DEL] | [DEL] | [DEL] | [DEL] | Marked for removal — Owner Change #2 |
| `/recap` | [SKIP] | [SKIP] | [ ] | [ ] | [SKIP] | [ ] | [ ] | [ ] | [ ] | Pro/Family + roles |
| `/recap/[id]` | [SKIP] | [SKIP] | [ ] | [ ] | [SKIP] | [ ] | [ ] | [ ] | [ ] | |
| `/billing` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/appeal` | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | |
| `/welcome` | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | post-signup flow |
| `/expert-queue` | [SKIP] | [SKIP] | [SKIP] | [SKIP] | [ ] | [ ] | [ ] | [ ] | [ ] | Expert+ only |

### Admin surfaces (admin/owner only — all others SKIP)

| Page | admin | owner | Notes |
|------|-------|-------|-------|
| `/admin` (dashboard) | [ ] | [ ] | |
| `/admin/newsroom` | [ ] | [ ] | |
| `/admin/newsroom/clusters/[id]` | [ ] | [ ] | |
| `/admin/story-manager` | [ ] | [ ] | |
| `/admin/kids-story-manager` | [ ] | [ ] | |
| `/admin/articles` (via newsroom) | [ ] | [ ] | |
| `/admin/breaking` | [ ] | [ ] | |
| `/admin/top-stories` | [ ] | [ ] | |
| `/admin/categories` | [ ] | [ ] | |
| `/admin/moderation` | [ ] | [ ] | |
| `/admin/comments` | [ ] | [ ] | |
| `/admin/reports` | [ ] | [ ] | |
| `/admin/users` | [ ] | [ ] | |
| `/admin/users/[id]` | [ ] | [ ] | |
| `/admin/users/[id]/permissions` | [ ] | [ ] | |
| `/admin/access` | [ ] | [ ] | |
| `/admin/access-requests` | [ ] | [ ] | |
| `/admin/verification` | [ ] | [ ] | |
| `/admin/support` | [ ] | [ ] | |
| `/admin/appeals` (via moderation) | [ ] | [ ] | |
| `/admin/subscriptions` | [ ] | [ ] | |
| `/admin/plans` | [ ] | [ ] | |
| `/admin/referrals` | [ ] | [ ] | |
| `/admin/promo` | [ ] | [ ] | |
| `/admin/ads/queue` | [ ] | [ ] | |
| `/admin/ads/preview` | [ ] | [ ] | |
| `/admin/ad-campaigns` | [ ] | [ ] | |
| `/admin/ad-placements` | [ ] | [ ] | |
| `/admin/ad-units/[id]` | [ ] | [ ] | |
| `/admin/ad-analytics` | [ ] | [ ] | |
| `/admin/sponsors` | [ ] | [ ] | |
| `/admin/analytics` | [ ] | [ ] | |
| `/admin/pipeline/runs` | [ ] | [ ] | |
| `/admin/pipeline/runs/[id]` | [ ] | [ ] | |
| `/admin/pipeline/settings` | [ ] | [ ] | |
| `/admin/pipeline/cleanup` | [ ] | [ ] | |
| `/admin/pipeline/costs` | [ ] | [ ] | |
| `/admin/pipeline-config` | [ ] | [ ] | |
| `/admin/feeds` | [ ] | [ ] | |
| `/admin/expert-sessions` | [ ] | [ ] | |
| `/admin/recap` | [ ] | [ ] | |
| `/admin/notifications` | [ ] | [ ] | |
| `/admin/email-templates` | [ ] | [ ] | |
| `/admin/permissions` | [ ] | [ ] | |
| `/admin/features` | [ ] | [ ] | |
| `/admin/settings` | [ ] | [ ] | |
| `/admin/system` | [ ] | [ ] | |
| `/admin/cohorts` | [ ] | [ ] | |
| `/admin/streaks` | [ ] | [ ] | |
| `/admin/words` | [ ] | [ ] | |
| `/admin/data-requests` | [ ] | [ ] | |
| `/admin/auth-recovery` | [ ] | [ ] | |
| `/admin/kids-dob-corrections` | [ ] | [ ] | |
| `/admin/kids-dob-corrections/[id]` | [ ] | [ ] | |
| `/admin/prompt-presets` | [ ] | [ ] | |
| `/admin/reader` | [ ] | [ ] | |

### Skip entirely

`/ideas/*` (preview), `/beta-locked` (redirect), `/logout` (action), `/mockup-explore` (internal).

---

## 7. True-Fix Gate

**Premise:** every fix is a *true* fix — full implications understood, cross-platform parity enforced, no patches, no regressions. **No "two steps forward, three steps back."** A fix that breaks something else is not a fix; it's a swap. The only way to hold that at speed is a multi-agent check chain at every step — pre-impl, mid-impl, post-impl — with an explicit downstream-impact map driving every verification. This gate is non-optional.

### 7.1. Per-finding pipeline

For each `Ready for fix: yes` finding (see §8 finding states). Steps run in order; each step's output is the input to the next.

**Step 1 — Cite re-verification.**
`finding-verifier` agent on every `file:line` cite. If refuted or partial → mark finding `stale`, update `Confirmed:`, stop. Don't fix from a drifted cite.

**Step 2 — Pre-impl 4-agent panel (parallel).**
Dispatch in a single message:

- `general-purpose` (investigator) — read current code at every cite; quote the actual lines; confirm what is broken vs what looked broken. Output: confirmed root cause + coupling map.
- `Plan` (planner) — propose the fix shape; explicitly enumerate web + iOS adult + iOS kids parity (memory `feedback_cross_platform_consistency`). Output: file-by-file diff plan.
- `independent-reviewer` lens=`edge-cases` (big-picture reviewer) — what else does this fix touch? Caller graph, DB schema, RLS, types, kill-switches, related tests, migrations.
- `adversary` (paranoid reviewer) — what is the implementer about to MISS? Permission bypasses, regression vectors, race conditions, copy/UX gotchas, downstream surfaces. Reviews the *gap*, not the diff.

Require **4/4 alignment** on the fix shape before proceeding. If divergent → dispatch 4 fresh independent agents (no shared context) on the disputed point; their verdict decides (memory `feedback_divergence_resolution_4_independent_agents`). Don't bring technical merits to the owner.

**Step 3 — Downstream impact map (the regression gate).**

This is the step that prevents "two steps forward, three steps back." A dedicated agent (`general-purpose` with the four panel outputs as input) produces an explicit, exhaustive list of EVERY downstream item that could be affected by the planned change:

- Every caller / importer of every file the plan touches (grep the symbol, list each call site).
- Every UI surface that renders any component in the plan (route + role visibility).
- Every API endpoint that consumes any function the plan changes.
- Every DB table / RLS policy / RPC the plan touches, and every consumer of each.
- Every type / interface change and every file that imports it.
- Every test (unit, integration, smoke) that exercises any of the above.
- Every cross-platform sibling — web ↔ iOS adult ↔ iOS kids equivalents.
- Every locked surface (§8.4) that this could touch — if any → STOP, request unlock first (§7.6).
- Every kill-switched surface (CLAUDE.md) that this could re-expose — if any → STOP.

**Output format** the agent must produce: a numbered list `[1] surface — file — what changes — what to verify post-impl`. This list is the contract for Step 6 and Step 7. The map is saved into the finding's `Notes for next agent:` block before implementation starts.

If the map has zero items, the planner missed something — re-run Step 2 with a stricter brief.

**Step 4 — Implement.**
`fix-implementer` agent (or 4 in parallel for cross-cutting fixes per memory `feedback_4_stream_parallel_cleanup` / `feedback_batch_mode_4_parallel_implementers`). The implementer receives the plan from Step 2 AND the downstream map from Step 3. It is required to touch nothing outside the plan; if it discovers a needed scope expansion, it stops and reports — no silent scope creep.

**Step 5 — Diff peer review (mid-impl, before any verification).**
A fresh agent (`independent-reviewer` lens=`edge-cases` or a second `adversary`) reads the actual diff produced in Step 4 — not the plan, the diff. Cross-checks against the downstream map: does the diff actually do what the plan said? Did anything outside the plan get touched? Did anything in the plan get missed? Pass/fail gate. If fail → re-implement, don't proceed.

**Step 6 — Static check pass (parallel, code-level only — no app boot).**

- `build-verifier` — type-check + lint + sentinel grep + file existence.
- `bug-hunter-runtime` — crashes, null derefs, unhandled rejections (static analysis, doesn't run the app).
- `bug-hunter-flow` — state loss, dead-end UX, double-submits, broken state machines (reads code, traces flows).
- `bug-hunter-security` — auth bypasses, RLS holes, RBAC gaps. **Mandatory** for any finding touching auth / RBAC / payments / kid safety / schema migrations / COPPA.

All four must return clean. Any flag → fix the gap, re-run the flagged agent, then continue. None of these run the app — they read the code.

**Step 7 — Cross-platform sweep.**
The finding's `Cross-platform parity:` line lists web / iOS adult / iOS kids. Each is either fixed or marked "not applicable" with a reason in the commit message. No silent platform gaps. The downstream map (Step 3) lists cross-platform siblings — confirm each was addressed.

**Step 8 — Owner test checklist (handoff for localhost testing).**
The agent does NOT run smoke tests. Code lands on localhost — owner tests it. Agent's job here is to prepare a tight list of what to look at:

- **Primary surface** — the route the fix targeted; what should look different and how.
- **Downstream items to spot-check** — pulled from the Step 3 map, ranked highest-risk first. Plain English: "load this page as this role, confirm this still works."
- **Cross-platform spot-checks** — if iOS was touched, name the screens to open.
- **Known not-yet-verified** — anything the static checks couldn't cover.

Output is a numbered list pasted into the chat (plain English) AND saved into the finding under `Owner test checklist:`. Owner walks it on localhost, marks each as PASS / FAIL. Owner FAIL = re-plan, don't ship.

**Step 9 — Self-check before commit.**

- Did I re-Read every file I edited, post-Edit?
- Step 6 static checks green across all 4 agents?
- Step 7 cross-platform sweep complete?
- Step 8 owner test checklist written and handed off?
- §0 Current task, §6 matrix, §8 finding all updated this turn?
- Commit message draft accurate (no overstated scope, no claimed-but-not-shipped items)?

If any answer is no → fix the gap before going further.

**Step 10 — Owner verifies on localhost.**
Owner walks the Step 8 checklist at `localhost:3000`. Owner says PASS or FAIL.

- **Owner FAIL** → finding `Status: in-flight` (back to Step 4 with new info). Don't commit.
- **Owner PASS** → proceed to Step 11.

**Step 11 — Commit + push.**
Commit message names the finding number(s) (e.g. `fix(login): remove dead "get help" link (QA finding-N)`). Push at end of session. Committed-but-unpushed = failure (Vercel never deploys; memory `feedback_always_push_after_commits`).

**Step 12 — Owner verifies on production (promotion to LOCKED).**
After Vercel deploy, owner loads the route on production. Owner PASS → owner writes the LOCKED line into §8.4 (per §7.5 promotion pipeline). Owner FAIL → matrix flips back to `[BUG]`, new finding opened.

### 7.1.4. Same-turn bookkeeping per step

Every step writes its result back into QA.md AND advances the git artifact (commit message draft) the same turn the step finishes. No batched bookkeeping at the end. If the session crashes mid-fix, the next session can read the doc and resume from the exact step the previous one stopped at.

| Step | QA.md update | Git artifact |
|------|--------------|--------------|
| 1 — Cite re-verify | Finding's `Confirmed:` line refreshed with date + verifier name. If stale → `Status: stale`, stop. | Nothing yet. |
| 2 — Pre-impl 4-agent panel | Finding gets a `Panel summary:` block (one-line per expert). `Status: planning`. | **Draft commit message** written into the finding (`Draft commit:` field). |
| 3 — Downstream impact map | Map saved into finding under `Downstream map:`. **§0 STATUS = downstream-mapped.** Any locked-surface hit → §8.4 unlock request opened that turn. | Commit message draft refined to name affected surfaces. |
| 4 — Implement | Finding `Status: in-flight`. §6 matrix cells touched → `[~]`. §0 STATUS = implementing. | Files modified locally; `git status` should match the planned diff. |
| 5 — Diff peer review | Finding gets `Diff review:` (pass/fail + reviewer ID). If fail → re-implement. | Commit message draft locked. |
| 6 — Static check pass | Finding gets `Build:` / `Runtime:` / `Flow:` / `Security:` lines (pass/fail per agent). §0 STATUS = static-checks-green. | Nothing yet. |
| 7 — Cross-platform sweep | Finding's `Cross-platform parity:` updated per platform. | Commit message draft notes platform coverage. |
| 8 — Owner test checklist | Checklist saved under `Owner test checklist:` in finding AND pasted in chat (plain English). §0 STATUS = awaiting-owner-localhost-test. | Nothing yet. |
| 9 — Self-check (pre-handoff) | §0 STATUS = handed-off-to-owner. | Commit message reviewed once more. |
| 10 — Owner localhost verify | Owner result recorded: PASS → §0 STATUS = owner-pass-ready-to-commit. FAIL → finding `Status: in-flight`, back to Step 4. | Nothing yet — no commit until owner PASS. |
| 11 — Commit + push | Finding `Status: shipped`, `Ready for fix: n/a — shipped YYYY-MM-DD <sha>`. §6 matrix flipped from `[~]` → `[FIXED]`. Roll-up moved to §8.3 Shipped. §0 STATUS = pushed-awaiting-prod-confirm. | `git commit` + `git push`. |
| 12 — Owner prod verify | Owner PASS → §6 matrix `[FIXED]` → `[PROD]`, then owner writes LOCKED line in §8.4 → matrix → `[LOCKED]`. Owner FAIL → matrix back to `[BUG]`, new finding. | Nothing — just verifies. |

The doc is the resume token. If you walk away mid-Step 6, the next session reads §0 + the finding's bookkeeping lines and knows to start at Step 7 with the existing downstream map and commit draft intact. No re-deriving from scratch.

### 7.1.5. Why this many steps

Every step exists because skipping it costs more than running it:

- Step 1 — without it, you fix a phantom (Find #1 was already fixed in code; would have wasted a session).
- Step 2 4/4 alignment — single-agent fixes ship the agent's blind spot. Four-lens convergence has caught regressions on every elevated-care fix this project has shipped.
- Step 3 downstream map — the doc that prevents "two steps forward, three steps back." Without an explicit map, regressions are invisible until owner clicks around and finds them.
- Step 5 diff peer review — implementers drift. The diff often deviates from the plan in ways the implementer doesn't notice.
- Step 6 static check pass — agents read the code (type-check, lint, runtime/flow/security analysis). They don't run the app — that's owner's job. But they catch every code-level mistake before it gets to localhost.
- Step 8 owner test checklist — agents prep a tight, prioritized list of what owner should look at on localhost so testing isn't a guessing game.
- Step 10 owner localhost verify — owner is the eyes. No code ships without owner saying "yes this is right" on localhost.
- Step 12 owner prod verify → LOCKED — fixes don't prove themselves on commit; they prove themselves on production, with owner's confirmation. That's the only path to `[LOCKED]`.

If a fix feels small enough that "all this is overkill," apply judgment for true one-line typos only. Anything touching state, auth, RBAC, payments, kid safety, schema, RLS, or shared chrome runs the full chain — no exceptions.

### 7.2. Hard nos

- No fix without re-Read of current file in this session.
- No "patch and move on" — read memory `genuine_fixes_not_patches`.
- No mixing clusters in one session (cluster = fix scope; one session = one cluster).
- No `--no-verify` / `--no-gpg-sign` on commits.
- No fix on `Ready for fix: no` finds (decision/diagnosis blocked).
- No copy-only fix when the structural complaint is size/position/layout (Find #4 lesson — copy was already correct, the bugs were size + position).
- No reintroducing kill-switched surfaces (CLAUDE.md inventory).
- No Sentry, no keyboard shortcuts, no `// removed` markers for deleted code.
- No fabricated symbols / file paths — Grep first, then call.
- No skipping the adversary on auth / chrome / RBAC / payments / COPPA / schema-migration finds.

### 7.3. Hard stop conditions (end the session)

- No `Ready for fix: yes` finds remain in the picked cluster.
- `build-verifier` failed and the cause is not a 1-line fix.
- `smoke-tester` reports unrelated regressions on the route under test.
- A finding's cite drifted enough that the fix shape changed → re-confirm before any new attempt.
- A finding requires an owner decision that wasn't locked.
- The session has been working a single finding for >3 implementer dispatches.
- Token budget approaching cap — end on a clean push, not mid-fix.

### 7.5. Promotion pipeline — local → Vercel → LOCKED

Every page (and every fix) walks this exact sequence. No skipping.

```
[ ]  → local QA on localhost:3000
[~]  → in flight in this session
[OK] or [FIXED]  → matches ground truth locally; build green; smoke green
       │
       │  commit + push (§7 Step 8)
       ▼
[PROD]  → live on Vercel; awaiting owner prod confirmation
       │
       │  owner loads the route on production (veritypost.com), confirms
       │  it matches §5 Ground truth + the finding's expected fix
       │
       │  owner writes the confirmation line into §8.4 Lock log:
       │    "<page or finding-N>: confirmed prod YYYY-MM-DD by owner"
       ▼
[LOCKED]  → frozen. UI/UX cannot change without an unlock (§7.6).
```

Rules:

- A `[OK]` cell does NOT skip to `[LOCKED]`. It must go through Vercel + owner prod confirmation first.
- Only the owner can promote `[PROD]` → `[LOCKED]`. Agents never write `[LOCKED]` on their own.
- An agent that finishes a fix sets the matrix cell to `[FIXED]` and the finding to `Status: shipped`. Vercel deploy moves it to `[PROD]`. Owner confirmation moves it to `[LOCKED]`.
- If the owner rejects a `[PROD]` cell (prod doesn't match), revert it to `[BUG]` with a new finding under §8.

### 7.6. Lock + unlock protocol

**Zero-exception rule.** When the owner declares a surface `[LOCKED]`, that UI/UX is frozen. Nothing changes it. Not a token sweep. Not a dark-mode pass. Not a collateral edit from a fix on another finding. Not a "while I was already in this file" tweak. Not a refactor. Not a copy nudge. Not an agent's judgment call. Not even another finding shipping nearby.

**The ONLY exception is explicit, strict, written owner permission** — an unlock line authored by the owner in §8.4 that names the route or finding-N, the date, and the scope of what may change. No verbal/implicit "go ahead." No "owner mentioned it last session." No agent inference from intent. The unlock line in §8.4 IS the permission; absent the line, there is no permission.

If you don't have an unlock line in §8.4 for the exact surface or file you're about to edit, you don't touch the file. Full stop.

The reason this rule is absolute: the moment one "tiny" exception is allowed, locking is meaningless. The owner needs to be able to say "this is what it should be" once and have that survive every future session, every cleanup sweep, every well-intentioned agent.

**Before any edit to a file that backs a `[LOCKED]` surface:**

1. Grep §6 matrix for the route. If any role's cell on that route is `[LOCKED]`, the surface is locked.
2. Grep the file path against the locked-surface list (§8.4). Many components back multiple routes — `NavWrapper.tsx` backing `/`, `/browse`, `/leaderboard` etc. is locked if ANY of those routes is locked.
3. If locked → STOP. Do not edit. Open a §8 finding with cluster `locked-change-request`, name the surface, name the diff intent, name the trigger (which finding / which user request prompted it). Set `Status: awaiting-unlock`, `Ready for fix: no`.
4. Surface the request to the owner with a one-paragraph summary: what you want to change, why, what breaks if you don't, what risks the change introduces, what other locked surfaces it could touch.
5. Owner responds with one of:
   - **Unlock granted** — owner appends to §8.4: `"<route or finding-N>: unlocked YYYY-MM-DD for <reason / finding-N>; re-lock required after prod re-confirm."` Cell flips from `[LOCKED]` back to `[ ]` for re-QA. Fix runs through §7 like any other finding.
   - **Unlock denied** — close the request finding as `Status: declined`. Don't loop back.
   - **Scope adjustment** — owner specifies a smaller change that doesn't touch the locked surface. Fix proceeds within that smaller scope.
6. After the unlocked fix ships and re-walks the promotion pipeline, owner re-locks via §8.4.

**Hard nos for locked surfaces:**

- No "while I'm in this file anyway" tweaks.
- No collateral renames / refactors that touch a locked component.
- No theme / token / copy sweeps that reach a locked surface without it being in the unlock list.
- No agent decision to unlock — only the owner.
- No silent unlock — the §8.4 line is the contract.

If a fix to an unlocked finding *requires* touching a locked surface (e.g. dark-mode token sweep needs to cross `NavWrapper.tsx` which is locked), stop and request a bundled unlock for the specific files before any edit lands.

### 7.7. Bookkeeping (every state change, same turn)

Per memory `feedback_update_everything_as_you_go`:

- finding-verifier refutes a cite → update `Confirmed:` and `Status:` that turn.
- fix-implementer starts → bump `Status: in-flight` that turn.
- commit pushed → `Status: shipped`, `Ready for fix: n/a — shipped YYYY-MM-DD <sha>`, move bullet under §8 roll-up *Shipped*. Leave the finding body in *Active* for history.
- new finding surfaces mid-session → add to *Active* with `Status: new` that turn. Don't fix in same session.
- owner decision locked mid-session → write into finding body, bump status that turn.

---

## 8. Findings log

### 8.1. Template

```
### N. <short title>

- **Cluster:** <dark-mode | auth | article-reader | chrome | pipeline-data | copy | layout | a11y | decision-pending | other>
- **What was seen:** <1–2 sentences, raw>
- **Surface:** <route or screen> — <file:line cite(s)>
- **Associated:** <related components / cross-platform siblings / related routes>
- **Cross-platform parity:** web / iOS adult / iOS kids — affected | N/A
- **Known context:** <kill-switches, recent commits, memories>
- **Confirmed:** no | partial | yes — <date + verifier name>
- **Owner decision needed:** <yes/no — what owner needs to call before fix>
- **Status:** new | confirmed | decision-locked | ready-for-fix | in-flight | shipped | stale
- **Ready for fix:** no | yes — <only "yes" when Status >= ready-for-fix AND no owner decision pending>
- **Notes for next agent:** <scope guardrails — what NOT to expand into>
```

Keep ≤8 lines. If investigation grows, spin a finding doc under `UI_UX_REVIEW/owner-N-<slug>.md` and link from here.

### 8.2. Active findings

#### 1. Desktop article: timeline below + left of body (should be right rail)

- **Cluster:** article-reader / layout
- **What was seen:** On desktop article view, timeline is stacked below the article body and aligned left. Should be a right-side rail next to the body.
- **Surface:** `/[slug]` — `web/src/components/article/ArticleReaderTabs.tsx:35-123` (consumer); fed from `web/src/app/[slug]/page.tsx:301-306` via `timelineSlot`.
- **Associated:** `TimelineSection`, `SourcesSection` (currently both share `timelineSlot` — see Finding #3); body column max-width 680px in shell.
- **Cross-platform parity:** web only. iOS adult uses tabbed StoryDetailView — N/A. iOS kids — N/A.
- **Known context:** `ArticleReaderTabs.tsx:96-119` implements a 75/25 desktop split with sticky right rail at `top: 80px`, max 1280px. Mobile breakpoint `@media (max-width: 1023px)`. So code is correct; symptom may be downstream (timeline empty, container override, ad slot collapsing rail).
- **Confirmed:** **stale — already fixed in code** (2026-05-03 agent pass). Owner saw a deploy that didn't reflect this OR symptom is downstream.
- **Owner decision needed:** yes — verify against production deploy. If still stacked, capture viewport width + screenshot.
- **Status:** stale (likely already fixed) — needs production-deploy verification before re-opening
- **Ready for fix:** no — stale until owner reproduces against current prod
- **Notes for next agent:** don't ship a desktop-layout fix until owner re-checks on prod. If still broken: check whether `timelineSlot` is populated (`page.tsx:350-356` has timeline + sources + rail-ad) and whether ad component renders null in prod.

#### 2. Article page: sources showing "Unknown" for everything

- **Cluster:** pipeline-data
- **What was seen:** Every source row reads "Unknown" instead of a real publisher / outlet name.
- **Surface:** `/[slug]` — render: `web/src/components/article/SourcesSection.tsx:50-83`; data: `web/src/app/[slug]/page.tsx:174-178` (selects `title, url, publisher, sort_order` from `sources`).
- **Associated:** writers `web/src/app/api/admin/pipeline/generate/route.ts:1173-1174` + `:1799-1807` and `web/src/app/api/newsroom/ingest/run/route.ts:238` defaulted outlet/publisher to literal `'Unknown'`.
- **Cross-platform parity:** web confirmed. iOS adult `StoryDetailView.swift:2424` reads same `sources` table — affected. iOS kids — N/A.
- **Known context:** render component innocent — bug upstream. Three writers were defaulting to "Unknown" sentinel.
- **Confirmed:** yes (2026-05-03). DB query returned 4 rows all with `title='Unknown'` AND `publisher='Unknown'`.
- **Owner decision needed:** no.
- **Status:** **shipped 2026-05-03 `6d46831`**.
- **Ready for fix:** n/a — shipped.
- **Notes / shipped state:** writers null-safe; render fallback uses hostname-from-URL (SourcesSection `hostFromUrl` helper, Models.swift `hostFromURLString` helper); also fixed long-standing "NYT — NYT" duplicate via `s.publisher !== s.title` guard. **Backfill migration `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql` requires owner to apply** (MCP server here is read-only) — until then the 4 existing rows still render legacy values.

#### 3. Article page: sources rendered under Timeline tab (should sit with article body)

- **Cluster:** article-reader
- **What was seen:** On mobile the sources block appears inside the Timeline tab, under timeline events. Sources belong with the article, not under the timeline.
- **Surface:** `web/src/app/[slug]/page.tsx:350-356` — both `<TimelineSection />` AND `<SourcesSection />` are passed inside `timelineSlot={...}` along with `<Ad placement="article_rail" />`.
- **Associated:** `ArticleReaderTabs.tsx` (renders that slot as Timeline tab on mobile, stacked after article on desktop — connects to Finding #1).
- **Cross-platform parity:** web — affected. iOS adult — NOT affected (`StoryDetailView.swift:735` keeps sources inside Story tab). iOS kids — N/A.
- **Known context:** structural one-file edit — move `<SourcesSection />` from `timelineSlot` into `articleSlot`. Keep rail ad in `timelineSlot`. `SourcesSection` already styled to render under article body.
- **Confirmed:** yes (2026-05-03).
- **Owner decision needed:** small — place `<SourcesSection>` BEFORE or AFTER `<ArticleActions>` in `articleSlot`? Default = before (sources are body, actions are post-read). Also: when timeline empty after the move, hide the Timeline tab when `timeline.length === 0`?
- **Status:** confirmed (small owner micro-decision pending).
- **Ready for fix:** no — owner decision required.
- **Notes for next agent:** one-file edit. `ArticleReaderTabs.tsx:119` first-child margin-zero rule still works after the move (TimelineSection remains first child of timelineSlot).

#### 4. "Back to edition" button — bad button, bad view, bad position

- **Cluster:** article-reader / layout
- **What was seen:** The button itself, the surface it lives in, and its position are all wrong.
- **Surface:** `web/src/components/NextStoryFooter.tsx:52-72` (button); rendered at `web/src/app/[slug]/page.tsx:406`.
- **Associated:** top-bar wordmark already routes to `/`; `NavWrapper.tsx` chrome.
- **Cross-platform parity:** web only. iOS adult/kids use system back chevron — N/A.
- **Known context:** copy is **already "Back to home"** at `NextStoryFooter.tsx:71` (DECISION #021-clean). Size complaint stands: `fontSize:13`, `padding:8px 14px` — undersized hit target (<44px). Position complaint stands: button is buried at very bottom of reader after "More in [category]" list.
- **Confirmed:** partial — copy is moot, size + position stand.
- **Owner decision needed:** yes — three calls: (a) keep or remove the button (top-bar wordmark is the only other guaranteed home affordance); (b) if keeping, redesign at ≥44px hit target (e.g. `padding:'12px 16px'` + `minHeight:44`); (c) keep or rework "More in [category]" list above it.
- **Status:** confirmed (size + position) / moot (copy).
- **Ready for fix:** no — owner decision required.
- **Notes for next agent:** single-consumer (only `page.tsx:406`). Don't ship a copy-only fix; copy is correct. Position fix = relocating to top of article (breadcrumb-style) or into NavWrapper top bar on article routes — material UX change, owner decision first.

#### 5. Dark mode doesn't cover top bar + bottom nav (and colors should invert)

- **Cluster:** dark-mode / chrome
- **What was seen:** In dark mode the top bar and bottom nav stay white. Owner expects them to flip with the theme — and to invert (light-on-dark, mirroring body inversion).
- **Surface:** `web/src/app/NavWrapper.tsx:391` (top bar `background: 'rgba(255,255,255,0.97)'`), `:421` (bottom nav same hard-coded white).
- **Associated:** every web surface — NavWrapper wraps every route. Likely also `borderColor`, link/text colors, dividers inside the same component need theme tokens.
- **Cross-platform parity:** web only. iOS adult/kids — N/A.
- **Known context:** also flagged in `UI_UX_REVIEW/A-1-home.md` finding #2; moved to `UI_UX_REVIEW_OUT_OF_WAVE.md` as a sweep candidate. Owner now flagging as priority + adding "invert colors" requirement.
- **Confirmed:** yes (2026-05-03). Surrounding hard-coded values that will clash once chrome flips dark: `:357` text uses light-pinned `--text` (#111 — Finding #8 territory); `:393,423` `borderTop/borderBottom` uses `--border` not redefined dark; `:616` nav-link active uses `--accent` not redefined dark; `:648` admin banner uses literal `#111` (coincidentally fine). NavWrapper is suppressed on `/login`, `/signup`, `/welcome`, `/verify-email`, `/api/auth/callback`, `/logout`, `/beta-locked`, `/request-access`, all `/admin/*`, `/ideas/*`, `/story/*`, `/mockup/*`.
- **Owner decision needed:** yes — token strategy: (a) introduce `--chrome-bg` / `--chrome-text` / `--chrome-border` tokens defined separately in light + dark blocks, OR (b) reuse `--p-surface` / `--p-ink` / `--p-border` from the new token system. (b) cheaper, aligns with newer direction.
- **Status:** confirmed (token-strategy decision pending).
- **Ready for fix:** no — owner decision required; also gated on Finding #8 bundling.
- **Notes for next agent:** Finding #8 must ship first OR be bundled with this — flipping chrome bg without flipping `--text` / `--border` / `--accent` would create dark text on dark chrome. Recommend bundling #5 + #8 into one dark-mode session.

#### 6. Web silently logs the user out overnight

- **Cluster:** auth
- **What was seen:** Was logged in last night, opened browser today and was logged out. Recurring.
- **Surface:** session-cookie write path: `web/src/lib/supabase/server.ts:15-53` + `:59-87`. Middleware redirect: `web/src/middleware.js:419-440`.
- **Associated:** middleware sets `?toast=session_expired` (`middleware.js:434`) when `sb-<ref>-auth-token` cookie exists but session invalid.
- **Cross-platform parity:** web confirmed. iOS adult — needs check (Keychain). iOS kids — N/A.
- **Known context:** original maxAge hypothesis was wrong — `@supabase/ssr@0.10.2` already passes `maxAge: 400 days` (verified at `node_modules/@supabase/ssr/dist/main/utils/constants.js:10`). Better candidate cause: `middleware.js:341-348` `needsUser` short-circuits to `false` on public routes, so token refresh only fires on protected hits. Land on `/` overnight → no refresh → next protected nav hits expired access token → client `getUser()` in `NavWrapper.tsx:264` tries to refresh → if that fails, user is logged out.
- **Confirmed:** partial — symptom confirmed, original cause refuted, new cause narrowed (needs runtime cookie capture).
- **Owner decision needed:** no — runtime diagnosis first.
- **Status:** symptom confirmed / cause unresolved (needs runtime cookie capture).
- **Ready for fix:** no — diagnosis blocks fix.
- **Notes for next agent:** owner needs to do this in browser, agents can't repro: (1) DevTools → Application → Cookies on `veritypost.com` immediately after fresh sign-in; capture name + Max-Age + Expires + SameSite + Secure for every `sb-*` cookie; (2) close browser, return >2h later, capture again; note which dropped; (3) if all cookies survive → access expired and refresh failed; instrument middleware refresh path; (4) if cookies missing → look for accidental `auth.signOut()` or third-party cookie purge. Do NOT speculatively expand `needsUser` to all routes — perf hit; fix should be middleware doing a non-blocking `getSession()` to drive refresh.

#### 7. /login renders only a spinner — never resolves

- **Cluster:** auth / chrome / csp
- **What was seen:** veritypost.com/login showed a `<Suspense fallback>` spinner forever; never hydrated.
- **Surface:** `web/src/app/login/page.tsx` (was `'use client'`) + `web/src/app/layout.js` (root layout) + `web/src/middleware.js` (CSP emission).
- **Associated:** `_SingleDoorForm.tsx`, the now-deleted `_WaitlistForm.tsx`, the moved `_RequestAccessForm.tsx`, `ConsentedScripts.tsx` (silent GA4/AdSense breakage same root cause), inline theme-flash `<script>` at `layout.js:118` (also CSP-blocked).
- **Cross-platform parity:** web only. iOS adult / kids — N/A (native HTTP clients ignore CSP).
- **Known context (root cause):** Vercel served `/login` from prerender cache (`x-vercel-cache: HIT`) with `<script>` tags that carried no `nonce` attribute. Middleware emits per-request CSP `script-src 'self' 'nonce-XYZ' 'strict-dynamic' …`. Per CSP3, `'strict-dynamic'` causes browsers to ignore `'self'` and require a matching nonce on every `<script>`. All chunks blocked → no hydration → fallback persists. Layout never read `x-nonce` from middleware, so framework-script auto-attach never fired. 19 top-level `'use client'` pages had the same latent bug; non-Suspense ones presented as white screens instead of spinners.
- **Confirmed:** yes (2026-05-03 — investigator + planner + edge-cases reviewer + adversary panel; then 4-fresh-agent divergence panel converged 4/4 on layout-level fix).
- **Owner decision needed:** locked — Option A (layout-level nonce read; do NOT add per-page `force-dynamic` wrappers).
- **Status:** **shipped 2026-05-03** — `4c3e702` (layout fix bundled with /login QA copy strip + /request-access route flip + waitlist kill + iOS parity); `97f11f7` (GA4 `connect-src` follow-on once nonces unblocked the gtag.js loader); `ce3e72f` (NavWrapper bottom-nav lag fix).
- **Ready for fix:** n/a — shipped.
- **Notes for next agent:** do NOT add per-page `export const dynamic = 'force-dynamic'` server wrappers — 4/4 panel verdict, layout-level `headers()` call cascades dynamic rendering. Do NOT revert RootLayout to sync. Do NOT reintroduce `_WaitlistForm.tsx` or any `mode=request|waitlist` query branch on /login. Do NOT swap the placeholder text away from `"Email Address"`. AdSense origins should be added to CSP only when `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` is approved (see §5.5 Architecture / infra block for the exact additions).

#### 9. Bottom-nav "Sign up" → "Profile" lag after login

- **Cluster:** chrome / nav
- **What was seen:** After OTP auth completes, the bottom-right slot took ~1-2s to flip from "Sign up" to "Profile".
- **Surface:** `web/src/app/NavWrapper.tsx:213-262` — `loadProfile()` had `setLoggedIn(true)` deferred behind two sequential awaits (users SELECT + `refreshAllPermissions()` RPC).
- **Associated:** none — bottom nav `loggedIn` is the only consumer of the boolean for label swap; admin nav slot (separate state) still depends on permissions.
- **Cross-platform parity:** web only. iOS adult/kids use SwiftUI nav with their own auth binding.
- **Known context:** `navItems` array only depends on the `loggedIn` boolean for the label swap; profile/avatar/perms are separate state and can fill in on subsequent ticks.
- **Confirmed:** yes (2026-05-03 — owner reproduced).
- **Owner decision needed:** locked — flip on auth presence, fill data later.
- **Status:** **shipped 2026-05-03 `ce3e72f`**.
- **Ready for fix:** n/a — shipped.
- **Notes for next agent:** do NOT move `setLoggedIn(true)` back below the `users` SELECT or `refreshAllPermissions()` await — the lag returns. Deduping (`lastHydrateRef.current` 60s window) still lives below the early flip; that's intentional.

#### 10. Admin/owner can't see every profile section (expert + role-gated locks apply)

- **Cluster:** admin / rbac / profile
- **What was seen:** Logged in as admin@veritypost.com (role=`owner`, perm sets `owner_mode` + `admin` + `owner` + family/pro/free via plan). Some profile sections still render the "Upgrade to unlock — paid plans / See plans" lock, e.g. Expert queue + Expert profile (gated on `is_expert`, not perms). Owner intent: as admin/owner I should be able to access ANY view in /profile — backstage pass, no lock gates apply.
- **Surface:** `web/src/app/profile/_components/ProfileApp.tsx:176-194` (per-section `locked: !perms.X` / `!u.is_expert` checks); `web/src/app/profile/_components/AppShell.tsx:573-617` (LockedSection — wrong copy "This section is part of paid plans" + wrong CTA "See plans" for any role-gated section).
- **Associated:** every `_sections/*Section.tsx` consumer; `web/src/lib/permissions.js` (`hasPermission`); admin/owner role detection (no current helper — `users.role`/`user_roles` join needed). Plan section also misleading for owner (no real subscription).
- **Cross-platform parity:** web — affected. iOS adult — same pattern in `ProfileView.swift` / `SettingsView.swift`; needs parity check before fix. iOS kids — N/A (no admin).
- **Known context:** DB confirms admin@veritypost.com has `owner` role + `owner_mode`+`admin`+`owner` permission sets, plus family/pro/free via `verity_family_monthly` plan. All 11 ProfileApp-gated perm keys ARE granted. Only `is_expert=false` + section-internal gates would still lock. Memory: kill-switched surfaces stay disabled even for admin; this finding does not override kill switches.
- **Confirmed:** yes (2026-05-03 — DB queried, perm sets verified, ProfileApp + AppShell source read).
- **Owner decision:** **LOCKED 2026-05-03 — owner override** of panel safety rails. Owner-mode = full edit access (NOT read-only); owner-mode is assignable to other users via existing `/admin/users/[id]/permissions` page; "owner mode can do it all."
- **Status:** decision-locked, ready-for-fix.
- **Ready for fix:** yes — runs §7 fix gate (cite reverify → 4-agent pre-impl → downstream map → implement → diff peer review → static check → smoke → owner prod confirm → lock).
- **Notes for next agent / locked decisions + 4-agent panel convergence (2026-05-03):**

  **Scope is MUCH smaller than originally documented — most of the fix is already shipped.** Panel of 4 (investigator + planner + edge-cases reviewer + adversary) read the actual code and converged 4/4 on the narrow scope below.

  **Already-shipped (do NOT redo):**
  - `web/src/lib/permissions.js:179,187,206,217` — `admin.owner_mode` short-circuit on `hasPermission`, `getPermission`, `hasPermissionViaRpc`, `hasPermissionFor`. Every `hasPermission(any.key)` already returns true for owner-mode holders.
  - `web/src/app/profile/settings/_cards/BillingCard.tsx:318-328` — owner-mode branch returns `<Card title="Plan" description="Full access (no subscription required).">{null}</Card>`. All billing CTAs already suppressed.
  - `web/src/components/NavWrapper.tsx:264` + `BillingCard.tsx:59` — both already consume `useAuth().isOwnerMode`.
  - `web/src/app/admin/users/[id]/permissions/page.tsx` — already lists every permission_set incl. `owner_mode` and grants per user via `user_permission_sets`.

  **Genuinely needs fix this session (5-file scope, Option A approved by owner 2026-05-03):**
  1. **`web/src/app/profile/_components/ProfileApp.tsx:363,374`** — Two `locked:` lines AND-gate on raw `u.is_expert` column which the perms short-circuit cannot reach. Add `isOwnerMode = hasPermission('admin.owner_mode')` derivation; rewrite both predicates to OR in `isOwnerMode`. Also compute per-section `bypassed: isOwnerMode && (un-overridden lock would have been true)` for badge display.
  2. **`web/src/app/profile/_components/AppShell.tsx`** — Extend `SectionDef` with `bypassed?: boolean`. In the section header (around L381-405), render a small inline "Admin view" pill (11px, muted) when `active.bypassed === true`. Non-owners never see it. LockedSection (L573-617) stays as-is (dead path for owners, used by other roles).
  3. **`VerityPost/VerityPost/PermissionService.swift:69-87`** — Mirror the web short-circuit. Prepend `if cache.contains("admin.owner_mode") { return true }` in `has(_:)`. In `get(_:)`, return synthesized row with `granted: true, granted_via: "owner_mode"` when cache contains the key. (Note: investigator says DB RPC `my_permission_keys` may already inject all keys; the explicit short-circuit is still needed for `granted_via` attribution and for any future "Admin view" badge logic on iOS.)
  4. **`web/src/app/profile/settings/_cards/BillingCard.tsx:322-328`** — Already correct; no change. (Adversary flagged that an owner with a real Stripe subscription cannot cancel — separate Finding #14 below; not blocking this fix.)
  5. **NEW — `supabase/migrations/<timestamp>_owner_mode_expert_rpcs.sql`** — Step 3 downstream map caught: SECURITY DEFINER RPCs `claim_queue_item(p_user_id, p_queue_item_id)` and `post_expert_answer(...)` hard-code `is_user_expert(p_user_id)` which only checks roles `(expert|educator|journalist)`. Owner-mode user clicks Claim/Answer → 400 "only experts can claim queue items". Fix: extend the pre-check in BOTH RPCs to `IF NOT (is_user_expert(p_user_id) OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=p_user_id AND r.name='owner')) THEN RAISE...`. Back-channel writes already include `owner` in `expert_can_see_back_channel()` — no change needed there. Apply via `mcp__claude_ai_Supabase__apply_migration` (writable). RLS policies on `expert_queue_items` already allow `is_admin_or_above()` reads — owner reads succeed without further changes.

  **iOS kids — permanent N/A.** No admin role; children cannot hold `admin.owner_mode`.

  **Test surfaces post-impl (smoke):**
  - admin@veritypost.com on `/profile` → every rail row clickable; Messages/Family/Expert queue/Expert profile all render real content; "Admin view" pill in header on Expert queue + Expert profile (the only sections owner is bypassing-to-see); Plan section shows muted "Full access (no subscription required)" with no CTAs.
  - Free user on `/profile` → no behavior change.
  - Expert (non-owner) user on `/profile` → no behavior change; pill absent.
  - Admin user on iOS adult → /profile equivalent shows everything; PermissionService.shared.get("foo")?.granted_via == "owner_mode" returns true.

  **Migration / DB:** none (client-only).
  **Rollback:** revert four files (ProfileApp.tsx, AppShell.tsx, PermissionService.swift; BillingCard untouched). Perm system itself unchanged.

  **Adversary P0/P1 spillover findings (filed separately, NOT blocking #10):**
  - **Finding #11 (P0)** — Privilege escalation in `/api/admin/users/[id]/permissions/route.js`. Self-grant `admin.owner_mode` allowed for any `admin.permissions.scope_override` holder.
  - **Finding #12 (P0)** — Client kid-session cache cascade. `permissions.js` short-circuit doesn't check `active_kid` context; client gates skip during a parent's kid session even though server denies.
  - **Finding #13 (P1)** — No audit-log marker on owner-mode bypass writes. Owner expert/family writes attribute to owner with no `via=owner_mode` flag.
  - **Finding #14 (P2)** — BillingCard owner-mode branch suppresses cancel even when owner has a real Stripe subscription. Edge case for dogfooding accounts.

  **Do NOT (binding constraints from the panel):**
  - Don't change LockedSection copy (dead path for owners, correct path for other roles).
  - Don't inject a fake `is_expert=true` anywhere (existing `expert.queue.oversight_all_categories` perm already feeds the right data via the short-circuit).
  - Don't widen the iOS short-circuit beyond `PermissionService` (parental gate, kid PIN, content filters must keep their own checks — see Finding #12).
  - Don't ship the BillingCard cancel-when-real-sub fix in this session (Finding #14, separate cycle).

#### 11. Privilege escalation — admin can self-grant `admin.owner_mode` via permissions UI

- **Cluster:** rbac / security / admin
- **What was seen:** `/api/admin/users/[id]/permissions/route.js:77` only requires the caller to hold `admin.permissions.scope_override` plus pass `requireAdminOutranks`. There is no key-level deny preventing `permission_key === 'admin.owner_mode'` from being granted via the `grant` action, and no enumeration of permission_set members preventing assignment of a set containing `admin.owner_mode` via `assign_set`. An admin can target their own user id (the rank guard's "self-edit allowed" comment at L98 explicitly permits self-edits) and one-click escalate to full owner-mode bypass.
- **Surface:** API: `web/src/app/api/admin/users/[id]/permissions/route.js:77,98`. UI: `web/src/app/admin/users/[id]/permissions/page.tsx:316-326,451,678` (`assignableSets` includes `owner_mode` because the page filters on `is_active` only).
- **Associated:** `permissions.js:179` short-circuit (any holder of `admin.owner_mode` passes every UI gate); `compute_effective_perms` SQL function; `bump_user_perms_version` propagation.
- **Cross-platform parity:** web — affected. iOS adult — same risk if iOS exposes any "grant permission" admin surface (none found yet — confirm during fix). iOS kids — N/A.
- **Known context:** discovered by the §7.1 Step 2 adversary in the Finding #10 panel (2026-05-03). Owner override on #10 (full edit access) makes this MORE acute — an escalated admin gets all the write paths #10 enables, not just read access.
- **Confirmed:** yes (2026-05-03 — file read at `/api/admin/users/[id]/permissions/route.js:77,98` + UI assign-set filter confirmed).
- **Owner decision needed:** yes — three calls: (a) hard-deny `permission_key === 'admin.owner_mode'` on grant action AND enumerate set members on assign_set/remove_set to reject any set containing it, OR (b) introduce a separate `admin.owner_mode.assign` permission held only by the seeded owner role (more flexible but more code), OR (c) restrict the entire `/api/admin/users/[id]/permissions` surface to owner-mode holders only (simplest but kills admin's ability to manage non-owner perms).
- **Status:** confirmed (decision-pending) — separate session before granting `owner_mode` to any second user.
- **Ready for fix:** no — owner decision required on (a)/(b)/(c); fix this BEFORE granting `owner_mode` to anyone besides admin@veritypost.com.
- **Notes for next agent:** do NOT block Finding #10 on this; #10 only changes what owner-mode holders SEE, not who can BECOME owner-mode. Currently only one user holds `owner_mode` (admin@veritypost.com); risk is latent until a second admin is created. Migration history may include a previous owner-mode rename — check `supabase/migrations/2026-05-02_admin_owner_mode_rename.sql` for context.

#### 12. Client kid-session cascade — `permissions.js` short-circuit bypasses kid-protective UI gates

- **Cluster:** rbac / coppa / kids / security
- **What was seen:** `permissions.js:179,187,206,217` short-circuit `hasPermission` to true for any key when the cache contains `admin.owner_mode`. The DB RPC at `supabase/migrations/2026-05-02_admin_owner_mode_rename.sql:130` correctly excludes owner-mode when `active_kid IS NOT NULL` (server-side denies). But the client-side `allPermsCache` was loaded outside the kid-session context and still satisfies every key. UI gates (parental gate prompts, kid PIN re-entry chrome, content filters) skip locally even though the server would still deny. Result: owner-as-parent enters a kid session and the parental gate / PIN chrome may visually skip.
- **Surface:** `web/src/lib/permissions.js:177-181,185-189,205-211,216-222` (4 short-circuit sites). RPC: `supabase/migrations/2026-05-02_admin_owner_mode_rename.sql:130` (server-side excludes when `active_kid` is set; client cache has no symmetrical guard).
- **Associated:** every kid-related component checking `hasPermission` on the client; parental gate flow; kid PIN modal; content-rating filters; `active_kid` cookie / session var (find by grep `active_kid`).
- **Cross-platform parity:** web — confirmed. iOS adult — `PermissionService.swift` short-circuit (per Finding #10 implementation) MUST NOT cascade to kid surfaces; in practice iOS kids = separate app so the cache lives in a different process — this is web-only risk. iOS kids — N/A.
- **Known context:** discovered by Finding #10 panel adversary (2026-05-03). Server denies correctly so this is "client UI bypasses" not "data exposed" — but visible UI bypass undermines the parental-gate UX promise even if reads/writes are still blocked.
- **Confirmed:** partial (2026-05-03 — short-circuit confirmed at the 4 cited lines; the active_kid cascade chain needs runtime trace to confirm exact UI surfaces affected). Server-side guard confirmed in migration RPC.
- **Owner decision needed:** yes — two calls: (a) in `permissions.js` short-circuit, ALSO check for `active_kid` set (in cookie / session) and skip the bypass when in kid context — or (b) invalidate / rebuild `allPermsCache` on every kid-session enter/exit.
- **Status:** confirmed (decision-pending).
- **Ready for fix:** no — owner decision; needs runtime trace of which kid UI gates are affected before scoping (a) vs (b).
- **Notes for next agent:** do NOT block Finding #10 on this; the short-circuit predates this session. But fix this BEFORE expanding owner-mode to additional users (Finding #11 makes this more acute too). When implementing, capture exhaustive list of kid UI gates that read `hasPermission` to guarantee all are covered.

#### 13. No audit-log marker on owner-mode bypass writes

- **Cluster:** observability / rbac / audit
- **What was seen:** When owner-mode user performs writes through routes that have `if (isOwnerMode)` branches (e.g. expert queue claim/answer, family seat add, alert subscriptions), only `add-kid-with-seat` writes `owner_mode: true` in the response payload (`web/src/app/api/family/add-kid-with-seat/route.ts:368`). No write paths write a persistent audit row marking `via=owner_mode`. Result: expert reputation, family seat usage logs, parent-supervisor logs all attribute owner-mode activity as ordinary user activity.
- **Surface:** `web/src/app/api/expert/ask/route.js`, `web/src/app/api/comments/route.js`, `web/src/app/api/family/seats/route.ts`, `web/src/app/api/alerts/subscriptions/route.js`, plus any other route taking an `isOwnerMode` branch. No `admin_audit_log` (or equivalent) row written.
- **Associated:** future analytics/metrics queries that segment by user type; expert reputation scoring; family supervisor compliance logs.
- **Cross-platform parity:** web — confirmed. iOS adult — needs check (any iOS-specific write endpoints with isOwnerMode branches). iOS kids — N/A.
- **Known context:** discovered by Finding #10 adversary (2026-05-03). Low urgency pre-launch (only one owner-mode user); higher urgency once owner-mode is granted to any team member or moderator.
- **Confirmed:** yes (2026-05-03 — file inspection of cited routes).
- **Owner decision needed:** yes — (a) which audit table (existing one, or new `admin_audit_log`)? (b) write a row for every owner-mode bypass write, or only for high-blast-radius writes (expert claim/answer, family seat changes, perm grants)?
- **Status:** confirmed (decision-pending).
- **Ready for fix:** no — owner decision; small fix once table chosen.
- **Notes for next agent:** check `supabase/migrations/` for any existing `admin_audit_log` / `audit_log` table; reuse if present.

#### 14. BillingCard owner-mode branch suppresses cancel even when owner has a real Stripe subscription

- **Cluster:** billing / edge-case
- **What was seen:** `BillingCard.tsx:322-328` short-circuits ALL billing UI when `isOwnerMode`. If the owner ALSO has a real Stripe subscription (test purchase, dogfooding, accidentally), the cancel button vanishes — owner cannot cancel through the UI, must go through Stripe portal externally.
- **Surface:** `web/src/app/profile/settings/_cards/BillingCard.tsx:322-328`.
- **Associated:** `current_subscription_id` field on the user; Stripe portal at `/api/stripe/portal` (if exists).
- **Cross-platform parity:** web — confirmed. iOS adult — `SubscriptionView.swift` likely has its own `isOwnerMode` branch; check during fix. iOS kids — N/A.
- **Known context:** discovered by Finding #10 adversary (2026-05-03). P2 because real owner won't subscribe; only matters if dogfooding test buys happen. Owner-override on #10 said "owner mode can do it all" which would imply showing cancel when there's something to cancel.
- **Confirmed:** yes (2026-05-03 — direct file read).
- **Owner decision needed:** yes — small one-liner: when `isOwnerMode && current_subscription_id != null`, render a minimal "You have an active subscription. Manage it in the Stripe portal." card with a single Cancel button, instead of the empty `<Card>{null}</Card>`?
- **Status:** confirmed (decision-pending; P2).
- **Ready for fix:** no — owner decision; small fix.
- **Notes for next agent:** do NOT touch in Finding #10's fix session. Schedule when convenient. Memory: `feedback_genuine_fixes_not_patches` — if shipping, also confirm Stripe portal returns the user back to /profile?section=plan with success/cancel toast handling intact.

#### 8. Dark mode: article body text stays dark (illegible on dark surface)

- **Cluster:** dark-mode
- **What was seen:** In dark mode, article text still renders dark, so it disappears against the dark page.
- **Surface:** article render components: `web/src/components/article/ArticleSurface.tsx:53,66`, `MidBodyQuizTeaser.tsx:29`, `SourcesSection.tsx:42,72,77`, `TimelineSection.tsx:81,106,111`, `UpNextSheet.tsx:182`, `AnonArticleCtaBanner.tsx:23`, `ArticleReaderTabs.tsx:147-148` — all read `var(--text-primary, #111)` or `var(--text, #111)`.
- **Associated:** root token defs `web/src/app/globals.css:34-35` (light: `--text-primary: #111111`, `--text: #111111`); dark blocks `:root:not([data-theme])` line 129 + `:root[data-theme="dark"]` line 179.
- **Cross-platform parity:** web only. iOS — N/A.
- **Known context:** dark-mode blocks redefine ONLY `--p-*` tokens (`--p-ink`, `--p-bg`, etc.) — `--text-primary` and `--text` are NEVER redefined dark, so they resolve to `#111111` in dark mode. Two viable fixes: (a) redefine `--text-primary` + `--text` (and the FULL legacy palette — `--bg`, `--card`, `--border`, `--accent`, `--dim`, `--muted`, `--soft`, `--foreground`) inside both dark blocks; OR (b) sweep article components to read `--p-ink` instead.
- **Confirmed:** yes (2026-05-03). Path-(a) blast radius: ~50+ consumer files. Does NOT reach `web/src/app/admin/*` (admin owns its own inline-style palette).
- **Owner decision needed:** yes — path (a) full legacy palette redefinition (one CSS file, every consumer flips at once — bigger QA surface but also fixes Finding #5's chrome borders/text), OR path (b) scoped sweep of article components to `--p-ink` only (smaller blast, but leaves rest of app dark-broken).
- **Status:** confirmed (path-a vs path-b decision pending).
- **Ready for fix:** no — owner decision required.
- **Notes for next agent:** if path (a): bundle with Finding #5 (chrome) and ship as one dark-mode session. Watch `/login`, `/welcome`, `/logout`, `/signup` — they use legacy palette but suppress NavWrapper chrome; need full flip. Watch hard-coded white-card pages (`[slug]/not-found.tsx:35` uses `background:'#fff'`+`var(--text-primary)`) — those will go dark-text-on-white-bg, intentional for them. `StoryArticlePicker.tsx:56` reads `var(--foreground)` — also not redefined dark; include in path-(a) sweep.

#### 15. Migration `_210000_grant_feed_clusters_browse_access.sql` not idempotent

- **Cluster:** pipeline-data
- **What was seen:** `CREATE POLICY feed_clusters_public_read` and `feed_cluster_articles_public_read` lack `IF NOT EXISTS` guards. Re-running the migration (e.g., on a fresh dev DB or after a partial-apply situation) errors `42710: policy already exists`. Already hit this once in prod-apply on 2026-05-04 — required manual workaround applying only the GRANT statements.
- **Surface:** `supabase/migrations/20260503210000_grant_feed_clusters_browse_access.sql:23,29`
- **Associated:** none — standalone migration cleanup
- **Cross-platform parity:** DB-only — N/A
- **Known context:** Postgres has no `CREATE POLICY IF NOT EXISTS`. Canonical pattern: `DROP POLICY IF EXISTS …; CREATE POLICY …`. Migration is already applied to prod, so the fix is for fresh-DB / re-apply scenarios.
- **Confirmed:** yes (2026-05-04, audit agent verified via prod re-apply attempt).
- **Owner decision needed:** no — pure cleanup.
- **Status:** ready-for-fix
- **Ready for fix:** yes — small, no risk. Wrap both CREATE POLICY blocks with `DROP POLICY IF EXISTS` guards + add a header comment noting the prior partial-state recovery.
- **Notes for next agent:** edit the existing migration file in place (it is already in `supabase_migrations.schema_migrations` so re-running is a no-op for tracker purposes; the new guards just make the body safe to re-run).

#### 16. iOS push notification tap-through is unimplemented

- **Cluster:** pipeline-data
- **What was seen:** `PushRegistration` class implements `userNotificationCenter(_:willPresent:)` (foreground banner) but has no `userNotificationCenter(_:didReceive:)` handler. When the app is backgrounded and a push lands, tapping the notification opens the app to the last-shown screen — there is no deep-link routing to the article slug carried in the payload.
- **Surface:** `VerityPost/VerityPost/PushRegistration.swift:94-101`
- **Associated:** `VerityPost/VerityPost/VerityPostApp.swift:53-66` (existing `onOpenURL` handler routes `/story/<slug>` URLs via `ArticleRouter.slug` — same hook can be used or extended for notification taps); cron webpush branch (web push deferred per CLAUDE.md kill-switch row 8).
- **Cross-platform parity:** iOS adult only. Web push deferred (kill-switch). Kids iOS — N/A.
- **Known context:** Push IS a live feature per CLAUDE.md kill-switch inventory (iOS-only by design). Last touched 2026-04-27 in autonomous wave shipping; never finished. Header comment in PushRegistration.swift explicitly says "No feature gate here" — confirms not a launch-hide.
- **Confirmed:** yes (2026-05-04, audit agent).
- **Owner decision needed:** no — straightforward feature completion.
- **Status:** ready-for-fix
- **Ready for fix:** yes — add `didReceive` UNUserNotificationCenterDelegate method that reads `slug` (or article_id) from `response.notification.request.content.userInfo` and routes via the same path `onOpenURL` uses.
- **Notes for next agent:** verify the server-side push payload format (cron worker / send-push edge function) actually puts a `slug` or `article_id` field into `userInfo`. If payload format isn't set up, scope expands to include payload schema. Read the existing cron push branch first.

#### 17. iOS `RecapListView` hub view is unreachable

- **Cluster:** layout
- **What was seen:** `RecapListView` was added 2026-04-26 (T-115/T-117) as the "hub" entry point for recaps that fetches `/api/recap` and navigates to `RecapQuizView`. No code path actually navigates to `RecapListView` — `HomeRecapCard` jumps directly to `RecapQuizView`, bypassing the hub.
- **Surface:** `VerityPost/VerityPost/RecapView.swift:11`
- **Associated:** `VerityPost/VerityPost/HomeFeedSlots.swift:10` (HomeRecapCard direct-to-quiz path); `VerityPost/VerityPost/HomeView.swift` (potential "See all recaps" entry point); `ProfileView.swift` (potential profile-section entry point).
- **Cross-platform parity:** iOS adult only. Web — N/A. Kids iOS — N/A.
- **Known context:** Created with explicit T-115 intent ("Hub view fetches /api/recap and navigates to RecapQuizView"). No kill-switch, no launch-hide marker. Either an unfinished wire-up OR a design decision to ship single-card surface only.
- **Confirmed:** yes (2026-05-04, audit agent).
- **Owner decision needed:** YES — wire it (e.g., HomeView "See all recaps" link, or Profile section) OR mark as launch-hide (header comment + accept that it's parked).
- **Status:** decision-needed
- **Ready for fix:** no — owner call required.
- **Notes for next agent:** if owner says wire-up, the natural entry point is HomeView right next to HomeRecapCard. If owner says launch-hide, add a header comment matching the pattern used for ForgotPasswordView / following/page.tsx in commit `707fc71`.

#### 18. iOS Profile Followers/Following stat tiles non-tappable

- **Cluster:** layout
- **What was seen:** The Followers and Following count tiles on ProfileView's social row render counts but are plain `VStack` (the `statTile` helper) with no `Button`, `NavigationLink`, or tap gesture. Tapping does nothing. iOS already has a working `FollowingView` (the pre-launch-hidden tab destination) that COULD render here.
- **Surface:** `VerityPost/VerityPost/ProfileView.swift:478-491` (tiles), `VerityPost/VerityPost/ProfileView.swift:449` (statTile helper).
- **Associated:** `VerityPost/VerityPost/FollowingView.swift` (existing implementation, kept alive launch-hidden — could be reused or repurposed); no equivalent FollowersList view exists.
- **Cross-platform parity:** iOS adult only (web has the equivalent `/profile` social row). Web side parity check needed before fix.
- **Known context:** No kill-switch entry, no comment explaining non-tappability. ProfileView was last touched 2026-05-03 in owner-mode session-5; stat tiles were not the focus of any recent edit. Likely original-design oversight, but possibly intentional display-only.
- **Confirmed:** yes (2026-05-04, audit agent).
- **Owner decision needed:** YES — make tappable (drill into followers list / following list view) OR keep display-only by design.
- **Status:** decision-needed
- **Ready for fix:** no — owner call required. If owner says tappable: scope includes building a FollowersList view that doesn't exist yet, plus making FollowingView re-reachable from outside the dropped Tab.following surface (which is its OWN launch-hide).
- **Notes for next agent:** if tappable wins, also do web parity sweep on `/profile` social row to keep platforms aligned.

#### 19. /admin/feeds rebuild — shipped, awaiting owner prod smoke confirm

- **Cluster:** chrome / pipeline-data
- **What was seen:** Pre-rebuild, /admin/feeds had decorative status badges (no per-feed writeback from ingest), bulk-delete cascaded silently through ~25 child tables, no soft-delete, editor role had `admin.feeds.manage`. Five-stream rebuild closed all of it.
- **Surface:** `web/src/app/admin/feeds/page.tsx`; `web/src/app/api/admin/feeds/route.ts:144-181` (un-delete-on-re-add); `web/src/app/api/admin/feeds/{[id],bulk,list}/route.ts`; ingest writeback in `lib/pipeline/ingestRun.ts`.
- **Associated:** `supabase/migrations/20260504130000_drop_feeds_max_items_per_run.sql`, `…140000_add_feeds_deleted_at.sql`, `…150000_lock_feeds_to_admin.sql` (all applied to prod).
- **Cross-platform parity:** web admin chrome only — N/A iOS / kids.
- **Known context:** Vercel `dpl_5J8LAvy9bDrpApif9t7HyZ6BnnwC` for `aee2701` is `READY` on production. Schema verified via Supabase MCP: `feeds.deleted_at` + `feeds_deleted_at_idx` partial index exist; `feeds.max_items_per_run` gone; `permission_set_perms` for `admin.feeds.manage` is now `{owner, admin}` only. After tier-1 anchor seed (2026-05-04): 255 live feeds / 252 active / 3 inactive (the 3 Google News fallback rows for AP / AP Sports / Reuters are staged `is_active=false` because of GNews ToS gray area — owner flips on at /admin/feeds when ready). All 26 new rows tagged `metadata.tier='1-anchor'`, source_class first_party (23) or gnews_fallback (3). `feeds.url` UNIQUE has no partial filter, so soft-delete-then-re-add relies on the POST route's restore branch — verified in place at route.ts:144-181.
- **Amended 2026-05-04 by Finding #20:** the 129 non-RSS-shaped active rows that previously inflated `error_count` every ingest cycle (RSS-only filter, no scraper handler) are now reclassified to `scrape_html` (96) or `scrape_json` (33) and handled by the new fanout. Type column added to /admin/feeds table renders RSS / Scrape HTML / Scrape JSON badges. After Phase A smoke passes, the broken-rows symptom in step 2 of the original smoke checklist is moot — scrape_html rows will be polled cleanly by the new path.
- **Confirmed:** yes (2026-05-04 — Vercel + Supabase MCP + file read).
- **Owner decision needed:** no for the rebuild itself; yes once smoke passes — promote to `[LOCKED]` in §8.4? The chrome is non-trivial and worth freezing while the long-tail seed work (options 2/3/5 in CURRENT) runs.
- **Status:** pending-prod-confirm (per §0 smoke checklist)
- **Ready for fix:** n/a — shipped 2026-05-04 `aee2701`. Awaiting owner in-browser run.
- **Notes for next agent:** do NOT re-edit /admin/feeds files until smoke passes or owner reports a failure. If smoke step 2 (writeback) reports zero movement after a real ingest, check `lib/pipeline/ingestRun.ts` — the writeback Map relies on the upsert RETURNING rows; if the ingest cron uses a different code path, writeback won't fire there.

#### 20. Discovery scraper layer Phase A — RSS-only ingest extended to all active sources

- **Cluster:** chrome / pipeline-data
- **What was seen:** Pre-fix, 129 of 252 active feeds had non-RSS-shaped URLs (publisher homepages, encyclopedia portals, gov data sites, JSON APIs). The RSS-only filter on /api/newsroom/ingest/run dropped them every cycle, fail-parsed them as RSS, and inflated `error_count` on each. The "Refresh feeds" button polled less than half the active source list. Bug originated in the pipeline pivot when a discovery scraper was specced alongside RSS but never built.
- **Surface:** `web/src/app/api/newsroom/ingest/run/route.ts` (widened feeds query, dual-fanout via Promise.allSettled, source_class stable sort before dedup, deferred-handler branch for scrape_json), `web/src/lib/pipeline/scrape-discovery.ts` (NEW — Jina Reader primary + Cheerio fallback, article-URL heuristic, multi-part-TLD-aware sameRegistrableDomain, silent-fail contract), `web/src/app/admin/feeds/page.tsx` (new Type column badge + module-scope `feedTypeLabel` helper).
- **Associated:** `supabase/migrations/20260504160000_feed_type_scraper_values.sql` (applied to prod via Supabase MCP). Reclassify preview retained at `Ongoing Projects/Current/scraper_reclassify_preview_2026-05-04.md` for audit.
- **Cross-platform parity:** web admin only — N/A iOS / kids (server-only route + lib).
- **Known context:** Migration is data-only — no CHECK constraint exists on `feeds.feed_type`. 129 rows touched, stamped `metadata.reclassified_at='2026-05-04'` and `metadata.reclassified_from_pipeline='rss_only_default'`. Idempotent: re-running the WHERE rule returns 0 affected. Migration file edited post-apply to add `AND feed_type IN ('feed','rss')` defensive guard for future replays. Cross-bucket dedup contract preserved: `Array.prototype.sort` is stable in V8/Node and orders RSS before scrape_html before the existing first-occurrence-wins dedup. scrape_json rows are deferred — they get `last_polled_at` updated but no fetch and no error_count change. Adversary review surfaced 11 findings; 3 fixed in slice (migration replay guard, multi-part TLD bug for `co.uk`/`com.au`/etc., audit-log payload), 8 documented as Phase B/C followup. CLI gates green: tsc 0 errors, lint 0 errors on touched files, `npm run build` clean.
- **Confirmed:** yes (2026-05-04 — Supabase MCP query + tsc/lint/build).
- **Owner decision needed:** no for Phase A itself. Phase B (JSON API handler + per-source `extraction_config` JSONB column + admin UI for the field-mapping config) and Phase C (cross-path dedup hardening + Story Manager scraper provenance + zero-results-streak alerting + numeric-id heuristic tightening + concurrent-run single-flight enforcement) are split out and need separate owner go.
- **Status:** pending-prod-confirm (per §0 smoke checklist)
- **Ready for fix:** n/a — shipped 2026-05-04. Awaiting owner in-browser run.
- **Notes for next agent:** do NOT re-edit any of the four touched surfaces until smoke passes or owner reports a failure. If smoke step 4 (scrape_html rows show zero items in Items/24h) fails on EVERY scrape_html row, the article-URL heuristic in `scrape-discovery.ts` is over-rejecting — start by loosening `looksLikeSlug` length threshold or `looksLikeNumericId`; do NOT widen `sameRegistrableDomain`, that fix is correct. If only some rows yield zero, that's normal — 96 publishers don't all expose article links cleanly on their homepage HTML.
- **Phase B amendment (2026-05-04):** The "deferred for Phase B" stub in route.ts has been replaced with a real third Promise.allSettled fanout — see Finding #21. `outcome.deferred` field eradicated; replaced with `outcome.unconfigured` (handler exists, extraction_config = `{}`). `feedsByType.scrape_json` shape changed from `{ polled, deferred }` to `{ polled, succeeded, failed, unconfigured }`. `itemsBySource` gained `scrape_json` count. `FlatItem.source_class` extended; sort priority is now RSS > scrape_html > scrape_json (3-way) before first-occurrence-wins dedup. Phase A's `scrape-discovery.ts` and the Phase A-only sections of route.ts are unchanged.

#### 21. Discovery scraper layer Phase B — JSON consumer + per-source extraction config + admin editor

- **Cluster:** chrome / pipeline-data
- **What was seen:** Phase A landed a deferred-stub for the 33 active scrape_json feeds (NewsAPI, GNews, MediaStack, NewsData and similar JSON APIs). Stub advanced last_polled_at without fetching, leaving those sources permanently zero-output. Phase B builds the real consumer + config plumbing + admin UI.
- **Surface:** `web/src/lib/pipeline/extraction-config.ts` (NEW — `JsonExtractionConfig` interface, `validateExtractionConfig` type-guard, `EXTRACTION_CONFIG_ENV_ALLOW_LIST` + `EXTRACTION_CONFIG_ENV_HOST_BINDINGS`, `resolveEnvRefs` with per-env-var host-binding check, `walkDotPath` with proto-pollution segment guard, `redactExtractionConfigForAudit`), `web/src/lib/pipeline/scrape-json.ts` (NEW — silent-fail JSON consumer, dot-path field walker, 50-article cap, 15s timeout, 10MB body soft cap, http/https-only URL validation, per-article try/catch), `web/src/app/api/newsroom/ingest/run/route.ts` (third Promise.allSettled fanout `scrapeJsonRun` parallel to RSS + scrape_html; FeedOutcome.deferred → unconfigured; FlatItem.source_class extended; 3-way SOURCE_CLASS_PRIORITY sort; feedsByType.scrape_json shape change; allowed_category_slugs filter parity with rss + scrape_html branches), `web/src/app/api/admin/feeds/[id]/extraction-config/route.ts` (NEW Save endpoint — admin.feeds.manage gate, validates config, gates by feed_type='scrape_json', recordAdminAction with redacted payload, 30/60s rate limit), `web/src/app/api/admin/feeds/[id]/extraction-config/test/route.ts` (NEW Test endpoint — read-only, 10/60s/actor in-memory rate limit with opportunistic eviction, returns first 5 articles, NO writes), `web/src/app/admin/feeds/_ExtractionConfigEditor.tsx` (NEW drawer component — Defaults dropdown for NewsAPI/GNews/MediaStack/NewsData, JSON textarea, Save + Test buttons), `web/src/app/admin/feeds/page.tsx` (additive — import + conditional render gated to scrape_json + `key={selected.id}` for per-feed remount; Phase A surface untouched).
- **Associated:** `supabase/migrations/20260504170000_feeds_extraction_config.sql` (applied to prod via Supabase MCP — adds `feeds.extraction_config jsonb NOT NULL DEFAULT '{}'`, idempotent via `IF NOT EXISTS`, no CHECK constraint, no backfill needed). `web/src/types/database.ts` regenerated; `extraction_config: Json` on `feeds` Row type at line 6461.
- **Cross-platform parity:** web admin only — N/A iOS / kids (server-only route + lib + admin-only UI).
- **Known context:** Owner-controlled `feed.url` could otherwise be pivoted to an attacker-controlled host to exfiltrate the resolved env-var key (admin.feeds.manage holders can edit feed.url). Mitigation: per-env-var host bindings — NEWSAPI_KEY only resolves on newsapi.org, NEWSDATA_KEY on newsdata.io, MEDIASTACK_KEY on mediastack.com, GNEWS_KEY on gnews.io. Resolver returns `null` (silent-fail to `[scrape_json.config_unresolved]`) on host mismatch. Inline literal secrets in headers/query_params persist to `feeds.extraction_config` (operator's choice) but are scrubbed in `admin_audit_log.new_value` via `redactExtractionConfigForAudit` (header values → `[INLINE-VALUE-REDACTED]` unless `${ENV_VAR}` placeholder; query_params with secret-shaped names → same). Test endpoint deliberately echoes the unresolved config (placeholders intact) — env-var values resolved inside scrape-json never bubble back. KILL_SWITCH `settings.ai.ingest_enabled` gates all three consumers via the existing 503 path. Adversary review surfaced 9 findings; 5 fixed in slice (host binding, top-level strict-key allowlist, dot-path proto-pollution segment guard, audit-log redaction, in-memory rate-limit eviction, editor remount-per-feed via React `key` prop), 4 deferred to Phase C. CLI gates green: tsc 0 errors, lint 0 errors on touched files, `npm run build` clean.
- **Confirmed:** yes (2026-05-04 — Supabase MCP query confirmed column exists with default `{}`, all 255 rows defaulted; tsc/lint/build all green).
- **Owner decision needed:** no for Phase B itself. Owner ACTION pending for the env vars: NEWSAPI_KEY / NEWSDATA_KEY / MEDIASTACK_KEY / GNEWS_KEY to be set in Vercel project. Without those, the configured scrape_json rows return `[scrape_json.config_unresolved]` warnings cleanly — no failure mode, just zero items until the keys land. Phase C (vendor-echo defense-in-depth scrub on Test sample, save vs clear-errors UX coupling, automated cron for scrape sources, JSONPath syntax for vendors that need `$.results[*]`) split out and needs separate owner go.
- **Status:** pending-prod-confirm (per §0 smoke checklist).
- **Ready for fix:** n/a — shipped 2026-05-04. Awaiting owner in-browser run.
- **Notes for next agent:** do NOT re-edit any of the seven touched surfaces until smoke passes or owner reports a failure. If Test button reports "[scrape_json.config_unresolved]" on a config that LOOKS valid, three likely causes in order: (1) env var not set in Vercel for that environment (preview vs production), (2) feed.url host doesn't match the env-var binding (e.g., NewsAPI config saved on a feed pointing to example.com — fix the URL or remove the env-var ref), (3) validator rejected an extra top-level key in the config. Check `[scrape_json.config_unresolved]` Vercel log for which feed + host failed. Do NOT loosen the host-binding check — that's the sole defense against URL-pivot exfiltration.
- **Phase C amendment (2026-05-04):** Phase A + Phase B item "Phase C followups" closed by Finding #22. Heuristic, singleflight, dedup attribution, observability, and reclassify ergonomics all land in #22.

#### 22. Discovery scraper layer Phase C — singleflight + dedup attribution + heuristic tightening + Reclassify wizard + health pill

- **Cluster:** chrome / pipeline-data
- **What was seen:** Five followups + one operator surface from Phase A/B's deferred-finding bucket, all polish-grade hardening (no new pipeline routes, no new dependencies, additive-only on existing surfaces). Key gaps: concurrent Run Feed clicks could double-insert error_count under the read-modify-write race; cross-feed dedup silently dropped duplicate URLs without surfacing which feed contributed zero unique items; the article-URL heuristic accepted bare year-segments and digit-heavy non-article paths; pipeline_runs orphan recovery only ran daily via cron leaving the operator stuck after a Vercel timeout; new feeds added via seed/manual could land with a wrong feed_type and the only correction path was direct DB SQL.
- **Surface:** `web/src/app/api/newsroom/ingest/run/route.ts` (in-route orphan-reaper before INSERT + 23505-catch returning HTTP 409 with runningRunId + insertedByFeed wired into writeback for `metadata.zero_results_streak` increment/reset + staleStreaks[] response field), `web/src/lib/pipeline/scrape-discovery.ts` (looksLikeNumericId + looksLikeSlug tightening + 12-case // VERIFY comment array), `web/src/app/api/admin/pipeline/health/route.ts` (NEW — admin.pipeline.run_ingest gate, ingest-pipeline-only scoped recentRuns + orphanReapedLast7d + currentlyRunning), `web/src/app/api/admin/feeds/reclassify/route.ts` (NEW — admin.feeds.manage gate, server-side urlLooksRss heuristic re-check, per-row admin_audit_log entry, max 200 items per call), `web/src/app/admin/feeds/_ReclassifyModal.tsx` (NEW component — preview table with current-vs-proposed feed_type + reason; mirror of server heuristic), `web/src/app/admin/feeds/page.tsx` (page-header Reclassify button + "no unique items N+ runs" badge in Source cell when metadata.zero_results_streak >= 3), `web/src/app/admin/newsroom/page.tsx` ("Last run: <m>m ago, <s>s, <N> items" health pill next to Run Feed button + 409 toast on singleflight collision).
- **Associated:** `supabase/migrations/20260504180000_pipeline_runs_singleflight_index.sql` (applied to prod via Supabase MCP — partial unique index pipeline_runs_singleflight_ingest, plus a pre-flight UPDATE that resets stale 'running' ingest rows older than 10m to 'failed' so the index can be created without violation, plus a post-create assertion DO block that aborts the migration loudly if a future replay finds an index of the same name with a different WHERE clause). Migration verified live: indexdef quotes match, two-row INSERT smoke confirms 23505 raised on collision, cleanup left zero running rows.
- **Cross-platform parity:** web admin only — N/A iOS / kids (server-only routes + lib + admin-only UI).
- **Known context:** Phase A's reclassify metadata stamps (`reclassified_at`/`reclassified_from_pipeline='rss_only_default'`) survive untouched; new wizard-driven reclassifications stamp `reclassified_via='admin_wizard'` + `reclassified_from=<prev type>` so the audit trail differentiates source. Streak counter only ever writes on ok-fetched feeds (failed-fetch and unconfigured-scrape_json branches leave metadata.zero_results_streak untouched — error_count / unconfigured already cover those cases). `pipeline-cleanup` cron at 06:00 UTC remains as the daily defense-in-depth orphan reaper; in-route reaper is the live unblocker. Adversary review surfaced 8 findings; 3 P1s fixed in slice (health endpoint scope leak — generate-pipeline error_messages exposed to ingest-only operators via pipeline_type-agnostic recentRuns + orphanReapedLast7d queries; reclassify feed→rss alias pivot — bypassed urlLooksRss check; migration `IF NOT EXISTS` could silently keep a wrong-WHERE existing index of the same name), 5 P2s left as non-blocking (raceDeduped comment slightly stale under singleflight; 60s kill-switch cache lets new runs start within 60s of disable, pre-existing pattern; priority_weight vs source_class sort — sort by class wins over weight by spec; VERIFY array is a comment block not a Vitest case; tightened heuristic still accepts year-prefixed slugs `/best-of-2024` by spec). CLI gates green: tsc 0 errors, lint 0 errors on touched files, `npm run build` clean.
- **Confirmed:** yes (2026-05-04 — Supabase MCP confirmed singleflight index live + 23505 collision verified; tsc/lint/build all green).
- **Owner decision needed:** no for Phase C itself. No further phases specced — Phase C closes the Phase A/B deferred bucket.
- **Status:** pending-prod-confirm (per §0 smoke checklist).
- **Ready for fix:** n/a — shipped 2026-05-04. Awaiting owner in-browser run.
- **Notes for next agent:** do NOT re-edit any of the seven touched surfaces until smoke passes or owner reports a failure. If `Run Feed` returns 409 unexpectedly, run `SELECT id, started_at FROM public.pipeline_runs WHERE pipeline_type='ingest' AND status='running'` via Supabase MCP — if the row's started_at is older than 10 minutes, the in-route reaper at /api/newsroom/ingest/run should pick it up on the next click; if the row is fresh AND no operator is actively triggering, that's a stuck Vercel lambda — wait 10 min then retry. If the staleStreaks list grows beyond 25 routinely, that's signal that operator-side feed pruning is overdue. Do NOT loosen the singleflight index — that's the sole protection against the error_count read-modify-write race and against double-cluster-insertion on overlapping runs. Do NOT remove the pipeline_type='ingest' filter on /api/admin/pipeline/health — it's the boundary that keeps generate-pipeline error messages out of admin.pipeline.run_ingest's reach.

### 8.3. Roll-up by cluster

#### Ready for fix (decision-locked, fix session can pull these)

- **pipeline-data:** #15 (migration `_210000` idempotency — small, no risk), #16 (iOS push tap-through — feature completion)

#### Decision needed (owner Q&A pass before fix)

- **dark-mode:** #5 (chrome flip — token strategy), #8 (article text — path a vs b) — recommend bundling
- **article-reader:** #3 (sources placement micro-decision), #4 (back-to-home button — keep / delete / relocate)
- **layout:** #17 (RecapListView — wire up vs launch-hide), #18 (Profile Followers/Following tiles — tappable vs display-only)

#### Diagnosis blocked (runtime capture needed)

- **auth:** #6 (overnight logout — cookie capture), #7 (login spinner — console + network capture)

#### Stale / likely already fixed

- **article-reader / layout:** #1 (desktop timeline rail — needs prod re-check)

#### Shipped — pending owner prod confirm

- **chrome / pipeline-data:** #19 (/admin/feeds rebuild) — shipped 2026-05-04 `aee2701`. **Owner action pending:** in-browser smoke per §0 checklist; on green, owner writes a `[LOCKED]` line in §8.4 if freezing is desired.
- **chrome / pipeline-data:** #20 (Discovery scraper layer Phase A) — shipped 2026-05-04 `5627445`. **Owner action pending:** in-browser smoke per §0 checklist (Discovery tab Refresh feeds + /admin/feeds Type column verification + Story Manager item provenance check). Phase B (Finding #21) supersedes the deferred-stub portion of this finding.
- **chrome / pipeline-data:** #21 (Discovery scraper layer Phase B) — shipped 2026-05-04 `c3ab23c`. **Owner action pending:** (a) set env vars NEWSAPI_KEY / NEWSDATA_KEY / MEDIASTACK_KEY / GNEWS_KEY in Vercel project (without keys, configured scrape_json rows return cleanly with zero items, no failure mode); (b) in-browser smoke per §0 checklist 7-step list (drawer editor + Defaults dropdown + Save + Test + ingest run with new shape + env-var → host binding rejection + audit-log redaction).
- **chrome / pipeline-data:** #22 (Discovery scraper layer Phase C) — shipped 2026-05-04 (this commit). **Owner action pending:** in-browser smoke per §0 7-step checklist (Discovery tab health pill + 409 toast on concurrent Run Feed + Reclassify wizard preview & apply + streak badge on stale feed rows + staleStreaks response on Run Feed + audit-log entry per reclassify). Closes the Phase A/B deferred-finding bucket; no further phases specced.

#### Shipped

- **pipeline-data:** #2 (sources "Unknown") — shipped 2026-05-03 `6d46831`. **Owner action pending:** apply `supabase/migrations/20260503000007_backfill_unknown_sources_to_null.sql`.

### 8.4. Lock log — owner-written only

This section is the contract for §7.6. Only the owner edits it. Agents read it before any edit; they never write to it.

**Lock entry format** (owner writes when promoting `[PROD]` → `[LOCKED]`):

```
LOCKED <YYYY-MM-DD>: <route or finding-N> — <one-line scope of what is frozen>
  Files: <comma-separated list of files this lock binds>
  Roles: <which roles' cells in §6 this covers>
```

**Unlock entry format** (owner writes to grant a one-time edit):

```
UNLOCKED <YYYY-MM-DD>: <route or finding-N> — <reason / finding-N driving the change>
  Scope: <exactly what may change — file(s), components, behavior>
  Re-lock required: <yes — after prod re-confirm>
```

**Decline / scope-adjust entries** are also valid:

```
DECLINED <YYYY-MM-DD>: <route or finding-N> — <reason>
SCOPED <YYYY-MM-DD>: <route or finding-N> — <smaller change permitted that does NOT touch the locked surface>
```

#### Active locks

```
LOCKED 2026-05-03: /login — Email-only single-door, no H1, no visible label, placeholder "Email Address", T&C consent line below submit ("By continuing, you agree to our Terms and Privacy Policy."). The only paths off /login are: enter a valid OTP → in; or "Don't have an account? Request access →" → /request-access. No "having trouble", no contact link, no recovery flow.
  Files: web/src/app/login/page.tsx, web/src/app/login/_SingleDoorForm.tsx
  Roles: anon (every other role is [SKIP] on /login per §6)

LOCKED 2026-05-03: /request-access — canonical URL for Early Access signup. Single email field; no name field, no reason textarea, no intro paragraph. H1 "request early access" (lowercase). T&C consent line. "send it →" submit. Footer link "already have an account? sign in" → /login.
  Files: web/src/app/request-access/page.tsx, web/src/app/request-access/_RequestAccessForm.tsx
  Roles: all (role-invariant per §5.6)

LOCKED 2026-05-03: Waitlist == request-access. One backend (/api/access-request), one URL (/request-access), one form. The "join the waitlist" / "you're on the list" / "get in line →" UI is permanently retired (`_WaitlistForm.tsx` deleted). /login?mode=waitlist is a dead query param (silently ignored).
  Files: web/src/app/login/page.tsx (no mode branches), web/src/app/login/_WaitlistForm.tsx (must stay deleted)
  Roles: all

LOCKED 2026-05-03: Email placeholder convention. Every email input across web + iOS uses literal placeholder "Email Address". Forbidden alternatives: you@example.com, name@domain.com, you@somewhere.cool, morning@coffee.com, any "fun" or "professional sample" variant.
  Files: web/src/app/login/_SingleDoorForm.tsx, web/src/app/request-access/_RequestAccessForm.tsx, VerityPost/VerityPost/LoginView.swift, VerityPost/VerityPost/SignupView.swift
  Roles: all (role-invariant placeholder)

LOCKED 2026-05-03: CSP nonce flow lives at the root layout. RootLayout is async, reads x-nonce via next/headers, threads nonce={...} to inline theme <script> and to <ConsentedScripts nonce={...} />. ConsentedScripts forwards nonce to all 3 next/script tags. Per-page force-dynamic wrappers are FORBIDDEN — redundant after layout fix; 4/4 panel verdict. Marketing pages losing static prerender is the accepted cost.
  Files: web/src/app/layout.js, web/src/components/ConsentedScripts.tsx, web/src/middleware.js
  Roles: all (every route renders through RootLayout)

LOCKED 2026-05-03: NavWrapper bottom-nav loggedIn flips on auth presence. setLoggedIn(true) + setAuthLoaded(true) hoisted ABOVE the users SELECT + refreshAllPermissions() awaits in loadProfile(). Profile data and permission cache fill in on subsequent ticks. Reverting re-introduces the 1-2s "Sign up" → "Profile" lag.
  Files: web/src/app/NavWrapper.tsx
  Roles: all (chrome rendered for every authenticated and anonymous user)

LOCKED 2026-05-03: CSP connect-src GA4 origin set. Includes www.google-analytics.com, analytics.google.com, stats.g.doubleclick.net, region1.google-analytics.com, www.googletagmanager.com. tpc.googlesyndication.com is permanently excluded until non-personalized AdSense (npa=1) is gated. AdSense origins (pagead2.googlesyndication.com, googleads.g.doubleclick.net, *.safeframe.googlesyndication.com) deferred until NEXT_PUBLIC_ADSENSE_PUBLISHER_ID is approved by Google.
  Files: web/src/middleware.js (buildCsp() function, connect-src directive)
  Roles: all

LOCKED 2026-05-03: Beta-gate allowlist includes /terms + /privacy. Legal pages must be reachable for anonymous visitors during Early Access — required for any consent line that links to them. Adding /contact, /help, /about, /pricing, or any other surface to this allowlist requires explicit owner approval.
  Files: web/src/middleware.js (betaGateAllowed conditional)
  Roles: anon (only role gated by NEXT_PUBLIC_BETA_GATE)

LOCKED 2026-05-03: T&C consent — iOS LoginView mirrors web (markdown link to /terms + /privacy below submit, tinted with VP.accent). iOS SignupView already has the COPPA-gated checkbox with Terms + Privacy links (lines 151-176) — DO NOT add a second consent line on signup. Kids iOS has no login surface (child profile under parent's adult account); permanently N/A for any login-parity work.
  Files: VerityPost/VerityPost/LoginView.swift, VerityPost/VerityPost/SignupView.swift
  Roles: all iOS adult; kids = permanent N/A

LOCKED 2026-05-03: Owner-mode backstage pass for /profile (Finding #10 — owner-directed lock at owner request, commit ee9ea19). Any user holding `admin.owner_mode` permission has FULL EDIT ACCESS to every section of /profile (web) AND every PermissionService-gated UI on iOS adult, regardless of plan tier, expert flag (`is_expert`), family membership, plan_status, account state, or profile completeness. Owner-mode users can claim/decline/answer expert queue items, post back-channel messages, edit family seats, modify expert credentials, and use any section's write paths. The `permissions.js` short-circuit at lines 179/187/206/217, the `PermissionService.swift:69-87` short-circuit, and the `is_owner_mode_user(uuid)` SQL helper used by `claim_queue_item` + `post_expert_answer` together form a single coherent contract. DO NOT WEAKEN ANY PART of this contract:
  - Do NOT remove or narrow `permissions.js` `admin.owner_mode` short-circuits (4 sites).
  - Do NOT remove the `isOwnerMode` derivation in `ProfileApp.tsx` or its OR'd-in bypass on the four `locked:` predicates (messages, family, expert-queue, expert-profile).
  - Do NOT remove the `bypassed?: boolean` field on `SectionDef` or the "Admin view" pill rendering in `AppShell.tsx`. The pill is the operator's signal that they're seeing a section they normally would not.
  - Do NOT remove or narrow the `cache.contains("admin.owner_mode")` short-circuit in `PermissionService.swift` `has(_:)` and `get(_:)`. The `granted_via:"owner_mode"` attribution in `get(_:)` must stay.
  - Do NOT remove or narrow `is_owner_mode_user(uuid)` (must filter `expires_at`) or the owner-mode bypass branches inside `claim_queue_item` and `post_expert_answer`. Those RPCs MUST allow owner-mode through `is_user_expert` AND through the target-expert / target-category guards in `claim_queue_item`. The "must claim before answer" guard in `post_expert_answer` IS preserved (owner claims first, same as an expert).
  - Do NOT add a `preview={true}` or "read-only" rail to Expert / Family / Plan sections under owner-mode (owner override 2026-05-03 explicitly stripped that safety rail; "owner mode can do it all").
  - Do NOT leave BillingCard's owner-mode branch returning empty UI when the owner has a real subscription — Finding #14 follow-up; do NOT pre-emptively hide cancel from a paying owner.
  - Owner-mode is ASSIGNABLE to other users via existing `/admin/users/[id]/permissions` page — assignment surface stays as-is. Privilege escalation risk on the assign endpoint is tracked separately as Finding #11; that fix MUST land before any second user is granted owner-mode.
  Files: web/src/lib/permissions.js (lines 177-181, 185-189, 205-211, 216-222), web/src/app/profile/_components/ProfileApp.tsx (isOwnerMode useMemo + 4 sections' locked/bypassed predicates), web/src/app/profile/_components/AppShell.tsx (SectionDef.bypassed + section header pill), VerityPost/VerityPost/PermissionService.swift (has(_:) + get(_:)), supabase/migrations/20260503000008_owner_mode_expert_rpcs.sql + the live `is_owner_mode_user` / `claim_queue_item` / `post_expert_answer` functions in `fyiwulqphgmoqullmrfn`
  Roles: any user holding `admin.owner_mode` (currently admin@veritypost.com only); does NOT change behavior for any other role
```

Each of the locks above awaits prod confirmation per §7.5 (`[FIXED]` → `[PROD]` → `[LOCKED]`). When owner confirms each on `veritypost.com`, append `confirmed prod YYYY-MM-DD by owner` to the entry.

#### Lock history

*(empty — first locks not yet promoted past `[FIXED]`)*

---

## 9. Session log

| # | Role | Date | Pages covered | Findings logged | Fixes shipped (commit) | Status |
|---|------|------|---------------|-----------------|------------------------|--------|
| — | — | — | — | — | — | not started |

---

## 10. Reference

**Web public:** `/` → `web/src/app/page.tsx` · `/[slug]` (article reader) · `/browse` · `/search` · `/category/[id]` · `/leaderboard` · `/login` · `/welcome` · `/pricing` · `/how-it-works` · `/about`
**Web authed:** `/profile` (+ `/settings`, `/settings/billing`, `/settings/expert`, `/family`) · `/profile/kids[/[id]]` · `/bookmarks` · `/notifications` · `/messages` · `/recap[/[id]]` · `/billing` · `/appeal` · `/expert-queue`
**Web admin:** `/admin` (hub) · `/admin/newsroom` (+ `/clusters/[id]`) · per-section subroutes — see `web/src/app/admin/`
**iOS adult:** `VerityPost/VerityPost/` — `ContentView.swift`, `HomeView.swift`, `BrowseLanding.swift`, `ProfileView.swift`, `StoryDetailView.swift`, `FindView.swift`, `AlertsView.swift`, `MessagesView.swift`, `LeaderboardView.swift`, `BookmarksView.swift`, `SettingsView.swift`, `SubscriptionView.swift`
**iOS kids:** `VerityPostKids/VerityPostKids/` — `PairCodeView.swift`, `ParentalGateModal.swift`, `ArticleListView.swift`, `KidReaderView.swift`, `KidQuizEngineView.swift`, scenes (`QuizPassScene`, `StreakScene`, `BadgeUnlockScene`, `GreetingScene`), `LeaderboardView.swift`, `ExpertSessionsView.swift`, `ProfileView.swift`
**Chrome (every web surface):** `web/src/app/NavWrapper.tsx` · `web/src/middleware.js`
**Kill-switched:** see `CLAUDE.md` § Kill-Switch Inventory.
