# Verity Post — Work Queue

Merged from TODO.md + CHANGES_TO_MAKE.md + OUTSTANDING.md + Planning.md on 2026-05-01.
All shipped items removed. Single source of truth going forward.

---

## Priority Queue — Ready to Implement

Items below are confirmed real, code locations verified, unblocked.

---

### P1 — Score formula: seed `score_rules` + add reconcile cron
**Why:** `score_rules` weights live in the live DB only — no migration source-of-truth. `reconcile_verity_scores` exists but has zero callers, so ledger drift accumulates forever.
- Add a migration seeding canonical weights: reads=1, quizzes=5, comments=2, upvote_received=3, downvote_received=-1
- Add a daily/weekly cron entry in `vercel.json` calling `reconcile_verity_scores`
- Add an admin surface (or log entry) to inspect drift
- **Platform:** web (cron + migration). iOS = consumer only, not applicable.

---

### P2 — AI pipeline: write `subcategory_id` (blocks Section C)
**Why:** `articles.subcategory_id` is never populated by the AI pipeline or RSS ingest. Section C's entire backfill produces NULL subcategories until this is fixed.
- `web/src/app/api/admin/pipeline/generate/route.ts:1820-1844` — add subcategory derivation between cluster classification and article persist
- `web/src/lib/pipeline/persist-article.ts:68-95` — add `subcategory_id` to `PersistArticlePayload`
- `prompt-overrides.ts:81-86` — `clusterSubcategoryId` is always null; wire it
- The SQL persist RPC also needs a `subcategory_id` branch
- **Platform:** web pipeline only. iOS is a consumer.

---

### P3 — `follow_counts` maintenance (MCP verify first)
**Why:** `follows/route.js:42` calls `toggle_follow`; `counters.js:53-58` references `update_follow_counts`. Neither function body is in repo migrations. Need to confirm via MCP whether they maintain `followers_count` / `following_count` correctly, or if cached counts are drifting.
- **MCP query:** `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('toggle_follow', 'update_follow_counts');`
- If the RPCs don't maintain the cached counts → add `UPDATE users SET followers_count / following_count` to each RPC body
- **Platform:** web + iOS (both read cached counts)

---

### P4 — Admin mark-quiz writes fake `quiz_attempts` rows
**Why:** `web/src/app/api/admin/users/[id]/mark-quiz/route.ts:72-81` hardcodes `attempt_number: 1`, sets `is_correct: passed` (one boolean for all questions), `points_earned: score` on every row. Admin score UI takes only a numeric score — no per-question breakdown. Every admin-logged quiz attempt is structurally wrong.
- Architectural decision needed: either (a) write a single summary row per attempt with `attempt_number` computed from existing rows, or (b) change the schema so admin grants are a separate record type. Pick before implementing.
- **Platform:** web admin only.

---

### P5 — `score_rules` + `reconcile_verity_scores` cron (see P1 above — same item)

---

### P6 — Section A: remaining steps
Section A core (rate limit, self-tag guard, migration, 6-chip CommentRow) is shipped. What remains:
- **Step 7a** — API status gates for tag endpoints
- **Step 7b** — 4 product decisions (see Owner Decisions below)
- **Step 7c/tests** — update `social-deep.spec.ts:95` fixture from `context_tag: 'misleading'` (invalid) to a valid `tag_kind`; add e2e for tag kinds, rate-limit, self-tag guard, soft-deleted comment guard
- **Realtime** — add subscription on `comment_context_tags` (or targeted refetch) for per-user cast state; `comments` subscription covers aggregate counts but not `_your_tags`
  - Web: `CommentThread.tsx:249` — tags fetched once, never subscribed
  - iOS: `StoryDetailView.swift:3243` — local optimistic only, doesn't fan out to other viewers
- **Platform:** web + iOS adult. Kids: not applicable (no comments).

---

