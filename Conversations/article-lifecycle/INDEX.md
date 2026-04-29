# Article Lifecycle Redesign — Index

**Last updated:** 2026-04-29 (session 8)
**Phase:** 8 — slices 01–04 + 06 partially implemented; slice 05 deferred (structural scope)
**Next session should pick up:** Slice 04 D1 (quiz-regenerate endpoint), then Slice 05 (stories schema migration)

---

## Slice status

| # | Slice | Status | Last touched | Slice doc |
|---|---|---|---|---|
| 01 | Generation | **implemented** | 2026-04-29 | `slices/01-generation.md` |
| 02 | Publishing | **implemented** | 2026-04-29 | `slices/02-publishing.md` |
| 03 | Viewing | **implemented** | 2026-04-29 | `slices/03-viewing.md` |
| 04 | Quizzes | **partial** (D2/D3/D6 done; D1 quiz-regenerate pending) | 2026-04-29 | `slices/04-quizzes.md` |
| 05 | Timelines | locked (deferred — stories schema, large session) | 2026-04-29 | `slices/05-timelines.md` |
| 06 | Comments | **partial** (D6 AI-flagged tab + moderation history done; D1 ArticleEngagementZone pending slice 05) | 2026-04-29 | `slices/06-comments.md` |

**Default ordering** is generation → publishing → viewing → quizzes → timelines → comments. Owner can redirect any time.

**Blocked-by:** none. No slice is gated on another's lock.

---

## Foundation status

| Doc | Status |
|---|---|
| `README.md` | ✓ written 2026-04-29 |
| `00-system-map.md` | ✓ written 2026-04-29 |
| `SESSION_LOG.md` | ✓ written 2026-04-29 (session 1 entry) |

---

## Cross-slice findings (from foundation pass)

These are findings that surfaced in the system map and touch more than one slice. Each one belongs to whichever slice should decide it; this list keeps them visible at program level so they don't get lost.

1. ~~**`scheduled` is a phantom feature.**~~ **Resolved in slice 02: rip it.** Zod enum, ALLOWED_TRANSITIONS, stories filter, `publish_at` column — all removed.

2. ~~**Web reader has no timeline rendering, and citation rendering is absent on web.**~~ **Resolved in slice 03.** Sources section and timeline section both added to web reader. Graceful no-op when empty. Slice 05 handles the data/admin side of timelines.

3. ~~**`article.view.timeline` permission may not exist in seed data.**~~ **Resolved in slice 03.** Key exists in DB and is granted to all users via the `user` role → `anon` set. The real bug was the RPC name: both iOS and web call `compute_effective_perms` which doesn't exist; the actual function is `my_permission_keys`. Fix is part of slice 03 implementation (D1).

4. ~~**Comment hide/unhide is unaudited.**~~ **Resolved in slice 06 (D4).** `moderation_actions` table will be created. Hide/unhide/remove/ai_flagged all write rows. Admin reports page surfaces the per-comment history inline.

5. ~~**NCMEC submission is a stub.**~~ **Resolved in slice 06 (D2).** Stub stays at launch. Urgent reports surface in admin queue + Sentry. Owner actions manually. Wire post-launch after ESP registration.

6. **System-wide `v2_live` kill switch but no admin UI** to toggle (T287). Operations risk. Touches every slice but isn't a per-slice decision; keep as a program-level deferred item.

7. ~~**AI moderation columns exist on comments but no caller writes them.**~~ **Resolved in slice 06 (D3).** Background cron scores recent unscored comments via Anthropic, writes all four columns, flags ≥0.7 toxicity for admin review. Zero user-facing exposure.

8. ~~**Type/content silently dropped on timeline insert.**~~ **Resolved in slice 05.** `type`/`content` were UI-state-only. New `timelines.type` column ('event'|'article') is now persisted. `linked_article_id` FK added for article-type entries. Editor maps UI `'story'` → DB `'article'` on save.

9. ~~**Non-transactional cascade on article PATCH.**~~ **Resolved in slice 02: defer T5.** Audit markers stay as the detection mechanism. T5 RPC is a named TODO for a future hardening session.

10. ~~**Lenient timeline date parse falls back to `now()`** silently.~~ **Resolved in slice 05 (D1).** RPC gains a WHERE guard: rows with unparseable dates are skipped entirely rather than silently timestamped `now()`.

11. ~~**iOS kids stale-content on background→foreground** (A91 deferred).~~ **Resolved — already fixed.** `KidReaderView.swift:113-116` re-fetches on `scenePhase == .active`. No action needed.

12. ~~**Web event tracking implementation unsurfaced.**~~ **Resolved in slice 03.** Web has `track.ts` + `trackServer.ts` + `/api/events/batch` — the pipeline is built. `article_read_start`, `article_read_complete`, `scroll_depth`, and `increment_view_count` are wired to the reader as part of slice 03 implementation (D4). Uses `sendBeacon` on tab-hide to survive navigation.

13. ~~**No explicit RLS on `articles` table.**~~ **Resolved in slice 02: add RLS.** Policy: anon + authenticated can SELECT only `status='published'` rows. Migration ships with the slice.

---

14. **Stories-as-containers structural change (slice 05 D5–D7).** Slice 05 introduced a top-level `stories` table. `articles` get `story_id` FK; `timelines` parent FK changes to `story_id`; `articles.slug` removed (slug lives on `stories`). Cross-slice implementation impacts:
    - **Slice 01 (Generation):** `persist_generated_article` RPC now also inserts into `stories` and creates a `type='article'` timeline entry for the new article.
    - **Slice 02 (Publishing):** PATCH route sets `stories.published_at` on first article publish. `timelines` RLS policy joins through `stories`, not `articles`.
    - **Slice 03 (Viewing):** Web reader architecture changes — `/[slug]` is a story page with in-place article switching via `?a=<article-id>` query param, not a simple article page. `ArticleSurface` pattern replaced by story-page layout.
    - **Slice 04 (Quizzes):** Quiz still per-article; shown within the story page for the selected article. Concept unchanged, container context changes.
    - **Slice 06 (Comments):** Per slice 06 D1, discussion stays per-article (per-headline). No story-level zone. `comments.story_id` exists as a convenience FK for queries; routing/UX is article-level only.

---

## Open owner-questions visible at program level

None. All slice sessions have resolved their questions; locked answers are in slice docs.

---

## Deferred items (named, intentional)

- **`v2_live` admin UI.** Foundation flagged the gap; owner can decide when to elevate this from "DB-direct toggle" to a real ops surface. Carrying as deferred until a slice session promotes it.

---

## Conventions

- Slice docs live at `slices/<NN>-<name>.md` and follow the shape of `Convo 1.md` — narrative with reasoning, not bullets.
- This index updates every session. The slice statuses, last-touched dates, and cross-slice list are the load-bearing fields.
- The system map (`00-system-map.md`) gets amended (not rewritten) as slice work surfaces new findings. Only the cross-cutting "known fragility" and "open questions" lists get added to.
