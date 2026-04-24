// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  let user;
  try {
    user = await requirePermission('kids.parent.household_kpis');
  } catch (err) {
    {
      console.error('[kids.household-kpis.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

  const service = createServiceClient();
  const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: coAdultRows }, { data: kidRows }, { data: ownerRow }] = await Promise.all([
    service
      .from('subscriptions')
      .select('user_id')
      .eq('family_owner_id', user.id)
      .eq('status', 'active'),
    service
      .from('kid_profiles')
      .select('id, display_name, streak_current')
      .eq('parent_user_id', user.id),
    service
      .from('users')
      .select('id, username, display_name, streak_current')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  const adultIds = [user.id, ...(coAdultRows || []).map((r) => r.user_id).filter(Boolean)];
  const kidIds = (kidRows || []).map((k) => k.id);

  const [readsRes, quizRes] = await Promise.all([
    service
      .from('reading_log')
      .select('time_spent_seconds, completed, user_id, kid_profile_id')
      .gte('created_at', sinceIso)
      .eq('completed', true)
      .or(
        [
          `user_id.in.(${adultIds.join(',')})`,
          kidIds.length ? `kid_profile_id.in.(${kidIds.join(',')})` : null,
        ]
          .filter(Boolean)
          .join(',')
      ),
    service
      .from('quiz_attempts')
      .select('user_id, kid_profile_id, article_id, attempt_number, is_correct')
      .gte('created_at', sinceIso)
      .or(
        [
          `user_id.in.(${adultIds.join(',')})`,
          kidIds.length ? `kid_profile_id.in.(${kidIds.join(',')})` : null,
        ]
          .filter(Boolean)
          .join(',')
      ),
  ]);

  const reads = readsRes?.data || [];
  const quizRows = quizRes?.data || [];

  const articles = reads.length;
  const minutes = Math.round(reads.reduce((sum, r) => sum + (r.time_spent_seconds || 0), 0) / 60);

  const attemptCorrects = new Map();
  for (const row of quizRows) {
    const actor = row.kid_profile_id || row.user_id;
    if (!actor || !row.article_id || row.attempt_number == null) continue;
    const key = `${actor}|${row.article_id}|${row.attempt_number}`;
    attemptCorrects.set(key, (attemptCorrects.get(key) || 0) + (row.is_correct ? 1 : 0));
  }
  let quizzesPassed = 0;
  for (const count of attemptCorrects.values()) {
    if (count >= 3) quizzesPassed += 1;
  }

  const members = [];
  if (ownerRow) {
    members.push({
      kind: 'adult',
      name: ownerRow.display_name || ownerRow.username || 'You',
      streak: ownerRow.streak_current || 0,
    });
  }
  if (adultIds.length > 1) {
    const coIds = adultIds.slice(1);
    const { data: coRows } = await service
      .from('users')
      .select('display_name, username, streak_current')
      .in('id', coIds);
    for (const r of coRows || []) {
      members.push({
        kind: 'adult',
        name: r.display_name || r.username || 'Adult',
        streak: r.streak_current || 0,
      });
    }
  }
  for (const k of kidRows || []) {
    members.push({
      kind: 'kid',
      name: k.display_name || 'Kid',
      streak: k.streak_current || 0,
    });
  }

  let longest = { streak: 0, name: '', kind: null };
  for (const m of members) {
    if (m.streak > longest.streak) longest = { streak: m.streak, name: m.name, kind: m.kind };
  }

  return NextResponse.json({
    window_days: 7,
    articles,
    minutes,
    quizzes_passed: quizzesPassed,
    longest_streak: longest,
    family_size: members.length,
  });
}
