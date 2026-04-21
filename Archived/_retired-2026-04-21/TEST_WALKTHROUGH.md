# End-to-End Manual Test Walkthrough

Smoke path from a cold sign-up through every major feature gate. Each step has an **Expected** line in bold; anything else is a bug — note the step and triage.

Prior walkthrough used stale SQL paths (`01-Schema/...`) and old test-account credentials (`@vp.test` / password `password`); archived as `archive/2026-04-20-consolidation/TEST_WALKTHROUGH.md.old`.

## 0 — Prep

1. Ensure `test-data/accounts.json` seed is applied via `node scripts/seed-test-accounts.js`. Accounts use emails like `owner@test.veritypost.com` with tier-specific passwords (`TestOwner1!`, `TestAdmin1!`, etc.) — see `test-data/ACCOUNTS.md` for the full list.
2. Apply `schema/032_seed_test_articles.sql` to populate 5 test articles if running against a fresh DB.
3. Open `http://localhost:3000` (or the deploy URL).
4. Dev tools: Network + Console visible.
5. Supabase SQL Editor in a second tab — several steps need SQL verification.

Cleanup after testing:

```sql
DELETE FROM articles WHERE slug LIKE 'test-%';
-- quizzes, attempts, reading_log, comments, bookmarks cascade
```

---

## 1 — New signup + email verification

1. `/signup` → form with email + password.
2. Sign up with `walkthrough+<timestamp>@test.veritypost.com`. **Expected:** redirects to `/verify-email`; email lands in Resend inbox (or Supabase SMTP sink in dev).
3. Click the link. **Expected:** lands authenticated, redirects to `/welcome`.
4. SQL: `SELECT email_verified, onboarding_completed_at FROM users WHERE email='...';` → `email_verified=true, onboarding_completed_at IS NULL`.

---

## 2 — Onboarding

1. `/welcome` after verification. **Expected:** 3-screen carousel. No emojis. Progress dots. "Start reading" on last.
2. Click through; click Start reading. **Expected:** redirects to `/`. SQL `onboarding_completed_at` now a timestamp.
3. Sign out, sign back in. **Expected:** goes straight to `/`, no `/welcome` re-entry.

---

## 3 — Home feed + article reader

1. `/`. **Expected:** category pills, article cards.
2. Click Politics. **Expected:** feed filters.
3. Click an article. **Expected:** `/story/<slug>` loads with body, sources, timeline.
4. View page source. **Expected:** `<title>` matches article title, OG meta present.

---

## 4 — Quiz + comments

1. As `user@test.veritypost.com` (free), open the Fed test article.
2. Click Take the quiz. **Expected:** 5 questions (drawn from 12-question pool).
3. Answer all 5 correctly. **Expected:** pass screen, discussion section becomes visible.
4. Post a comment. **Expected:** lands at top of thread, 0 upvotes.
5. Sign in as `verity_pro@test.veritypost.com` (paid) in another browser; open same article; pass quiz; upvote. **Expected:** count becomes 1. Toggle again → 0.
6. SQL: `SELECT upvote_count, downvote_count FROM comments WHERE body ILIKE '%your test%';` matches UI.

---

## 5 — Quiz retakes (free cap)

1. As free `user`, open any article.
2. Deliberately fail. **Expected:** fail screen, 1 attempt remaining message.
3. Retake. **Expected:** 5 different questions (no overlap with attempt 1).
4. Fail again. **Expected:** "No attempts remaining" state + Verity upgrade CTA.

---

## 6 — Bookmark cap (D13)

1. Free user bookmarks 10 articles.
2. Try 11th. **Expected:** toast "Free plan is limited to 10 bookmarks" + upgrade CTA pointing at `/profile/settings#billing` (NOT `/plans` — that was a 404 prior).

---

## 7 — Tier gates (free → paid)

Upgrade via SQL to simulate a purchase:

```sql
UPDATE users SET plan_id = (SELECT id FROM plans WHERE name='verity_monthly'),
                 plan_status='active'
WHERE email='user@test.veritypost.com';
```

