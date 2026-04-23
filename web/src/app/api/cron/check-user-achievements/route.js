// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/observability';

const CRON_NAME = 'check-user-achievements';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Daily sweep: runs check_user_achievements(user_id) over every user who
// had ANY activity in the last 48h (reading, quiz, comment, or a streak
// day that rolled over). Covers milestones that are time-based (e.g.,
// streak_days) without requiring an event to fire at midnight.
//
// Runs at 03:45 UTC after the overnight scoring jobs settle.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    const service = createServiceClient();
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Union of active users in the last 48h (reading + quiz + comment).
    const [{ data: readers }, { data: quizzers }, { data: commenters }] = await Promise.all([
      service.from('reading_log').select('user_id').gte('created_at', since),
      service.from('quiz_attempts').select('user_id').gte('created_at', since),
      service.from('comments').select('user_id').gte('created_at', since),
    ]);
    const ids = new Set();
    for (const r of readers || []) if (r.user_id) ids.add(r.user_id);
    for (const r of quizzers || []) if (r.user_id) ids.add(r.user_id);
    for (const r of commenters || []) if (r.user_id) ids.add(r.user_id);

    let awarded = 0;
    let users = 0;
    for (const uid of ids) {
      users += 1;
      const { data } = await service.rpc('check_user_achievements', { p_user_id: uid });
      awarded += (data || []).length;
    }

    await logCronHeartbeat(CRON_NAME, 'end', { users, awarded });
    return NextResponse.json({ users, awarded, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog('check-user-achievements', run);
export const POST = withCronLog('check-user-achievements', run);
