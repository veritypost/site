// Phase 14: lib/scoring.js is now a thin wrapper over Postgres RPCs.
// All point accrual, category_scores upserts, streak roll-over, and
// milestone bonuses happen atomically in the database. Callers pass a
// service-role Supabase client (see createServiceClient in lib/supabase/server).

const toNull = (v) => (v === undefined ? null : v);

export async function scoreQuizSubmit(service, { userId, kidProfileId, articleId, attemptNumber }) {
  const { data, error } = await service.rpc('score_on_quiz_submit', {
    p_user_id: userId,
    p_kid_profile_id: toNull(kidProfileId),
    p_article_id: articleId,
    p_attempt_number: attemptNumber,
  });
  if (error) return { error: error.message };
  return data;
}

export async function scoreReadingComplete(
  service,
  { userId, kidProfileId, articleId, readingLogId }
) {
  const { data, error } = await service.rpc('score_on_reading_complete', {
    p_user_id: userId,
    p_kid_profile_id: toNull(kidProfileId),
    p_article_id: articleId,
    p_reading_log_id: readingLogId,
  });
  if (error) return { error: error.message };
  return data;
}

export async function scoreCommentPost(service, { userId, commentId }) {
  const { data, error } = await service.rpc('score_on_comment_post', {
    p_user_id: userId,
    p_comment_id: commentId,
  });
  if (error) return { error: error.message };
  return data;
}

export async function advanceStreak(service, { userId, kidProfileId }) {
  const { data, error } = await service.rpc('advance_streak', {
    p_user_id: toNull(userId),
    p_kid_profile_id: toNull(kidProfileId),
  });
  if (error) return { error: error.message };
  return data;
}

// Achievement rollup — migration 050 added `check_user_achievements(uuid)`
// which evaluates a small set of criteria shapes (reading_count,
// quiz_pass_count, comment_count, streak_days) and inserts newly-earned rows
// into user_achievements. Called from quiz/read/comment scoring paths so
// milestones land the moment the user crosses them; a cron also runs
// daily to catch streak_days at midnight.
export async function checkAchievements(service, { userId }) {
  if (!userId) return [];
  const { data, error } = await service.rpc('check_user_achievements', { p_user_id: userId });
  if (error) {
    // T-070 — prior code silently returned [] on RPC error. An
    // achievement-check failure doesn't break the caller's flow, but
    // it's a real signal worth surfacing in logs.
    console.error('[scoring.checkAchievements]', error.message);
    return [];
  }
  return data || [];
}

// Back-compat shim for older call sites. New code should call the
// RPC-specific helpers above. This wraps award_points directly so
// ad-hoc grants (admin tools, one-off adjustments) still work.
export async function awardPoints(
  service,
  { userId, kidProfileId, action, articleId, categoryId, sourceType, sourceId, syntheticKey }
) {
  const { data, error } = await service.rpc('award_points', {
    p_action: action,
    p_user_id: toNull(userId),
    p_kid_profile_id: toNull(kidProfileId),
    p_article_id: toNull(articleId),
    p_category_id: toNull(categoryId),
    p_source_type: sourceType || 'manual',
    p_source_id: toNull(sourceId),
    p_synthetic_key: toNull(syntheticKey),
  });
  if (error) return { awarded: false, error: error.message };
  return data;
}
