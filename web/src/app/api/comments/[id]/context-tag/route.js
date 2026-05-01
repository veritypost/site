// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/comments/[id]/context-tag
// D15/D16: toggle a per-user tag on a comment. Any user who passed the
// article's quiz can tag (D16). The RPC autopins the comment once the
// `context` threshold is reached and maintains `helpful_count` for the
// `helpful` kind. Body: { tag_kind?: 'context' | 'helpful' | 'insightful'
// | 'sarcastic' | 'cite_needed' | 'off_topic' } — defaults to 'context'
// for backward compatibility with callers who POST no body.
const ALLOWED_TAG_KINDS = new Set([
  'context',
  'helpful',
  'insightful',
  'sarcastic',
  'cite_needed',
  'off_topic',
]);

export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('comments.context_tag');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].context-tag.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  // Parse + validate tag_kind. Empty body → 'context' so legacy callers
  // (web pre-multi-tag, any cached client) keep their semantics.
  let tagKind = 'context';
  try {
    const body = await request.json().catch(() => null);
    if (body && typeof body.tag_kind === 'string') tagKind = body.tag_kind;
  } catch {
    // No body — accept default.
  }
  if (!ALLOWED_TAG_KINDS.has(tagKind)) {
    return NextResponse.json({ error: 'invalid_tag_kind' }, { status: 400 });
  }

  const service = createServiceClient();

  // Mirror /api/comments/[id]/vote rate-limit pattern. Per-user bucket so
  // tagging is rate-limited independently of voting; 30/min ceiling stops
  // a runaway client from spraying the toggle endpoint.
  const rate = await checkRateLimit(service, {
    key: `comment_tag:${user.id}`,
    policyKey: 'comment_tag',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  // Explicit self-tag guard at the API boundary. The RPC also rejects
  // self-tagging with a clean RAISE so the DB-level rule stays the
  // source of truth, but a 403 here gives the client an actionable
  // error rather than a generic RPC failure.
  try {
    const { data: comment } = await service
      .from('comments')
      .select('user_id')
      .eq('id', params.id)
      .maybeSingle();
    if (comment?.user_id === user.id) {
      return NextResponse.json({ error: 'cannot_tag_own_comment' }, { status: 403 });
    }
  } catch (e) {
    console.error('[comments.id.context-tag] self-tag precheck', e);
  }

  const { data, error } = await service.rpc('toggle_context_tag', {
    p_user_id: user.id,
    p_comment_id: params.id,
    p_tag_kind: tagKind,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.context_tag',
      fallbackStatus: 400,
    });
  return NextResponse.json(data);
}
