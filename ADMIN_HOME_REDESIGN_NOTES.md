# /admin/home redesign — design notes

Working notes from the spec session. Goal: review before code lands. Anything missing → flag.

---

## § Session state — 2026-05-15

**Shipped + tracked (uncommitted, working tree):**

- **Wave 0** — `trending_stories_recent` view (`security_invoker=true`, 7d window, DirectoryArticle shape, partial index, GRANT service_role); `ORDER BY sort_order, src.id` follow-up; `/api/directory/trending` route (anon GET, limit 10/30, `{articles,total}`, `private,max-age=300`); 4 orphan admin pages deleted + 301 redirects in `next.config.js`; `database.ts` extended.
- **Wave 1+2** — `ad_pins` (8 cols incl. `bypass_freq_cap` + `force_all_tiers`, placement_id PK, CASCADE), `ad_freq_counters` (PK ad_unit_id+scope+scope_key), `ad_target_geo` (PK ad_unit_id+mode+country_code, ISO regex), `ad_placements.fallback_network` + `fallback_network_unit_id` (CHECK none/adsense/admob/house), 4 perms `admin.ads.pins.{create,edit,delete,view}` (category=ui, sort_order=0). Counter backfill from 831 existing impressions. `serve_ad` rewritten VOLATILE — STABLE would have bricked on DELETE inside; mandatory `source` field on every return path (`no_placement | editorial_block | tier_hidden | pinned | programmatic | network_fallback | no_fill`); pin branch honors force_all_tiers + bypass_freq_cap; counter-backed caps; fallback ladder from placement. `_bump_ad_freq_counters` trigger AFTER INSERT on ad_impressions. SELECT policy on `ad_freq_counters` (admin.ads.view), NULL guard in trigger. Web `/api/ads/serve` returns `{ad_unit, fallback, source}`; latent `safeUnit.id` → `safeUnit.ad_unit_id` bug fixed. iOS `HomeFeedSlots.swift` AdPayload CodingKeys fix (`id ← ad_unit_id` — silent decode bug since file shipped; iOS native ads have not been rendering); +source/fallback_network/fallback_network_unit_id; render guard skips `source == "network_fallback"`.
- Migrations on disk: `20260515000000_trending_stories_recent.sql`, `20260515000100_trending_stories_recent_sort_order.sql`, `20260515150000_ads_pins_counters_fallback_geo.sql`, `20260515150100_serve_ad_pin_branch_counters_fallback.sql`, `20260515150200_ads_freq_counters_policy_and_trigger_guard.sql`.

**Wave 3 — IN PROGRESS:**

Pre-impl gate completed steps 1-2 (Investigator A + Investigator B). Planner v1 is the next step.

**Wave 3 gate findings to feed Planner v1:**

Investigator A surfaced 11 surprises. Investigator B independently verified, corrected 5, extended 5, added 12 new findings. Load-bearing items the planner must build around:

