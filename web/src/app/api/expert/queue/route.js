// @migrated-to-permissions 2026-04-18
// @feature-verified expert_queue 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/expert/queue — list queue items visible to the caller.
// Experts see pending items in their categories + directed at them,
// plus items they've claimed and answered.
export async function GET(request) {
  let user;
  try { user = await requirePermission('expert.queue.view'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  // Get category IDs this user is approved for.
  const { data: catRows } = await service
    .from('expert_application_categories')
    .select('category_id, expert_applications!inner(user_id, status)')
    .eq('expert_applications.user_id', user.id)
    .eq('expert_applications.status', 'approved');
  const categoryIds = (catRows || []).map(r => r.category_id);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  let q = service
    .from('expert_queue_items')
    .select('*, comments!fk_expert_queue_items_comment_id(id, body, created_at, users!fk_comments_user_id(username, avatar_color)), answer:comments!fk_expert_queue_items_answer_comment_id(id, status), articles(title, slug)')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (status === 'pending') {
    // Pending: categories I cover OR targeted at me.
    const orParts = [];
    if (categoryIds.length > 0) {
      orParts.push(`and(target_type.eq.category,target_category_id.in.(${categoryIds.join(',')}))`);
    }
    orParts.push(`and(target_type.eq.expert,target_expert_id.eq.${user.id})`);
    q = q.or(orParts.join(','));
  } else if (status === 'claimed' || status === 'answered') {
    q = q.eq('claimed_by', user.id);
  }

  const { data, error } = await q;
  if (error) return safeErrorResponse(NextResponse, error, { route: 'expert.queue', fallbackStatus: 400 });
  return NextResponse.json({ items: data || [] });
}
