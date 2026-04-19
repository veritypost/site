# Verity Post — End-to-End Manual Test Walkthrough

Work through every section in order. Each step has **expected** behaviour bolded. If you see anything else, stop and note it — that's a bug.

## 0. Prep

1. Apply **`01-Schema/032_seed_test_articles.sql`** in Supabase.
2. Confirm seeded test accounts exist (shared password `password`, emails `<username>@vp.test`):
   - `user` (Free), `premium` (Verity Pro), `family` (Verity Family)
   - `admin`, `editor`, `moderator`, `expert`
3. Pick any modern browser with dev tools open (Network + Console).
4. Have the Supabase SQL Editor in a second tab — several steps need SQL inserts/updates.
5. Site URL assumed `http://localhost:3000` or your deploy URL; adjust.

Cleanup after testing:

```sql
DELETE FROM articles WHERE slug LIKE 'test-%';
-- quizzes, attempts, reading_log, comments, bookmarks cascade
```

---

## 1. New user signup + email verification

1. Visit `/signup`. **Expected:** signup form with email + password.
2. Sign up with a fresh address (e.g. `walkthrough+<ts>@vp.test`). **Expected:** lands on pick-username / verify-email screen; Supabase sends a confirmation email.
3. Check the Supabase auth inbox (or email if SMTP is wired). **Expected:** link to confirm email.
4. Click the confirm link. **Expected:** lands on the site, authenticated.
5. In SQL: `SELECT email_verified, onboarding_completed_at FROM users WHERE email = '<your signup email>';`
   - **Expected:** `email_verified = true`, `onboarding_completed_at IS NULL`.

---

## 2. Onboarding walkthrough

1. You should already be on `/welcome` after verification. If not, sign out → sign in again at `/login`.
2. **Expected:** Three-screen walkthrough. Screen 1: quiz-gated discussions. Screen 2: Verity Score. Screen 3: streaks. No emojis or icons. Progress dots at the bottom.
3. Click **Next** twice, then **Start reading** on the last screen.
4. **Expected:** redirects to `/` (home feed). In SQL: `onboarding_completed_at` is now a timestamp.
5. Log out, log back in. **Expected:** you go straight to `/`, never see `/welcome` again.

---

## 3. Browse home feed, open an article

1. Home feed at `/`.
2. **Expected:** category pills across the top ("All", "Politics", "World", …). Below, the 5 seeded test articles plus anything else published.
3. Scroll the feed. **Expected:** stories render as cards with title, excerpt, category badge, date.
4. Tap "Politics". **Expected:** feed filters to Politics; the Fed Reserve test article appears.
5. Click the Fed article. **Expected:** `/story/test-congressional-hearing-fed-independence` loads with title, cover image, full body, source pills area, quiz CTA.
6. View source. **Expected:** `<title>Test: Congressional Hearing on Federal Reserve Independence — Verity Post</title>`, OG tags present (og:title, og:description, og:image = the cover image URL).

---

## 4. Quiz pass → enter discussion

1. On the Fed article, click **Take the quiz**. **Expected:** 5 questions appear (pulled from the 12-question pool), each with 4 options.
2. Answer all 5 correctly using the seeded explanations as a guide (option 0 is correct in every seeded question). **Expected:** result screen shows "Passed 5/5" with explanations for every answer, and a percentile readout.
3. Scroll down. **Expected:** discussion section appears (was invisible before). You see "No comments yet — be the first."
4. Check in SQL: `SELECT correct_count, attempt_count FROM quizzes WHERE article_id = (SELECT id FROM articles WHERE slug='test-congressional-hearing-fed-independence') LIMIT 1;` — **Expected:** non-zero values; attempts logged.

---

## 5. Quiz fail → retake → fresh questions

1. Log in as `user@vp.test` / `password` (free tier).
2. Open the Science article (`test-jwst-early-galaxies`).
3. **Take the quiz.** Deliberately choose wrong answers (anything other than option 0). **Expected:** fail screen with "2/5" or similar; message "Retake with fresh questions"; remaining-attempt counter says **1 left**.
4. **Retake.** **Expected:** 5 different questions from the pool; the 5 you just saw do **not** reappear.
5. Fail again. **Expected:** "No attempts remaining" state; upgrade CTA offers Verity tier (unlimited retakes).
6. In SQL: `SELECT attempt_number, questions_served FROM quiz_attempts WHERE user_id = (SELECT id FROM users WHERE username='user') ORDER BY created_at DESC LIMIT 2;` — **Expected:** two rows with `attempt_number` 1 and 2, `questions_served` arrays disjoint.

---

## 6. Post a comment, upvote another