### P7 — Leaderboard subcategory pills (false affordance)
Subcategory pills already removed from web (shipped this session). Confirm iOS leaderboard has no equivalent inert pill — check `LeaderboardView.swift` for any subcategory UI that doesn't filter.

---

### P8 — Browse: confirm unclustered articles (owner decision needed)
Published articles not attached to a cluster don't appear in Browse (Browse queries `feed_clusters`). Owner call: surface published-but-unclustered articles as a union set in Browse, or stay clusters-only?
- `web/src/app/browse/page.tsx:125-148` — the cluster query
- If yes: union with `articles WHERE status='published' AND NOT EXISTS(SELECT 1 FROM feed_cluster_articles WHERE article_id = articles.id)`
- **Platform:** web + iOS (iOS Browse mirrors the same table; decision applies to both).

---

### P9 — `ai_sentiment` + `ai_tag` (owner decision needed)
Haiku cron writes `ai_sentiment` and `ai_tag` every 15 min. Only `ai_toxicity_score` is consumed. Two options:
- (a) Surface `ai_sentiment` + `ai_tag` in admin auto-flagged panel (`web/src/app/admin/reports/page.tsx:148-161`)
- (b) Strip the prompt to toxicity-only, halve Haiku spend
- **Platform:** web admin only.

---

### P10 — GDPR deletion RPC body (MCP verify)
`vercel.json` has a deletion cron; `process-deletions/route.js:51` calls `sweep_expired_deletions`. No function body in repo migrations.
- **MCP query:** `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'sweep_expired_deletions';`
- Verify retention semantics are correct (30-day grace period, data zeroed not deleted, etc.)
- **Platform:** server-side only.

---

## Owner Decision Queue

These are blocked on your call — no code until you decide.

| # | Item | Decision needed |
|---|------|----------------|
| D1 | **Section A Step 7b — 4 decisions** | (1) Mutual exclusion of positive vs negative tag kinds? Default: non-exclusive. (2) Helpful badge cliff — awarded once frozen via `helpful_badge_awarded_at`? (3) `comment_tag_kinds` config table vs TS constant? Default: TS constant. (4) Self-tag policy per kind? Default: block all. |
| D2 | **Browse unclustered articles** | Surface published-but-unclustered articles in Browse, or clusters-only? |
| D3 | **ai_sentiment + ai_tag** | Surface in admin panel, or strip from prompt to cut Haiku spend? |
| D4 | **Admin mark-quiz architecture** | Summary row per attempt vs separate record type? |
| D5 | **Item 11b UX spec** | Confirm whether confirmation modal ("Type @username"), self-revoke block, and `bump_user_perms_version` cache invalidation are wired in the existing `/admin/users/[id]/permissions/page.tsx`. Core toggle UI exists (826 lines); need to know which UX requirements are still missing before declaring shipped. |

---

## Blocked Items

These can't start until their prereq ships.

| Item | Blocked on |
|------|-----------|
| **Section C** — subcategory scoring | P2 (subcategory_id in pipeline) must ship first; otherwise backfill is all NULLs |
| **Section E** — Your Record | Sections B + C |
| **Section F** — Public Verity card | Sections B + C + E |
| **Section J** — Leaderboard retirement | Sections E + F (retire once card is live) |
| **Item 12 — Admin impersonation** | Item 11b (toggle infrastructure) + OUTSTANDING #1 (privacy policy clause) |
| **Item 11b — Per-user god-mode grant** | Owner D5 decision above; may already be substantially built |

---

## Deferred Until Sections Ship

These are real gaps but doing them now is premature — they depend on later sections.

| Item | Deferred to |
|------|------------|
| TODO-003: Leaderboard web route + iOS view retirement | Section J (after E + F) |
| TODO-005: OG image generator (`card/[username]/opengraph-image.js`) update | Section F — update in lockstep with `page.js` |
| TODO-006: CommentThread `category_scores` badge — category vs subcategory | Section C — add as explicit decision in Section C plan |

---

## Section Plans

