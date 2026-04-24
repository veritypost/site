// @migrated-to-permissions 2026-04-18
// @feature-verified recap 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function GET(request) {
  let user;
  try {
    user = await requirePermission('recap.list.view');
  } catch (err) {
    if (err.status === 403) return NextResponse.json({ recaps: [], paid: false });
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: err.status || 401 }
    );
  }

  const service = createServiceClient();

  // Current week = Monday-starting window.
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const url = new URL(request.url);
  const category = url.searchParams.get('category_id');

  let q = service
    .from('weekly_recap_quizzes')
    .select('*, categories(name)')
    .eq('is_active', true)
    .gte('week_end', weekStartStr)
    .order('week_start', { ascending: false });
  if (category) q = q.eq('category_id', category);

  const { data, error } = await q;
  if (error) return safeErrorResponse(NextResponse, error, { route: 'recap', fallbackStatus: 400 });

  // Existing attempt per recap so the UI can badge completed.
  const ids = (data || []).map((r) => r.id);
  let attempts = [];
  if (ids.length > 0) {
    const { data: a } = await service
      .from('weekly_recap_attempts')
      .select('recap_quiz_id, score, total_questions, completed_at')
      .eq('user_id', user.id)
      .in('recap_quiz_id', ids);
    attempts = a || [];
  }
  const byRecap = Object.fromEntries(attempts.map((x) => [x.recap_quiz_id, x]));

  return NextResponse.json({
    recaps: (data || []).map((r) => ({ ...r, my_attempt: byRecap[r.id] || null })),
    paid: true,
  });
}
