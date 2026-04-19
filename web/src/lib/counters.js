// Counter RPC helpers.
//
// Migrations 056 and 057 revoke EXECUTE on every RPC in this module
// from `authenticated` and `anon`. Callers MUST pass a service-role
// Supabase client (see `createServiceClient()` in lib/supabase/server).
// Invoking any of these helpers with a user-session client will fail
// with an insufficient-privilege error — that is intentional. Counter
// writes carry cross-row authority and must stay on the server.

export async function incrementField(supabase, tableName, rowId, fieldName, amount = 1) {
  const { error } = await supabase.rpc('increment_field', {
    table_name: tableName,
    row_id: rowId,
    field_name: fieldName,
    amount,
  });
  if (error) throw new Error(`increment_field failed: ${error.message}`);
}

export async function incrementViewCount(supabase, articleId) {
  const { error } = await supabase.rpc('increment_view_count', {
    article_id: articleId,
  });
  if (error) throw new Error(`increment_view_count failed: ${error.message}`);
}

export async function incrementCommentCount(supabase, articleId, amount = 1) {
  const { error } = await supabase.rpc('increment_comment_count', {
    article_id: articleId,
    amount,
  });
  if (error) throw new Error(`increment_comment_count failed: ${error.message}`);
}

export async function incrementBookmarkCount(supabase, articleId, amount = 1) {
  const { error } = await supabase.rpc('increment_bookmark_count', {
    article_id: articleId,
    amount,
  });
  if (error) throw new Error(`increment_bookmark_count failed: ${error.message}`);
}

export async function incrementCommentVote(supabase, commentId, voteType, amount = 1) {
  const { error } = await supabase.rpc('increment_comment_vote', {
    comment_id: commentId,
    vote_type: voteType,
    amount,
  });
  if (error) throw new Error(`increment_comment_vote failed: ${error.message}`);
}

export async function updateFollowCounts(supabase, followerId, followingId, amount = 1) {
  const { error } = await supabase.rpc('update_follow_counts', {
    follower: followerId,
    following: followingId,
    amount,
  });
  if (error) throw new Error(`update_follow_counts failed: ${error.message}`);
}
