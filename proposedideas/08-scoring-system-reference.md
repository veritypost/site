# Scoring system — reference

Definitive audit of the Verity Post scoring stack as it exists today.
Written to prevent future parallel-system mistakes (see `schema/111`
rollback). Every claim cited to file:line.

---

## Big picture

What schema/022_phase14_scoring.sql + related files implement is
already close to what the master-plan §6 asked for. The system is
production-quality: append-only ledger, rules table with caps,
dedupe indexes, category rollups, streak + freeze mechanics,
reconciliation, recompute, and a guard trigger against direct
`users.verity_score` writes from authenticated clients. **Future
scoring work extends this system; it does not replace it.**

---

## 1. Ledger: `score_events`

Defined in `schema/reset_and_rebuild_v2.sql` (seeded columns) and
`schema/022_phase14_scoring.sql:41-97` (indexes + RLS).

```
id              uuid PK
user_id         uuid NULL    -- adult subject
kid_profile_id  uuid NULL    -- kid subject
action          varchar(50) NOT NULL
points          integer NOT NULL
category_id     uuid NULL
article_id      uuid NULL
source_type     varchar(30) NOT NULL  -- quiz_attempt|reading_log|comment|streak|manual
source_id       uuid NULL
occurred_on     date NOT NULL
metadata        jsonb
created_at      timestamptz
CHECK ((user_id IS NOT NULL AND kid_profile_id IS NULL)
       OR (kid_profile_id IS NOT NULL))
```

### Dedupe indexes

- **Concrete events:** UNIQUE `(user_id, action, source_type, source_id)` and `(kid_profile_id, action, source_type, source_id)` WHERE `source_id IS NOT NULL`. Replays of the same `quiz_attempt.id` / `reading_log.id` / `comment.id` with the same action collide.
- **Synthetic events:** UNIQUE `(user_id, action, metadata->>'key')` and `(kid_profile_id, action, metadata->>'key')` WHERE `source_id IS NULL`. Streak-milestone and first-quiz-of-day bonuses dedupe by caller-supplied key.

### RLS
Users see own events + parents see their kids'. Writes gated to service role (DEFINER functions).

---

## 2. Rules: `score_rules`

`schema/reset_and_rebuild_v2.sql:85-100`.

Key columns: `action` (UNIQUE), `points`, `max_per_day`,
`max_per_article`, `cooldown_seconds`, `is_active`, `applies_to_kids`.

### Seeded actions (as of 2026-04-20)

| action | points | max/day | max/article | cooldown | kids? |
|---|---|---|---|---|---|
| read_article | 5 | 50 | 1 | — | yes |
| quiz_correct | 10 | 100 | 10 | — | yes |
| quiz_perfect | 25 | 50 | 25 | — | yes |
| first_quiz_of_day | 5 | 5 | — | — | yes |
| post_comment | 3 | 15 | 1 | 60s | **no** |
| receive_upvote | 2 | 20 | — | — | yes |
| streak_day | 5 | 5 | — | — | yes |
| streak_7 | 25 | — | — | — | yes |
| streak_30 | 100 | — | — | — | yes |
| streak_90 | 250 | — | — | — | yes |
| streak_365 | 1000 | — | — | — | yes |
| achievement_earned | 0 | — | — | — | yes |
| community_note | 15 | — | — | — | no |
| daily_login | 1 | 1 | — | — | yes |

To add a rule: `INSERT INTO score_rules (action, points, …)`.
To retire: flip `is_active=false` rather than delete.

---

## 3. Writer RPC: `award_points`

`schema/022_phase14_scoring.sql:187-319`.

```
award_points(
  p_action text,
  p_user_id uuid DEFAULT NULL,
  p_kid_profile_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_source_type text DEFAULT 'manual',
  p_source_id uuid DEFAULT NULL,
  p_synthetic_key text DEFAULT NULL
) RETURNS jsonb
```