1. **`is_admin_or_above()` SQL = `SELECT user_has_role('admin')` — NOT owner-aware.** `record_admin_action` RPC will reject an owner-only actor. `admin@veritypost.com` has owner + admin permission sets (memory `user_admin_account.md`), so operator passes; but any future admin user without admin role membership will fail the audit gate.
2. **`ad_pins` has 8 columns.** `bypass_freq_cap boolean NOT NULL DEFAULT false` peer to `force_all_tiers`. Planner must decide whether the Wave 3 popover exposes it. Recommendation: expose as advanced toggle, default ON (pin = direct-sold = bypass by intent). Reviewer to challenge.
3. **`home_slot_items` second CHECK:** `(content_type='article' AND article_id NOT NULL AND ref_id NULL) OR (content_type<>'article' AND article_id NULL)`. `quiz_from_article` content_type cannot put the source article in `article_id` — it goes in `ref_id` or `payload.article_id`. Planner picks one.
4. **`admin.ads.pins.*` perms exist but no permission_set links them.** Migration must grant to the existing admin set. Other ad perm keys (`admin.ads.placements.*`, `admin.ads.units.*`, `admin.ads.campaigns.*`, `admin.ads.view`) follow the same dotted hierarchy.
5. **No INSERT/UPDATE/DELETE RLS policies on `ad_pins`.** Service-role bypasses RLS so writes via API work; cookie-scoped writes would fail, which is intentional. SELECT policy is gated on `admin.ads.pins.view`.
6. **No `/quiz/[slug]` reader route exists.** `find web/src/app -type d | grep quiz` returns only API routes. `quiz_from_article` slot has no destination URL. Plan: defer route to Wave 9; slot stores `article_id` and links to fallback `/{slug}#article-quiz` (in-article quiz anchor still ships).
7. **`home_slots.kind` CHECK enumerates 14 kinds today.** Adding `quiz_from_article` requires DROP + ADD CHECK.
8. **`/api/admin/ads/` namespace today has only `overview/`.** All ad writes are at sibling `/api/admin/ad-<noun>/`. Wave 3's `/api/admin/ads/pins/` is the first nested write route here. Naming-precedent break, accepted.
9. **Spec says `hasPermissionServer`; idiom is `requirePermission`.** Use the throwing variant for write-route gates.
10. **No existing `ad_units` typeahead.** Closest pattern: `web/src/app/admin/editors-edge/_components/ArticlePicker.tsx` (300ms debounce over `/api/search`). New picker component needed.
11. **`trending_stories_recent` has no `category_name`.** List_rail Trending mode joins via `categoryById` already passed by `HomeLayout` to renderers.
12. **`KIND_LABEL.engagement = 'Daily quiz'` already exists** with daily-quiz semantic. `quiz_from_article` is additive; UX label needs to be clearly different (e.g. "Quiz on article").
13. **In-popover ArticlePicker uses 250ms debounce** (admin/home), editors-edge ArticlePicker uses 300ms. Match the local idiom.
14. **`record_admin_action` requires `auth.uid()` inside the RPC** — must call via cookie-scoped client, not service-role. `recordAdminAction()` helper (adminMutation.ts:216-263) already handles this; service-role fallback at 188-205 inserts direct.

**Files cited (all confirmed by both investigators):**

- `web/src/app/admin/home/page.tsx` (SlotInlineEditor L1732-2421; ArticlePickerPanel L2426-2549; KIND_LABEL/KIND_DEFAULT_CAPACITY L123-167; activeEdit L225-242; assignArticle L349; savePayload L490-521; PATCH slot L476; DELETE item L461)
- `web/src/app/_home/slots/registry.ts` (14 kinds, SELF_SOURCING set L50-55)
- `web/src/app/_home/slots/ListRail.tsx` (config keys: capacity, label, numbered, timestamps, L42-64)
- `web/src/app/_home/HomeLayout.tsx` (slot map + `categoryById` plumbing)
- `web/src/app/api/admin/home/items/route.ts` (recordAdminAction example caller L160-165)
- `web/src/app/api/admin/ad-units/route.js`, `ad-placements/route.js` (write-route canonical pattern)
- `web/src/lib/auth.js` (requirePermission L466-515; hasPermissionServer L523-541; owner_mode bypass L479-483/531-535)
- `web/src/lib/adminMutation.ts` (canonical skeleton L1-75; recordAdminAction L216-263; service-role fallback L188-205)
- `web/src/lib/supabase/server.ts` (createServiceClient L136-149)
- `web/src/components/admin/Toast.jsx` (useToast L134)
- `web/src/components/admin/DatePicker.jsx` (native date/datetime-local wrapper)

---

## § Next session — Wave 3 Planner v1 (PICK UP HERE)

Read the Session state block above FIRST, then this prompt:

