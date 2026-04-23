// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { safeErrorResponse } from '@/lib/apiErrors';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Phase 19.2: daily sweep that anonymizes every account whose 30-day
// deletion grace period has expired. Batch size is enforced inside the
// sweep RPC (LIMIT 500 per run).
//
// Apple Guideline 5.1.1.v: deletion must be unrecoverable. The SQL
// `anonymize_user` scrubs PII in `public.users`, but the `auth.users`
// credential row remains and could allow sign-in via an OAuth re-link
// (the rotated email + nulled password_hash close most paths, but the
// row itself is what Apple reviewers look for). After the sweep
// succeeds, enumerate the just-anonymized users and delete their
// GoTrue auth rows via the admin API.
//
// `sweep_expired_deletions` returns the count of anonymized rows but
// not their IDs. We re-query for users whose `deletion_completed_at`
// landed within the last 24h AND whose auth row still exists; that's
// the set the sweep just produced (the anonymize RPC sets
// `deletion_completed_at = now()`). A failed `auth.admin.deleteUser`
// is logged but does not fail the cron — the next run retries.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data: anonymizedCount, error } = await service.rpc('sweep_expired_deletions');
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'cron.process_deletions',
      fallbackStatus: 500,
    });

  // Find rows that just completed anonymization and still need their
  // auth.users credential dropped. The 25-hour window is generous
  // enough to retry stragglers from the previous run.
  let authDeleted = 0;
  let authFailed = 0;
  if ((anonymizedCount ?? 0) > 0) {
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { data: candidates, error: candErr } = await service
      .from('users')
      .select('id')
      .not('deletion_completed_at', 'is', null)
      .gte('deletion_completed_at', since)
      .limit(1000);
    if (candErr) {
      console.error('[cron.process_deletions] candidate query', candErr);
    } else if (candidates?.length) {
      for (const row of candidates) {
        try {
          // `auth.admin.deleteUser` 404s for already-deleted rows,
          // which is fine. Any other failure: log and continue.
          const { error: delErr } = await service.auth.admin.deleteUser(row.id);
          if (delErr) {
            const msg = (delErr.message || '').toLowerCase();
            if (msg.includes('user not found') || msg.includes('not_found')) {
              // Already removed in a prior run — count as success.
              authDeleted++;
            } else {
              authFailed++;
              console.error('[cron.process_deletions] auth delete', row.id, delErr.message);
            }
          } else {
            authDeleted++;
          }
        } catch (e) {
          authFailed++;
          console.error('[cron.process_deletions] auth delete throw', row.id, e?.message);
        }
      }
    }
  }

  return NextResponse.json({
    anonymized_count: anonymizedCount,
    auth_rows_deleted: authDeleted,
    auth_rows_failed: authFailed,
    ran_at: new Date().toISOString(),
  });
}

export const GET = withCronLog('process-deletions', run);
export const POST = withCronLog('process-deletions', run);