### Flow
1. Rule lookup. Missing/inactive → `{awarded:false, reason:'rule_missing_or_inactive'}`.
2. Kid applicability (line 220-222): if kid + rule `applies_to_kids=false` → `not_applicable_to_kids`.
3. `max_per_article` check (228-239).
4. `max_per_day` check (242-253) — **per-subject**, per local-date.
5. `cooldown_seconds` check (256-267) — min interval since subject's last award of same action.
6. INSERT `score_events` row (276-285) with `ON CONFLICT … EXCEPTION WHEN unique_violation` → `already_awarded`.
7. UPDATE `users.verity_score` OR `kid_profiles.verity_score` (288-292).
8. Upsert `category_scores` (294-313) — accumulates category points + last_activity_at. Kid rows carry `parent_user_id` for family leaderboard.
9. Return `{awarded:true, points:N, reason:null}`.

### Idempotency precisely
- **Concrete path:** same `source_id` + action + subject → second call returns `already_awarded` without touching score.
- **Synthetic path:** same `p_synthetic_key` + action + subject → same dedupe via metadata key index.
- **Callers retrying must reuse the same `p_synthetic_key` on the retry** — generating a new one defeats idempotency.

---

## 4. Per-event wrappers

All in `schema/022_phase14_scoring.sql`.

### `score_on_quiz_submit(p_user_id, p_kid_profile_id, p_article_id, p_attempt_number)` — 515-626

- Walks the 5 `quiz_attempts` rows for that attempt.
- For each correct row: `award_points('quiz_correct', …, source_type='quiz_attempt', source_id=row.id)` + stamps `quiz_attempts.points_earned`.
- If 5/5 correct: `award_points('quiz_perfect', …, synthetic_key='quiz_perfect:<article>:<attempt>')`.
- Once per day (first quiz): `award_points('first_quiz_of_day', …, synthetic_key='first_quiz_of_day:<today>')`.
- If ≥3/5 + category present: bumps `category_scores.quizzes_correct`.
- If kid: bumps `kid_profiles.quizzes_completed_count`.
- Calls `advance_streak`.
- Returns `{awarded, correct, total, points_total, first_quiz_of_day, streak}`.
- **Caller:** `web/src/app/api/quiz/submit/route.js:54-64` via `scoreQuizSubmit` in `lib/scoring.js:8-17`.

### `score_on_reading_complete(p_user_id, p_kid_profile_id, p_article_id, p_reading_log_id)` — 634-693

- `award_points('read_article', …, source_type='reading_log', source_id=reading_log.id)`. max_per_article=1 means one credit per article, ever.
- On success: stamps `reading_log.points_earned`, bumps subject's `articles_read_count`, bumps `category_scores.articles_read`.
- Calls `advance_streak`.
- Returns `{awarded, points, reason, streak}`.
- **Callers:** `web/src/app/api/stories/read/route.js:89-95, 122-128` via `scoreReadingComplete` (lib/scoring.js:19-28). Also wrapped in `award_reading_points(article_id)` RPC at `schema/066` (iOS bearer-token path).

### `score_on_comment_post(p_user_id, p_comment_id)` — 703-738

- `award_points('post_comment', …, source_type='comment', source_id=comment.id)` — cooldown 60s, max 15/day, 1/article.
- Calls `advance_streak`.
- **Caller:** `web/src/app/api/comments/route.js:46-47` via `scoreCommentPost` (lib/scoring.js:30-37).

### `advance_streak(p_user_id, p_kid_profile_id)` — 343-503

- Fetches streak_current / _best / _last_active_date / _freeze_remaining / _freeze_week_start FOR UPDATE.
- **Weekly refill:** first activity of a new ISO week → `streak_freeze_remaining = _user_freeze_allowance(...)` (2 for Pro/Family/XL adults + Family kids; 0 otherwise). Stamps `streak_freeze_week_start`.
- **Same-day call:** no-op (persists any refill state, returns `advanced:false`).
- **Gap logic:** `gap = (today - last) - 1`. gap=0 → streak++. gap>0 + enough freezes → consume freezes, streak++, insert N `streaks(is_freeze=true)` rows for bridged days. gap>0 + not enough → streak resets to 1.
- Updates `streak_best` if new max.
- Inserts today's `streaks(is_freeze=false)` activity row.
- `award_points('streak_day', …, synthetic_key='streak_day:<today>')` — respects max 5/day.
- If streak lands on 7/30/90/365: `award_points('streak_<N>', …, synthetic_key='streak_<N>:<today>')` — one-time bonus.
- Returns `{advanced, streak, best, milestone, freezes_used}`.

