// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { safeErrorResponse } from '@/lib/apiErrors';
import { captureException } from '@/lib/observability';

const CRON_NAME = 'process-deletions';

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
// Pin to 60s — sweep RPC limits 500 rows/run; fails loudly if it drags.
export const maxDuration = 60;

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  try {
    return await runInner();
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err) });
    throw err;
  }
}

async function runInner() {
  const service = createServiceClient();
  const { data: anonymizedCount, error } = await service.rpc('sweep_expired_deletions');
  if (error) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: error.message });
    return safeErrorResponse(NextResponse, error, {
      route: 'cron.process_deletions',
      fallbackStatus: 500,
    });
  }

  // BugList #7 — query the unbounded backlog of anonymized rows whose
  // auth credential is still alive (deletion_auth_purged_at IS NULL).
  // The previous 25-hour window meant a single bad cron run stranded
  // those rows forever; the partial index keeps this cheap. Cap at
  // 1000/run for cron timeout safety; the query naturally drains as
  // rows get stamped purged.
  let authDeleted = 0;
  let authFailed = 0;
  let authPaged = 0;
  const { data: candidates, error: candErr } = await service
    .from('users')
    .select('id, deletion_auth_retry_count')
    .not('deletion_completed_at', 'is', null)
    .is('deletion_auth_purged_at', null)
    .limit(1000);
  if (candErr) {
    console.error('[cron.process_deletions] candidate query', candErr);
    await captureException(candErr, { cron: CRON_NAME, phase: 'candidate_query' });
  } else if (candidates?.length) {
    for (const row of candidates) {
      const nowIso = new Date().toISOString();
      try {
        const { error: delErr } = await service.auth.admin.deleteUser(row.id);
        // Prefer structured status; fall back to message-match for
        // older SDK versions. Same fragility note as deletedAccountGate.ts.
        const errStatus = delErr?.status;
        const msg = (delErr?.message || '').toLowerCase();
        const looksLikeAlreadyGone =
          errStatus === 404 ||
          msg.includes('user not found') ||
          msg.includes('not_found') ||
          msg.includes('not found');
        if (!delErr || looksLikeAlreadyGone) {
          // Conditional WHERE on _purged_at IS NULL — if a parallel
          // login-time gate already stamped the column, don't write
          // again (and especially don't reset retry_at).
          const { error: upErr } = await service
            .from('users')
            .update({
              deletion_auth_purged_at: nowIso,
              deletion_auth_retry_at: nowIso,
            })
            .eq('id', row.id)
            .is('deletion_auth_purged_at', null);
          if (upErr) {
            console.error('[cron.process_deletions] purge stamp failed', row.id, upErr.message);
          }
          authDeleted++;
        } else {
          authFailed++;
          await service.rpc('increment_deletion_auth_retry', { p_user_id: row.id });
          const nextCount = (row.deletion_auth_retry_count ?? 0) + 1;
          // Page on the 5th failure for a given row — surfaces an
          // honest auth API regression (vs. transient outage that
          // self-heals on the next nightly run).
          if (nextCount >= 5) {
            authPaged++;
            await captureException(new Error(delErr.message || 'auth deleteUser failed'), {
              cron: CRON_NAME,
              user_id: row.id,
              retry_count: nextCount,
              phase: 'auth_delete',
            });
          }
          console.error('[cron.process_deletions] auth delete', row.id, delErr.message);
        }
      } catch (e) {
        authFailed++;
        await service.rpc('increment_deletion_auth_retry', { p_user_id: row.id });
        const nextCount = (row.deletion_auth_retry_count ?? 0) + 1;
        if (nextCount >= 5) {
          authPaged++;
          await captureException(e, {
            cron: CRON_NAME,
            user_id: row.id,
            retry_count: nextCount,
            phase: 'auth_delete_throw',
          });
        }
        console.error('[cron.process_deletions] auth delete throw', row.id, e?.message);
      }
    }
  }

  await logCronHeartbeat(CRON_NAME, 'end', {
    anonymized_count: anonymizedCount,
    auth_rows_deleted: authDeleted,
    auth_rows_failed: authFailed,
    auth_rows_paged: authPaged,
  });
  return NextResponse.json({
    anonymized_count: anonymizedCount,
    auth_rows_deleted: authDeleted,
    auth_rows_failed: authFailed,
    auth_rows_paged: authPaged,
    ran_at: new Date().toISOString(),
  });
}

export const GET = withCronLog('process-deletions', run);
export const POST = withCronLog('process-deletions', run);
