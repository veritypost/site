// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';

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
// T229 — Vercel Hobby maxDuration ceiling. Two-tier risk at scale: (a) the
// run itself can be killed mid-loop (handled by L5 concurrency cap above);
// (b) when the run is killed, the 'start' heartbeat we wrote at line 27
// stays orphaned with no matching 'end' or 'error' phase, so an operator
// looking at webhook_log can't distinguish "cron ran but timed out" from
// "cron crashed early." Need a separate global cron route that periodically
// scans webhook_log for `cron:*:start` rows older than maxDuration + grace
// (e.g. 90s) without a paired terminal phase, and writes a synthetic
// `cron:*:timeout` heartbeat. Out of scope for this PR; track as T229.
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

    // L5: sequential await exceeded maxDuration=60 at scale. 10k active
    // users × ~10ms per RPC round-trip = 100s and the cron was silently
    // truncated — the last N users skipped (achievement_events never
    // fires for them, next tick re-covers) with no observable error.
    // Parallelize with a concurrency cap so we don't burn the Supabase
    // connection pool. 10 in flight keeps per-tick latency under 1s per
    // 1k users at Vercel's cold-start budget while staying well below
    // the 60-connection default pool.
    const userIds = [...ids];
    const CONCURRENCY = 10;
    let awarded = 0;
    let failed = 0;
    let cursor = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= userIds.length) return;
        try {
          const { data } = await service.rpc('check_user_achievements', {
            p_user_id: userIds[idx],
          });
          awarded += (data || []).length;
        } catch (err) {
          failed += 1;
          console.error('[cron.check-achievements] user rpc failed:', userIds[idx], err);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    await logCronHeartbeat(CRON_NAME, 'end', { users: userIds.length, awarded, failed });
    return NextResponse.json({
      users: userIds.length,
      awarded,
      failed,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

export const GET = withCronLog('check-user-achievements', run);
export const POST = withCronLog('check-user-achievements', run);
