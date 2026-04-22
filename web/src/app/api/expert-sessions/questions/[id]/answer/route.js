// @migrated-to-permissions 2026-04-18
// @feature-verified expert_sessions 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission, getUserRoles } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { EDITOR_ROLES } from '@/lib/roles';

// POST — expert answers a kid question (approves it at the same time).
// Editor/admin can also answer/approve for moderation purposes.
// Body: { answer_text }
//
// F-014 — the pre-fix route gated only on `expert_can_see_back_channel`
// and then updated `kid_expert_questions` WHERE id = params.id. Any
// approved expert could therefore rewrite every kid's answer on the
// platform. The fix scopes the write to (a) the expert assigned to the
// question's session, or (b) an editor/admin acting in a moderation
// capacity.
// T-019: previously a mis-labeled local `MOD_ROLES` Set whose contents
// were actually EDITOR_ROLES (no moderator role). Using the canonical
// EDITOR_ROLES export preserves behaviour and names it correctly.

export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('kids_expert.question.answer');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { answer_text } = await request.json().catch(() => ({}));
  if (!answer_text) return NextResponse.json({ error: 'answer_text required' }, { status: 400 });

  const service = createServiceClient();

  // Permission gate #2: ownership scope. Resolve the question's session
  // and require the caller to be either the session's assigned expert
  // or a moderator-level role.
  const { data: question } = await service
    .from('kid_expert_questions')
    .select('id, session_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: session } = await service
    .from('kid_expert_sessions')
    .select('id, expert_id')
    .eq('id', question.session_id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwnSession = session.expert_id === user.id;
  if (!isOwnSession) {
    const roles = await getUserRoles(null, user.id);
    const isMod = (roles || []).some((r) => EDITOR_ROLES.has(r.name?.toLowerCase?.()));
    if (!isMod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await service
    .from('kid_expert_questions')
    .update({
      answer_text,
      is_approved: true,
      answered_at: new Date().toISOString(),
    })
    .eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'expert_sessions.questions.id.answer',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