1. Still on the Fed article as `premium@vp.test` (log in if needed). Pass the quiz if not already passed.
2. Scroll to the comment composer. Type "Interesting — the $100B-$250B bank tier is a sensible threshold." Click **Post**.
3. **Expected:** comment appears at the top of the thread. Counts show 0 upvotes, 0 downvotes.
4. In another browser (or incognito) log in as `user@vp.test`, pass the same quiz, open the same article.
5. Click the **▲** / upvote on the premium user's comment.
6. **Expected:** upvote count flips to 1. Click again: flips back to 0 (toggle). Click downvote: upvote=0, downvote=1. Click upvote: downvote=0, upvote=1 (mutually exclusive).
7. In SQL: `SELECT upvote_count, downvote_count FROM comments WHERE body LIKE '%sensible threshold%';` — **Expected:** matches what the UI shows.

---

## 7. Tag a comment as Article Context

1. As any quiz-passed user on the Fed article, find a substantive comment. Click **Context** on the overflow / pill row.
2. **Expected:** the Context counter increments, the button flips to active (bold or accented). Tagging again removes it.
3. In SQL: `SELECT context_tag_count, is_context_pinned FROM comments WHERE body LIKE '%sensible threshold%';` — **Expected:** `context_tag_count > 0`. `is_context_pinned` flips to true only once the settings-driven threshold is hit (default `min_count=5` and `percent` share).

---

## 8. Bookmark 10 articles → hit cap

1. Log in as `user@vp.test` (free).
2. Bookmark every published article you can find until you hit 10 saves. Click the bookmark icon on each story page or `/bookmarks`.
3. **Expected:** bookmarks list grows; 10/10 shows on the bookmarks page.
4. Try to bookmark an 11th. **Expected:** error toast / inline message "Free plan is limited to 10 bookmarks" and an **Upgrade to Verity** CTA. In SQL: `SELECT COUNT(*) FROM bookmarks WHERE user_id = (SELECT id FROM users WHERE username='user');` → exactly 10.

---

## 9. Verity Score increment

Before anything below, in SQL:
```sql
SELECT verity_score FROM users WHERE username = 'user';
```
Note the number. Call it `score_before`.

1. As `user`, complete a full quiz pass on one article you haven't quizzed yet (e.g. AMOC / Climate).
2. Re-run the SQL. **Expected:** `verity_score` went up. Quiz-correct is 10 points per right answer in score_rules; a 5/5 pass also grants the `quiz_perfect` bonus (25) plus `first_quiz_of_day` (5) if it's the user's first quiz today.
3. Also scroll to end of the article (triggers reading_log completion). **Expected:** `read_article` points (5) added on first complete read per article.
4. Check `score_events` table: `SELECT action, points, occurred_on FROM score_events WHERE user_id = (SELECT id FROM users WHERE username='user') ORDER BY created_at DESC LIMIT 10;` — **Expected:** one row per action, no duplicates on replay.

---

## 10. Streak tracking

1. `SELECT streak_current, streak_last_active_date FROM users WHERE username='user';` right after the Step 9 activity.
2. **Expected:** `streak_current = 1` (or higher if the user already had activity earlier today) and `streak_last_active_date = today's date`.
3. To simulate a second day without actually waiting: run this in SQL:
   ```sql
   UPDATE users SET streak_last_active_date = current_date - 1 WHERE username='user';
   ```
4. Back in the browser, complete another quiz or mark another article read.
5. Re-query. **Expected:** `streak_current` incremented by 1. `streak_day` row appeared in `score_events`.
6. If `streak_current` reaches 7: **Expected:** a `streak_7` event in `score_events` (+25 bonus).

---

## 11. Category scores

1. Before the test: `SELECT score FROM category_scores WHERE user_id = (SELECT id FROM users WHERE username='user') AND category_id = (SELECT id FROM categories WHERE slug='politics');`
2. As `user`, pass the quiz on the Politics article and scroll to finish reading.
3. Re-run the SQL. **Expected:** politics score has increased by ≥ 10 (quiz_correct × n_correct) plus `read_article` (5). The Science category score should be unchanged.
4. Visit `/profile`. **Expected:** per-category breakdown shows Politics with a larger number than before.

---

## 12. Leaderboard

1. `/leaderboard`. **Expected:** global leaderboard listing users by `verity_score`. Free users see global only.
2. Your `user` account should be somewhere on the list if the score is > 0.
3. Paid user (log in as `premium`) sees **Category** tabs. **Expected:** clicking Politics shows users ranked within Politics based on `category_scores.score`.

---

## 13. Follow user (free → blocked)

1. As `user` (free), visit `/u/premium`.
2. **Expected:** profile loads with name/bio. The **Follow** button is either hidden or disabled with an upgrade hint ("Following is a Verity feature").
3. Try to POST to `/api/follows` directly via dev-tools console:
   ```js
   fetch('/api/follows', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ target_user_id: '<premium user id>' })})
     .then(r => r.status)
   ```
   **Expected:** 403 or 400 with a plan-required error.

