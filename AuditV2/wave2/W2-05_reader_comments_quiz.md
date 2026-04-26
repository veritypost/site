# W2-05: Reader / Comments / Quiz Flow

## Q1: comment_status enum drift `'visible'` vs `'published'` — WAVE A WAS WRONG (or partial)

Verified live state:
- **`comments.status` is `varchar`, not an enum** (no `comment_status` enum exists in pg_type — verified).
- **`post_comment` RPC inserts `'visible'`** (verified in pg_proc body).
- **`reports/route.js:66` updates to `'hidden'`** when threshold reached.
- **`CommentThread.tsx:100`** reads `.eq('status', 'visible')`.
- **`CommentThread.tsx:203,228`** filter realtime payloads by `payload.new.status !== 'visible'`.
- **No code path uses `'published'` for comments** — only `web/src/lib/pipeline/story-match.ts:114,145` uses `'published'` and that's for **articles**, a different table.

**Verdict:** the 6/6 Wave A audit consensus on "comment_status enum drift" was likely a **false alarm** — they may have confused `articles.status='published'` with comments. Reading and writing of comments is internally consistent on `'visible'/'hidden'`.

**Wave 3 should:** run a comprehensive grep `grep -rn "comments.*status\|status.*comments" web/src --include="*.ts" --include="*.tsx" --include="*.js"` and `grep -rn "'published'\|'visible'" web/src/app/api/comments web/src/app/api/admin/moderation` to confirm absolutely no path writes `'published'` to comments.

## Q2: F1-F4 vs PRELAUNCH_UI_CHANGE direction conflict

Per Z02:
- F1-F4 are launch-hidden (sources-above-headline, reading-receipt, earned-chrome-comments, quiet-home-feed).
- PRELAUNCH_UI_CHANGE proposes a 6-phase visible-product rebuild.
- Conflict on: story page direction + home page direction.

The PRELAUNCH_UI_CHANGE doc is dated 2026-04-25 (today, per Z02). F-specs are older. **More recent = canonical.**

**Verdict:** PRELAUNCH_UI_CHANGE supersedes F1-F4 for any overlapping scope. F-specs that don't overlap remain valid. Wave 3 should diff specifically.

## Q3: Quiz threshold — HARDCODED IN RPC, NOT DB-DRIVEN

`user_passed_article_quiz` RPC body (verified):
```
WHERE t.correct_sum >= 3
```
Hardcoded `3`. Not DB-driven.

`settings` table query for `quiz%` keys returns **zero rows**. There is no `quiz_unlock_threshold` setting.

**Concern:** if owner ever wants to change to "4/5 to unlock", a code change is required (the RPC body must be updated). Per CLAUDE.md "DB is default" rule, this should live in `settings` and the RPC should `_setting_int('quiz.unlock_threshold', 3)`.

**Recommended fix:** add migration:
```sql
INSERT INTO settings (key, value) VALUES ('quiz_unlock_threshold', '3');
CREATE OR REPLACE FUNCTION user_passed_article_quiz(...) ... 
  WHERE t.correct_sum >= _setting_int('quiz_unlock_threshold', 3);
```

## Q4: CommentRow `COMMENT_MAX_DEPTH = 2` — confirms Z16 (mirrors DB by hand)

- `web/src/components/CommentRow.tsx:31` — `const COMMENT_MAX_DEPTH = 2;`
- DB `settings.comment_max_depth = 2` (verified).
- They happen to match, but it's manual mirror not a runtime read. If DB value changes, UI breaks.
- post_comment RPC reads `_setting_int('comment_max_depth', 3)` — RPC fallback 3, DB override 2.

**Recommended fix:** UI should fetch via `getSettings()` helper or pass through page props.

## Q5: Quiz pass threshold hardcoded client-side — Wave A claim PARTIALLY TRUE

Server-side: hardcoded in RPC (Q3 — `>= 3` in `user_passed_article_quiz`).
Client-side: Z13 didn't surface a hardcoded threshold in story page (the page uses the RPC result directly).

So the gating logic is server-side; client doesn't independently re-implement the threshold. **Wave A overstated.**

## Q6: /api/comments/[id]/report ↔ /api/reports — see W2-10 Q10
- /api/comments report has NO rate limit (bug)
- /api/reports has rate limit 10/hr
- Both write to `reports` table, different perms. Keep both, fix rate limit on comments variant.

## Q7: Reading receipt (F2) — DEFERRED to Wave 3

Need to grep for `reading_receipt`, `read_progress`, etc. tables/code. F2 is launch-hidden but should have no dead-code paths.

## Q8: Earned chrome (F3) — DEFERRED to Wave 3

Comment-author chrome differentiation is the F3 feature. CommentRow.tsx already has plan-tier badge logic. Whether it's gated by perms vs pure plan check needs verification.

## Q9: Round 2 L03 TOCTOU races — DEFERRED to Wave 3

L03 lens flagged TOCTOU in comment edit/delete + quiz attempt-count. Need to read L03 verbatim and inspect specific routes.

## Q10: Story page launch-hides — DEFERRED to Wave 3

Z13 said multiple. Need to enumerate (regwall variants, anon interstitial). Each should have a kill-switch flag, not deletion.

## Confirmed duplicates
- (none new in this thread; W2-10 covers /api/reports vs /api/comments/[id]/report)

## Confirmed stale
- Wave A's "comment_status enum drift" finding — likely false-alarm (no enum, code path consistent on `'visible'`)
- F1-F4 specs where they conflict with PRELAUNCH_UI_CHANGE 2026-04-25

## Confirmed conflicts (real bugs)
- **Quiz threshold hardcoded `>= 3` in RPC** (not DB-driven — violates DB-default rule)
- **CommentRow MAX_DEPTH=2** mirrors DB by hand (will silently break if DB changes)
- (and W2-10 Q10's missing rate limit on /api/comments report — already logged)

## Unresolved (Wave 3)
- Confirm absolute absence of `'published'` writes to comments
- F1-F4 vs PRELAUNCH_UI_CHANGE scope-by-scope diff
- F2 reading-receipt code path inventory (any dead code?)
- F3 earned-chrome perm-vs-plan gating
- L03 TOCTOU specifics
- Story page launch-hide enumeration

## Recommended actions
1. **P1:** Migration to make `quiz_unlock_threshold` a DB setting + RPC reads it
2. **P1:** CommentRow reads `comment_max_depth` from `settings` (use `getSettings()` helper)
3. **P2:** Run comprehensive grep to confirm `'published'` is never written to comments table
4. **P2:** Diff F1-F4 vs PRELAUNCH_UI_CHANGE; mark superseded sections in F-spec headers
5. **P3:** L03 TOCTOU verification (Wave 3)
