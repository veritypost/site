# Session 7 — Public Web (non-social, non-profile)

**Self-contained operating manual.** Source docs (`*_READ_ONLY_HISTORICAL.md` in `Ongoing Projects/`) are frozen historical reference. This session file is canonical — everything you need to ship Session 7 lives here.

---

## 0. Hermetic guarantee

Session 7 owns a strict file set. No other session edits these paths; this session does not edit any path outside the list. If a finding requires an off-domain edit, defer the item, flag it for the owning session, and ship the on-domain slice if any.

### 0.1 Owned paths (strict)

- `web/src/app/about/`
- `web/src/app/browse/`
- `web/src/app/dmca/`
- `web/src/app/help/`
- `web/src/app/how-it-works/`
- `web/src/app/ideas/`
- `web/src/app/leaderboard/`
- `web/src/app/recap/`
- `web/src/app/story/[slug]/`
- `web/src/app/search/`
- `web/src/app/welcome/`
- `web/src/app/contact/`
- `web/src/app/appeal/`
- `web/src/app/beta-locked/`
- `web/src/app/access-request/` (and `web/src/app/request-access/` confirmed-redirect twin)
- `web/src/app/pricing/`
- `web/src/app/page.tsx`
- `web/src/app/layout.js`
- `web/src/app/manifest.js`
- `web/src/app/NavWrapper.tsx`
- `web/src/app/api/quiz/**`
- `web/src/app/api/recap/**`
- `web/src/components/*` **excluding** S5-owned (`CommentRow.tsx`, `CommentThread.tsx`, `CommentComposer.tsx`)
- `web/public/**`
- **NEW pages this session creates:** `web/src/app/corrections/`, `web/src/app/editorial-standards/`, `web/src/app/methodology/`
- **NEW components this session creates:** `web/src/components/CookieBanner.tsx`, `web/src/lib/brand.ts` (shared lib — ownership passes to S7 since it's the first creator per index rule 3)

### 0.2 Out of scope

- Profile / redesign / settings → Session 8.
- Login / signup / forgot-password / verify-email pages → Session 3.
- Comment surfaces (CommentRow / CommentThread / CommentComposer) → Session 5.
- Admin tree → Session 6.
- iOS adult / kids → Sessions 9 / 10.
- Email templates (`betaApprovalEmail.ts`, `accessRequestEmail.ts`) → Session 3.
- Middleware (`web/src/middleware.js`) → Session 3 (S7 coordinates with S3 on `/ideas` gating).

---

## 1. Owner-locked authorization

Owner instruction 2026-04-27, verbatim: **"for any owner questions you have for me just use best practice. what a senior developer would do, a ui/ux mastermind would do."**

This is a standing authorization. Every owner-pending decision in this session is locked with the senior-dev / UI-UX-mastermind default and inlined in the item entry. **Do not ask the owner anything in this session.** Implementation rationale lives next to the lock.

Reverse a default at any time by editing the lock and re-shipping; the locked default is the present source of truth.

### 1.1 Best-practice locks summary (cross-references)

The following locks govern Session 7 work; full text lives in each item's entry below. Listed here for orientation.

| Item | Lock |
|---|---|
| A13 | Remove `showAiLabel` admin gate. Disclosure is a fact-of-record, not a toggle. |
| A19 | Ship placeholder favicons (single-color brand mark) until owner provides real PNGs. |
| A20 | Replace `[pending]` placeholder with `legal@veritypost.com` mailto copy. |
| A21 | Coordinate with S3 to middleware-gate `/ideas/*` on admin role. |
| A47 | Strip timeline copy — describe present state OR render unavailable state. No softer-timeline replacement. |
| A50 | Add `/pricing` + `/how-it-works` to footer (anon + authed). Pricing also in primary nav. |
| A51 | Show `/help` link in BOTH anon and authed states. |
| A52 | Pick "Verity Post" Title Case. Create `lib/brand.ts` exporting `BRAND_NAME`. |
| A53 | Pick "Verity Post Kids" for the kid product everywhere. |
| A106 | Drop per-category color treatment entirely. Uniform expanded design. |
| A107 | Stable label "Latest stories." Wait for AR1 before promoting "editors" framing. |
| E1–E9 | Bundle into AR1 trust-transparency surface (provenance, verifier, retraction, plagiarism, difficulty, reading-time, simpler-version). |
| E20 | Render the missing 4 welcome carousel steps (quiz_intro, verity_score, profile, notifications, first_story). |
| F1 / F2 / F3 | Ship `/corrections`, `/editorial-standards`, `/methodology`. `/methodology` may fold into `/editorial-standards`. |
| I3 | Rewrite `/dmca` to remove the § 2258A acknowledgment. |
| I5 | Add `<meta name="ai-generated" content="true">` + schema.org `creativeWorkStatus` on AI articles. |
| I6 | Ship homegrown CookieBanner CMP. GA4 + third-party scripts gate behind consent. |
| I7 | CCPA "Do Not Sell" footer link + GPC respect (toggle stub in S8). |
| K1 | "Pass the quiz" copy (cheaper than changing runtime). |
| K3 | Standardize "Sign in" project-wide. |
| K6 | Per-page audit; ship inline empty-state CTAs. |

---

## 2. Multi-agent shipping process

Every non-trivial item ships under the **6-agent ship pattern**: 4 pre-implementation agents, then implementer(s), then 2 post-implementation reviewers. Per memory `feedback_4pre_2post_ship_pattern`. Per memory `feedback_genuine_fixes_not_patches` — **these are genuine fixes, not patches.**

### 2.1 Pre-implementation (4 agents)

1. **Investigator.** Reads the current file at the line numbers cited in the item. Quotes the current code into the work log. Confirms the audit claim is still accurate against `main`. Per memory `feedback_verify_audit_claims_against_current_code`, ~5/35 audit claims drift between audit-time and ship-time; first agent's job is to re-verify before anyone touches code.
2. **Planner.** Writes the change plan: files to touch, exact diffs in pseudocode, test plan, rollback plan. Plans the genuine-fix shape — kill the thing being replaced, no parallel paths, no TODOs/HACKs/force-unwraps-as-crutch. Surfaces tradeoffs in writing when a patch is the only option (per memory `feedback_genuine_fixes_not_patches`).
3. **Big-picture reviewer.** Cross-file impact. Looks at importers, types, callers, data flow coherence. Flags any off-domain edits that would be required (those defer the item).
4. **Independent adversary.** Reads only the plan (not the investigator/planner notes). Tries to break it. Looks for ways the change regresses an unrelated surface, breaks a contract, leaks data, or weakens security. Per memory `feedback_4pre_2post_ship_pattern`, the adversary consistently earns its keep by surfacing scope reductions and regression risks.

**Gate:** all 4 agents reach unanimous "ship" verdict. Per memory `feedback_four_agent_review`. If divergence persists, dispatch 4 fresh independent agents on the disputed point with no shared context (per memory `feedback_divergence_resolution_4_independent_agents`); their verdict decides. Do not bring technical disputes to owner for merits-call.

### 2.2 Implementation

Per memory `feedback_batch_mode_4_parallel_implementers`: when items can be parallelized within Session 7, dispatch 1 planner + N implementers + reviewer with **isolated file ownership** — no two implementers edit the same file. Items in this session that benefit from batch mode: A52 (brand sweep across 7 files), A47 (timeline-copy purge across 5 files), F1/F2/F3 (three new pages), E1–E9 (AR1 trust surface composed of 7 wired-but-not-rendered fields).

### 2.3 Post-implementation (2 reviewers)

1. **Independent code reviewer.** Reads the diff cold. Verifies it matches the plan, no scope creep, no hidden parallel paths, types coherent.
2. **Security/correctness reviewer.** Required for elevated-care items: kid safety, COPPA, RBAC, billing, AI disclosure, legal-page copy, accessibility-blocking surfaces. In Session 7 this applies to A13, A21, A43, F1–F3, I3, I5, I6, I7, A102, A103.

### 2.4 Verification authority

Per memory `feedback_mcp_verify_actual_schema_not_migration_log`: when a Session 7 item depends on a DB column or RPC, verify via MCP `information_schema` / `pg_proc` / `pg_constraint` directly — never trust the `supabase_migrations` log or audit notes alone.

Per memory `feedback_no_assumption_when_no_visibility`: when a fix needs Vercel / Supabase / Apple / AdSense dashboard visibility, do not pass agent defensive hedges through as launch-critical. Verify from code/live behavior first; if the dashboard is invisible to you, flag "can't see X, can you check" — but only after you've confirmed the code-side claim independently.

---

## 3. Standing rules

### 3.1 No user-facing timelines (memory `feedback_no_user_facing_timelines`)

Owner-locked rule. **Banned strings** anywhere user-visible:

- "coming soon" / "soon"
- "before launch" / "launches in"
- "Check back soon" / "Check back later"
- "actively working" / "we're working on it"
- "we'll get back" / "we'll have"
- "finishing the editorial polish" / "finishing the X polish"
- "in a future pass" / "in the next pass"
- "will be available" / "available soon"
- "Under construction"

The fix is **never** a softer-timeline replacement. Rewrite to **describe present state** OR render a clean **unavailable state** with no implication of a future change. Strip entirely.

A47 (this session's slice) hits 5 owned files. K6 (empty-state CTAs) is the constructive flip side: when stripping a timeline leaves an empty surface, replace with a useful inline action, not "check back."

### 3.2 No color-per-tier (memory `feedback_no_color_per_tier`)

Owner-locked rule. Tiers do not get distinct hues — no rainbow, no muted ramp, no gradient. Tier is a label, not a visual identity. Reject any reviewer or agent suggestion of color-coded ranks.

In Session 7 this affects: tier badge rendering in `story/[slug]/page.tsx`, `welcome/page.tsx`, anywhere a tier label is displayed in components owned here. Use neutral tokens (`--ink` / `--ink-muted`).

### 3.3 No keyboard shortcuts in admin UI (memory `feedback_no_keyboard_shortcuts`)

Out of Session 7 scope (no admin code here), but if any item references a hotkey or command palette, do not propose or build it.

### 3.4 Genuine fixes, never patches (memory `feedback_genuine_fixes_not_patches`)

Every item ships as a complete integration: kill the thing being replaced, no parallel paths, no TODOs/HACKs/force-unwraps-as-crutch, types + callers + data flow coherent. Surface tradeoffs in writing when a patch is the only option.

### 3.5 Apple App Review surface

Several items in this session (A19, A50, A51, A53) directly affect Apple App Review evaluation of the web Support URL, brand consistency, and app store icons. Apple reviewers sign in with test accounts — flow Apple-reviewer-walkthrough through every authed surface and confirm the Support URL is reachable from a signed-in state.

### 3.6 EU AI Act + CA AB 2655 disclosure (regulatory non-toggleable)

A13, A43, I5 carry regulatory exposure. AI disclosure is a **fact of record**, not an admin preference. The existence of a kill-switch is itself the regulatory issue, even if never flipped. EU AI Act Article 50 effective Aug 2026; CA AB 2655 already in force.

---

## 4. Item index

22 items total (20 baseline + 2 follow-on coordination items split across F-block).

| ID | Title | Sev | File anchor |
|---|---|---|---|
| S7-A13 | AI-disclosure pill behind admin master switch | HIGH | `story/[slug]/page.tsx:1735` |
| S7-A19 | Favicon, apple-touch-icon, manifest icons | HIGH | `web/public/`, `layout.js`, `manifest.js` |
| S7-A20 | DMCA `[pending]` placeholder | HIGH | `dmca/page.tsx:124` |
| S7-A21 | `/ideas` publicly reachable | HIGH | `ideas/` + middleware (S3 coord) |
| S7-A22 | "Open verify-email" engineer copy | MED | `story/[slug]/page.tsx:1401` |
| S7-A43 | AI byline conflation (expert badge on AI articles) | HIGH | `story/[slug]/page.tsx:1735-1802` |
| S7-A44 | AI-as-feature pitched on `/how-it-works` | HIGH | `how-it-works/page.tsx:18,39` |
| S7-A47 | Banned timeline copy purge (web slice) | HIGH | 5 files |
| S7-A50 | `/pricing` + `/how-it-works` missing from primary nav | HIGH | `NavWrapper.tsx:445-460` |
| S7-A51 | `/help` hidden from authed nav | HIGH | `NavWrapper.tsx:447-453` |
| S7-A52 | Brand casing drift (web slice) | MED | 7 files |
| S7-A53 | "Verity Post Kids" vs "Verity Kids" drift (web slice) | MED | 3 files |
| S7-A97 | Welcome ScreenThree headline contradicts empty fallback | MED | `welcome/page.tsx:474-525` |
| S7-A102 | Read-state #888 dim text fails AA contrast | MED | `page.tsx:590` |
| S7-A103 | `/search` date inputs no labels | MED | `search/page.tsx:197,204` |
| S7-A105 | "At cap (10)" Save bookmark — no upgrade affordance for touch | MED | `story/[slug]/page.tsx:1840-1858` |
| S7-A106 | `/browse` expanded category card flatlines | MED | `browse/page.tsx:478` |
| S7-A107 | `/browse` "Latest" vs "Featured by editors" silent flip | MED | `browse/page.tsx:316` |
| S7-A109 | Welcome ScreenTwo claims quiz unlocks discussion | MED | `welcome/page.tsx:441-443` |
| S7-A110 | Graduation-claim headline lacks parent context | MED | `welcome/page.tsx:667` |
| S7-E20 | Welcome carousel admin steps drift (7 declared, 3 render) | LOW | `welcome/page.tsx` + `/admin/reader` |
| S7-AR1 | E1–E9 + E16 trust-transparency surface bundle | HIGH | `story/[slug]/page.tsx` provenance pill, `/corrections` |
| S7-F1 | `/corrections` page — does not exist | HIGH | `web/src/app/corrections/page.tsx` (new) |
| S7-F2 | `/editorial-standards` page — does not exist | HIGH | `web/src/app/editorial-standards/page.tsx` (new) |
| S7-F3 | `/methodology` page — does not exist | HIGH | `web/src/app/methodology/page.tsx` (new) |
| S7-I3 | `/dmca` page acknowledges § 2258A unfulfilled duty | HIGH | `dmca/page.tsx` |
| S7-I5 | Machine-readable AI disclosure meta + schema.org | HIGH | `story/[slug]/page.tsx` metadata |
| S7-I6 | Cookie banner / ePrivacy Art. 5(3) compliance | HIGH | `components/CookieBanner.tsx` (new) |
| S7-I7 | CCPA "Do Not Sell" / GPC handler footer link | MED | `NavWrapper.tsx`, footer link only |
| S7-K1 | Welcome carousel "Score 3 out of 5" misleading copy | MED | `welcome/page.tsx:442` |
| S7-K3 | "Log In" vs "Sign in" inconsistency | LOW | sweep across owned tree |
| S7-K6 | Empty-state CTAs missing on 7 surfaces | MED | per-page audit |

---

## 5. Items

### S7-A13 — AI-disclosure pill behind admin master switch

- **ID:** S7-A13
- **Title:** AI-disclosure pill behind admin master switch
- **Source:** TODO A13 (HIGH — owner-locked rule violations).
- **Severity:** HIGH. Regulatory exposure (EU AI Act Article 50 effective Aug 2026; CA AB 2655 already in force).
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/story/[slug]/page.tsx:454-458` (state declaration), `:1735` (render gate).
- **Current state:** `const [showAiLabel, setShowAiLabel] = useState<boolean>(true);` followed by `{story.is_ai_generated && showAiLabel && (...)}`. The pill is gated behind a settings-table boolean an admin can flip, removing every disclosure pill site-wide.
- **Fix:** Remove the `showAiLabel` boolean from the visibility predicate. Render predicate becomes `{story.is_ai_generated && (...)}`. Keep the `showAiLabel` setting in the settings table only if it's repurposed to control **placement / style** (e.g., top-of-article vs inline-with-byline) — never visibility. If no near-term placement experiment is planned, drop the state hook entirely; deletion is the genuine fix.
- **Why:** EU AI Act + CA AB 2655 disclosure obligations are not globally toggleable. Even if the admin never flips the switch, the existence of the kill-switch is the regulatory issue — disclosure must be a fact of record, not an admin preference.
- **Deps:** None on this slice. Coordinates conceptually with S7-A43 (byline conflation) and S7-I5 (machine-readable disclosure meta) — bundle the three into one PR if practical.
- **Verification:**
  - Render an article with `is_ai_generated=true` and confirm pill renders regardless of `showAiLabel` state.
  - Grep `showAiLabel` across owned tree — should be zero references after fix (or only style/placement references, never visibility).
  - Confirm pill copy unchanged.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (regulatory).

---

### S7-A19 — Favicon, apple-touch-icon, manifest icons missing

- **ID:** S7-A19
- **Title:** Favicon, apple-touch-icon, manifest icons missing entirely
- **Source:** TODO A19 (HIGH — infra / launch readiness).
- **Severity:** HIGH. P0 ship-blocker for anything beyond closed beta. AdSense + Apple App Review both check for real favicon + manifest icons.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/public/` (currently only `ads.txt`); `web/src/app/layout.js:88-92` (icons array deliberately omitted); `web/src/app/manifest.js:21-24` (`icons: []`).
- **Current state:** Every browser tab shows the default page glyph. Add-to-Home-Screen falls back to a screenshot. OG cards have no brand image.
- **Fix (best-practice locked):** Ship **placeholder favicons** (single-color brand mark, no rich illustration) **until owner provides real PNGs**. Better than no favicon at all and better than waiting indefinitely.
  - Generate placeholders (the brand wordmark "VP" on a solid background using existing brand colors from globals.css):
    - `web/public/favicon.ico` (multi-resolution: 16, 32, 48 px)
    - `web/public/apple-touch-icon.png` (180×180)
    - `web/public/icon-192.png`
    - `web/public/icon-512.png`
    - `web/public/og-image.png` (1200×630, brand wordmark + tagline)
  - Wire in `web/src/app/layout.js` icons array:
    ```js
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-touch-icon.png',
    },
    ```
  - Wire OG image in `layout.js` `openGraph.images` + `twitter.images`.
  - Wire in `web/src/app/manifest.js` `icons` array with the same 192 + 512 entries.
- **Why:** A site with no favicon reads as a test deployment. AdSense reviewers and Apple App Review treat missing icons as a quality signal. Social unfurl is brand-dead without an OG image. Placeholder is a tiny improvement that unblocks both reviewer paths; real assets are a one-line replacement when owner ships them.
- **Deps:** Coordinates with S7-A52 (brand casing) — both touch `layout.js`. Ship A52 first or in the same PR; the brand strings in the OG metadata should already be "Verity Post" before the OG image gets wired.
- **Verification:**
  - `curl -I https://staging-domain/favicon.ico` returns 200.
  - View page source on `/` and `/story/<slug>` — `<link rel="icon">` and `<meta property="og:image">` resolve to real files.
  - Lighthouse PWA audit passes the icon checks (192 + 512 + maskable optional).
  - Apple touch icon renders when added to iOS home screen (test on a device or via simulator).
- **Multi-agent process:** Standard 4 pre + 2 post. Independent code reviewer confirms the icons array structure matches Next.js 14 App Router conventions.

---

### S7-A20 — DMCA `[pending]` placeholder

- **ID:** S7-A20
- **Title:** DMCA agent registration page ships `[pending]` placeholder
- **Source:** TODO A20 (HIGH — infra / launch readiness).
- **Severity:** HIGH. Bad legal posture (an actual DMCA notice has nowhere to go), bad credibility on a launch-window legal review.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/dmca/page.tsx:124-125`.
- **Current state:** `"DMCA Designated Agent registration: [pending — to be filed at copyright.gov/dmca-agent]."` — literal `[pending]` placeholder on a publicly-reachable footer-linked legal page.
- **Fix (best-practice locked):** Replace the placeholder line with `"Send DMCA notices to legal@veritypost.com."` Owner files the actual copyright.gov form separately (Q4.18 owner-side; $6, 10 minutes).
  - Keep the rest of the DMCA page intact (notice requirements, counter-notice procedure).
  - Bundle with S7-I3 — the § 2258A acknowledgment removal lives on the same page.
- **Why:** Public placeholder text on a legal page is unprofessional and signals a half-finished legal posture. The mailto-only fallback is a defensible interim — DMCA notices land in a real inbox, owner forwards them while completing registration. Once owner files the form, replace the line with the registered agent details.
- **Deps:** Owner-side action separately tracked (Q4.18). Engineering ships the copy fix today regardless of registration status.
- **Verification:**
  - Visit `/dmca` — no `[pending]` string anywhere.
  - `mailto:legal@veritypost.com` link clickable.
  - Footer link to `/dmca` still works.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (legal page).

---

### S7-A21 — `/ideas` is publicly reachable

- **ID:** S7-A21
- **Title:** `/ideas` is publicly reachable — no auth gate
- **Source:** TODO A21 (HIGH — infra / launch readiness).
- **Severity:** HIGH. Internal mocks publicly visible.
- **Status:** OPEN. Best-practice locked. Cross-session coordination required.
- **File:line:** `web/src/app/ideas/page.tsx:1-6` (header comment falsely claims "hidden from nav + crawlers"); `web/src/app/ideas/feed/ranked/page.tsx`; entire `/ideas/*` tree.
- **Current state:** Route has no middleware gate, no admin check. Anyone who guesses or leaks the URL sees internal design mockups.
- **Fix (best-practice locked):** Middleware-gate the entire `/ideas/*` tree on admin role. **S3 owns the middleware edit** (`web/src/middleware.js`). S7 verifies the page is unreachable to anonymous users post-S3-ship.
  - **S3's slice (do not edit from S7):** Add `/ideas` to the admin-only matcher in middleware.js. Anonymous traffic gets a 404, not a render.
  - **S7's slice:** (a) Update the header comment in `ideas/page.tsx:1-6` to accurately reflect the gating mechanism (middleware, not "hidden from nav + crawlers"). (b) Add `robots: { index: false, follow: false }` metadata to the page export so crawlers don't index it even if a middleware bug ever leaks it. (c) Run a final end-to-end check (anon `curl /ideas` → 404).
- **Why:** Internal design mocks publicly visible signals "early/unfinished" to anyone who maps the site. A middleware gate is the cleanest solution — keeps the routes alive for admins, kills public discovery cleanly. Defense in depth via robots meta covers the case where middleware has a bug.
- **Deps:** **S3 must ship the middleware change first.** S7 ships its slice in the same window or after S3 lands. Tag both commits with cross-references.
- **Verification:**
  - Anonymous `curl -I https://staging/ideas` returns 404.
  - Authenticated non-admin `curl -I` returns 404 (or signed-in non-admin user sees 404 in browser).
  - Authenticated admin sees the page render.
  - `curl https://staging/ideas` HTML output contains `<meta name="robots" content="noindex, nofollow">`.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (RBAC). Investigator verifies the S3 middleware change has actually shipped before S7's verification step.

---

### S7-A22 — "Open verify-email" engineer copy

- **ID:** S7-A22
- **Title:** "Open verify-email" engineer-language ships to users
- **Source:** TODO A22 (MEDIUM — copy / IA hygiene).
- **Severity:** MEDIUM. Trust-eroding on the highest-traffic surface.
- **Status:** OPEN.
- **File:line:** `web/src/app/story/[slug]/page.tsx:1401`.
- **Current state:** `<a href="/verify-email">Open verify-email</a>` — engineer-name copy on the article surface.
- **Fix:** Replace link text with `"Verify your email"`. Keep the href unchanged.
- **Why:** Trust-eroding. Anyone hitting this string assumes the rest of the surface is similarly half-baked.
- **Deps:** None.
- **Verification:**
  - Render an article as an unverified user — link copy reads "Verify your email."
  - Click the link → routes to `/verify-email` correctly.
  - No other "Open verify-email" or "open <slug>" patterns in the owned tree (grep).
- **Multi-agent process:** Standard 4 pre + 2 post. Lightweight — single-file copy fix.

---

### S7-A43 — AI byline conflation (expert badge on AI articles)

- **ID:** S7-A43
- **Title:** AI byline conflation on story page (expert badge on AI-flagged articles)
- **Source:** TODO A43 (HIGH — public web bugs).
- **Severity:** HIGH. Misrepresents authorship in exactly the way EU AI Act / CA AB 2655 disclosure obligations exist to prevent.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/story/[slug]/page.tsx:1735-1802`.
- **Current state:** Renders both the "AI-synthesized" pill (line 1735) AND a `By <display_name>` byline with potential expert badge (line ~1762) when `is_ai_generated=true` and an author is joined.
- **Fix (best-practice locked):** When `story.is_ai_generated === true` (or post-AR1 rewrite, when `ai_assistance_level !== 'none'`):
  - **Suppress the human byline.** Do not render `By <display_name>`.
  - **Never render the expert badge** on AI-flagged pieces.
  - **Replace with "Compiled by" or "Verified by"** label until AR1 ships the full provenance pill. Choose "Compiled by" for AI-synthesized pieces with no human verifier; "Verified by" for AI-synthesized pieces where `verified_by` is non-null. The verified user's display_name renders in the "Verified by" variant — but as a verifier, not as the author.
- **Why:** An expert badge on an AI-written article is fraudulent attribution. Even temporarily, this is the kind of disclosure-failure that triggers EU AI Act enforcement. Per memory `project_ai_role_intent_correction`, AI was never meant to be the writer; the byline conflation is the surface symptom of the deeper intent drift, and AR1 is the architectural fix. This item is the near-term patch ahead of AR1 landing.
- **Deps:** Bundle with S7-A13 (disclosure pill un-gating) and S7-I5 (machine-readable meta) into one regulatory-fix PR. AR1 (full pipeline rewrite) supersedes this item when it ships — but ship the patch now; AR1 is multi-week.
- **Verification:**
  - Article with `is_ai_generated=true`, no `verified_by` → byline reads "Compiled by Verity Post" (or similar AI-attribution string), no expert badge anywhere on the surface.
  - Article with `is_ai_generated=true`, `verified_by` non-null → byline reads "Verified by <verifier display_name>", no expert badge on the verifier render.
  - Article with `is_ai_generated=false` → existing byline + expert badge logic unchanged.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (regulatory).

---

### S7-A44 — AI-as-feature pitched on `/how-it-works`

- **ID:** S7-A44
- **Title:** AI-as-feature pitched on `/how-it-works`
- **Source:** TODO A44 (HIGH — public web bugs).
- **Severity:** HIGH. Public copy contradicts AR1 architectural intent.
- **Status:** OPEN.
- **File:line:** `web/src/app/how-it-works/page.tsx:18` ("AI-generated summaries so you can quickly understand the key facts"); `:39` step 4 ("apply for journalist roles" promise).
- **Current state:** Public copy explicitly pitches AI-as-writer and promises a journalist-role application that doesn't ship.
- **Fix:**
  - **Strike the line at `:18`** — "AI-generated summaries so you can quickly understand the key facts." Replace with present-state copy describing what actually ships (e.g., "Original reporting from verified contributors, with AI assistance to surface context and source provenance"). Per memory `project_ai_role_intent_correction`.
  - **Rewrite step 4 at `:39`** — drop the "apply for journalist roles" promise. Replace with a present-state description of what a reader becomes after they pass quizzes / build verity score / accumulate read history. If no terminal-state action ships today, end the flow at "your verity score grows" without promising a future role.
  - Per rule 3.1 (no user-facing timelines), the rewrite cannot use "soon" / "in a future update" / "we're working on" language.
- **Why:** New visitors and reviewers (AdSense, Apple) read this page and form expectations. Step-4 promises a feature that doesn't exist; the AI-summary line contradicts the product intent. Bundle with AR1 cutover so messaging matches behavior.
- **Deps:** None for the patch. Full rewrite syncs with AR1.
- **Verification:**
  - Read `/how-it-works` end-to-end — every claim describes a present-state behavior. No future tense, no roles that don't exist.
  - Grep for "AI-generated" in the owned tree — confirm the strike landed.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A47 — Banned timeline copy purge (web slice)

- **ID:** S7-A47
- **Title:** Banned timeline copy purge across owned files
- **Source:** TODO A47 (HIGH — public web bugs); cross-cutting; this is the S7 slice.
- **Severity:** HIGH. Direct violation of an owner-locked rule (memory `feedback_no_user_facing_timelines`).
- **Status:** OPEN. Best-practice locked.
- **Files in scope (S7 slice):**
  - `web/src/app/recap/page.tsx:79-82` — "We're finishing the editorial polish"
  - `web/src/components/UnderConstruction.tsx:55, 76` — "Under construction" / "Check back soon"
  - `web/src/app/accessibility/page.tsx:93, 153` — timeline copy on the a11y disclosure page
  - `web/src/app/kids-app/page.tsx:111` — kids-app marketing surface
- **Out-of-S7-slice (assigned elsewhere):**
  - Profile / settings slice → S8 (`profile/settings/page.tsx:3186, 3192, 3199, 4837, 4839, 4915`; `profile/kids/page.tsx:694, 735`; `redesign/profile/...`).
  - iOS slice → S9 (`AlertsView.swift:318`).
  - Admin slice → S6 (`admin/reader/page.tsx:204`).
  - Expert queue → S6 (`ExpertQueueView.swift:194` — actually iOS S9).
- **Fix (best-practice locked):** Per rule 3.1. Each occurrence rewrites to **describe present state** OR renders a **clean unavailable state**. **No softer-timeline replacement** — "Check back later", "We're working on it" are also banned. Strip entirely.
  - `recap/page.tsx:79-82` — if the recap page genuinely has nothing to render, render an empty state with a CTA to a working surface (e.g., "Browse stories" → `/browse`). If the recap is partially functional, describe what works now without promising the missing parts.
  - `components/UnderConstruction.tsx:55, 76` — this component itself is a banned-copy carrier. **Genuine fix:** delete the component. Audit callers; replace each call site with the appropriate present-state surface (most likely an `EmptyState` from the existing `components/EmptyState.tsx`). Per memory `feedback_genuine_fixes_not_patches`: kill the thing being replaced, no parallel paths.
  - `accessibility/page.tsx:93, 153` — accessibility disclosure should describe what's true today (which features are accessible, which features are inaccessible by virtue of not yet being shipped). No timeline copy. If a feature's a11y is incomplete, say "this feature is not currently available to screen-reader users" without promising future support.
  - `kids-app/page.tsx:111` — kids-app marketing copy describes what shipped (App Store link, what the app does). No "coming soon" framing.
- **Why:** Direct violation of owner-locked rule. Most of these are paid/legal-adjacent surfaces (settings, accessibility, kids privacy). Apple App Review can flag promised-but-not-shipped features.
- **Deps:** None for the S7 slice. Cross-cutting full-purge depends on S6, S8, S9 also shipping their slices; index-level commit message tag `[A47-cross-cutting]` lets future audits trace the full purge.
- **Verification:**
  - `grep -rEn "coming soon|check back|we're working on|finishing the .* polish|launches? (soon|next|in)|will be available|in a future pass|under construction|actively working" web/src/app/recap web/src/components/UnderConstruction* web/src/app/accessibility web/src/app/kids-app` returns zero hits.
  - `UnderConstruction.tsx` deleted; no importers remain.
  - Smoke test each affected route — visual confirmation of the new copy / empty state.
  - **Post-ship lint rule** (out-of-scope follow-up, flag for S6 if lint config lives there): a CI grep matching the banned patterns to prevent regression.
- **Multi-agent process:** Batch mode. 1 planner + 4 implementers (one per file group) + reviewer. Implementer 1: `recap/page.tsx`. Implementer 2: `UnderConstruction.tsx` deletion + caller migration. Implementer 3: `accessibility/page.tsx`. Implementer 4: `kids-app/page.tsx`.

---

### S7-A50 — `/pricing` + `/how-it-works` missing from primary nav

- **ID:** S7-A50
- **Title:** `/pricing` + `/how-it-works` missing from primary nav
- **Source:** TODO A50 (HIGH — public web bugs).
- **Severity:** HIGH. Hides conversion surface; AdSense + Apple reviewers can't find it.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/NavWrapper.tsx:445-460` (footer); `:347` and surrounding (top nav).
- **Current state:** Neither `/pricing` nor `/how-it-works` is in the footer or top nav. Both pages are fully built. New visitors can't discover paid tiers without typing the URL.
- **Fix (best-practice locked):**
  - **Footer:** Add both `/pricing` and `/how-it-works` to the footer in **both anon and authed** states.
  - **Primary nav:** Add `/pricing` to the primary nav (header). Skip `/how-it-works` from the header — pricing is the conversion CTA, how-it-works is contextual depth that lives in footer.
- **Why:** Hides the conversion surface. AdSense / Apple reviewers also won't find them, even though both pages are reviewer-relevant for understanding the product economics.
- **Deps:** Coordinates with S7-A52 (brand sweep also touches NavWrapper).
- **Verification:**
  - Visit `/` as anon — header shows "Pricing" link; footer shows both "Pricing" and "How it works."
  - Sign in, repeat — header shows "Pricing"; footer shows both.
  - Both links navigate to the live pages.
  - Mobile nav (if applicable) also exposes pricing in the same way.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A51 — `/help` hidden from authed nav

- **ID:** S7-A51
- **Title:** `/help` hidden from authed nav but is the App Store Support URL
- **Source:** TODO A51 (HIGH — public web bugs).
- **Severity:** HIGH. Apple App Review checks Support URL reachability from inside the app.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/NavWrapper.tsx:447-453`.
- **Current state:** Comment reads "Help link hidden from users pre-launch. The page itself stays reachable because Apple App Store submission requires a public Support URL." Footer renders `/help` to anon visitors only; authed users have it hidden.
- **Fix (best-practice locked):** Show `/help` link in **both anon AND authed** states (footer minimum). Remove the conditional that hides it from authed users.
  - Verify the `/help` page contents are reviewer-ready (Apple App Review test accounts will sign in and look for support content; if `/help` is empty, the App Store can flag the submission). If `/help` content is incomplete, that's a separate ticket (cross-reference TODO-PRE-LAUNCH note).
- **Why:** Apple App Review specifically checks that the Support URL declared in App Store Connect is reachable from inside the app. A reviewer signed into a test account can't browse to `/help` → may flag the submission for "missing support surface."
- **Deps:** None for the link visibility. Help-page-content completeness is a separate concern.
- **Verification:**
  - Sign in as test user, scroll to footer — "Help" link present.
  - Click → `/help` renders.
  - Repeat as anon — "Help" link present.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A52 — Brand casing drift (web slice)

- **ID:** S7-A52
- **Title:** Brand casing drift — pick "Verity Post" Title Case
- **Source:** TODO A52 (MEDIUM — copy / brand drift).
- **Severity:** MEDIUM. Visible drift on every social unfurl, every Google result, every transactional email.
- **Status:** OPEN. Best-practice locked.
- **Files in scope (S7 slice):**
  - `web/src/app/NavWrapper.tsx:500` — lowercase "verity post" wordmark
  - `web/src/app/layout.js:54-79` — site title `'veritypost.com'`, OG, Twitter, manifest
  - `web/src/app/manifest.js:5-15`
  - `web/src/app/beta-locked/page.tsx:9, 10, 57, 65`
  - `web/src/app/request-access/page.tsx:69`
  - `web/src/app/request-access/confirmed/page.tsx:10, 11, 73`
  - `web/src/app/ideas/feed/ranked/page.tsx:15`
- **Out-of-S7-slice:**
  - Email templates → S3 (`betaApprovalEmail.ts:11, 15, 33, 42`; `accessRequestEmail.ts:11, 15, 30, 37`).
  - iOS adult → S9.
  - iOS kids → S10.
- **Fix (best-practice locked):** Pick **"Verity Post"** (Title Case) and apply everywhere user-visible.
  - **Create `web/src/lib/brand.ts`** exporting:
    ```ts
    export const BRAND_NAME = 'Verity Post';
    export const BRAND_DOMAIN = 'veritypost.com';
    export const BRAND_LEGAL_ENTITY = 'Verity Post LLC';
    export const BRAND_TAGLINE = '<owner-supplied tagline; default to neutral product description>';
    ```
  - Update each owned file to import from `lib/brand.ts` instead of using string literals.
  - In `layout.js`, set `metadata.title.default = BRAND_NAME` and the OG / Twitter `siteName` to `BRAND_NAME`.
  - In `manifest.js`, set `name = BRAND_NAME`, `short_name = BRAND_NAME`.
  - **Out-of-scope follow-up:** ESLint rule (custom or via `no-restricted-syntax`) flagging string literals matching `/verity\s*post/i` outside `lib/brand.ts`. Track as a follow-up; do not block this item on it.
- **Why:** Anyone pasting a Verity Post URL into Slack/Twitter/iMessage sees the bare domain. Mixed case in the same `NavWrapper` component (`© Verity Post LLC` next to `verity post` wordmark). Every Google result, every social unfurl, every transactional email currently leads with the wrong casing. Single source of truth eliminates drift.
- **Deps:** Coordinates with S7-A19 (icons in `layout.js`), S7-A50 (NavWrapper edits), S7-A53 (brand sweep on adjacent files).
- **Verification:**
  - `grep -rEn "verity\s*post|veritypost\.com|Verity Post" web/src/app web/src/components web/src/lib` — every match either resolves to `lib/brand.ts` or imports from it.
  - View `/` — header wordmark reads "Verity Post."
  - View source — `<title>` and OG / Twitter metadata read "Verity Post."
  - Visit `/beta-locked`, `/request-access`, `/request-access/confirmed`, `/ideas/feed/ranked` — every brand mention is "Verity Post."
- **Multi-agent process:** Batch mode. 1 planner + 3 implementers + reviewer. Implementer 1: `lib/brand.ts` + `layout.js` + `manifest.js`. Implementer 2: `NavWrapper.tsx` + `ideas/feed/ranked/page.tsx`. Implementer 3: `beta-locked/`, `request-access/`, `request-access/confirmed/`.

---

### S7-A53 — "Verity Post Kids" vs "Verity Kids" drift (web slice)

- **ID:** S7-A53
- **Title:** Brand name drift — "Verity Post Kids" vs "Verity Kids" cross-app
- **Source:** TODO A53 (MEDIUM — copy / brand drift).
- **Severity:** MEDIUM. Privacy + terms documents are legal-relevant.
- **Status:** OPEN. Best-practice locked.
- **Files in scope (S7 slice):**
  - `web/src/app/kids-app/page.tsx:83, 86` — already correct "Verity Post Kids", keep
  - `web/src/app/privacy/kids/page.tsx:8, 58` — "Verity Kids" → fix to "Verity Post Kids"
  - `web/src/app/terms/page.tsx:117` — "Verity Kids" → fix to "Verity Post Kids"
- **Note:** `web/src/app/privacy/` and `web/src/app/terms/` are legal pages. They are not explicitly listed in the S7 owned-paths, but they fall under `web/src/app/` in non-other-session-owned territory. Since S5 / S8 / S6 / S3 don't claim them and they're not iOS, S7 takes ownership.
- **Out-of-S7-slice:**
  - iOS Info.plist → S10 (`VerityPostKids/VerityPostKids/Info.plist:8` already correct).
  - iOS GraduationHandoffView → S9 (`GraduationHandoffView.swift:65, 72, 108` "Verity" alone).
  - iOS QuizPassScene → S10 (`QuizPassScene.swift:202` "Verity Score").
- **Fix (best-practice locked):** Pick **"Verity Post Kids"** (matches iOS bundle identifier pattern) and grep-replace globally in the web slice. Use the `BRAND_NAME` constant or a sibling `BRAND_KIDS_NAME` export from `lib/brand.ts`:
  ```ts
  export const BRAND_KIDS_NAME = 'Verity Post Kids';
  ```
- **Why:** Privacy + terms documents are legal-relevant; using two product names for the same child product is the kind of inconsistency Apple Kids review and FTC reviewers flag. Inconsistent legal naming creates ambiguity in COPPA enforcement.
- **Deps:** S7-A52 (`lib/brand.ts` creation).
- **Verification:**
  - `grep -rEn "Verity Kids" web/src/app/privacy web/src/app/terms web/src/app/kids-app` returns zero hits.
  - All matches are "Verity Post Kids."
  - Privacy and terms pages render correctly with the updated name.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (legal page).

---

### S7-A97 — Welcome ScreenThree headline contradicts empty fallback

- **ID:** S7-A97
- **Title:** Welcome ScreenThree headline contradicts empty-array fallback
- **Source:** TODO A97 (MEDIUM — web bugs).
- **Severity:** MEDIUM. Empty-state copy lies to the user.
- **Status:** OPEN.
- **File:line:** `web/src/app/welcome/page.tsx:474-525`.
- **Current state:** Headline "Your first read is waiting" renders unconditionally above the ternary. When `stories.length === 0`, the fallback contradicts the headline.
- **Fix:** Make the headline conditional on `stories.length > 0`. Provide a different headline for the empty fallback. Per rule 3.1, the empty-state copy must describe present state — not promise a future delivery.
  - When `stories.length > 0`: "Your first read is waiting" (existing copy).
  - When `stories.length === 0`: present-state copy that doesn't lie. Example: "Browse stories to start reading" with a CTA to `/browse`. **Not** "stories will appear here soon" — that's banned timeline copy.
- **Why:** Empty-state UX honesty. User sees "your first read is waiting" while staring at no stories.
- **Deps:** None.
- **Verification:**
  - Force-empty the welcome stories array (e.g., temporarily mock the data fetcher) — render shows the empty-state headline + browse CTA, no contradiction.
  - Normal render path → "Your first read is waiting" + the story list.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A102 — Read-state #888 dim text fails AA contrast

- **ID:** S7-A102
- **Title:** Read-state #888 dim text fails AA contrast on white
- **Source:** TODO A102 (MEDIUM — web a11y).
- **Severity:** MEDIUM. Apple App Store accessibility review penalty + general a11y.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/page.tsx:590`.
- **Current state:** Read-article titles drop to `#888888` on white. Measured contrast ratio ~3.54:1; WCAG AA requires 4.5:1 for normal text.
- **Fix (best-practice locked):** Change to `#666666` or darker. `#666` measures 5.74:1 against white — passes AA for normal text. Long-term: pull from `--ink-muted` token once CC-7 design tokens land (out of scope for S7).
- **Why:** Apple App Store accessibility review penalty + general a11y. Affects every read-article on the homepage feed.
- **Deps:** None for the patch. Token migration depends on CC-7 (architectural cleanup project, not a session item).
- **Verification:**
  - Measure contrast against `#ffffff` background using a color-contrast tool — ratio ≥ 4.5:1.
  - Visual smoke test on `/` — read-state titles visibly readable, distinct from unread but legible.
  - Repeat in dark mode if applicable (verify the dark-mode token also passes AA).
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (a11y).

---

### S7-A103 — `/search` date inputs no labels (a11y)

- **ID:** S7-A103
- **Title:** `/search` date inputs have no labels
- **Source:** TODO A103 (MEDIUM — web a11y).
- **Severity:** MEDIUM. Hard-fail a11y rejection vector for App Store + general WCAG.
- **Status:** OPEN.
- **File:line:** `web/src/app/search/page.tsx:197, 204`.
- **Current state:** `<input type="date">` with no `aria-label`, no `placeholder`, no visible `<label>`. Screen readers announce "edit, blank."
- **Fix:** Wrap each date input in a `<label>` with visible text "From" / "To" (preferred — visible label is more accessible than aria-label alone). If visible labels conflict with the existing search UI density, use `aria-label="From date"` / `aria-label="To date"` as a fallback.
- **Why:** Search is a primary surface; unlabeled date inputs are a hard-fail a11y rejection vector. Apple App Review accessibility-related review can flag the entire submission.
- **Deps:** None.
- **Verification:**
  - VoiceOver / NVDA announces "From date, edit" and "To date, edit" on focus.
  - Visual smoke test — labels visible above each input (or per the chosen design).
  - Lighthouse a11y audit on `/search` — passes the labels check.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (a11y).

---

### S7-A105 — "At cap (10)" Save bookmark — no upgrade affordance for touch

- **ID:** S7-A105
- **Title:** "At cap (10)" Save bookmark button has no upgrade affordance for touch users
- **Source:** TODO A105 (MEDIUM — web UX bugs).
- **Severity:** MEDIUM. Conversion path lost on touch.
- **Status:** OPEN.
- **File:line:** `web/src/app/story/[slug]/page.tsx:1840-1858`.
- **Current state:** Disabled button has only `title="Upgrade for unlimited bookmarks"` tooltip. Tooltips are mouse-hover only; on touch, the disabled button reveals nothing.
- **Fix:** Two acceptable options:
  - **(A) Upgrade modal on tap:** Tap on disabled state opens the upgrade modal (existing `LockModal.tsx` is the right component — wire it as the on-tap action).
  - **(B) Inline upgrade chip:** Render an inline upgrade chip ("Pro: unlimited bookmarks") next to the disabled button as a persistent visual.
  - **Pick (A)** — closer to the existing pattern (LockModal already exists, used elsewhere for paid-feature gating). Less visual clutter than a permanent chip.
- **Why:** Conversion path for paid bookmarks; touch users hit a wall with no path forward. iOS users in particular can't read the title attribute.
- **Deps:** None. Reuses existing `LockModal.tsx` component.
- **Verification:**
  - On a free-tier account at the 10-bookmark cap, tap the disabled Save button on touch — LockModal opens with upgrade copy.
  - On desktop hover, tooltip still works (don't remove it).
  - On click of "Upgrade" within the modal, route to `/pricing`.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A106 — `/browse` expanded category card flatlines

- **ID:** S7-A106
- **Title:** `/browse` expanded category card flatlines on default-style categories
- **Source:** TODO A106 (MEDIUM — web UX bugs).
- **Severity:** MEDIUM. Inconsistent UI; looks unfinished.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/browse/page.tsx:478` (expanded card style); upstream `CAT_STYLE` map.
- **Current state:** Expanded card swaps to per-category color from `CAT_STYLE` map. Most slugs miss the map (~6 hardcoded entries) and fall to `DEFAULT_STYLE` (`#f3f4f6` neutral grey). Visually the expansion goes flat.
- **Fix (best-practice locked):** **Drop the per-category color treatment entirely. Uniform expanded design.** Per memory `feedback_no_color_per_tier` (rule 3.2) — the same logic that bans tier colors applies to category colors when the result is half-implemented and visually inconsistent.
  - Remove `CAT_STYLE` map entirely (or pare to a neutral `DEFAULT_STYLE`).
  - Apply uniform expanded-state design using neutral palette tokens.
  - Keep category icons / wordmark differentiation if useful, but no color hue per category.
- **Why:** The half-implemented per-category color drifts (only 6 of N categories have entries; others fall flat). Either populate every category in the DB (high friction, requires brand decisions on every category) or drop it entirely. Per genuine-fix principle (rule 3.4): kill the thing being replaced rather than carry parallel paths.
- **Deps:** None.
- **Verification:**
  - View `/browse` — every expanded card has the same chrome regardless of slug.
  - Grep `CAT_STYLE` in owned tree — only the neutral default remains, or removed entirely.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A107 — `/browse` "Latest" vs "Featured by editors" silent flip

- **ID:** S7-A107
- **Title:** `/browse` "Latest" vs "Featured by editors" header label flips silently
- **Source:** TODO A107 (MEDIUM — web UX bugs).
- **Severity:** MEDIUM. Disorienting; "editors" implies a team that doesn't exist on the public surface yet.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/browse/page.tsx:316`.
- **Current state:** Header label is `{hasEditorPick ? 'Featured by editors' : 'Latest'}`. State swaps based on whether `is_featured` rows appear in top 3.
- **Fix (best-practice locked):** **Stable label "Latest stories."** Wait for AR1 (editor-of-record surface) before promoting "editors" framing.
- **Why:** "Editors" implies a named editorial team that doesn't exist on the public surface yet. Once AR1 lands a real editor-of-record byline, the framing becomes truthful and we can re-introduce "Featured" labels — but only with a sub-line explainer of who the editors are.
- **Deps:** Item resolves itself when AR1 ships the editor-of-record surface; until then, stable label.
- **Verification:**
  - View `/browse` with `is_featured` mix — header consistently reads "Latest stories."
  - Grep for "Featured by editors" in owned tree — zero hits.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A109 — Welcome ScreenTwo claims quiz unlocks discussion

- **ID:** S7-A109
- **Title:** Welcome ScreenTwo claims quiz unlocks discussion (not always true)
- **Source:** TODO A109 (MEDIUM — web UX bugs).
- **Severity:** MEDIUM. Onboarding promise broken on fresh content.
- **Status:** OPEN.
- **File:line:** `web/src/app/welcome/page.tsx:441-443`.
- **Current state:** Copy unconditionally promises "Pass the quiz to unlock discussion." `web/src/app/story/[slug]/page.tsx:1208` only renders `quizNode` when `quizPoolSize >= 10`. Fresh content → no quiz, but user expects the gate.
- **Fix:** Soften copy to **"Most articles have a comprehension quiz."** Cheaper than backfilling the quiz pool aggressively (which is architectural and bundles with AR1).
- **Why:** User opens an article expecting the unlock mechanic, finds the comments already open. Either the wedge is real (always-gate) or the onboarding shouldn't promise it. Soft copy is the immediate fix; aggressive pool backfill bundles with AR1.
- **Deps:** None for the patch. AR1 (quiz pedagogy) is the architectural fix.
- **Verification:**
  - Read welcome ScreenTwo — copy reads "Most articles have a comprehension quiz" (or close variant).
  - No copy promises "every article" or "always" gate.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-A110 — Graduation-claim headline lacks parent context

- **ID:** S7-A110
- **Title:** Graduation-claim headline lacks parent context
- **Source:** TODO A110 (MEDIUM — web UX bugs).
- **Severity:** MEDIUM. Phishing-vector + impersonal at the terminal moment.
- **Status:** OPEN.
- **File:line:** `web/src/app/welcome/page.tsx:667` (headline); `:608` (state holds `done.display_name`); `:639` (success state already renders it).
- **Current state:** Headline reads "You've graduated. Your parent moved you to the main app." No parent display name. `done.display_name` is available in state but missing on the headline.
- **Fix:** Render parent display name from token-side. Headline becomes "[Parent name] moved you to the main app." (or similar). Fall back to current copy if `done.display_name` is null/undefined.
  - Defensive: HTML-escape the display_name before injecting (it's user-controlled).
- **Why:** A 13-year-old who got the link forwarded incorrectly (or is being phished) can't verify it's real without parent context. Plus "your parent" is impersonal at the terminal moment of graduation.
- **Deps:** Token-side already returns `display_name` (per `:608`). No backend change.
- **Verification:**
  - Trigger graduation-claim with a valid token where parent's `display_name` is set → headline shows the name.
  - Token without display_name → headline falls back to "Your parent moved you to the main app."
  - Inject `<script>` into a test parent display_name → renders escaped text, no XSS.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (XSS surface, kid-touching flow).

---

### S7-E20 — Welcome carousel admin steps drift (7 declared, 3 render)

- **ID:** S7-E20
- **Title:** Welcome carousel admin steps drift — 7 declared, 3 render
- **Source:** PotentialCleanup E20 (P4 — wired-but-not-rendered).
- **Severity:** LOW (P4) but high-leverage owner-facing item — admin can configure 7 steps, 4 silently drop.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/welcome/page.tsx` (renders 3); admin declaration at `/admin/reader/page.tsx` (declares 7) — admin-side is S6's, S7 owns the renderer side.
- **Current state:** Admin declares 7 onboarding steps (`quiz_intro`, `verity_score`, `profile`, `notifications`, `first_story`, plus the 3 currently rendered). Welcome page only renders 3.
- **Fix (best-practice locked):** **Render the missing 4** (`quiz_intro`, `verity_score`, `profile`, `notifications`, `first_story` — pick 4 of the 5 if 5 is too long; bundle `notifications` + `profile` if needed).
  - Read step config from the admin settings table (existing `welcome_carousel_steps` setting or equivalent).
  - Each step is a typed render block; map step_id → render component in welcome/page.tsx.
  - Steps that are not configured fall through cleanly.
- **Why:** Admin operator-trust drift — admin configures something, runtime ignores it. Per memory `feedback_genuine_fixes_not_patches`: kill the gap. Either render every declared step or restrict the admin declaration to 3.
- **Deps:** S6 owns the admin declaration side; S7 owns the renderer. Coordinate on the step_id contract — the values must match exactly.
- **Verification:**
  - Configure all 7 steps in admin → welcome page renders all 7 (in declared order).
  - Configure only 3 → renders 3.
  - Disable a step in admin → renderer skips it.
- **Multi-agent process:** Standard 4 pre + 2 post. Coordinate with S6 on the step_id contract.

---

### S7-AR1 — E1–E9 + E16 trust-transparency surface bundle

- **ID:** S7-AR1
- **Title:** Wired-but-not-rendered trust fields — provenance pill, verifier badge, retraction reason, plagiarism stamp, difficulty pill, reading-time pill, "Simpler version" toggle, source trust score
- **Source:** PotentialCleanup E1–E9 + E16 (all P4 — wired-but-not-rendered).
- **Severity:** HIGH (bundled). Trust-transparency surface is a launch-blocker per panel §1.1; per Q4.19 lock.
- **Status:** OPEN. Best-practice locked. **Bundle into one provenance/trust render pass** under AR1.
- **Fields and their data sources:**
  - E1 `articles.ai_model` — populated, never rendered
  - E2 `articles.ai_provider` — populated, never rendered
  - E3 `articles.ai_confidence_score` — populated, never rendered
  - E4 `articles.is_verified` + `verified_by` — populated, never rendered (verifier badge)
  - E5 `articles.retraction_reason` + `unpublished_at` — populated, no public surface (renders on `/corrections` page — see F1)
  - E6 `articles.plagiarism_status` — populated, never rendered
  - E7 `articles.difficulty_level` — populated, never rendered (color-free pill per rule 3.2)
  - E8 `articles.reading_time_minutes` — populated, never rendered
  - E9 `articles.kids_summary` — populated by kid pipeline runs, never rendered for adult readers ("Simpler version" toggle when non-null)
  - E16 `sources.metadata` — never populated, never rendered (publisher trust score per source)
- **File:line:** `web/src/app/story/[slug]/page.tsx` (story surface); `web/src/app/corrections/page.tsx` (new — see F1).
- **Fix (best-practice locked):** Bundle into **AR1 trust-transparency surface**. Single provenance pill component near byline rendering AI provenance (model, provider, confidence), verifier badge, plagiarism stamp, difficulty pill, reading-time pill. Source trust score renders per-source in the sources list. Retraction reason renders on the `/corrections` page (see S7-F1).
  - Provenance pill copy: "AI-synthesized · GPT-4 · Confidence 0.87" (model/provider/confidence subtle, expandable on hover/tap).
  - Verifier badge: "Verified by <verifier display_name>" with link to verifier's profile.
  - Plagiarism stamp: only render when `plagiarism_status` is something user-meaningful (e.g., "checked" or "flagged"); hide on null.
  - Difficulty pill: "Reading level: 8th grade" (color-free per rule 3.2; neutral chip).
  - Reading-time pill: "5 min read" — small, near byline.
  - "Simpler version" toggle: shown on adult articles where `kids_summary IS NOT NULL`; on toggle, body swaps to the kids_summary copy. Toggle persists in localStorage for the session.
  - Source trust score: per-source pill in the sources list. Render only when `sources.metadata.trust_score` is non-null. Pipeline writes this score (S6 owns pipeline; coordinate on the metadata.trust_score contract).
- **Why:** Trust-transparency surface is the launch differentiator per panel §1.1. Every column in E1-E9 is data on the floor — pipeline pays compute to populate, UI ignores. Bundling them into one render pass collapses 8 P4 items into one shippable surface.
- **Deps:**
  - **S6 owns the pipeline-side** — `sources.metadata.trust_score` population (E16) requires pipeline writes; S7 reads.
  - **AR1 is the broader architectural project**; this surface is the public-facing slice.
  - Coordinates with S7-A13 (un-gate disclosure pill) and S7-A43 (byline conflation) — the provenance pill is the eventual home for both fixes.
  - **S7-F1 (`/corrections` page)** consumes E5 (retraction_reason + unpublished_at).
- **Verification:**
  - Article with `is_ai_generated=true` + non-null model/provider/confidence → provenance pill renders with all three values.
  - Article with `verified_by` non-null → verifier badge renders, links to verifier profile.
  - Article with `kids_summary` non-null → "Simpler version" toggle visible on adult page; toggle swaps body copy.
  - Article with non-null `difficulty_level` and `reading_time_minutes` → both pills render.
  - Source with `metadata.trust_score` populated → trust pill renders next to source.
  - Article with `retraction_reason` non-null → does NOT render on the story page itself (the article is presumed unpublished); renders on `/corrections`.
- **Multi-agent process:** Batch mode with elevated care. 1 planner + 4 implementers + 2 reviewers (independent code reviewer + security/correctness reviewer for regulatory). Implementer 1: provenance pill + AI provenance render. Implementer 2: verifier badge + linkout. Implementer 3: difficulty + reading-time + simpler-version toggle. Implementer 4: source trust score render. Co-ship with S7-F1 (`/corrections` page).

---

### S7-F1 — `/corrections` page

- **ID:** S7-F1
- **Title:** `/corrections` page does not exist; ship before launch (Q4.19 LOCKED)
- **Source:** PotentialCleanup F1 + Q4.19 owner-locked decision.
- **Severity:** HIGH. Trust-transparency surface launch-blocker per panel §1.1.
- **Status:** OPEN. Best-practice locked. **Q4.19 owner-locked — SHIP.**
- **File:line:** **NEW PAGE** `web/src/app/corrections/page.tsx`.
- **Current state:** Page does not exist. No code links to it.
- **Fix (best-practice locked):**
  - Create `web/src/app/corrections/page.tsx`.
  - Server component reading `articles WHERE retraction_reason IS NOT NULL OR unpublished_at IS NOT NULL`, ordered by `unpublished_at DESC` (most recent first), capped at 100 rows initially with pagination.
  - Each row renders: original article title (linkable to a non-public archive view if owner wants — otherwise plain text), retraction reason copy (`articles.retraction_reason`), date (`articles.unpublished_at`), and the verifier of record if `verified_by` is set.
  - Section headers grouping by month if the list grows long.
  - Empty state when no corrections exist: present-state copy describing that no articles have been retracted or unpublished. **Not** "no corrections yet" — that implies a future delivery (rule 3.1).
  - Page metadata: `<meta name="robots" content="index, follow">` (corrections should be discoverable for trust-signal value).
  - Add `/corrections` link to footer (anon + authed) — coordinate with S7-A50 footer changes.
- **Why:** Per Q4.19 owner lock and panel §1.1: trust-transparency surface launch-blocker. Surfaces wired-but-not-rendered E5 fields. Public retraction record builds reader trust + signals editorial discipline to AdSense/Apple reviewers.
- **Deps:** S7-AR1 (provides the data shape on `articles.retraction_reason` and `unpublished_at`). S7-A50 (footer link wiring).
- **Verification:**
  - Visit `/corrections` — renders successfully (200, not 404).
  - Insert a test row with `retraction_reason='Test retraction'` and `unpublished_at=now()` → row appears on the page.
  - Empty-state path renders honest present-state copy.
  - Footer link to `/corrections` works.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (legal page).

---

### S7-F2 — `/editorial-standards` page

- **ID:** S7-F2
- **Title:** `/editorial-standards` page does not exist; ship before launch (Q4.19 LOCKED)
- **Source:** PotentialCleanup F2 + Q4.19 owner-locked decision.
- **Severity:** HIGH. Trust-transparency surface launch-blocker.
- **Status:** OPEN. Best-practice locked. **Q4.19 owner-locked — SHIP.**
- **File:line:** **NEW PAGE** `web/src/app/editorial-standards/page.tsx`.
- **Current state:** Page does not exist.
- **Fix (best-practice locked):**
  - Create `web/src/app/editorial-standards/page.tsx`.
  - Static / mostly-static content page documenting:
    1. **Editorial role of AI.** Per memory `project_ai_role_intent_correction` — AI assists human authors. AI does not write articles end-to-end; AI is a research and drafting tool for verified contributors. Spell out the concrete role: source clustering, fact extraction, draft summaries reviewed by humans before publish.
    2. **Provenance pill semantics.** Document what the provenance pill on each article means (model, provider, confidence, verifier badge, "Compiled by" vs "Verified by" labels). Cross-reference to the article surface so users know what they're seeing.
    3. **Corrections policy.** Link to `/corrections`. Describe when an article is corrected, retracted, or unpublished. State the timeline targets ("we update the corrections page within 24 hours of a verified error" — but only if that's a true present-state commitment owner stands behind; per rule 3.1, no aspirational timelines).
    4. **Verification process.** What `verified_by` means. Who can verify. Link to expert applications (`/signup/expert`) without promising a journalist role.
    5. **Source standards.** What constitutes a credible source. Link to the source trust score on each article (E16 / S7-AR1).
    6. **Conflict of interest disclosure.** Standard editorial disclosure.
  - Page metadata: indexable + crawlable.
  - Add `/editorial-standards` link to footer (anon + authed).
- **Why:** Q4.19 owner-locked. Trust-transparency surface. Documents the AR1 architectural intent for public consumption — closes the loop between the provenance pill and what it means.
- **Deps:** Coordinates with S7-F1 (`/corrections` link), S7-F3 (may absorb `/methodology`), S7-AR1 (provenance pill semantics).
- **Verification:**
  - Visit `/editorial-standards` — renders successfully.
  - Every claim describes present state (no "we will" / "soon").
  - Internal links to `/corrections`, `/signup/expert`, etc. resolve.
  - Indexable per page metadata.
  - Footer link present in anon + authed.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (legal-relevant editorial commitment).

---

### S7-F3 — `/methodology` page

- **ID:** S7-F3
- **Title:** `/methodology` page does not exist; may fold into `/editorial-standards`
- **Source:** PotentialCleanup F3 + Q4.19 owner-locked decision.
- **Severity:** HIGH (bundled). Trust-transparency.
- **Status:** OPEN. Best-practice locked. **Q4.19 owner-locked — SHIP, may fold into F2.**
- **File:line:** **NEW PAGE** `web/src/app/methodology/page.tsx` OR **a section within `/editorial-standards`**.
- **Current state:** Page does not exist.
- **Fix (best-practice locked):** **Fold into `/editorial-standards` as a section** unless content depth justifies a separate page. The default lock per Q4.19: methodology is a section under editorial-standards, not a separate route.
  - If folded: add a `<section id="methodology">` under `/editorial-standards/page.tsx` documenting:
    - How the AI pipeline works (research clustering, source ranking, draft generation, human review gate).
    - How the verity score / verification process operates.
    - How source trust scores are computed (cross-reference E16 / S7-AR1).
    - Quiz pedagogy (how questions are generated, why they exist as the discussion gate per S7-A109).
  - If split (only if content is long enough — measure during planning): create `web/src/app/methodology/page.tsx` with the same content; add to footer.
  - Either way: `/methodology` URL must work (route exists OR redirects to `/editorial-standards#methodology`).
- **Why:** Q4.19 owner-locked. Methodology page surfaces the "how" behind the trust signals; folds cleanly into editorial-standards if the content footprint is small.
- **Deps:** S7-F2.
- **Verification:**
  - Visit `/methodology` — either renders directly or redirects to `/editorial-standards#methodology`.
  - Section reads as a coherent technical/editorial overview without leaking implementation drift.
- **Multi-agent process:** Bundle planning with S7-F2 — planner decides fold-vs-split based on content depth.

---

### S7-I3 — `/dmca` acknowledges § 2258A unfulfilled

- **ID:** S7-I3
- **Title:** `/dmca` page publicly acknowledges § 2258A duty platform cannot fulfill
- **Source:** PotentialCleanup I3.
- **Severity:** HIGH. P0 — public admission of unfulfilled federal obligation.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/dmca/page.tsx` (the § 2258A acknowledgment paragraph).
- **Current state:** Page publicly acknowledges the § 2258A duty (CSAM reporting) without coordination with NCMEC ESP registration. Public admission of an unfulfilled federal obligation is a worse legal posture than not acknowledging the duty in the first place.
- **Fix (best-practice locked):** **Rewrite to remove the acknowledgment** OR coordinate with NCMEC ESP filing (Q4.18 owner-side, separately tracked).
  - Code-side fix today: remove the § 2258A acknowledgment paragraph from `/dmca`. The DMCA page is for copyright notices; CSAM reporting belongs on a separate compliance page that ships only after NCMEC ESP registration is filed (owner-side action, Q4.18).
  - The remaining DMCA page covers § 512(c) safe-harbor procedure, takedown notice format, counter-notice procedure, and the registered agent contact (per S7-A20).
- **Why:** Public admission of an unfulfilled federal obligation invites enforcement attention. The fix is to not advertise the gap until it's closed; once NCMEC ESP registration completes (Q4.18), owner ships a separate CSAM reporting page with the legitimate procedure.
- **Deps:** Bundle with S7-A20 (DMCA `[pending]` placeholder fix on the same page). Owner-side NCMEC ESP filing is separately tracked (Q4.18) and doesn't block this code-side fix.
- **Verification:**
  - Read `/dmca` end-to-end — no reference to § 2258A or CSAM reporting duty.
  - DMCA procedure for copyright takedowns intact and complete.
  - No `[pending]` strings (per S7-A20).
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (legal page; federal-compliance-adjacent).

---

### S7-I5 — Machine-readable AI disclosure meta tag

- **ID:** S7-I5
- **Title:** Machine-readable AI disclosure meta + schema.org
- **Source:** PotentialCleanup I5.
- **Severity:** HIGH. EU AI Act Article 50 effective Aug 2026; pre-emptive compliance.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/story/[slug]/page.tsx` metadata export (the `generateMetadata` function or static metadata block).
- **Current state:** No machine-readable AI disclosure on AI-flagged articles. Visual disclosure pill exists but no `<meta>` tag and no schema.org structured data.
- **Fix (best-practice locked):** When `story.is_ai_generated === true`:
  - Add `<meta name="ai-generated" content="true">` to the page metadata.
  - Add schema.org `creativeWorkStatus` JSON-LD via the existing `JsonLd.tsx` component (or extend it):
    ```json
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "creativeWorkStatus": "AI-Generated",
      "creator": {
        "@type": "SoftwareApplication",
        "name": "<ai_provider> <ai_model>"
      },
      ...
    }
    ```
  - For non-AI articles (`is_ai_generated === false`), do not add either tag — let the absence indicate human authorship.
- **Why:** EU AI Act Article 50 (effective Aug 2026) requires machine-readable disclosure of AI-generated content. Search engines and aggregators consume schema.org `creativeWorkStatus` already (Google's "About this result" surface uses it). Pre-emptive compliance is cheap; retroactive compliance under enforcement is expensive.
- **Deps:** Bundle with S7-A13 (visual disclosure un-gating) and S7-A43 (byline conflation) into one regulatory-fix PR.
- **Verification:**
  - View source on an AI-flagged article → `<meta name="ai-generated" content="true">` present.
  - View `<script type="application/ld+json">` block → contains `"creativeWorkStatus": "AI-Generated"`.
  - View source on a human-authored article → neither tag present.
  - Validate JSON-LD via Google's Rich Results test → no errors.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (regulatory).

---

### S7-I6 — Cookie banner / ePrivacy Art. 5(3) compliance

- **ID:** S7-I6
- **Title:** Cookie banner — ship homegrown CMP
- **Source:** PotentialCleanup I6 + TODO A49 cross-reference.
- **Severity:** HIGH. P0 for any EU traffic. ePrivacy Art. 5(3) requires consent before non-essential cookies.
- **Status:** OPEN. Best-practice locked.
- **File:line:** **NEW COMPONENT** `web/src/components/CookieBanner.tsx`. Wire into `web/src/app/layout.js`.
- **Current state:** No cookie consent surface. GA4 fires unconditionally for EU traffic (per A49). TODO-PRE-LAUNCH T2 owner-blocks on Funding Choices snippet.
- **Fix (best-practice locked):** **Ship a homegrown CMP first.** Don't wait on Funding Choices.
  - Create `web/src/components/CookieBanner.tsx`:
    - Renders at the bottom of the page on first visit.
    - Three buttons: "Accept all", "Reject non-essential", "Customize."
    - Customize panel allows toggling categories (essential, analytics, advertising).
    - Stores consent state in `localStorage` (`vp_consent_v1`) AND on the user record (when authed) via a server route — coordinate with S3 on the consent storage shape (S3 owns auth/account routes; this requires a new tiny route or extension, owned by S3).
    - Banner re-shows when consent state is missing OR when consent version (`vp_consent_v1` → `vp_consent_v2`) bumps.
    - Footer includes a "Cookie preferences" link to re-open the banner.
  - **Wire GA4 + any third-party scripts behind consent.**
    - In `web/src/app/layout.js`, the GA4 `<script>` only renders when `consent.analytics === true`.
    - Same for AdSense scripts when those land (currently AdSense is owner-blocked on submission per Q4.18 owner-side).
    - Iframes embedding third-party content (YouTube, Twitter) get a consent-gate placeholder showing "Click to load embedded content" until consent.
  - **GPC respect.** When the browser sends `Sec-GPC: 1`, default `consent.advertising = false` and `consent.analytics = false`. Banner still renders but pre-checks the reject states.
  - When TODO-PRE-LAUNCH T2 lands (owner ships Funding Choices snippet), the homegrown CMP can either swap to Funding Choices or co-exist (Funding Choices governs ad-networks, homegrown CMP governs first-party tracking). Bundle the swap as a follow-up.
- **Why:** ePrivacy Art. 5(3) requires opt-in for non-essential cookies before they fire. GA4 is a non-essential cookie. The homegrown CMP unblocks compliance immediately; Funding Choices integration can follow.
- **Deps:**
  - S3 coordination: consent state storage on user record requires a small auth-side change. S3 owns `web/src/app/api/account/**`. Add an `account/consent` route or extend `account/me`.
  - Owner-side: TODO-PRE-LAUNCH T2 (Funding Choices) is a follow-up, not a blocker.
- **Verification:**
  - First visit (no localStorage) → banner renders.
  - Click "Reject non-essential" → GA4 does not fire (verify via Network tab; no `google-analytics.com` request).
  - Click "Accept all" → GA4 fires.
  - Sec-GPC: 1 header (test via browser extension) → reject states pre-checked.
  - Authed user accepts → consent state persists across devices (server-side storage).
  - Re-visit anon → banner does not re-render until consent version bumps.
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (regulatory). Coordinate with S3 on consent storage contract.

---

### S7-I7 — CCPA "Do Not Sell" / GPC handler footer link

- **ID:** S7-I7
- **Title:** CCPA "Do Not Sell" / GPC handler — footer link
- **Source:** PotentialCleanup I7.
- **Severity:** MEDIUM. Activates as a hard requirement on AdSense rollout.
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/NavWrapper.tsx` footer (S7 slice). Toggle stub in `/profile/settings` (S8 slice).
- **Current state:** No "Do Not Sell" link, no GPC handler.
- **Fix (best-practice locked):**
  - **Footer link (S7 slice):** Add "Do Not Sell or Share My Personal Information" link in footer (anon + authed). Routes to `/profile/settings#privacy` for authed users; routes to a static page (or a banner-like modal) explaining the choice for anon users.
  - **Settings toggle (S8 slice):** S8 builds the toggle in `/profile/settings`. The toggle controls a `users.do_not_sell` boolean. Out of S7 scope but referenced for context.
  - **GPC respect (cross-cutting):** Bundle with S7-I6 cookie banner — when `Sec-GPC: 1` is present, default the do-not-sell state to true server-side.
- **Why:** CCPA requires Californian users to be able to opt out of "sale" (broadly construed including some ad-network contexts). GPC is the browser-level signal. AdSense rollout activates this as a hard requirement.
- **Deps:** S7-I6 (consent storage / GPC handling); S8 (settings toggle).
- **Verification:**
  - Footer renders "Do Not Sell" link in both anon + authed.
  - Anon click → routes to a sensible explainer.
  - Authed click → routes to `/profile/settings#privacy` (verify the anchor lands on the right section once S8 ships the toggle).
  - GPC header sent → server reads it and acts accordingly (coordinate with S7-I6).
- **Multi-agent process:** Standard 4 pre + 2 post. Security/correctness reviewer required (regulatory).

---

### S7-K1 — Welcome carousel "Score 3 out of 5" misleading copy

- **ID:** S7-K1
- **Title:** Welcome carousel screen 2 says "Score 3 out of 5"; server enforces full pass for adults
- **Source:** PotentialCleanup K1.
- **Severity:** MEDIUM (P1 in K1 — false specificity).
- **Status:** OPEN. Best-practice locked.
- **File:line:** `web/src/app/welcome/page.tsx:442`.
- **Current state:** Welcome screen 2 says "Score 3 out of 5"; server enforces full pass for adults.
- **Fix (best-practice locked):** Change copy to **"Pass the quiz"** — cheaper than changing runtime to a 60% threshold like kids. Avoid making numerical claims that are wrong.
- **Why:** False specificity that users will catch on first quiz attempt. Better to be vague than wrong. Changing runtime threshold has cross-platform implications (iOS hardcodes 60% per A93/A41) — out of scope here.
- **Deps:** None (copy fix only).
- **Verification:**
  - Welcome screen 2 reads "Pass the quiz" or close variant.
  - No "X out of 5" or "X out of N" specific claim.
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-K3 — "Log In" vs "Sign in" inconsistency

- **ID:** S7-K3
- **Title:** "Log In" vs "Sign in" inconsistency project-wide
- **Source:** PotentialCleanup K3.
- **Severity:** LOW (P3 in K3) but Apple HIG-relevant.
- **Status:** OPEN. Best-practice locked.
- **File:line:** Sweep across owned tree (web slice).
- **Current state:** Both "Log In" and "Sign in" appear across the codebase.
- **Fix (best-practice locked):** Standardize **"Sign in"** project-wide. Matches Apple Human Interface Guidelines (Apple uses "Sign in" everywhere).
  - S7 slice: sweep all owned files for "Log In" / "Log in" / "Login" (as button/link copy, not URL paths) and replace with "Sign in".
  - Out-of-S7-slice: S3 owns auth pages (`/login` URL stays as a route name; copy on the page is S3's). S9 + S10 own iOS.
- **Why:** Brand consistency and Apple HIG alignment. Tiny but high-visibility — "Sign in" is the dominant industry pattern.
- **Deps:** S3 (auth pages) and S9 (iOS) ship their slices independently. S7 owns the public-web copy sweep.
- **Verification:**
  - `grep -rEn "(Log In|Log in|Login)" web/src/app web/src/components` (excluding S5-owned and S3/S8 paths) — every match is a URL path, not user-visible copy.
  - Visual smoke test on owned pages — every CTA reads "Sign in."
- **Multi-agent process:** Standard 4 pre + 2 post.

---

### S7-K6 — Empty-state CTAs missing on 7 surfaces

- **ID:** S7-K6
- **Title:** Empty-state CTAs missing on 7 surfaces
- **Source:** PotentialCleanup K6.
- **Severity:** MEDIUM. Per-page audit.
- **Status:** OPEN. Best-practice locked.
- **File:line:** Per-page audit in owned tree.
- **Current state:** Multiple surfaces render empty states without inline CTAs. Compounds with A47 timeline-copy purge (rule 3.1) — when banned timeline copy gets stripped, the surface is left empty.
- **Fix (best-practice locked):** Per-page audit. Ship inline CTAs for empty states. Use the existing `web/src/components/EmptyState.tsx` component as the canonical container.
  - Identify the 7 (per REVIEW.md) — start with surfaces in S7-owned tree, then enumerate via search:
    1. `web/src/app/recap/page.tsx` empty state (post-A47 timeline-copy strip).
    2. `web/src/app/welcome/page.tsx` empty fallback (per S7-A97).
    3. `web/src/app/browse/page.tsx` empty category state.
    4. `web/src/app/search/page.tsx` empty results.
    5. `web/src/app/leaderboard/page.tsx` empty leaderboard.
    6. `web/src/app/page.tsx` empty home feed (post-failure state).
    7. `web/src/app/about/page.tsx` empty list rendering (if any).
  - Each empty state gets a present-state explainer + a primary CTA routing to a working surface (`/browse`, `/pricing`, `/help`).
  - **Avoid "no items yet"** — that implies a future delivery (rule 3.1). Use "Browse stories to start reading" / "Search returned no matches" / "Sign in to track your activity" instead.
- **Why:** Per memory `feedback_genuine_fixes_not_patches`: when stripping a timeline ("we're working on it"), the genuine fix replaces it with a useful action, not a hollow empty state. Empty states are a primary UX surface; without CTAs they're dead-ends.
- **Deps:** S7-A47 (timeline-copy purge frees surfaces that need CTAs).
- **Verification:**
  - Force each empty state (mock data) — every surface has a CTA visible above the fold.
  - CTAs route to live destinations.
  - No banned timeline copy remains.
- **Multi-agent process:** Batch mode (per-page implementer-per-surface). 1 planner + 4 implementers + reviewer.

---

## 6. Cross-session coordination map

| Item | Coordinates with | Why |
|---|---|---|
| S7-A21 | S3 (middleware) | S3 adds `/ideas` to admin-only matcher; S7 verifies + adds robots meta |
| S7-A52 | All sessions touching brand strings (S3 emails, S9 iOS, S10 kids iOS) | `lib/brand.ts` is the single source of truth |
| S7-A47 | S6 (admin), S8 (profile/settings), S9 (iOS), S10 (kids iOS) | Cross-cutting timeline-copy purge |
| S7-A53 | S9 + S10 (iOS slices) | Brand "Verity Post Kids" sweep |
| S7-AR1 | S6 (pipeline writes for source trust score E16) | Source `metadata.trust_score` populated by pipeline |
| S7-E20 | S6 (admin reader settings) | Step_id contract on welcome carousel config |
| S7-I6 | S3 (consent storage on user record) | Auth-side small extension for cross-device consent |
| S7-I7 | S8 (settings toggle for Do Not Sell) | S7 ships footer link; S8 ships the toggle |
| S7-K3 | S3 (auth pages) + S9 + S10 (iOS) | "Sign in" sweep is cross-platform |
| S7-F1 | S7-AR1 (data shape on `articles.retraction_reason`) | Same data model, separate render |

---

## 7. Order of execution within Session 7

Items are independently shippable but some have natural ordering. Recommended order:

1. **Foundation (no deps):**
   - S7-A22 (engineer copy fix — single-line)
   - S7-A102 (a11y contrast — single-line)
   - S7-A103 (search labels — small)
   - S7-A52 (brand sweep + `lib/brand.ts`) — needed before A19, A53, F1, F2, F3
2. **Trust + regulatory bundle (one PR):**
   - S7-A13 (un-gate disclosure pill)
   - S7-A43 (byline conflation)
   - S7-I5 (machine-readable disclosure meta)
3. **Legal page sweep:**
   - S7-A20 (DMCA placeholder)
   - S7-I3 (DMCA § 2258A removal)
4. **Brand sweep follow-on:**
   - S7-A19 (icons; depends on A52 brand strings being stable in `layout.js`)
   - S7-A53 (kids brand)
5. **Nav + footer:**
   - S7-A50 (pricing + how-it-works in nav)
   - S7-A51 (help in nav)
   - S7-A47 (timeline-copy purge — frees surfaces)
   - S7-K6 (empty-state CTAs — fills surfaces freed by A47)
   - S7-I7 (Do Not Sell footer link — depends on I6 storage)
   - S7-K3 (Sign in sweep)
6. **Welcome flow batch:**
   - S7-A97 (welcome empty headline)
   - S7-A109 (welcome quiz copy soften)
   - S7-A110 (graduation parent name)
   - S7-K1 (welcome quiz score copy)
   - S7-E20 (carousel admin steps drift)
7. **Ideas gate:**
   - S7-A21 (after S3 ships middleware)
8. **Story page batch:**
   - S7-A105 (touch-upgrade affordance)
9. **Browse batch:**
   - S7-A106 (per-category color drop)
   - S7-A107 (Latest stable label)
10. **Trust-transparency bundle:**
    - S7-AR1 (provenance pill + verifier + difficulty + reading-time + simpler-version + source trust)
    - S7-F1 (`/corrections` page)
    - S7-F2 (`/editorial-standards` page)
    - S7-F3 (`/methodology` page or section)
11. **Compliance bundle:**
    - S7-I6 (cookie banner)
    - S7-I7 (Do Not Sell footer link)

---

## 8. Final verification checklist

Before marking Session 7 complete:

- [ ] **Brand sweep clean.** No "verity post" lowercase or "veritypost.com" in user-visible strings outside `lib/brand.ts`. Grep across owned tree returns only `BRAND_NAME` references.
- [ ] **No banned timeline copy.** `grep -rEn "coming soon|check back|we're working on|finishing the .* polish|launches? (soon|next|in)|will be available|in a future pass|under construction|actively working"` across owned tree returns zero hits.
- [ ] **No "Verity" without "Post"** in any S7 file (except inside identifiers like `verity_pro` SKU strings).
- [ ] **AI disclosure pill** renders unconditionally on `is_ai_generated=true` articles.
- [ ] **Machine-readable AI disclosure** present (`<meta name="ai-generated">` + JSON-LD `creativeWorkStatus`).
- [ ] **AI byline conflation fixed.** No expert badge on AI-flagged articles. "Compiled by" / "Verified by" labels render correctly.
- [ ] **Favicon + manifest icons** present (placeholder OK pre-owner-PNG).
- [ ] **DMCA `[pending]` removed.** `legal@veritypost.com` mailto in place. § 2258A acknowledgment removed.
- [ ] **`/ideas` gated.** Anon + non-admin authed → 404.
- [ ] **Footer + nav.** `/pricing`, `/how-it-works`, `/help`, `/corrections`, `/editorial-standards` reachable from footer in both anon + authed states. `/pricing` in primary nav.
- [ ] **`/corrections`, `/editorial-standards`, `/methodology` ship.** `/methodology` either own page or section under editorial-standards.
- [ ] **Trust-transparency surface live.** Provenance pill, verifier badge, difficulty, reading-time, simpler-version toggle all render where applicable.
- [ ] **Cookie banner ships.** GA4 + third-party scripts gated. GPC respected.
- [ ] **CCPA "Do Not Sell" link** in footer.
- [ ] **a11y.** `/page.tsx:590` contrast ≥ 4.5:1. `/search` date inputs have labels.
- [ ] **Welcome flow.** Empty headline conditional. "Pass the quiz" copy. "Most articles have a comprehension quiz" softened. Graduation includes parent name. 7 carousel steps render when admin configures all 7.
- [ ] **`/browse`.** Stable "Latest stories" label. Uniform expanded card design.
- [ ] **Story page touch.** Bookmark cap upgrade modal opens on tap.
- [ ] **"Sign in" copy.** No "Log In" / "Login" as button copy in owned tree.
- [ ] **Empty-state CTAs.** Every empty state has a useful inline action.
- [ ] **No edits outside owned-paths list.** Run `git diff --name-only main..HEAD | grep -v "<owned-prefix-list>"` — empty.
- [ ] **Commit messages tagged `[S7-Annn]`** or `[S7-Tnnn]` per per-item id.
- [ ] **Item statuses updated** in this file (mark each item ✅ with commit SHA when shipped).

---

## 9. Completion sign-off

When all items above ship and the verification checklist passes:

- [ ] Update each item's Status field in section 5 to `SHIPPED <date> <commit-sha>`.
- [ ] Mark Session 7 ✅ in `00_INDEX.md`.
- [ ] Run a final cross-cutting grep for `[S7-` in commit messages to confirm coverage.
- [ ] Memorize `feedback_4_stream_parallel_cleanup` lessons learned for the post-mortem if any pattern shifted.
- [ ] Per memory `feedback_update_everything_as_you_go`: this file's Status fields update the same turn an item lands; no batched bookkeeping.
