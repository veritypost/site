// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';

const CRON_NAME = 'process-data-exports';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Phase 19.1: picks up verified pending export requests, snapshots
// the user's data via the export_user_data RPC, uploads it to the
// private 'data-exports' bucket, writes a 7-day signed URL back onto
// the data_requests row, and fires an in-app notification.
// One request per run keeps memory bounded; schedule the cron
// frequently (every 15 minutes) so queue depth doesn't build.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Pin to 60s — single export per run keeps memory + wall-clock bounded.
export const maxDuration = 60;

const BUCKET = 'data-exports';
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function run(request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');
  const service = createServiceClient();

  const { data: claimed, error: claimErr } = await service.rpc('claim_next_export_request');
  if (claimErr) {
    console.error('[cron.process-data-exports] claim failed:', claimErr);
    await logCronHeartbeat(CRON_NAME, 'error', { error: claimErr.message, stage: 'claim' });
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }
  if (!claimed || !claimed.id) {
    await logCronHeartbeat(CRON_NAME, 'end', { processed: 0 });
    return NextResponse.json({ processed: 0, ran_at: new Date().toISOString() });
  }

  // L6: state-machine the run so a failure in a late step doesn't reset a
  // row that's already been marked complete. Prior code caught ANY error
  // and reset status → 'pending' unconditionally, so:
  //   - upload OK + data_requests.update FAILED → reset → next tick
  //     re-uploads to a different path, re-completes with a different URL.
  //   - data_requests.update OK + create_notification FAILED → reset
  //     overwrites a completed row + second tick creates a second
  //     notification + second download URL. User emailed twice.
  //
  // Track which phase we reached, only reset if the row is still in the
  // pre-complete state AND delete any orphan blob so the storage bucket
  // doesn't accumulate dead exports. Notification is best-effort after
  // the row is marked complete — a missed notification is recoverable
  // (user sees the completed data_request in their dashboard).
  let uploadedPath = null;
  try {
    const { data: snapshot, error: snapErr } = await service.rpc('export_user_data', {
      p_user_id: claimed.user_id,
    });
    if (snapErr) throw new Error(`export_user_data: ${snapErr.message}`);

    const json = JSON.stringify(snapshot, null, 2);
    const size = new TextEncoder().encode(json).byteLength;
    const stamp = Date.now();
    const path = `${claimed.user_id}/${stamp}.json`;

    const { error: uploadErr } = await service.storage.from(BUCKET).upload(path, json, {
      contentType: 'application/json',
      upsert: false,
    });
    if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);
    uploadedPath = path;

    const { data: signed, error: signErr } = await service.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr) throw new Error(`sign: ${signErr.message}`);

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    // Guarded transition → 'completed'. Condition on status='processing' so
    // a concurrent admin mark-cancel or duplicate worker (shouldn't happen
    // under claim_next_export_request, but belt-and-braces) can't clobber.
    const { data: completed, error: updateErr } = await service
      .from('data_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        download_url: signed.signedUrl,
        download_expires_at: expiresAt,
        file_size_bytes: size,
      })
      .eq('id', claimed.id)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle();
    if (updateErr) throw new Error(`data_requests.update: ${updateErr.message}`);
    if (!completed) {
      // Row was cancelled or reclaimed by another path — drop our orphan
      // upload and exit cleanly. No notification.
      await service.storage
        .from(BUCKET)
        .remove([path])
        .catch((e) => console.warn('[cron.process-data-exports] orphan cleanup:', e));
      await logCronHeartbeat(CRON_NAME, 'end', { processed: 0, reason: 'status_changed' });
      return NextResponse.json({ processed: 0, reason: 'status_changed' });
    }

    // Row is 'completed' — from here on any failure is recoverable (user
    // can see the row + download URL in the dashboard). Notification +
    // anything after is best-effort; do NOT reset on failure.
    try {
      await service.rpc('create_notification', {
        p_user_id: claimed.user_id,
        p_type: 'data_export_ready',
        p_title: 'Your data export is ready',
        p_body: 'Your personal data archive is available to download. The link expires in 7 days.',
        p_action_url: signed.signedUrl,
        p_action_type: 'data_request',
        p_action_id: claimed.id,
        p_priority: 'normal',
        p_metadata: { data_request_id: claimed.id, expires_at: expiresAt },
      });
    } catch (notifErr) {
      console.error(
        '[cron.process-data-exports] notification failed (export still delivered):',
        notifErr
      );
    }

    await logCronHeartbeat(CRON_NAME, 'end', {
      processed: 1,
      request_id: claimed.id,
      size_bytes: size,
    });
    return NextResponse.json({
      processed: 1,
      request_id: claimed.id,
      size_bytes: size,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    // Pre-complete failure path. Reset only if the row is still in
    // 'processing' — never clobber a successful completion.
    if (uploadedPath) {
      await service.storage
        .from(BUCKET)
        .remove([uploadedPath])
        .catch((e) => console.warn('[cron.process-data-exports] upload cleanup on error:', e));
    }
    await service
      .from('data_requests')
      .update({
        status: 'pending',
        processing_started_at: null,
        notes: `worker error: ${err.message}`,
      })
      .eq('id', claimed.id)
      .eq('status', 'processing');
    console.error('[cron.process-data-exports] worker error:', err);
    await logCronHeartbeat(CRON_NAME, 'error', {
      error: err?.message || String(err),
      request_id: claimed.id,
    });
    return NextResponse.json({ error: 'Worker error', request_id: claimed.id }, { status: 500 });
  }
}

export const GET = withCronLog('process-data-exports', run);
export const POST = withCronLog('process-data-exports', run);