### `recompute_verity_score(p_user_id, p_kid_profile_id)` — 748-771

- Sets `users.verity_score` (or `kid_profiles.verity_score`) = SUM of that subject's `score_events.points`.
- **Admin ops only.** Not the hot path. Use after `reconcile_verity_scores()` surfaces drift.

---

## 5. Where `verity_score` actually gets mutated

Only two paths mutate `users.verity_score` / `kid_profiles.verity_score`:

1. **`award_points`** (schema/022:288-292) — the real writer.
2. **`recompute_verity_score`** (schema/022:748-771) — admin realignment.

**Guard trigger** (`schema/083_restrict_users_table_privileged_inserts_2026_04_19.sql`):
- Blocks authenticated users from UPDATE / INSERT with non-zero `verity_score` on `users`.
- Allows `service_role`, `postgres`, `supabase_admin`, `supabase_auth_admin`, admin-or-above roles.
- `SECURITY INVOKER` so `current_user` is preserved — DEFINER escalation by `award_points` runs as `postgres`, which is allowed.
- **`kid_profiles` does NOT have an equivalent guard** — gap.

**App code:** zero direct UPDATE `users.verity_score` or `kid_profiles.verity_score` statements anywhere under `web/src/app/api/` (verified by grep).

---

## 6. Kid scoring

- First-class subject throughout. Every scoring RPC accepts either `p_user_id` OR `p_kid_profile_id` (enforced by `score_events` CHECK).
- `kid_profiles` has its own `verity_score`, `streak_*`, `articles_read_count`, `quizzes_completed_count` columns.
- `award_points` routes the UPDATE to `kid_profiles` when subject is a kid.
- Rules with `applies_to_kids=false` (`post_comment`, `community_note`) are rejected for kid subjects — matches D9 (no kid comments).

---

## 7. Reconciliation + recompute

After `schema/111` rollback:
- `reconcile_verity_scores()` (adult only today) — returns rows where `users.verity_score != SUM(score_events.points)`.
- `recompute_verity_score(user, kid)` — manual realignment.

**Missing:** `category_scores` reconciliation. See §8.

---

## 8. Gaps + extension points

### (a) Reading-log DB trigger — **still worth doing**

Score RPCs fire from `/api/stories/read` today. If a future route writes `reading_log` directly without calling the RPC, points are lost silently.

**Pattern:**
```sql
CREATE TRIGGER on_reading_log_completed
  AFTER UPDATE OF completed ON public.reading_log
  FOR EACH ROW
  WHEN (NEW.completed = true AND OLD.completed = false)
  EXECUTE FUNCTION public.on_reading_log_completed_trigger();
```
The function calls `score_on_reading_complete(NEW.user_id, NEW.kid_profile_id, NEW.article_id, NEW.id)`.

**Idempotency:** existing unique index on `(user_id, action, source_type, source_id)` means the trigger can coexist with the current route-call path. Second fire → `already_awarded`.

Also add an `ON INSERT WHEN NEW.completed = true` trigger so rows created already-complete also fire.

### (b) `max_per_day` — **already enforced**
`schema/022:242-253`. Per-subject, per local-date. No work needed.

### (c) `category_scores` reconciliation — **missing, should add**
`award_points` writes `category_scores` in lockstep with `score_events`. If a process crashes or an admin edits `category_scores`, it drifts. Add a sibling of `reconcile_verity_scores`:

