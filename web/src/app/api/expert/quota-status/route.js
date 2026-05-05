// EXPERT_THREADS Wave 4a — GET /api/expert/quota-status
//
// Read-only feed for the "Today: X of Y" line under Mention caps. Returns:
//   { today_mentions: int, per_day_quota: int, today_per_post_max: int }
//
// today_mentions     — count from expert_mention_quota_counters for today (UTC).
// per_day_quota      — expert_applications.mention_quota_per_day.
// today_per_post_max — expert_applications.mention_quota_per_post (the
//                      current cap, surfaced as the per-post upper bound;
//                      the "actual today's max for any one article" is
//                      always equal to mention_quota_per_post).
//
// Auth: bearer/cookie required.

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  const supabase = createClient();
  let user;
  try {
    user = await requireAuth(supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status: err?.status ?? 401, headers: NO_STORE }
    );
  }

  const service = createServiceClient();

  // Fetch the most recent expert application for the caller. We tolerate
  // "no application" (expert hasn't applied yet — ExpertApplyForm renders
  // before this card mounts) by returning a coherent empty payload.
  const { data: appRow, error: appErr } = await service
    .from('expert_applications')
    .select('mention_quota_per_day, mention_quota_per_post')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (appErr) {
    console.error('[expert.quota-status.lookup]', appErr.message);
    return NextResponse.json(
      { error: 'Could not load application.' },
      { status: 500, headers: NO_STORE }
    );
  }

  if (!appRow) {
    return NextResponse.json(
      {
        today_mentions: 0,
        per_day_quota: 0,
        today_per_post_max: 0,
      },
      { headers: NO_STORE }
    );
  }

  // Day boundary uses UTC to match the counter table's PRIMARY KEY
  // (expert_user_id, day_utc) — the cron + RPC writers also key on UTC,
  // so we read the same partition they write to.
  const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: counterRow, error: counterErr } = await service
    .from('expert_mention_quota_counters')
    .select('count')
    .eq('expert_user_id', user.id)
    .eq('day_utc', todayUtc)
    .maybeSingle();

  if (counterErr) {
    console.error('[expert.quota-status.counter]', counterErr.message);
    // Fall through with count=0 rather than 500 — read-side display
    // failure should not blank the whole settings card.
  }

  return NextResponse.json(
    {
      today_mentions: counterRow?.count ?? 0,
      per_day_quota: appRow.mention_quota_per_day ?? 0,
      today_per_post_max: appRow.mention_quota_per_post ?? 0,
    },
    { headers: NO_STORE }
  );
}