> Continue Wave 3 of the /admin/home redesign. Pre-impl gate has completed Investigator A (ground truth) and Investigator B (verification) — their findings are captured in this file's § Session state block above. Next step is **Planner v1**.
>
> Restart task #3 (`Wave 3 — Planner v1`) and dispatch a planning agent with the prompt below. After Planner v1 returns, dispatch the three parallel reviewers (Planner Verifier, Big-picture Reviewer, Adversary) in a single message, then Adversary Verifier, then iterate. 4/4 unanimous required to ship. Apply the plan only after the gate clears.
>
> **Planner v1 brief (copy into the dispatched agent):**
>
> Draft a precise, verbatim-applicable Wave 3 implementation plan. No code changes — plan only. Output one markdown document, 3000-5000 words.
>
> **Wave 3 scope:**
>
> 1. Ad slot popover gets Auto / Pin tabs in `SlotInlineEditor` at `web/src/app/admin/home/page.tsx`. Auto = existing campaign rules (no behavior change). Pin = typeahead `ad_units` picker + "Pin until" chip (24h / This week / 2wk / Campaign end / Custom→date input) + "Show to all tiers" toggle (`force_all_tiers`) + advanced toggle for `bypass_freq_cap` (default ON, reviewer challenges welcome) + Reason text. Writes via NEW `/api/admin/ads/pins` (POST + DELETE), service-role only, `requirePermission('admin.ads.pins.{create,edit,delete}')`. Each mutation calls `recordAdminAction({action:'ad_pin.create|.update|.delete', targetTable:'ad_pins', targetId: placement_id})`. 📌 chip on slot meta when pin exists.
> 2. List slot popover for `list_rail` kind: Label + Source toggle (day-1 only "Trending") + headline count (3/4/5) + "More" link. Source `trending` reads from `trending_stories_recent` view via `HomeLayout` pre-fetch.
> 3. Quiz slot popover for new kind `quiz_from_article` (requires `home_slots.kind` CHECK relaxation): reuses `ArticlePickerPanel`; slot config stores `article_id`; renderer placeholder this wave links to `/{slug}#article-quiz` fallback (no `/quiz/[slug]` reader route yet — Wave 9).
>
> **Required plan sections:**
>
> 0. Summary
> 1. Schema deltas (migration files, full SQL, idempotent): (a) grant `admin.ads.pins.*` to existing admin permission_set — identify which set by querying `permission_sets` + `role_permission_sets`; (b) relax `home_slots.kind` CHECK to add `quiz_from_article`
> 2. New API route `/api/admin/ads/pins/route.ts` — full TS source, POST + DELETE
> 3. AdUnitPicker component (new, 250ms debounce, hits a new GET — define path)
> 4. SlotInlineEditor edits (exact line ranges, exact old_string→new_string, new state shapes)
> 5. registry.ts + ListRail.tsx changes (new kind dispatch; HomeLayout pre-fetch hook for trending)
> 6. Type updates (database.ts ad_pins typing verification; new TS types for forms)
> 7. Permission flow review (confirm operator passes both Next.js gate AND SQL audit gate)
> 8. Ship order (numbered, dependencies explicit)
> 9. Test plan (manual web QA, live DB checks, curl examples, browser checks)
> 10. Rollback
> 11. Out of scope (Wave 9 /quiz/[slug] route, Most Read/Most Discussed sources, iOS work)
> 12. Risks / known unknowns
>
> **Critical inputs to bake in (from gate):**
>
> - `is_admin_or_above()` = `user_has_role('admin')` only; not owner-aware. `record_admin_action` rejects owner-only actors. Operator (admin@veritypost.com) has admin role + owner_mode, passes both.
> - `ad_pins` has 8 cols incl. `bypass_freq_cap` default false.
> - `home_slot_items` CHECK forces article_id NULL for non-article content_types; quiz_from_article uses `ref_id` or `payload.article_id`.
> - `admin.ads.pins.*` perms exist but have no permission_set links — migration must grant.
> - No INSERT/UPDATE/DELETE RLS policies on `ad_pins` — service-role bypass; cookie-scoped writes fail (intended).
> - No `/quiz/[slug]` route exists — slot links to `/{slug}#article-quiz` fallback.
> - Use `requirePermission` (throwing), not `hasPermissionServer` (non-throwing).
> - In-popover debounce = 250ms (match local idiom).
> - `recordAdminAction()` already routes the audit call through the cookie-scoped client per adminMutation.ts:216-263.
>
> End with "PLAN v1 COMPLETE" line.

**Tasks tracker (from this session):**

