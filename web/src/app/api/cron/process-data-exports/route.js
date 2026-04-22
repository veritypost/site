// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Phase 19.1: picks up verified pending export requests, snapshots
// the user's data via the export_user_data RPC, uploads it to the
// private 'data-exports' bucket, writes a 7-day signed URL back onto
// the data_requests row, and fires an in-app notification.
// One request per run keeps memory bounded; schedule the cron
// frequently (every 15 minutes) so queue depth doesn't build.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'data-exports';
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function run(request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();

  const { data: claimed, error: claimErr } = await service.rpc('claim_next_export_request');
  if (claimErr) {
    console.error('[cron.process-data-exports] claim failed:', claimErr);
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }
  if (!claimed || !claimed.id) {
    return NextResponse.json({ processed: 0, ran_at: new Date().toISOString() });
  }

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

    const { data: signed, error: signErr } = await service.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr) throw new Error(`sign: ${signErr.message}`);

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    await service
      .from('data_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        download_url: signed.signedUrl,
        download_expires_at: expiresAt,
        file_size_bytes: size,
      })
      .eq('id', claimed.id);

    // In-app notification; the send-emails cron will fan out email.
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

    return NextResponse.json({
      processed: 1,
      request_id: claimed.id,
      size_bytes: size,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    await service
      .from('data_requests')
      .update({
        status: 'pending',
        processing_started_at: null,
        notes: `worker error: ${err.message}`,
      })
      .eq('id', claimed.id);
    console.error('[cron.process-data-exports] worker error:', err);
    return NextResponse.json({ error: 'Worker error', request_id: claimed.id }, { status: 500 });
  }
}

export const GET = withCronLog('process-data-exports', run);
export const POST = withCronLog('process-data-exports', run);
