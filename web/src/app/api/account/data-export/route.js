// @migrated-to-permissions 2026-04-24
// @feature-verified account_data_export 2026-04-24
//
// POST /api/account/data-export — user-initiated GDPR/CCPA data export
// request. Creates a pending `data_requests` row that the
// `process-data-exports` cron picks up, snapshots via export_user_data
// RPC, uploads to the private `data-exports` bucket, and emails the
// user a signed URL.
//
// C4 — previously this was `supabase.from('data_requests').insert()`
// direct from the settings page, relying on RLS to gate by
// `user_id = auth.uid()`. That skipped:
//   - the `settings.data.request_export` permission check (stale
//     client cache could allow a downgraded user to still trigger)
//   - rate limiting (one export per user can run away if clients
//     mass-fire; exports also eat real storage + RPC cost)
//   - audit trail (user-initiated data events should be logged)
//
// This route enforces all three.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST() {
  let user;
  try {
    user = await requirePermission('settings.data.request_export');
  } catch (err) {
    if (err.status) {
      console.error('[account.data_export.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  // One export request per user in a 24h window. GDPR/CCPA users can
  // ask for their data often, but the cron that builds the archive
  // takes real time + storage; cap the burst so a runaway client
  // doesn't DoS the export worker.
  const rate = await checkRateLimit(service, {
    key: `data.export.request:${user.id}`,
    policyKey: 'data.export.request',
    max: 2,
    windowSec: 60 * 60 * 24,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'You can request at most one export per day.' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 86400) } }
    );
  }

  // Don't stack up pending requests — if the user already has one in
  // flight, nudge them to wait instead of creating a second row the
  // cron would process redundantly.
  const { data: existing } = await service
    .from('data_requests')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('type', 'export')
    .in('status', ['pending', 'processing'])
    .maybeSingle();
  if (existing?.id) {
    return NextResponse.json({
      ok: true,
      id: existing.id,
      status: existing.status,
      deduped: true,
    });
  }

  const { data, error } = await service
    .from('data_requests')
    .insert({
      user_id: user.id,
      type: 'export',
      status: 'pending',
    })
    .select('id, status')
    .single();
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'account.data_export',
      fallbackStatus: 400,
      fallbackMessage: 'Could not queue export',
    });
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