- #1 Investigator A — **completed**
- #2 Investigator B — **completed**
- #3 Planner v1 — **completed** → output at `.claude/worktrees/focused-lamarr-638dbf/WAVE3_PLAN_V1.md` (2427 lines, 13 sections, ends `PLAN v1 COMPLETE`)
- #4 Planner Verifier — **completed** (NEEDS REVISION: 3 blockers + 2 framing) → `.claude/worktrees/focused-lamarr-638dbf/WAVE3_REVIEW_VERIFIER.md`
- #5 Big-picture Reviewer — **completed** (NEEDS DESIGN ITERATION: 5 must-fix) → `WAVE3_REVIEW_BIGPICTURE.md`
- #6 Adversary — **completed** (REVISE: 20 findings, 1 BLOCKER + 4 HIGH) → `WAVE3_REVIEW_ADVERSARY.md`
- #7 Adversary Verifier — **completed** (PROCEED TO PLAN v2: 17 CONFIRMED must-fixes) → `WAVE3_REVIEW_ADVVERIFIER.md`
- #8 Plan v2 synthesis — **completed** → `WAVE3_PLAN_V2.md`
- #9 Plan v2 4-agent gate — **completed** (BP SHIP, Verifier NEEDS REVISION, Adversary REVISE, Adv-Verifier filtered to 5 must-fixes)
- #10 Plan v3 patch — **completed** → `WAVE3_PLAN_V3.md`
- #11 Plan v3 2-agent gate — **completed** (Verifier v3 PASS, Adversary v3 REVISE with 1 HIGH ordering bug)
- #12 Plan v4 patch — **completed** → `WAVE3_PLAN_V4.md` (1890 lines, ends `PLAN v4 COMPLETE`)
- #13 Plan v4 Adversary — **ACCEPT** → `WAVE3_REVIEW_ADVERSARY_V4.md` (all 5 v3 findings closed; 5 new vectors LOW + inherited)
- #14 Implementation — **SHIPPED** (uncommitted, working tree, 2026-05-15)
- #15 Post-impl gate — **SHIPPED**: Reviewer SHIP / Adversary REVISE → 1 HIGH + 1 MEDIUM patched (F1: home GET now projects `pinned_ad_unit_id` + threaded through `PlacementOption.existingPin`; F2: ListRailConfigEditor `initialSource` ternary flipped to match renderer default). Final tsc clean.
- #16 Manual QA — **DEFERRED** (owner to walk § 9(c) before commit; checklist in task #10)
- #17 Commit — **PENDING owner go-ahead** (do not push per memory)

**Wave 3 SHIPPED 2026-05-15 (pending QA + commit).** Implementation landed via 4 parallel implementer agents (routes / cascade+merge / picker+SSR / admin-page atomic). Post-impl Reviewer + Adversary pass complete. tsc clean across the integrated tree.

**Files touched (Wave 3 only):**
- NEW: `web/supabase/migrations/20260516000000_admin_ads_pins_perm_grants.sql` (applied)
- NEW: `web/supabase/migrations/20260516000100_home_slots_kind_add_quiz_from_article.sql` (applied)
- NEW: `web/src/app/api/admin/ads/pins/route.ts` (POST + DELETE)
- NEW: `web/src/app/api/admin/ads/pins/recent/route.ts` (GET)
- NEW: `web/src/components/admin/ads/AdUnitPicker.tsx`
- MOD: `web/src/app/api/admin/ad-units/route.js` (GET q/approved/active/limit)
- MOD: `web/src/app/api/admin/ad-units/[id]/route.js` (DELETE cascade-audit)
- MOD: `web/src/app/api/admin/ad-placements/[id]/route.js` (DELETE cascade-audit)
- MOD: `web/src/app/api/admin/home/route.ts` (PlacementOption widening incl. `pinned_ad_unit_id`)
- MOD: `web/src/app/api/admin/home/slots/[id]/route.ts` (server-side merge + trending-no-ads guard)
- MOD: `web/src/app/admin/home/page.tsx` (Auto/Pin tab strip, PinForm, ListRailConfigEditor, ⚙ gear, 📌 chip, onCapacityChange patch, PlacementOption widening incl. `pinned_ad_unit_id`)
- MOD: `web/src/app/_home/HomeRoot.tsx` (conditional trending pre-fetch)
- MOD: `web/src/app/_home/HomeLayout.tsx` (thread trendingArticles)
- MOD: `web/src/app/_home/slots/_shared.tsx` (CardCtx extension)
- MOD: `web/src/app/_home/slots/ListRail.tsx` (hasAny fix + trending merge)

**Gate cleared 2026-05-15.** 4 plan versions, 11 pre-impl reviews, 2 post-impl reviews (17 → 5 → 1 → 0 → 2 → 0 must-fix). Plan v4 at `.claude/worktrees/focused-lamarr-638dbf/WAVE3_PLAN_V4.md`.

**Plan v2 changes from v1 (digest):**
- Scope reduced: quiz_from_article ships ONLY the CHECK relaxation; renderer + admin variant + SlotKind/REGISTRY/KIND_LABEL extension all deferred to Wave 9
- 3 migrations (was 2): added cascade-audit trigger on ad_units + ad_placements deletes
- Step 0 = regen `web/src/types/database.ts` in worktree (was missing — 0 hits today)
- New route: `/api/admin/ads/pins/recent` powering AdUnitPicker "Recent picks" row
- Server-side merge in PATCH `/api/admin/home/slots/[id]` (was destructive overwrite)
- ListRail `hasAny` short-circuit fixed (computed against merged renderItems)
- DatePicker JSX fixed (`includeTime` boolean + ChangeEvent onChange)
- Per-action permission gate: pre-existence check → `requirePermission(existing ? '.edit' : '.create')`
- `bypass_freq_cap` defaults FALSE everywhere (route + UI), parity with `force_all_tiers`
- Real tab strip for Auto/Pin (replaces Button-pair)
- Two-click Remove-pin confirm with advertiser name
- 4 preset chips (24h / This week / 2 weeks / Custom) — dropped Campaign-end + No-expiry
- §7 corrected: operator passes audit gate via owner-role hierarchy (100 ≥ 80), not permission_set
- Trending source rejects slots with content_type='ad' (400) instead of interleaving
- AdUnitPicker: 2-char min trim, no pg_trgm index (OVERSTATED finding dropped)
- #10 Implementation — pending
- #11 Post-impl Reviewer + Adversary — pending

