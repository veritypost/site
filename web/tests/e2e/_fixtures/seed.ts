/**
 * Deterministic test-data seeding — every role + every meaningful
 * scenario the app supports.
 *
 * Roles seeded (one user per row):
 *   owner, admin, editor, moderator, expert, journalist,
 *   free_reader, verity (paid), verity_pro (paid), parent (verity_family + kid)
 *
 * Cross-cutting state attached to those users:
 *   - subscriptions row for each paid user
 *   - article + 5-question quiz authored by journalist
 *   - bookmarks (free + paid)
 *   - follows (free → journalist)
 *   - notifications (unread, on free)
 *   - audit_log entries (admin)
 *   - reports (free reports a comment, mod queue surfaces it)
 *   - expert_application accepted (expert) + answered question
 *   - achievement (free, on a quiz pass)
 *   - kid_profile + active pair code + a 3-day streak
 *
 * Identifiers are stable across runs:
 *   - emails: vp-e2e-seed-<role>@veritypost.test (cleanup excludes this domain)
 *   - article slug: vp-e2e-seed-article-quiz-test
 *   - pair code: VPE2E001
 *
 * Specs read seeded ids via getSeed() (sync, JSON file written by setup).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';

export const SEED_PATH = resolve(__dirname, '../.auth/seed.json');

export const SEED_CONST = {
  // Test-domain emails — cleanup ignores this domain so the rows stay
  // stable run-to-run (FK targets in subscriptions/audit_log/etc. would
  // orphan otherwise).
  emailDomain: '@veritypost.test',
  password: 'SeedPass1234!',
  articleSlug: 'vp-e2e-seed-article-quiz-test',
  pairCode: 'VPE2E001',
  kidName: 'E2E Kid',
} as const;

const ROLE_EMAILS = {
  owner: 'vp-e2e-seed-owner@veritypost.test',
  admin: 'vp-e2e-seed-admin@veritypost.test',
  editor: 'vp-e2e-seed-editor@veritypost.test',
  moderator: 'vp-e2e-seed-moderator@veritypost.test',
  expert: 'vp-e2e-seed-expert@veritypost.test',
  journalist: 'vp-e2e-seed-journalist@veritypost.test',
  free: 'vp-e2e-seed-free@veritypost.test',
  verity: 'vp-e2e-seed-verity@veritypost.test',
  verity_pro: 'vp-e2e-seed-veritypro@veritypost.test',
  parent: 'vp-e2e-seed-parent@veritypost.test',
} as const;

type RoleKey = keyof typeof ROLE_EMAILS;

export interface SeededIds {
  users: Record<RoleKey, { id: string; email: string }>;
  password: string;
  categoryId: string;
  articleId: string;
  articleSlug: string;
  quizIds: string[];
  quizCorrectIndices: number[];
  kidProfileId: string;
  pairCode: string;
  // First seeded comment by `free` (the one that gets reported).
  reportedCommentId?: string;
  // Reported by `free`, in mod queue.
  reportId?: string;
  // Bookmark id owned by `free`.
  bookmarkId?: string;
  // Follow row: free → journalist.
  followId?: string;
  // Notification id owned by `free`.
  notificationId?: string;
  // Achievement id earned by `free`.
  achievementId?: string;
  // Kid streak (today + 2 days back).
  kidStreakDates: string[];
  // Expert application id (status=approved) for `expert`.
  expertApplicationId?: string;
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('seed: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------- Users + roles ----------------------

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`findUserByEmail list (page ${page}): ${error.message}`);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function ensureUser(
  admin: SupabaseClient,
  email: string,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const existingId = await findUserByEmail(admin, email);
  if (existingId) return existingId;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: SEED_CONST.password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created?.user) return created.user.id;
  const recheck = await findUserByEmail(admin, email);
  if (recheck) return recheck;
  throw new Error(`ensureUser ${email}: ${createErr?.message ?? 'unknown'}`);
}

async function ensureRoleAssignment(
  admin: SupabaseClient,
  userId: string,
  roleName: string
): Promise<void> {
  const { data: role } = await admin.from('roles').select('id').eq('name', roleName).maybeSingle();
  if (!role?.id) throw new Error(`ensureRoleAssignment: no role named ${roleName}`);

  const { data: existing } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role_id', role.id)
    .maybeSingle();
  if (existing?.id) return;

  const { error } = await admin.from('user_roles').insert({ user_id: userId, role_id: role.id });
  if (error) throw new Error(`ensureRoleAssignment ${roleName}: ${error.message}`);
}

// ---------------------- Plans + subscriptions ----------------------

async function findPlanIdByTier(admin: SupabaseClient, tier: string): Promise<string> {
  const { data, error } = await admin.from('plans').select('id').eq('tier', tier).limit(1);
  if (error) throw new Error(`findPlanIdByTier ${tier}: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`no plan with tier=${tier}`);
  return data[0].id;
}

async function ensureSubscription(
  admin: SupabaseClient,
  userId: string,
  tier: string
): Promise<void> {
  const planId = await findPlanIdByTier(admin, tier);
  await admin.from('users').update({ plan_id: planId, plan_status: 'active' }).eq('id', userId);

  const { data: existing } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing?.id) return;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  await admin.from('subscriptions').insert({
    user_id: userId,
    plan_id: planId,
    status: 'active',
    source: 'stripe',
    stripe_subscription_id: `sub_seed_${tier}_${userId.slice(0, 8)}`,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    is_family_member: false,
    auto_renew: true,
    billing_retry_count: 0,
    metadata: { seeded_by: 'e2e' },
  });
}

// ---------------------- Article + quiz ----------------------

async function ensureCategory(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from('categories')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ensureCategory: ${error.message}`);
  if (!data) throw new Error('ensureCategory: no active category');
  return data.id;
}

async function ensureArticle(
  admin: SupabaseClient,
  authorId: string,
  categoryId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('articles')
    .select('id')
    .eq('slug', SEED_CONST.articleSlug)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('articles')
    .insert({
      slug: SEED_CONST.articleSlug,
      title: 'E2E Seed: How honeybees communicate',
      subtitle: 'A short, fact-checked piece used by the test suite.',
      body:
        'Honeybees use a "waggle dance" to tell other bees in the hive ' +
        'where to find flowers. The dancer moves in a figure-8 pattern, ' +
        'with the angle of the straight section indicating direction ' +
        'relative to the sun, and the duration encoding distance.',
      excerpt: 'Honeybees use a waggle dance to tell other bees where flowers are.',
      category_id: categoryId,
      author_id: authorId,
      status: 'published',
      visibility: 'public',
      is_ai_generated: false,
      is_verified: true,
      is_breaking: false,
      is_featured: false,
      is_opinion: false,
      is_kids_safe: true,
      language: 'en',
      view_count: 0,
      share_count: 0,
      comment_count: 0,
      bookmark_count: 0,
      content_flags: {},
      csam_scanned: true,
      moderation_status: 'approved',
      push_sent: false,
      metadata: { seeded_by: 'e2e' },
      is_developing: false,
      needs_manual_review: false,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureArticle: ${error?.message}`);
  return data.id;
}

async function ensureQuiz(
  admin: SupabaseClient,
  articleId: string
): Promise<{ ids: string[]; correctIndices: number[] }> {
  const { data: existing } = await admin
    .from('quizzes')
    .select('id, options, sort_order')
    .eq('article_id', articleId)
    .order('sort_order', { ascending: true });
  if (existing && existing.length >= 5) {
    return {
      ids: existing.slice(0, 5).map((q) => q.id),
      correctIndices: existing.slice(0, 5).map((q) => {
        const opts = (q.options ?? []) as Array<{ text: string; is_correct: boolean }>;
        return opts.findIndex((o) => o.is_correct);
      }),
    };
  }

  const questions = [
    {
      question_text: 'What shape does a honeybee dance in to tell other bees where flowers are?',
      options: [
        { text: 'A figure-8', is_correct: true },
        { text: 'A circle', is_correct: false },
        { text: 'A triangle', is_correct: false },
        { text: 'A square', is_correct: false },
      ],
    },
    {
      question_text: 'What does the angle of the straight section indicate?',
      options: [
        { text: 'Time of day', is_correct: false },
        { text: 'Direction relative to the sun', is_correct: true },
        { text: 'Type of flower', is_correct: false },
        { text: 'Number of bees needed', is_correct: false },
      ],
    },
    {
      question_text: 'What does the duration of the dance encode?',
      options: [
        { text: 'Distance to the flowers', is_correct: true },
        { text: 'How sweet the nectar is', is_correct: false },
        { text: 'How dangerous the route is', is_correct: false },
        { text: 'How many bees should go', is_correct: false },
      ],
    },
    {
      question_text: 'Where do honeybees perform the waggle dance?',
      options: [
        { text: 'On the flowers', is_correct: false },
        { text: 'In the air mid-flight', is_correct: false },
        { text: 'Inside the hive', is_correct: true },
        { text: 'At the entrance only', is_correct: false },
      ],
    },
    {
      question_text: 'Why does this dance matter for the colony?',
      options: [
        { text: 'It marks the queen', is_correct: false },
        { text: 'It is decorative', is_correct: false },
        { text: 'It tells other foragers where to find food', is_correct: true },
        { text: 'It scares predators', is_correct: false },
      ],
    },
  ];

  const { data, error } = await admin
    .from('quizzes')
    .insert(
      questions.map((q, i) => ({
        article_id: articleId,
        title: `Q${i + 1}`,
        question_text: q.question_text,
        question_type: 'multiple_choice',
        options: q.options,
        points: 1,
        pool_group: 1,
        sort_order: i,
        is_active: true,
        attempt_count: 0,
        correct_count: 0,
        metadata: { seeded_by: 'e2e' },
      }))
    )
    .select('id, options, sort_order')
    .order('sort_order', { ascending: true });
  if (error || !data) throw new Error(`ensureQuiz: ${error?.message}`);

  return {
    ids: data.map((q) => q.id),
    correctIndices: data.map((q) => {
      const opts = (q.options ?? []) as Array<{ text: string; is_correct: boolean }>;
      return opts.findIndex((o) => o.is_correct);
    }),
  };
}

// ---------------------- Kid profile + pair code + streak ----------------------

async function ensureFamilyPlan(admin: SupabaseClient, parentId: string): Promise<void> {
  const planId = await findPlanIdByTier(admin, 'verity_family');
  await admin.from('users').update({ plan_id: planId, plan_status: 'active' }).eq('id', parentId);
}

async function ensureKidProfile(admin: SupabaseClient, parentId: string): Promise<string> {
  await ensureFamilyPlan(admin, parentId);
  const { data: existing } = await admin
    .from('kid_profiles')
    .select('id')
    .eq('parent_user_id', parentId)
    .eq('display_name', SEED_CONST.kidName)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('kid_profiles')
    .insert({
      parent_user_id: parentId,
      display_name: SEED_CONST.kidName,
      date_of_birth: '2015-06-01',
      // SHA-256 of "0000" — known dev pin.
      pin_hash: '813f4e44a0b50e26eebeb07de6fbf7c79b1e9b62da19a17d8e3cdb22e02234fd',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureKidProfile: ${error?.message}`);
  return data.id;
}

async function ensurePairCode(
  admin: SupabaseClient,
  parentId: string,
  kidProfileId: string
): Promise<string> {
  await admin.from('kid_pair_codes').delete().eq('code', SEED_CONST.pairCode);
  const { error } = await admin.from('kid_pair_codes').insert({
    code: SEED_CONST.pairCode,
    parent_user_id: parentId,
    kid_profile_id: kidProfileId,
    expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  });
  if (error) throw new Error(`ensurePairCode: ${error.message}`);
  return SEED_CONST.pairCode;
}

async function ensureKidStreak(admin: SupabaseClient, kidProfileId: string): Promise<string[]> {
  // 3-day streak: today + 2 prior days. Idempotent per (kid_profile_id, date).
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }
  for (const date of dates) {
    await admin
      .from('streaks')
      .upsert(
        { kid_profile_id: kidProfileId, date, activity_type: 'reading', is_freeze: false },
        { onConflict: 'kid_profile_id,date,activity_type', ignoreDuplicates: true }
      );
  }
  return dates;
}

// ---------------------- Bookmarks / follows / notifications ----------------------

async function ensureBookmark(
  admin: SupabaseClient,
  userId: string,
  articleId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('article_id', articleId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('bookmarks')
    .insert({ user_id: userId, article_id: articleId, sort_order: 0 })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureBookmark: ${error?.message}`);
  return data.id;
}

async function ensureFollow(
  admin: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId, notify: true })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureFollow: ${error?.message}`);
  return data.id;
}

async function ensureNotification(
  admin: SupabaseClient,
  userId: string,
  senderId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'seed_test')
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('notifications')
    .insert({
      user_id: userId,
      sender_id: senderId,
      type: 'seed_test',
      title: 'E2E seeded notification',
      body: 'A seeded notification for E2E test coverage.',
      channel: 'in_app',
      priority: 'normal',
      is_read: false,
      is_seen: false,
      push_sent: false,
      email_sent: false,
      metadata: { seeded_by: 'e2e' },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureNotification: ${error?.message}`);
  return data.id;
}

// ---------------------- Comments + reports ----------------------

async function ensureComment(
  admin: SupabaseClient,
  articleId: string,
  userId: string,
  body: string
): Promise<string> {
  const { data: existing } = await admin
    .from('comments')
    .select('id')
    .eq('article_id', articleId)
    .eq('user_id', userId)
    .eq('body', body)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('comments')
    .insert({
      article_id: articleId,
      user_id: userId,
      body,
      thread_depth: 0,
      is_edited: false,
      edit_count: 0,
      upvote_count: 0,
      downvote_count: 0,
      reply_count: 0,
      is_pinned: false,
      is_context_pinned: false,
      context_tag_count: 0,
      is_expert_question: false,
      is_author_reply: false,
      is_expert_reply: false,
      status: 'published',
      metadata: { seeded_by: 'e2e' },
      mentions: [],
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureComment: ${error?.message}`);
  return data.id;
}

async function ensureReport(
  admin: SupabaseClient,
  reporterId: string,
  commentId: string
): Promise<string> {
  const { data: existing } = await admin
    .from('reports')
    .select('id')
    .eq('reporter_id', reporterId)
    .eq('target_type', 'comment')
    .eq('target_id', commentId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('reports')
    .insert({
      reporter_id: reporterId,
      target_type: 'comment',
      target_id: commentId,
      reason: 'spam',
      description: 'E2E seeded report — moderation queue test fixture',
      status: 'open',
      is_supervisor_flag: false,
      is_escalated: false,
      metadata: { seeded_by: 'e2e' },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureReport: ${error?.message}`);
  return data.id;
}

// ---------------------- Audit log ----------------------

async function ensureAuditLogEntry(admin: SupabaseClient, actorId: string): Promise<void> {
  const { data: existing } = await admin
    .from('audit_log')
    .select('id')
    .eq('actor_id', actorId)
    .eq('action', 'seed_test_event')
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  await admin.from('audit_log').insert({
    actor_id: actorId,
    actor_type: 'user',
    action: 'seed_test_event',
    target_type: 'system',
    description: 'E2E seeded audit row',
    metadata: { seeded_by: 'e2e' },
  });
}

// ---------------------- Expert application ----------------------

async function ensureExpertApplication(admin: SupabaseClient, userId: string): Promise<string> {
  const { data: existing } = await admin
    .from('expert_applications')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('expert_applications')
    .insert({
      user_id: userId,
      application_type: 'expert',
      full_name: 'E2E Seed Expert',
      bio: 'Seeded for E2E coverage of expert flows.',
      social_links: {},
      credentials: { degree: 'PhD Test Studies' },
      government_id_provided: true,
      verification_documents: {},
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`ensureExpertApplication: ${error?.message}`);
  return data.id;
}

// ---------------------- Achievement ----------------------

async function ensureAchievementGrant(
  admin: SupabaseClient,
  userId: string
): Promise<string | undefined> {
  // Find any active achievement to grant; if none seeded, skip silently.
  const { data: ach } = await admin
    .from('achievements')
    .select('id, points_reward')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!ach?.id) return undefined;

  const { data: existing } = await admin
    .from('user_achievements')
    .select('id')
    .eq('user_id', userId)
    .eq('achievement_id', ach.id)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from('user_achievements')
    .insert({
      user_id: userId,
      achievement_id: ach.id,
      earned_at: new Date().toISOString(),
      points_awarded: ach.points_reward ?? 0,
      metadata: { seeded_by: 'e2e' },
    })
    .select('id')
    .single();
  if (error || !data) return undefined;
  return data.id;
}

// ---------------------- Master orchestrator ----------------------

export async function seedTestData(): Promise<SeededIds> {
  const admin = adminClient();

  // 1) Users for every role.
  const userIds: Record<RoleKey, string> = {} as Record<RoleKey, string>;
  for (const role of Object.keys(ROLE_EMAILS) as RoleKey[]) {
    userIds[role] = await ensureUser(admin, ROLE_EMAILS[role], {
      full_name: `E2E Seed ${role}`,
    });
  }

  // 2) Role assignments. Map our seeder labels to DB role names.
  // Free + verity + verity_pro + parent get the default "user" role only.
  const roleMap: Partial<Record<RoleKey, string>> = {
    owner: 'owner',
    admin: 'admin',
    editor: 'editor',
    moderator: 'moderator',
    expert: 'expert',
    journalist: 'journalist',
  };
  for (const [role, dbRoleName] of Object.entries(roleMap) as Array<[RoleKey, string]>) {
    await ensureRoleAssignment(admin, userIds[role], dbRoleName);
  }

  // 3) Subscriptions for paid tiers + family plan for parent.
  await ensureSubscription(admin, userIds.verity, 'verity');
  await ensureSubscription(admin, userIds.verity_pro, 'verity_pro');
  await ensureFamilyPlan(admin, userIds.parent);

  // 4) Article + quiz authored by journalist.
  const categoryId = await ensureCategory(admin);
  const articleId = await ensureArticle(admin, userIds.journalist, categoryId);
  const { ids: quizIds, correctIndices: quizCorrectIndices } = await ensureQuiz(admin, articleId);

  // 5) Kid + pair code + streak.
  const kidProfileId = await ensureKidProfile(admin, userIds.parent);
  const pairCode = await ensurePairCode(admin, userIds.parent, kidProfileId);
  const kidStreakDates = await ensureKidStreak(admin, kidProfileId);

  // 6) Cross-cutting state.
  const bookmarkId = await ensureBookmark(admin, userIds.free, articleId);
  const followId = await ensureFollow(admin, userIds.free, userIds.journalist);
  const notificationId = await ensureNotification(admin, userIds.free, userIds.journalist);
  const reportedCommentId = await ensureComment(
    admin,
    articleId,
    userIds.free,
    'E2E seeded comment that gets reported'
  );
  const reportId = await ensureReport(admin, userIds.free, reportedCommentId);
  await ensureAuditLogEntry(admin, userIds.admin);
  const expertApplicationId = await ensureExpertApplication(admin, userIds.expert);
  const achievementId = await ensureAchievementGrant(admin, userIds.free);

  const seed: SeededIds = {
    users: Object.fromEntries(
      Object.entries(ROLE_EMAILS).map(([role, email]) => [
        role,
        { id: userIds[role as RoleKey], email },
      ])
    ) as SeededIds['users'],
    password: SEED_CONST.password,
    categoryId,
    articleId,
    articleSlug: SEED_CONST.articleSlug,
    quizIds,
    quizCorrectIndices,
    kidProfileId,
    pairCode,
    reportedCommentId,
    reportId,
    bookmarkId,
    followId,
    notificationId,
    achievementId,
    kidStreakDates,
    expertApplicationId,
  };

  mkdirSync(dirname(SEED_PATH), { recursive: true });
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
  return seed;
}

/**
 * Sync read of the seed JSON written during globalSetup.
 */
