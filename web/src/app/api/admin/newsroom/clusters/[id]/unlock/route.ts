/**
 * F7 Phase 3 Task 11 — POST /api/admin/newsroom/clusters/:id/unlock
 *
 * Admin override to release a stuck feed_clusters row. Calls
 * release_cluster_lock(p_cluster_id, NULL), which bypasses the normal
 * lock-owner guard and unconditionally clears locked_by / locked_at /
 * generation_state.
 *
 * Idempotent: releasing an already-unlocked cluster returns
 *   { ok: true, released: false }
 *
 * Permission: admin.pipeline.release_cluster_lock
 * Rate limit: newsroom_cluster_unlock (10 per 60s, per user)
 * Audit: newsroom.cluster.unlock → admin_audit_log via record_admin_action
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  // 1. Permission gate — cookie-scoped client so auth.uid() resolves for
  //    downstream SECURITY DEFINER RPCs.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.release_cluster_lock', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;
  const clusterId = params.id;

  // 2. Shape check — reject obvious garbage before hitting the DB.
  if (!UUID_RE.test(clusterId)) {
    return NextResponse.json({ error: 'Invalid cluster id' }, { status: 400 });
  }

  const service = createServiceClient();

  // 3. Rate limit — DB policy: newsroom_cluster_unlock = 10/60s per user.
  const rl = await checkRateLimit(service, {
    key: `newsroom_cluster_unlock:user:${actorId}`,
    policyKey: 'newsroom_cluster_unlock',
    max: 10,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 4. Capture pre-release lock state for the audit record.
  const { data: preState, error: preErr } = await service
    .from('feed_clusters')
    .select('locked_by, locked_at, generation_state')
    .eq('id', clusterId)
    .maybeSingle();

  if (preErr) {
    console.error('[newsroom.clusters.unlock] pre-state read failed:', preErr.message);
    Sentry.captureException(preErr);
    return NextResponse.json({ error: 'Could not read cluster' }, { status: 500 });
  }
  if (!preState) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
  }

  // 5. Release lock via admin override (p_locked_by = null).
  //    release_cluster_lock isn't in the generated Database.Functions enum
  //    (post-migration — types regenerate after apply). Cast through unknown
  //    using the same pattern as adminMutation.ts → require_outranks.
  const rpcCall = service.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;

  const { data: released, error: relErr } = await rpcCall('release_cluster_lock', {
    p_cluster_id: clusterId,
    p_locked_by: null,
  });
  if (relErr) {
    console.error('[newsroom.clusters.unlock] release_cluster_lock failed:', relErr.message);
    Sentry.captureException(relErr);
    return NextResponse.json({ error: 'Could not release lock' }, { status: 500 });
  }

  // 6. Audit — best-effort (does not fail the request).
  await recordAdminAction({
    action: 'newsroom.cluster.unlock',
    targetTable: 'feed_clusters',
    targetId: clusterId,
    oldValue: preState,
    newValue: { released: !!released, actor: actorId },
  });

  return NextResponse.json({ ok: true, released: !!released });
}
