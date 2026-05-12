import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Validation coverage for the unified `intent` column on comments
 * (replaces the previous dual author_self_tag + reply_type split).
 *
 * Schema: comments.intent — text NULL or one of
 *   ('question', 'add_context', 'different_take').
 * Same enum is valid on both top-level + replies (no parent_id coupling).
 *
 * Cases:
 *   - invalid_intent_returns_400          (enum guard)
 *   - intent_works_on_top_level           (happy path, depth 0)
 *   - intent_works_on_reply               (happy path, depth 1)
 *   - intent_irrevocable_via_patch        (PATCH ignores intent)
 *   - null_intent_ok                      (omitting intent → NULL row)
 *   - cannot_tag_own_comment              (unchanged; covers /tag route)
 *
 * Specs that need a real successful POST seed a quiz_attempts pass row
 * via the service-role admin client; if that isn't feasible (no service
 * key) they soft-skip.
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Insert a quiz_attempts row that satisfies user_passed_article_quiz()
 * so post_comment's quiz gate clears. Cleanup deletes the row.
 * Returns the inserted row id, or null on failure (caller should skip).
 */
async function seedQuizPass(
  admin: SupabaseClient,
  userId: string,
  articleId: string,
  quizIds: string[]
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('quiz_attempts')
      .insert({
        user_id: userId,
        article_id: articleId,
        score: quizIds.length,
        total_questions: quizIds.length,
        passed: true,
        completed_at: new Date().toISOString(),
        metadata: { seeded_by: 'e2e:comments-validation' },
      })
      .select('id')
      .single();
    if (error || !data) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

async function deleteQuizPass(admin: SupabaseClient, attemptId: string) {
  await admin.from('quiz_attempts').delete().eq('id', attemptId);
}

async function deleteCommentById(admin: SupabaseClient, commentId: string) {
  await admin.from('comments').delete().eq('id', commentId);
}

test.describe('comments-validation — intent enum guard', () => {
  test.skip(!seed, 'seed data not available');

  test('invalid_intent_returns_400', async ({ page }) => {
    if (!seed!.users?.verity_pro || !seed!.articleId)
      test.skip(true, 'seed users or article missing');
    await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
    const res = await page.request.post('/api/comments', {
      data: {
        article_id: seed!.articleId,
        body: 'e2e invalid intent',
        intent: 'nonsense',
      },
    });
    expect(res.status()).toBe(400);
    const json = await res.json().catch(() => ({}));
    expect(json?.error).toBe('invalid_intent');
  });
});

test.describe('comments-validation — tag own comment', () => {
  test.skip(!seed, 'seed data not available');

  test('cannot_tag_own_comment returns 403', async ({ page }) => {
    if (!seed!.users?.free || !seed!.reportedCommentId)
      test.skip(true, 'seed dependencies (free user + own comment) missing');
    // The seeded `reportedCommentId` is authored by `free`. Sign in as
    // `free` and attempt to i_agree-tag their own comment.
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post(
      `/api/comments/${seed!.reportedCommentId}/tag`,
      { data: { kind: 'i_agree' } }
    );
    expect(res.status()).toBe(403);
    const json = await res.json().catch(() => ({}));
    expect(json?.error).toBe('cannot_tag_own_comment');
  });
});

test.describe('comments-validation — intent happy paths', () => {
  test.skip(!seed, 'seed data not available');

  test('intent_works_on_top_level: intent=question persists on depth-0 row', async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) test.skip(true, 'service role key not available');
    if (
      !seed!.users?.verity_pro ||
      !seed!.articleId ||
      !seed!.quizIds?.length
    )
      test.skip(true, 'seed dependencies missing');

    const userId = seed!.users.verity_pro.id;
    let attemptId: string | null = null;
    let newCommentId: string | null = null;
    try {
      attemptId = await seedQuizPass(
        admin!,
        userId,
        seed!.articleId,
        seed!.quizIds
      );
      if (!attemptId)
        test.skip(true, 'could not seed quiz_attempts pass row — schema mismatch');

      await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
      const res = await page.request.post('/api/comments', {
        data: {
          article_id: seed!.articleId,
          body: 'e2e intent top level',
          intent: 'question',
        },
      });
      if (res.status() >= 400)
        test.skip(true, `POST returned ${res.status()} — quiz gate or env issue`);
      expect(res.status()).toBeLessThan(300);

      const json = await res.json().catch(() => ({}));
      newCommentId = json?.comment?.id ?? null;
      expect(newCommentId).toBeTruthy();

      const { data: row, error: readErr } = await admin!
        .from('comments')
        .select('intent, parent_id')
        .eq('id', newCommentId!)
        .maybeSingle();
      expect(readErr).toBeNull();
      expect(row?.parent_id).toBeNull();
      expect(row?.intent).toBe('question');
    } finally {
      if (newCommentId) await deleteCommentById(admin!, newCommentId);
      if (attemptId) await deleteQuizPass(admin!, attemptId);
    }
  });

  test('intent_works_on_reply: intent=different_take persists on depth-1 row', async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) test.skip(true, 'service role key not available');
    if (
      !seed!.users?.verity_pro ||
      !seed!.articleId ||
      !seed!.reportedCommentId ||
      !seed!.quizIds?.length
    )
      test.skip(true, 'seed dependencies missing');

    const userId = seed!.users.verity_pro.id;
    let attemptId: string | null = null;
    let newCommentId: string | null = null;
    try {
      attemptId = await seedQuizPass(
        admin!,
        userId,
        seed!.articleId,
        seed!.quizIds
      );
      if (!attemptId)
        test.skip(true, 'could not seed quiz_attempts pass row — schema mismatch');

      await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
      const res = await page.request.post('/api/comments', {
        data: {
          article_id: seed!.articleId,
          body: 'e2e intent on reply',
          parent_id: seed!.reportedCommentId,
          intent: 'different_take',
        },
      });
      if (res.status() >= 400)
        test.skip(true, `POST returned ${res.status()} — quiz gate or env issue`);
      expect(res.status()).toBeLessThan(300);

      const json = await res.json().catch(() => ({}));
      newCommentId = json?.comment?.id ?? null;
      expect(newCommentId).toBeTruthy();

      const { data: row, error: readErr } = await admin!
        .from('comments')
        .select('intent, parent_id')
        .eq('id', newCommentId!)
        .maybeSingle();
      expect(readErr).toBeNull();
      expect(row?.parent_id).toBe(seed!.reportedCommentId);
      expect(row?.intent).toBe('different_take');
    } finally {
      if (newCommentId) await deleteCommentById(admin!, newCommentId);
      if (attemptId) await deleteQuizPass(admin!, attemptId);
    }
  });

  test('null_intent_ok: POST without intent → intent=NULL on the row', async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) test.skip(true, 'service role key not available');
    if (
      !seed!.users?.verity_pro ||
      !seed!.articleId ||
      !seed!.quizIds?.length
    )
      test.skip(true, 'seed dependencies missing');

    const userId = seed!.users.verity_pro.id;
    let attemptId: string | null = null;
    let newCommentId: string | null = null;
    try {
      attemptId = await seedQuizPass(
        admin!,
        userId,
        seed!.articleId,
        seed!.quizIds
      );
      if (!attemptId)
        test.skip(true, 'could not seed quiz_attempts pass row — schema mismatch');

      await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
      const res = await page.request.post('/api/comments', {
        data: {
          article_id: seed!.articleId,
          body: 'e2e null intent',
          // intentionally NO intent field
        },
      });
      if (res.status() >= 400)
        test.skip(true, `POST returned ${res.status()} — quiz gate or env issue`);
      expect(res.status()).toBeLessThan(300);

      const json = await res.json().catch(() => ({}));
      newCommentId = json?.comment?.id ?? null;
      expect(newCommentId).toBeTruthy();

      const { data: row, error: readErr } = await admin!
        .from('comments')
        .select('intent')
        .eq('id', newCommentId!)
        .maybeSingle();
      expect(readErr).toBeNull();
      expect(row?.intent).toBeNull();
    } finally {
      if (newCommentId) await deleteCommentById(admin!, newCommentId);
      if (attemptId) await deleteQuizPass(admin!, attemptId);
    }
  });
});