```sql
CREATE OR REPLACE FUNCTION public.reconcile_category_scores()
RETURNS TABLE (subject text, category_id uuid, reported int, ledger_sum int, drift int)
LANGUAGE sql STABLE
AS $$
  SELECT
    coalesce('user:' || cs.user_id::text, 'kid:' || cs.kid_profile_id::text),
    cs.category_id,
    cs.score,
    COALESCE(SUM(se.points), 0)::int,
    (cs.score - COALESCE(SUM(se.points), 0))::int
  FROM public.category_scores cs
  LEFT JOIN public.score_events se ON se.category_id = cs.category_id
    AND (
      (cs.user_id IS NOT NULL AND se.user_id = cs.user_id)
      OR (cs.kid_profile_id IS NOT NULL AND se.kid_profile_id = cs.kid_profile_id)
    )
  GROUP BY cs.id, cs.user_id, cs.kid_profile_id, cs.category_id, cs.score
  HAVING cs.score <> COALESCE(SUM(se.points), 0);
$$;
```

### (d) Guard trigger on `kid_profiles.verity_score` — **missing, should add**
Parity with `schema/083` guard on `users`. Authenticated users shouldn't be able to write `kid_profiles.verity_score` directly; only service role + DEFINER RPCs.

### (e) Re-fire on edge cases — **worth auditing**
- If a quiz is submitted with `kid_profile_id` and the kid is later deleted, the `score_events` row cascades via `ON DELETE` on `kid_profile_id` FK (verify). If not, orphans accumulate.
- Comments that get deleted — does `post_comment` need to be reversed? Currently no; upvote-based clawbacks aren't implemented. Decision matter, not a bug.

### (f) Rate-limit metrics in admin — **nice-to-have**
A view showing "daily users hitting `max_per_day` on each action" would catch when caps are too tight or rules are gamed.

---

## 9. Client-side call-site map

All flow through `web/src/lib/scoring.js`:

| Wrapper | RPC | Callers |
|---|---|---|
| `scoreQuizSubmit` | `score_on_quiz_submit` | `/api/quiz/submit/route.js:54-64` |
| `scoreReadingComplete` | `score_on_reading_complete` | `/api/stories/read/route.js:89-95, 122-128` |
| `scoreCommentPost` | `score_on_comment_post` | `/api/comments/route.js:46-47` |
| `advanceStreak` | `advance_streak` | (called indirectly via the three above) |

iOS bearer path: `award_reading_points(article_id)` (`schema/066`) — authenticated users only, internally creates reading_log + calls `score_on_reading_complete`.

---

## 10. Rules for future scoring work

1. **Never UPDATE `users.verity_score` or `kid_profiles.verity_score` directly.** Use `award_points` (or a per-event wrapper that calls it). The guard on `users` will reject you; the missing guard on `kid_profiles` won't, but it should.
2. **Never create a new ledger table.** `score_events` is it. If you think you need a new table, the answer is a new `action` value + a new `score_rules` row.
3. **For new event types:** add a row to `score_rules`, create a wrapper RPC following the shape of `score_on_*`, call it from the API route after the authoritative write succeeds.
4. **For idempotent-by-source events:** pass `source_type` + `source_id`. For synthetic events (daily/weekly/milestone), pass `p_synthetic_key` — and **preserve the key across retries**.
5. **Always call `advance_streak`** from wrappers that represent "user activity" (quiz, read, comment). Same-day calls are free (no-op).
6. **Kids aren't a special case** — they're a first-class subject. Route through `kid_profile_id` and let `applies_to_kids` filter at the rule layer.

---

## 11. What to build next (in order)

1. **Reading-log trigger** — guarantee RPC fires even if a new route path writes reading_log directly. Low risk, high value.
2. **`reconcile_category_scores()` function** — parity with user-level reconcile. Five-line function + a reference in the admin audit dashboard.
3. **`kid_profiles` guard trigger** — parity with `schema/083`. Close the gap that lets authenticated clients touch `kid_profiles.verity_score` directly (RLS already blocks it at the policy layer, but trigger-level defense is cheap belt-and-suspenders).
4. **Admin rate-limit metrics** — view + admin page showing which users hit `max_per_day` today, which action, which category. Signals gaming or too-tight caps.
5. **Category-scores rollup triggers** — `articles_read`, `quizzes_correct` are maintained imperatively by `score_on_reading_complete` / `score_on_quiz_submit`. A reconciliation function (§c) can catch drift; a nightly cron can heal it.

None of these are launch blockers. All are post-launch hardening.