---

## 14. DM (free → blocked)

1. As `user`, go to `/messages`.
2. **Expected:** page shows a locked banner like "Messaging is a paid feature" and the composer input is disabled.
3. Try to insert a `messages` row via Supabase client in the console. **Expected:** RLS rejects it (post-Phase 15 mute-gate policy also blocks).

---

## 15. Advanced search (free → blocked)

1. As `user`, visit `/search`.
2. **Expected:** basic keyword search works. Filters like Date Range, Source, Category dropdown are either hidden, disabled, or tagged with an upgrade prompt.
3. Submit a basic keyword query. **Expected:** results come back; no filter UI is active.

---

## 16. Profile scores visibility (free viewer)

1. As `user` (free), visit `/u/premium`.
2. **Expected:** you see `premium`'s avatar/name/bio. You do **not** see their Verity Score total, category breakdown, or per-category radar. If any of those appear — that's a D5/D7 violation, bug.

---

## 17. Upgrade via SQL → retest blocked features

Run:
```sql
UPDATE users
   SET plan_id = (SELECT id FROM plans WHERE name = 'verity_monthly'),
       plan_status = 'active'
 WHERE username = 'user';
```

Log out and back in as `user`. Now repeat:

1. Step 13 follow: **Expected:** Follow button works; POST returns 200; the follow row is created.
2. Step 14 DM: **Expected:** Messages page composer enabled; sending a message works.
3. Step 15 advanced search: **Expected:** filters are available; date-range / category filters return narrowed results.
4. Step 16 score visibility: **Expected:** visiting `/u/premium` now shows Verity Score and category breakdown.
5. Step 8 bookmarks: the 10-cap error should no longer fire; you can save more than 10.

---

## 18. Upgrade to Verity Pro → Ask an Expert

```sql
UPDATE users
   SET plan_id = (SELECT id FROM plans WHERE name = 'verity_pro_monthly')
 WHERE username = 'user';
```

Re-login as `user`. Open any article, pass the quiz.

1. **Expected:** an **Ask an Expert** button is visible on the article (was hidden/disabled at lower tiers).
2. Click it, type a question, submit. **Expected:** confirmation, question added to the expert queue.
3. In SQL: `SELECT status, body FROM comments WHERE is_expert_question = true AND user_id = (SELECT id FROM users WHERE username='user') ORDER BY created_at DESC LIMIT 1;` — **Expected:** `status` is visible (or pending if probation), the body is your question.

---

## 19. Cancel subscription → DMs die → 7-day grace

As `user` (currently Verity Pro from Step 18):

1. Visit `/profile/settings/billing`. Click **Cancel subscription**. Confirm.
2. **Expected:** UI flips to a "grace period" state showing N days remaining until freeze. In SQL:
   ```sql
   SELECT plan_status, plan_grace_period_ends_at FROM users WHERE username='user';
   ```
   **Expected:** `plan_status='active'`, `plan_grace_period_ends_at` ≈ now + 7 days.
3. Try to send a DM. **Expected:** the composer is locked with message "Messaging is paused — resubscribe to continue." (DMs revoke immediately per D40.)
4. Reading, commenting on articles you passed, bookmarks — all still work during grace.
5. Force the grace to expire:
   ```sql
   UPDATE users SET plan_grace_period_ends_at = now() - interval '1 day' WHERE username='user';
   SELECT billing_freeze_expired_grace();
   ```
   **Expected:** the RPC returns ≥ 1. Re-query the user row: `frozen_at` is set, `frozen_verity_score` matches the score pre-freeze, `plan_id` back to `free`.
6. Visit `/profile` — **Expected:** frozen banner visible; score still shown (the frozen value) but no progress indicator.
7. Click **Resubscribe**. Pick a plan. **Expected:** after the Stripe webhook (or the stubbed SQL call), score is restored to the frozen value, `frozen_at` nulled.

---

## 20. Admin: create an article + quiz + publish

1. Log in as `admin@vp.test` / `password`. Go to `/admin`.
2. Click **Stories** (or similar story-manager link). **Create new article**.
3. Fill: title, slug, excerpt, body (at least a paragraph), category, cover image URL.
4. **Save draft.** **Expected:** row appears in the draft list.
5. Open the draft, click **Quiz pool**. Add 10 questions (the minimum per D1). Each needs 4 options with one marked correct and a short explanation.
6. **Save quiz.** **Expected:** pool-size indicator shows 10/10.
7. Try to publish with only 9 questions: delete one and try **Publish**. **Expected:** editor rejects with "Quiz pool must contain at least 10 questions."
8. Add the 10th back and **Publish**. **Expected:** article appears on the home feed within a few seconds.