**Plan v1 gate verdict:** 0/4 SHIP. Three reviewers said REVISE/REVISION/ITERATION; Adv-Verifier filtered 20 adversary findings down to 14 CONFIRMED + 4 OVERSTATED + 2 OUT OF SCOPE + 0 hallucinated.

**Cross-tree divergence resolved 2026-05-15:** worktree's `database.ts` is missing the Wave 1+2 typegen regen (0 `ad_pins` hits; main checkout has uncommitted regen with 4 hits). Plan v2 Step 0 = run `supabase gen types typescript` in worktree OR cherry-pick main's regen.

**Design decisions Plan v2 will lock in (owner can override):**
- `count` → alias to `capacity` server-side (no duplicate JSONB key)
- Trending source rejects items with `content_type='ad'` (no interleaving complexity)
- Campaign-end preset disabled in v1 (Wave 9 ships it with lookup)
- `bypass_freq_cap` defaults FALSE everywhere (UI matches DB default)
- AdUnitPicker shows "Recent picks" row on focus (last 5 distinct from operator's audit log, 30d window)
- Most Read / Most Discussed radios hidden entirely (not disabled with "Wave 9" copy)
- Remove pin = two-click confirm (in-popover modal with advertiser name)
- **quiz_from_article: schema relaxation only in Wave 3; renderer + editor variant deferred to Wave 9**
- Real tab strip for Auto/Pin (not button-pair)
- iOS: not applicable (reasoning: iOS doesn't consume `home_slots.kind`; already honors `ad_pins` via Wave 1+2 `serve_ad`)

**Planner v1 key decisions (skim before reviewers run):**
- Migrations: only TWO new ones (perm grants + kind CHECK relax); no ad_pins schema changes (already shipped Wave 1+2).
- `quiz_from_article` stores article reference in `payload.article_id` (not `ref_id`); content_type='quiz_from_article' → article_id NULL per home_slot_items CHECK.
- AdUnitPicker hits new endpoint `GET /api/admin/ad-units?q=…` (extends existing route, not /api/search).
- `bypass_freq_cap` default ON in Pin UI; advanced toggle; defensible as "pin = direct-sold".
- 📌 chip on slot meta when ad_pins row exists.
- List-rail config writes via existing `PATCH /api/admin/home/slots/{id}` with merged `config` JSON — no new route.
- Renderer placeholder for quiz_from_article links to `/{slug}#article-quiz`; full `/quiz/[slug]` route deferred to Wave 9.

---

## 1. Mental model

Three reader-facing surfaces, three different ownership models:

| Surface | What it is | Who picks | Owner work per day |
|---|---|---|---|
| `/` (homepage) | 20 hand-picked slots — Drudge / Fox / NYT shape | **You, every slot** | ~2 min, more on news days |
| `/browse` (or similar) | Continuous-scroll section blocks below the homepage cutoff | The system (queries) | Zero — set rules once |
| `/latest` / `/{section}` | Reader-facing chronological + sectional pages | The system | Zero |

The "transform into browse" experience: reader scrolls past your 20 curated → hits a labeled section break ("LATEST", "TRENDING", "POLITICS", etc.) → continues into auto-fed blocks. Each block ends with "→ all in [section]" handoff. Eventually scroll terminates at "Browse archive →".

You only ever manage the curated 20. The browse zone runs itself.

---

## 2. Homepage slot inventory

**Top:**
- pos 10 — **banner slot** (full-width). Holds an ad or a story. Manual.

**Hero zone:**
- pos 20 — **hero** (tall horizontal, ~220px min-height). One lead story. Manual.

**Main column (left, ~75% width):**
- pos 22 → pos 56 — **19 horizontal slots** (~140px each). Every slot is `ad/story` interchangeable. Manual. **Total left column = 20 (hero + 19).**

**Right rail (right, ~25% width):**
- 14 slots, perfect squares (1:1), uniform size.
- Last slot auto-stretches to bottom-align with left column.
- Each slot can render as: `ad/story` square, **list card** (Trending / Most Read / etc — labelled top + numbered 5 headlines), or **quiz card** (today's quiz CTA).

**Bottom row:**
- 5 little squares (1:1, full-width 5-column grid). Each is `ad/story`. Manual.

**Browse handoff (below the 20):**
- Labelled blocks: LATEST → TRENDING → POLITICS → BUSINESS → TECH → CULTURE → "Caught up · Browse archive →".
- Each block is 8–10 auto-fed stories with one ad slot every ~5 stories.
- Section headers are tappable links to full section pages.
- Not managed on `/admin/home` at all — config lives on `/admin/article-layout` or sibling.

---

## 3. Slot types (what can go in a slot)

| Type | Where it can appear | Renderer notes |
|---|---|---|
| `story` | Anywhere | Pull from `articles` table, render eyebrow + headline + dek |
| `ad` | Anywhere | Resolve via `serve_ad` RPC → house HTML or AdSense/AdMob fallback |
| `list-trending` | Right rail only | Mini list: label + 5 numbered headlines from trending query |
| `list-most-read` | Right rail only | Same shape, different query |
| `list-most-discussed` | Right rail only | Same shape — top story threads by activity |
| `quiz` | Right rail only | Today's quiz CTA card |

Every slot has a `type` field. Most homepage slots are `story` or `ad`. The right rail is where the variant types live.

---

## 4. Fill modes (how a slot gets filled)

**Homepage = fully manual.** No auto-fill on `/`. Owner picks every slot.

- For a `story` slot: click → article search popover → pick → save.
- For an `ad` slot: click → ad picker (see § Ads below).
- For a `list-*` slot: click → pick which list query (trending / most-read / etc.) + headline count + link.
- For a `quiz` slot: click → set CTA text / link / enable-disable.

**Browse zone = fully programmatic.** Story slots in the browse zone are auto-fed by section/recency/trending queries. Ad slots in browse zone fill via campaign rules (no pinning, no manual ad picks below the 20).

---

## 5. Ads

### Two ways an ad slot fills

**(a) Auto fill (default).** Campaign rules decide which creative serves, based on:
- Viewer tier (anon / free / verity_sub)
- Section / story sensitivity
- Geo
- Frequency caps (per user, per session, daily)
- Approval status, active dates

Rules live on `/admin/ads/campaigns`. Set once per campaign, applies to every eligible slot.

**(b) Pinned (direct-sold).** Owner pins a specific creative to a specific slot.
- Bypass campaign rules (the pin wins)
- Optional `expires_at` (default chip: "This week")
- Optional `force_show_all_tiers` (default off — protect Verity sub no-ads promise)
- Logged to audit table (who pinned what, when)
- Visual cue in admin canvas: 📌 chip on slot meta

### Cross-platform ad rendering

| Platform | Renderer |
|---|---|
| Web desktop / mobile | SSR cell (`_SsrAdCell`) + client article `<Ad>` component. House HTML inlined; AdSense fallback via `adsbygoogle.js` |
| iOS (iPhone + iPad) | Native `AdSlotView`. House HTML rendered in `WKWebView`. AdMob SDK as fallback. ATT prompt after first article tap. |
| Kids app | **Zero ads, ever.** Hard-block at resolver |

**One creative authoring path** — HTML. iOS renders the same HTML in WebView (Reddit / Reuters / NYT model). No separate "native creative" format to maintain.

### Tier behaviour

- `anon` → full ad load
- `free` → full ad load (subscriber-funnel creatives target this tier)
- `verity_sub` → zero ads. Resolver returns null. Slot collapses or backfills with story.

---

## 6. Cross-platform layout derivation

**Owner edits `/admin/home` ONCE.** Mobile + iOS auto-derive:

- **Mobile web** → responsive CSS collapses 2-column layout to single column at ≤720px. Hero stays tall, all other boxes become uniform rectangles. Right-rail squares become full-width rectangles. Bottom 5 squares stack 1-col. No separate mobile admin.
- **iOS** → same slot config fetched via `/api/home` (or similar). iOS renders each slot kind with SwiftUI components mapped 1:1 to web kinds (`HeroStorySlot`, `StoryRowSlot`, `AdSlot`, `QuizSlot`, `ListSlot`).
- **Preview toggle on `/admin/home`** → `[Web Desktop] [Web Mobile] [iOS]` segmented control. Read-only. Just changes the preview pane; never writes config.

---

## 7. Admin information architecture

Final admin tree:

- `/admin/home` — homepage curation + ad pinning. Primary surface.
- `/admin/article-layout` — article-page ad template + per-story overrides + browse-zone block config.
- `/admin/ads/`
  - `overview` — KPIs, pacing, ending-soon
  - `campaigns` — campaign rules + tier/geo/frequency targeting
  - `creatives` (renamed from `units`) — creative library, approval queue folded in
  - `placements` — advanced/technical placement config
  - `audit` — pin history, mutation log

**Kill / redirect:** `/admin/ad-campaigns`, `/admin/ad-placements`, `/admin/ad-units`, `/admin/ad-analytics`, `/admin/ads/queue`. All are duplicates or fold into the above.

---

## 8. Schema deltas needed (additive only — no breaking changes)

```sql
-- 1. Pinning + expiry
CREATE TABLE public.ad_pins (
  placement_id    uuid PRIMARY KEY REFERENCES public.ad_placements(id) ON DELETE CASCADE,
  ad_unit_id      uuid NOT NULL REFERENCES public.ad_units(id) ON DELETE CASCADE,
  pinned_by       uuid REFERENCES public.users(id),
  pinned_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  reason          text,
  bypass_freq_cap boolean NOT NULL DEFAULT true,
  force_all_tiers boolean NOT NULL DEFAULT false,
  CHECK (expires_at IS NULL OR expires_at > pinned_at)
);

-- 2. Pre-aggregated freq caps (replaces live impression scan)
CREATE TABLE public.ad_freq_counters (
  ad_unit_id  uuid NOT NULL REFERENCES public.ad_units(id) ON DELETE CASCADE,
  scope       text NOT NULL CHECK (scope IN ('user','session','daily_unit')),
  scope_key   text NOT NULL,
  count       int  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_unit_id, scope, scope_key)
);

-- 3. Network fallback ladder per placement
ALTER TABLE public.ad_placements
  ADD COLUMN fallback_network text
    CHECK (fallback_network IN ('none','adsense','admob','house'))
    NOT NULL DEFAULT 'none',
  ADD COLUMN fallback_network_unit_id text;

-- 4. Geo targeting
CREATE TABLE public.ad_target_geo (
  ad_unit_id   uuid NOT NULL REFERENCES public.ad_units(id) ON DELETE CASCADE,
  mode         text NOT NULL CHECK (mode IN ('include','exclude')),
  country_code text NOT NULL,
  PRIMARY KEY (ad_unit_id, mode, country_code)
);

-- 5. Admin audit log (DB triggers, not app code)
CREATE TABLE public.ad_audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES public.users(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_audit_log_entity_idx
  ON public.ad_audit_log (entity, entity_id, created_at DESC);

-- 6. Article position taxonomy (enforce known names)
ALTER TABLE public.ad_placements
  ADD CONSTRAINT ad_placements_position_check
  CHECK (position IN (
    'home_hero','home_top_banner','home_main_inline','home_rail',
    'home_bottom_square','home_quiz','home_list',
    'browse_inline','browse_section_top',
    'article_top','article_inline_1','article_inline_2','article_inline_3',
    'article_bottom','article_sidebar','article_quiz_sponsor'
  ));
```

---

## 9. `serve_ad` resolver — lookup order

```
1. Load placement. Hard fail if missing / tier-hidden.
2. Editorial gates (ad_eligible, sensitivity_tags) — return null + 'editorial_block' source.
3. PIN BRANCH — if ad_pins row exists and not expired:
     check tier (unless force_all_tiers), freq (unless bypass_freq_cap)
     return pinned creative + source='pinned'
4. PROGRAMMATIC BRANCH — campaign matching:
     active + approved + window + tier + geo + cat/subcat + freq caps
     weighted random pick. Return + source='programmatic'.
5. FALLBACK BRANCH — return {ad_unit_id: NULL, fallback_network, fallback_unit_id, source='network_fallback'}.
6. Client (web or iOS) mounts AdSense/AdMob accordingly.
```

---

## 10. Slot inline editor popover (`/admin/home`)

When owner clicks a slot, popover opens. Field set depends on slot type:

### Story slot
```
[ Pick an article for this slot ]
─────────────────────────────────
Recent stories shown first. Type to filter.
[search input ──────────────────]
- House passes climate bill — Politics · 2h
- SpaceX launch delayed again — Science · 4h
- Federal hearings on AI safety — Tech · 6h
- Markets close mixed on Fed signal — Markets · 8h
─────────────────────────────────
[Clear slot]  [Cancel]  [Save slot]
```

### Ad slot
```
[ Fill this ad slot ]
─────────────────────────────────
○ Auto fill  (campaign rules decide)
● Pin specific creative
   Creative: [typeahead ▾]   (recent picks row at top)
   Pin until: [This week ▾]  (24h · This week · 2 wk · Campaign end · Custom)
   ☐ Show to all tiers (overrides Verity sub no-ads)
   Reason: [________________]
─────────────────────────────────
[Remove pin]  [Cancel]  [Save]
```

### List slot (right rail)
```
[ Configure list card ]
─────────────────────────────────
Label: [Trending           ]
Source: [ ○ Trending  ○ Most read  ○ Most discussed ]
Headlines to show: [ 3 · 4 · 5 ]
"More" link: [/latest                  ]
─────────────────────────────────
[Cancel]  [Save]
```

### Quiz slot
```
[ Configure quiz card ]
─────────────────────────────────
Headline: [Five questions on today's lead story.]
Meta: [~1 minute · 3 correct unlocks the thread]
CTA: [Start the quiz →]
Link: [/quiz                            ]
─────────────────────────────────
[Cancel]  [Save]
```

---

## 11. Day-to-day workflow

**Morning (5 min):**
1. Open `/admin/home`.
2. Pick hero. Pick 5 other top stories.
3. Maybe reconfigure right-rail Trending list source or quiz CTA copy.
4. Done.

**Mid-day swap (30 sec):**
1. Click slot 22.
2. Pick new article.
3. Save.

**Direct-sold ad (20 sec after Day 2):**
1. Click ad slot.
2. Pin tab → pick creative from recent → "This week" chip → Save.
3. Audit log records who/when/why.

**Never:**
- Manage mobile layout separately
- Manage iOS layout separately
- Manage the browse zone day-to-day
- Manage section pages day-to-day
- Manage `/latest` day-to-day

---

## 12. Wave order (suggested build path)

1. **Schema** — `ad_pins`, `ad_freq_counters`, `ad_audit_log`, `fallback_network` cols, geo target table, position CHECK. Additive, no break.
2. **Resolver rewrite** — `serve_ad` gains pin branch, counter reads, fallback ladder return shape. `/api/ads/serve` route updated.
3. **`/admin/home` slot popover** — story picker stays, ad slot gets Auto/Pin tabs, list + quiz get their config panels.
4. **Right-rail polish** — list / quiz / square variants; uniform sizing; bottom alignment.
5. **Web rendering polish** — reserved heights to kill CLS; lazy-load below-fold AdSense; `article_header` 16px margin for AdSense policy; hide rail wrapper on mobile properly.
6. **iOS WebView + AdMob** — SPM AdMob, UMP consent, ATT prompt, `HTMLCreativeView` SwiftUI component, native AdSlot routing by `ad_format`.
7. **Admin consolidation** — kill duplicate routes, audit log surface, preview toggle (Desktop / Mobile / iOS).
8. **Browse zone** — `/admin/article-layout` for browse block config (which sections, in which order, ads-every-N rule).

---

## 13. Open questions / TBD

- **Browse zone path:** is it `/latest`, `/browse`, or stays inline below `/`? (User wants "transform into browse other areas" — leaning toward inline continuation below the 20.)
- **Number of browse blocks:** default 5–6 (Latest, Trending, then top 4 sections)? Owner-configurable?
- **List card data sources:** start with Trending only, or ship all 3 (Trending / Most Read / Most Discussed) day-1?
- **Quiz card visibility:** which slot in the rail? Default position fixed or configurable?
- **AdSense / AdMob unit IDs:** owner has accounts already? Or do we wire up the placeholders first?
- **Browse-zone ad cadence:** "every 5 stories" hardcoded, or per-block configurable?
- **Mobile sticky ad:** keep current `MobileStickyAd.tsx` (320×50 footer)? Where does it sit in the new model?
- **Section pages:** in scope for this redesign, or punt to next session?

---

## 14. Out of scope (explicit)

- Personalization for logged-in readers (defer until post-launch traffic)
- Per-section ad templates beyond "ads-every-N" cadence
- Multi-variant creative testing / A/B
- Native iOS-only creative format (HTML + WebView is the chosen path)
- Sentry / observability around ads (deferred until traffic + revenue)
