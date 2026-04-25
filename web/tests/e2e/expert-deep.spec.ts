import { test, expect } from '@playwright/test';
import { signInAsSeededUser } from './_fixtures/createUser';
import { getSeed } from './_fixtures/seed';

/**
 * Deep coverage of the Ask-an-Expert + expert queue routes. Signed
 * in variously as: free reader (asks question), expert (claim/answer),
 * admin (approve answer).
 */

const seed = (() => {
  try {
    return getSeed();
  } catch {
    return null;
  }
})();

const FAKE_QUEUE_ID = '00000000-0000-0000-0000-0000000000bb';
const FAKE_QUESTION_ID = '00000000-0000-0000-0000-0000000000cc';
const FAKE_ANSWER_ID = '00000000-0000-0000-0000-0000000000dd';
const FAKE_SESSION_ID = '00000000-0000-0000-0000-0000000000ee';

test.describe('expert-deep — free user asking', () => {
  test.skip(!seed, 'seed data not available');

  test('GET /api/expert/queue (queue overview) does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.get('/api/expert/queue');
    expect(res.status()).toBeLessThan(500);
  });

  test('POST /api/expert/ask with valid shape does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post('/api/expert/ask', {
      data: {
        article_id: seed!.articleId,
        question: 'E2E seeded question — does not need to be answered.',
        category_id: seed!.categoryId,
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('expert-deep — expert workflow', () => {
  test.skip(!seed, 'seed data not available');

  test('claim non-existent queue item does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post(`/api/expert/queue/${FAKE_QUEUE_ID}/claim`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('decline non-existent queue item does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post(`/api/expert/queue/${FAKE_QUEUE_ID}/decline`, {
      data: { reason: 'e2e-test' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('answer non-existent queue item does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post(`/api/expert/queue/${FAKE_QUEUE_ID}/answer`, {
      data: { answer: 'e2e seeded answer' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('back-channel POST does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post('/api/expert/back-channel', {
      data: { question_id: FAKE_QUEUE_ID, message: 'e2e seeded back-channel message' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('expert apply does not 5xx (expert already approved)', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post('/api/expert/apply', {
      data: {
        application_type: 'expert',
        full_name: 'E2E Test',
        bio: 'Reapply attempt for the seeded expert.',
        expertise_areas: ['general'],
      },
    });
    // Expert already has an approved application — re-apply should
    // be rejected with a 4xx (conflict / already approved).
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('expert-deep — moderator approval', () => {
  test.skip(!seed, 'seed data not available');

  test('moderator approves non-existent answer does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.moderator, seed!.password);
    const res = await page.request.post(`/api/expert/answers/${FAKE_ANSWER_ID}/approve`, {
      data: {},
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('expert-deep — expert sessions (live Q&A)', () => {
  test.skip(!seed, 'seed data not available');

  test('expert creates a session does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post('/api/expert-sessions', {
      data: {
        title: 'E2E Test Session',
        description: 'Seeded session for testing.',
        scheduled_at: new Date(Date.now() + 86400_000).toISOString(),
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('user posts a question to a session does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.free, seed!.password);
    const res = await page.request.post(`/api/expert-sessions/${FAKE_SESSION_ID}/questions`, {
      data: { question: 'E2E seeded session question' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('expert answers a session question does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post(
      `/api/expert-sessions/questions/${FAKE_QUESTION_ID}/answer`,
      { data: { answer: 'E2E seeded session answer' } }
    );
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('expert-deep — supervisor opt-in', () => {
  test.skip(!seed, 'seed data not available');

  test('expert opts in as category supervisor does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post('/api/supervisor/opt-in', {
      data: { category_id: seed!.categoryId },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('expert opts out as category supervisor does not 5xx', async ({ page }) => {
    await signInAsSeededUser(page, seed!.users.expert, seed!.password);
    const res = await page.request.post('/api/supervisor/opt-out', {
      data: { category_id: seed!.categoryId },
    });
    expect(res.status()).toBeLessThan(500);
  });
});