---

## 21. Admin: process a report → apply penalty → user muted

1. As `user` (free again if the cancel left them there; otherwise re-upgrade), post a comment on any article. Call the comment body text `"VIOLATION-TEST"`.
2. As another user (e.g. `premium`), open the article, find the comment, click **Report**, pick a reason, submit.
3. Log in as `moderator@vp.test`. Go to `/admin/moderation` → Reports.
4. **Expected:** the VIOLATION-TEST comment appears in the report queue with reporter, reason, timestamp.
5. Open the report. Hide the comment. **Expected:** comment status flips to hidden; it disappears for regular viewers.
6. Click **Apply penalty** → level 2 (24h comment mute) with reason "Testing". Confirm.
7. In SQL: `SELECT is_muted, muted_until, mute_level FROM users WHERE username='user';` — **Expected:** `is_muted=true`, `muted_until ≈ now + 24h`, `mute_level=1`.
8. Log back in as `user`. Try to post a comment. **Expected:** server rejects with "account is muted or banned — cannot post comments" (Phase 15.1).
9. DMs should still work (level-1 mute is comments-only). Verify by opening `/messages`.
10. In SQL: `SELECT action, metadata FROM audit_log WHERE target_id = (SELECT id FROM users WHERE username='user') ORDER BY created_at DESC LIMIT 3;` — **Expected:** a `penalty.apply` row with the level, reason, and warning_id in metadata.

---

## 22. Admin: review an expert application → approve with probation

1. Log in as `user` (once the mute expires or run `UPDATE users SET is_muted=false, muted_until=NULL, mute_level=0 WHERE username='user';`).
2. Go to `/profile/settings/expert`. Submit an application: pick "Expert", fill out bio, organization, website, 3 sample responses, pick at least one category.
3. **Expected:** confirmation screen; in SQL a row lands in `expert_applications` with `status='pending'`.
4. Log in as `editor@vp.test`. Visit `/admin/verification`.
5. **Expected:** your pending application is listed.
6. Open it. Read the sample responses. For a journalist-type application you'd see a **Mark background check cleared** button — for Expert / Educator there's no BG requirement. Click **Approve + start probation** with review notes.
7. **Expected:** app status flips to `approved`; `probation_ends_at` ≈ now + 30 days; the user's role is granted via `user_roles`.
8. Log back in as `user`. Visit `/profile`. **Expected:** Expert badge visible.
9. Back as `editor`, open the same application. **Expected:** "Mark probation complete" button now shows (Phase 18.3). Click it. **Expected:** `probation_completed = true`; badge stays.

---

## 23. Kid experience (Family plan)

1. Upgrade `user` to Verity Family:
   ```sql
   UPDATE users
      SET plan_id = (SELECT id FROM plans WHERE name='verity_family_monthly')
    WHERE username='user';
   ```
2. Log in as `user`. Go to `/profile/kids`.
3. Click **Add kid profile**. **Expected:** form with name, avatar color, PIN, DOB, **and a Parental Consent section**: consent text block + full-name input + acknowledgment checkbox.
4. Fill the form. Leave consent checkbox unchecked and try to submit. **Expected:** blocked with "Parental consent acknowledgment required".
5. Check the box, type a parent name, submit.
6. **Expected:** kid profile created. In SQL:
   ```sql
   SELECT metadata FROM kid_profiles WHERE parent_user_id = (SELECT id FROM users WHERE username='user');
   ```
   **Expected:** metadata JSON contains `coppa_consent.version`, `parent_name`, `accepted_at`, `ip`.
7. Click through to the kid dashboard from the parent side. **Expected:** score, streak, freeze count, recent reads.
8. Switch to the kid profile (if session switcher exists) or test the kid-safe article flow on the kids landing page (`/kids`). **Expected:**
   - Only `is_kids_safe=true` articles render (Science + Climate test articles qualify).
   - No comment sections.
   - No follow / DM / search filters.
   - Expert-sessions entry point visible.
9. Take a kids quiz. **Expected:** score flows into `kid_profiles.verity_score`, not the parent's.

---

## End

Anything you saw that didn't match an **Expected:** line is a bug. Note the step number + what happened, and we'll triage.

Data cleanup when you're done:

```sql
DELETE FROM articles WHERE slug LIKE 'test-%';
-- auto-cascades quizzes, attempts, comments, bookmarks, reading_log
```

Reset `user`'s plan back to free if desired:

```sql
UPDATE users
   SET plan_id = NULL, plan_status = 'free',
       is_muted = false, muted_until = NULL, mute_level = 0,
       frozen_at = NULL, frozen_verity_score = NULL,
       plan_grace_period_ends_at = NULL
 WHERE username = 'user';
```
