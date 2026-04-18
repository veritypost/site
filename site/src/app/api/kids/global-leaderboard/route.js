import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// D12 (2026-04-16 clarification): kids-only global leaderboard.
// - Kid-surface only — callers must have an active kid profile they own.
// - Returns display_name + score + id only. No parent info.
// - Adult leaderboard queries `users`, so kids and adults stay separated.
//
// Chunk 6a: the exposure is now opt-in. Only kids whose parent has
// toggled `global_leaderboard_opt_in = true` appear in the result.
// The caller's own opt-in state is returned as `self_opt_in` so the
// client can render an opt-in CTA (instead of an artificially-narrow
// ranking) when self is not participating.
export async function GET(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const url = new URL(request.url);
  const activeKidId = url.searchParams.get('kid_profile_id');
  if (!activeKidId) {
    return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: owned } = await service
    .from('kid_profiles')
    .select('id, global_leaderboard_opt_in')
    .eq('id', activeKidId)
    .eq('parent_user_id', user.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: 'Kid profile not accessible' }, { status: 403 });
  }

  const selfOptIn = !!owned.global_leaderboard_opt_in;
  const categoryId = url.searchParams.get('category_id');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);

  // Short-circuit: if self isn't opted in, return an empty ranking +
  // the opt-in signal. The client renders a CTA panel, not a partial
  // leaderboard that would inflate self's rank.
  if (!selfOptIn) {
    return NextResponse.json({
      scope: categoryId ? 'category' : 'global',
      rows: [],
      self_opt_in: false,
    });
  }

  if (categoryId) {
    const { data, error } = await service
      .from('category_scores')
      .select('kid_profile_id, score, kid_profiles!inner(id, display_name, verity_score, global_leaderboard_opt_in)')
      .eq('category_id', categoryId)
      .eq('kid_profiles.global_leaderboard_opt_in', true)
      .not('kid_profile_id', 'is', null)
      .order('score', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const rows = (data || []).map(r => ({
      id: r.kid_profile_id,
      display_name: r.kid_profiles?.display_name || 'Unknown',
      score: r.score ?? 0,
    }));
    return NextResponse.json({ scope: 'category', rows, self_opt_in: true });
  }

  const { data, error } = await service
    .from('kid_profiles')
    .select('id, display_name, verity_score')
    .eq('is_active', true)
    .eq('global_leaderboard_opt_in', true)
    .order('verity_score', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const rows = (data || []).map(r => ({
    id: r.id,
    display_name: r.display_name || 'Unknown',
    score: r.verity_score ?? 0,
  }));
  return NextResponse.json({ scope: 'global', rows, self_opt_in: true });
}