Log out, log back in. Test:
- `/u/verity_pro` → Follow button works; POST `/api/follows` → 200.
- `/messages` → composer active; DM sends.
- `/search` → advanced filters visible.
- `/story/<slug>` → expert responses no longer blurred.
- `/leaderboard` → category tabs now visible.

---

## 8 — Stripe checkout

1. Open `/profile/settings/billing`.
2. Click Upgrade to Verity Pro. **Expected:** redirects to Stripe Checkout.
3. Use test card `4242 4242 4242 4242` (test mode).
4. Complete checkout. **Expected:** redirects back to `/profile/settings?success=1`; toast "Welcome to Verity Pro"; perms refresh; ad slots disappear.
5. SQL: `SELECT processing_status FROM webhook_log ORDER BY created_at DESC LIMIT 1;` → `'processed'`. `SELECT plan_id FROM users WHERE email='user@test.veritypost.com';` → verity_pro UUID.

---

## 9 — Kid pair flow

1. As `family@test.veritypost.com` (Verity Family plan), visit `/profile/kids`.
2. Add kid profile: name "Testy", DOB within 3–13 years ago, PIN (not a weak one — try `1234` first, expect rejection). **Expected:** kid profile lands, coppa_consent metadata populated.
3. Click Generate Pair Code. **Expected:** 8-char code shown.
4. Open VerityPostKids iOS app in simulator. Type code. **Expected:** app transitions to tab bar (Home / Ranks / Experts / Me).
5. Tap Me → Unpair this device. **Expected:** parental gate (math challenge) launches. Pass → app returns to pair screen.

---

## 10 — Cancel + grace (D40)

1. Upgrade a test user to Verity Pro (SQL or Stripe).
2. Cancel via `/profile/settings/billing` → Cancel subscription.
3. **Expected:** immediate DM revocation; `plan_grace_period_ends_at` ≈ now + 7 days.
4. Force grace expiry:
   ```sql
   UPDATE users SET plan_grace_period_ends_at = now() - interval '1 day' WHERE email='...';
   SELECT billing_freeze_expired_grace();
   ```
5. **Expected:** `frozen_at` set, `frozen_verity_score` preserved, `plan_id` back to free.
6. Resubscribe. **Expected:** score restored to frozen value; `frozen_at` nulled.

---

## 11 — Admin actions + audit trail

1. As `admin@test.veritypost.com`, open `/admin/moderation`.
2. Claim a report, hide the comment, apply a level-2 penalty with reason.
3. SQL: `SELECT * FROM audit_log WHERE target_id = '...' ORDER BY created_at DESC LIMIT 3;` → should show `penalty.apply` + `comment.hide` entries.
4. As muted user, try to post a comment. **Expected:** 403 "account is muted".

---

## 12 — Crons

Manually trigger each cron and confirm 200:

```bash
for path in freeze-grace sweep-kid-trials send-emails send-push \
            process-deletions process-data-exports \
            recompute-family-achievements check-user-achievements \
            flag-expert-reverifications; do
  curl -s -o /dev/null -w "$path: %{http_code}\n" \
    -H "Authorization: Bearer $CRON_SECRET" \
    "http://localhost:3000/api/cron/$path"
done
```

All should return 200.

---

## 13 — Kids iOS quizzes write through

1. Kid profile completes an article read on iOS.
2. SQL: `SELECT * FROM reading_log WHERE kid_profile_id = '...' ORDER BY created_at DESC LIMIT 1;` → row lands within 3s.
3. Kid takes the quiz, answers a question.
4. SQL: `SELECT * FROM quiz_attempts WHERE kid_profile_id = '...';` → row per answer.

(Prior TODO #18 fixed silent insert failures; confirm no drift here.)

---

## End

Any step that didn't match its **Expected** line is a bug. Note the step number + actual behavior, triage to TODO.md with a new item.

Reset test data if needed:

```sql
DELETE FROM articles WHERE slug LIKE 'test-%';
UPDATE users SET plan_id = (SELECT id FROM plans WHERE name='free'),
                 plan_status='free',
                 is_muted=false, muted_until=NULL,
                 frozen_at=NULL, frozen_verity_score=NULL,
                 plan_grace_period_ends_at=NULL
WHERE email LIKE '%@test.veritypost.com';
```
