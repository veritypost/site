// @migrated-to-permissions 2026-04-18
// @feature-verified expert_sessions 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission, getUserRoles } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET  — list approved questions for the session. kid_profiles identity
//        is attached only for privileged viewers: the assigned expert for
//        the session, the parent who owns each kid profile, or admin+.
//        Everyone else gets the question body + timestamp only.
// POST — kid submits a question. Body: { kid_profile_id, question_text }
export async function GET(_request, { params }) {
  let user;
  try { user = await requirePermission('expert.session.questions.view'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: session } = await service
    .from('kid_expert_sessions')
    .select('id, expert_id')
    .eq('id', params.id)
    .maybeSingle();

  const roleRows = await getUserRoles(null, user.id);
  const roleNames = roleRows.map((r) => r.name);
  const isAdmin = roleNames.some((n) => ['admin', 'superadmin', 'owner', 'editor', 'moderator'].includes(n));
  const isAssignedExpert = session?.expert_id === user.id;

  const { data, error } = await service
    .from('kid_expert_questions')
    .select('*, kid_profiles(id, parent_user_id, display_name, avatar_color)')
    .eq('session_id', params.id)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const questions = (data || []).map((row) => {
    const isParentOfKid = row.kid_profiles?.parent_user_id === user.id;
    if (isAdmin || isAssignedExpert || isParentOfKid) {
      const kp = row.kid_profiles;
      return {
        ...row,
        kid_profiles: kp ? { display_name: kp.display_name, avatar_color: kp.avatar_color } : null,
      };
    }
    const { kid_profiles: _kp, kid_profile_id: _id, ...rest } = row;
    return { ...rest, kid_profiles: null };
  });

  return NextResponse.json({ questions });
}

export async function POST(request, { params }) {
  let user;
  try { user = await requirePermission('kids_expert.question.ask'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { kid_profile_id, question_text } = await request.json().catch(() => ({}));
  if (!kid_profile_id || !question_text) {
    return NextResponse.json({ error: 'kid_profile_id and question_text required' }, { status: 400 });
  }

  const service = createServiceClient();

  // Confirm the parent owns this kid profile.
  const { data: kid } = await service
    .from('kid_profiles').select('id, parent_user_id').eq('id', kid_profile_id).maybeSingle();
  if (!kid || kid.parent_user_id !== user.id) {
    return NextResponse.json({ error: 'Kid profile not accessible' }, { status: 403 });
  }

  const { data, error } = await service
    .from('kid_expert_questions')
    .insert({
      session_id: params.id,
      kid_profile_id,
      question_text,
      is_approved: false,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