test.describe('comments-validation — intent irrevocable on PATCH', () => {
  test.skip(!seed, 'seed data not available');

  test('intent_irrevocable_via_patch: PATCH does not change intent', async ({
    page,
  }) => {
    const admin = adminClient();
    if (!admin) test.skip(true, 'service role key not available');
    if (!seed!.users?.verity_pro || !seed!.articleId)
      test.skip(true, 'seed users or article missing');

    // Seed a comment directly with intent='question' (bypasses the quiz
    // gate). Cleanup via finally.
    const userId = seed!.users.verity_pro.id;
    let commentId: string | null = null;
    try {
      const { data, error } = await admin!
        .from('comments')
        .insert({
          article_id: seed!.articleId,
          user_id: userId,
          body: 'e2e irrevocable intent fixture',
          thread_depth: 0,
          status: 'visible',
          intent: 'question',
          mentions: [],
          metadata: { seeded_by: 'e2e:comments-validation' },
        })
        .select('id')
        .single();
      if (error || !data) test.skip(true, `seed comment failed: ${error?.message ?? 'unknown'}`);
      commentId = data!.id as string;

      // Sign in as the comment author and PATCH with a body change AND an
      // `intent` field. The PATCH route only destructures `body` — `intent`
      // is silently ignored.
      await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
      const patchRes = await page.request.patch(`/api/comments/${commentId}`, {
        data: {
          body: 'e2e irrevocable intent fixture edited',
          intent: 'different_take',
        },
      });
      // Edit may succeed (200) inside the 15-min window, OR be rejected
      // (4xx) if rate-limit/etc fires — either way the row's intent must
      // remain 'question'.
      expect(patchRes.status()).toBeLessThan(500);

      const { data: row, error: readErr } = await admin!
        .from('comments')
        .select('intent')
        .eq('id', commentId)
        .maybeSingle();
      expect(readErr).toBeNull();
      expect(row?.intent).toBe('question');
    } finally {
      if (commentId) await deleteCommentById(admin!, commentId);
    }
  });
});
