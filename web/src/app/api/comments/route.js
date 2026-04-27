// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth, hasPermissionServer } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { scoreCommentPost } from '@/lib/scoring';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSettings, getNumber } from '@/lib/settings';

// T173 — defense-in-depth body length cap. The post_comment RPC has its
// own enforcement, but capping at the API layer fast-fails hostile or
// runaway clients before we burn a quiz check + scoring round-trip. The
// limit is sourced from the same `comment_max_length` setting that
// /api/settings/public exposes to the client (default 4000 chars).
const COMMENT_MAX_LENGTH_FALLBACK = 4000;

// T170/T209 — authenticated user data must never be cacheable by a CDN
// or shared proxy. Apply private/no-store to every response on this
// route (success + error paths).
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST /api/comments — create a top-level comment or threaded reply.
// Body: { article_id, body, parent_id?, mentions? }
// mentions is an array of { user_id, username }; the RPC strips it
// for free-tier users (D21).
export async function POST(request) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;

  // M11 — order: auth → rate-limit → permission → quiz → RPC. Rate-limit
  // fires before the perms RPC so an authenticated attacker probing for
  // a permission flip (or running the quiz pre-check as a recon side
  // channel) gets gated at 10/min instead of being able to spam the
  // expensive perms+quiz lookups.
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[comments.POST]', err);
      return NextResponse.json(
        { error: 'Unauthenticated' },
        { status: err.status, headers: NO_STORE }
      );
    }
    console.error('[comments.POST]', err);
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comments:${user.id}`,
    policyKey: 'comments_post',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    const retryAfter = String(rate.windowSec ?? 60);
    return NextResponse.json(
      { error: 'Posting too quickly. Wait a moment and try again.' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': retryAfter } }
    );
  }

  const allowed = await hasPermissionServer('comments.post');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Not allowed to post comments' },
      { status: 403, headers: NO_STORE }
    );
  }

  // T171 — bound the request size before JSON.parse so a hostile caller
  // can't force the runtime to buffer/parse an unbounded body. 50 KB is
  // ample for any legitimate comment / reply payload.
  const text = await request.text().catch(() => '');
  if (text.length > 50_000) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413, headers: NO_STORE });
  }
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* malformed JSON falls through to the empty-object validation below */
  }
  const { article_id, body, parent_id, mentions } = parsed;
  if (!article_id || !body) {
    return NextResponse.json(
      { error: 'article_id and body required' },
      { status: 400, headers: NO_STORE }
    );
  }

  // T173 — enforce comment body length at the app layer (defense-in-depth).
  // Pull the limit from settings so changing the cap is a one-row update
  // instead of a redeploy; fall back to 4000 if settings is unreachable.
  const settings = await getSettings(service).catch(() => ({}));
  const commentMaxLength = getNumber(settings, 'comment_max_length', COMMENT_MAX_LENGTH_FALLBACK);
  if (typeof body !== 'string' || body.length > commentMaxLength) {
    return NextResponse.json(
      { error: 'comment_too_long', max_length: commentMaxLength },
      { status: 400, headers: NO_STORE }
    );
  }

  // H4 — surface the quiz-gate failure as a specific 403 before
  // hitting the post_comment RPC.
  {
    const { data: passed, error: passErr } = await service.rpc('user_passed_article_quiz', {
      p_user_id: user.id,
      p_article_id: article_id,
    });
    if (passErr) {
      console.error('[comments.POST.quiz_check]', passErr.message || passErr);
    } else if (!passed) {
      return NextResponse.json(
        { error: 'Pass the quiz on this article to join the discussion.' },
        { status: 403, headers: NO_STORE }
      );
    }
  }

  const { data, error } = await service.rpc('post_comment', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_body: body,
    p_parent_id: parent_id || null,
    p_mentions: Array.isArray(mentions) ? mentions : [],
  });
  if (error) {
    console.error('[comments.POST]', error);
    // Ext-F1 — surface known RPC failure modes as actionable copy.
    // Server log keeps the raw cause; client gets a hint they can act on.
    const code = error.code;
    const msg = (error.message || '').toLowerCase();
    if (code === 'P0001' && (msg.includes('quiz') || msg.includes('not allowed'))) {
      return NextResponse.json(
        { error: 'Pass the quiz on this article to join the discussion.' },
        { status: 403, headers: NO_STORE }
      );
    }
    if (code === '23505' || msg.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Looks like that comment already posted.' },
        { status: 409, headers: NO_STORE }
      );
    }
    if (msg.includes('parent')) {
      return NextResponse.json(
        { error: 'Reply target not found — it may have been removed.' },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { error: 'Could not post comment. Try again in a moment.' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Phase 14: award post_comment points + advance streak.
  const scoring = await scoreCommentPost(service, { userId: user.id, commentId: data.id });
  if (scoring?.error) console.error('score_on_comment_post failed', scoring.error);

  // Re-fetch the row so the client gets the full shape (counts etc.).
  const { data: full } = await service
    .from('comments')
    .select(
      '*, users!user_id(id, username, avatar_color, avatar_url, is_verified_public_figure, is_expert, plans(tier))'
    )
    .eq('id', data.id)
    .maybeSingle();

  return NextResponse.json(
    {
      comment: full || { id: data.id },
      scoring: scoring?.error ? null : scoring,
    },
    { headers: NO_STORE }
  );
}