### Section A — Comment tagging system
**Status:** Steps 0–1 complete, Step 7a–7c + realtime remaining (see P6 above).

### Section B — Tags received + scoring backbone
**Status:** Not started. Unblocked after Section A ships.
- `TagsReceivedStrip.tsx` does not exist yet
- `helpful_received_count` columns not in any migration
- YouSection unmounted for B scope

### Section C — Per-subcategory scoring
**Status:** Blocked by P2 (subcategory_id pipeline gap).
- All RPC bodies missing from repo
- `category_scores.subcategory_id` not in any migration
- Backfill strategy depends on `articles.subcategory_id` being populated

### Section D — Browse redesign
**Status:** Partially started. Lifecycle filter chips, date range, coverage multi-select, sort pill already live.
- **Remaining:** keyword search input, subcategory pills (wired this time), source-aware story cards
- Also: answer D2 (unclustered articles) before final implementation

### Section E — Your Record
**Status:** Not started. Depends on B + C.
- YouSection has stat tiles only; no TotalsStrip, CategoryCard, SubcategoryRow, MicroBar components exist

### Section F — Public Verity card
**Status:** Not started. Depends on B + C + E.
- Card page exists in pre-redesign state
- Must update `opengraph-image.js` in lockstep (silent dependency — breaks social previews if missed)
- Confirm `public_profiles_v` WHERE clause via MCP before shipping: `SELECT pg_get_viewdef('public_profiles_v'::regclass, true);`

### Section J — Leaderboard retirement
**Status:** Not started. Gate: after E + F ship.
- Web: redirect `/leaderboard` once card is live; keep `/api/family/leaderboard` (family page still uses it)
- iOS adult: remove "Rankings" quick-link from `ProfileView.swift`
- iOS kids: remove tab-bar `.leaderboard` entry from `KidsAppRoot.swift`
- Family leaderboard surface (`/profile/family`) — keep as-is (family-scoped ranking is COPPA-safe)

---

## Outstanding Admin Features

### Item 4 — AI provider/model picker
**Status:** Backlogged. `PipelineRunPicker.tsx` exists, zero consumers.
- Locked decision: mount in **both** `/admin/story-manager` (per-article override) AND `/admin/pipeline-config` (global default)
- Before building: MCP query `SELECT provider, model FROM ai_models;` — if empty, populate first
- Identify which API routes trigger generation and confirm they accept `{ provider, model }` in body

### Item 11b — Per-user god-mode grant UI
**Status:** Core permissions UI exists at `/admin/users/[id]/permissions/page.tsx` (826 lines). Unclear if confirmation modal, self-revoke block, and cache invalidation are wired. See D5.

### Item 12 — Admin open / edit / impersonate
**Status:** Pending 11b + privacy policy clause.
- Surface 1: admin strip on `/u/[username]` (blocked — route is kill-switched)
- Surface 2: inline profile edit on `/u/[username]`
- Surface 3: extend `/admin/users/[id]` to full editor (currently read-only)
- Surface 4: write-mode impersonation (blocked until privacy clause live)

### OUTSTANDING #1 — Privacy policy clause for impersonation
Owner writes/approves. Suggested clause:
> Verity Post staff may, in connection with support, security, or policy enforcement, access your account and act on your behalf. Any actions taken by staff while accessing your account are logged and you will be notified by email.
Add to `web/src/app/privacy/page.tsx`. Blocks item 12 Surface 4 only.

---

## MCP Verification Queue

Run these before acting on the related items.

| What | Query |
|------|-------|
| `toggle_follow` / `update_follow_counts` bodies (P3) | `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('toggle_follow', 'update_follow_counts');` |
| `public_profiles_v` WHERE clause (pre-Section F) | `SELECT pg_get_viewdef('public_profiles_v'::regclass, true);` |
| `sweep_expired_deletions` body (P10) | `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'sweep_expired_deletions';` |
| `ai_models` table populated (item 4) | `SELECT provider, model FROM ai_models;` |
