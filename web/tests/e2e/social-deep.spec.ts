import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Deep coverage of the social graph + messaging + reports + appeals.
 * Signed in as the seeded `free` user (already has bookmark + follow
 * + notification + report from the seed).
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

const FAKE_USER_ID = '00000000-0000-0000-0000-0000000000ff';
const FAKE_COMMENT_ID = '00000000-0000-0000-0000-000000000111';
const FAKE_CONVERSATION_ID = '00000000-0000-0000-0000-000000000222';

test.describe('social-deep — follows', () => {
  test.skip(!seed, 'seed data not available');

  test('POST follow non-existent target does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
    const res = await page.request.post('/api/follows', {
      data: { target_id: FAKE_USER_ID },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('POST follow journalist (already followed by free) does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    // Free user already follows journalist (from seed). Re-following
    // should be idempotent (200/204) or 4xx (already follows). Not 5xx.
    const res = await page.request.post('/api/follows', {
      data: { target_id: seed!.users.journalist.id },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('social-deep — comments', () => {
  test.skip(!seed, 'seed data not available');

  test('POST top-level comment without quiz pass returns 4xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity_pro, seed!.password);
    const res = await page.request.post('/api/comments', {
      data: { article_id: seed!.articleId, body: 'E2E pre-quiz attempt' },
    });
    // Quiz not passed → 403 (Ext-F1). 400/401 also acceptable. Never 5xx.
    expect(res.status()).toBeLessThan(500);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('vote on non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post(`/api/comments/${FAKE_COMMENT_ID}/vote`, {
      data: { direction: 'up' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('vote on seeded reported comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    if (!seed!.reportedCommentId) test.skip(true, 'no seeded comment');
    const res = await page.request.post(`/api/comments/${seed!.reportedCommentId}/vote`, {
      data: { direction: 'up' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('flag non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post(`/api/comments/${FAKE_COMMENT_ID}/flag`, {
      data: { reason: 'spam' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('report seeded comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity, seed!.password);
    if (!seed!.reportedCommentId) test.skip(true, 'no seeded comment');
    const res = await page.request.post(`/api/comments/${seed!.reportedCommentId}/report`, {
      data: { reason: 'spam', description: 'e2e additional report' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('context-tag non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post(`/api/comments/${FAKE_COMMENT_ID}/context-tag`, {
      data: { context_tag: 'misleading' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('PATCH non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.patch(`/api/comments/${FAKE_COMMENT_ID}`, {
      data: { body: 'edited' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('DELETE non-existent comment does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.delete(`/api/comments/${FAKE_COMMENT_ID}`);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('social-deep — messaging', () => {
  test.skip(!seed, 'seed data not available');

  test('POST conversation start does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity, seed!.password);
    const res = await page.request.post('/api/conversations', {
      data: { recipient_id: seed!.users.journalist.id },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('POST message into non-existent conversation does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity, seed!.password);
    const res = await page.request.post('/api/messages', {
      data: { conversation_id: FAKE_CONVERSATION_ID, body: 'e2e seeded dm' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('GET messages search does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.verity, seed!.password);
    const res = await page.request.get('/api/messages/search?q=hello');
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('social-deep — reports & appeals', () => {
  test.skip(!seed, 'seed data not available');

  test('POST report on non-existent target does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/reports', {
      data: { target_type: 'comment', target_id: FAKE_COMMENT_ID, reason: 'spam' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('POST appeal on non-existent moderation event does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/appeals', {
      data: {
        penalty_id: '00000000-0000-0000-0000-000000000333',
        reason: 'e2e appeal test',
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('GET weekly reading report does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.get('/api/reports/weekly-reading-report');
    expect(res.status()).toBeLessThan(500);
  });
});