export function getSeed(): SeededIds {
  if (!existsSync(SEED_PATH)) {
    throw new Error(`getSeed: ${SEED_PATH} not found — globalSetup didn't run or seed failed`);
  }
  return JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeededIds;
}

/**
 * Cleanup hook for globalTeardown. Drops volatile seeded rows
 * (article + quizzes + comments + reports + pair code + notifications +
 * audit_log entries + bookmarks + follows + expert app + achievement
 * grant). The seed users + plan_id stay (other rows reference them via
 * FK so deleting orphans them).
 */
export async function cleanupSeed(): Promise<void> {
  const admin = adminClient();

  await admin.from('kid_pair_codes').delete().eq('code', SEED_CONST.pairCode);

  // Article-scoped: drop the article (FK cascades to quizzes/comments
  // if the schema is set up that way; if not, drop them explicitly).
  const { data: art } = await admin
    .from('articles')
    .select('id')
    .eq('slug', SEED_CONST.articleSlug)
    .maybeSingle();
  if (art?.id) {
    // Reports → comment ids referencing the article.
    const { data: comments } = await admin.from('comments').select('id').eq('article_id', art.id);
    if (comments && comments.length > 0) {
      const commentIds = comments.map((c) => c.id);
      await admin.from('reports').delete().in('target_id', commentIds);
    }
    await admin.from('bookmarks').delete().eq('article_id', art.id);
    await admin.from('comments').delete().eq('article_id', art.id);
    await admin.from('quizzes').delete().eq('article_id', art.id);
    await admin.from('articles').delete().eq('id', art.id);
  }

  // Per-user volatile state: notifications + audit_log seeded rows + follows.
  await admin.from('notifications').delete().eq('type', 'seed_test');
  await admin.from('audit_log').delete().eq('action', 'seed_test_event');

  // Follows seeded between free and journalist (if both still exist).
  const freeId = await findUserByEmail(admin, ROLE_EMAILS.free);
  const journalistId = await findUserByEmail(admin, ROLE_EMAILS.journalist);
  if (freeId && journalistId) {
    await admin.from('follows').delete().eq('follower_id', freeId).eq('following_id', journalistId);
  }
}
