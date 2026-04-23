/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/:id/move-item
 *
 * Reassigns a single discovery_item (or kid_discovery_item) to a different
 * cluster within the same audience, or to no cluster (target = null → state
 * resets to 'pending'). Wraps the SECURITY DEFINER RPC `reassign_cluster_items`
 * which enforces audience match and existence.
 *
 * NB: the path-param `:id` is the *target* cluster context. The RPC takes
 * the item id + the chosen target_cluster_id from the body, so we pass
 * `target_cluster_id` straight through. Audit logs target_table=feed_clusters
 * with the path-param id (the cluster the operator is acting from).
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_mutate (60 / 60s, per user)
 * Audit: cluster.move
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

type RpcCall = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Auth + permission gate (BEFORE rate limit, BEFORE body parse).
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.clusters.manage', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;
  const clusterId = params.id;

  if (!UUID_RE.test(clusterId)) {
    return NextResponse.json({ error: 'Invalid cluster id' }, { status: 400 });
  }

  const service = createServiceClient();

  // 2. Rate limit (AFTER auth so unauth callers can't burn the bucket).
  const rl = await checkRateLimit(service, {
    key: `admin_cluster_mutate:${actorId}`,
    policyKey: 'admin_cluster_mutate',
    max: 60,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 3. Body parse + shape validation.
  let body: { item_id?: unknown; target_cluster_id?: unknown; audience?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  const itemId = typeof body.item_id === 'string' ? body.item_id : null;
  const targetClusterId =
    body.target_cluster_id === null
      ? null
      : typeof body.target_cluster_id === 'string'
        ? body.target_cluster_id
        : undefined;
  const audience = body.audience;

  if (!itemId || !UUID_RE.test(itemId)) {
    return NextResponse.json({ error: 'item_id must be a uuid' }, { status: 422 });
  }
  if (targetClusterId === undefined) {
    return NextResponse.json(
      { error: 'target_cluster_id must be a uuid or null' },
      { status: 422 }
    );
  }
  if (targetClusterId !== null && !UUID_RE.test(targetClusterId)) {
    return NextResponse.json(
      { error: 'target_cluster_id must be a uuid or null' },
      { status: 422 }
    );
  }
  if (audience !== 'adult' && audience !== 'kid') {
    return NextResponse.json({ error: "audience must be 'adult' or 'kid'" }, { status: 422 });
  }

  // 4. RPC call.
  const rpc = service.rpc as unknown as RpcCall;
  const { data, error } = await rpc('reassign_cluster_items', {
    p_item_id: itemId,
    p_target_cluster_id: targetClusterId,
    p_audience: audience,
  });

  if (error) {
    const code = error.code;
    if (code === '22023') {
      // invalid_parameter — audience mismatch is the most likely cause here.
      const isAudience = /audience/i.test(error.message);
      return NextResponse.json(
        { error: isAudience ? 'Audience mismatch' : 'Invalid request' },
        { status: isAudience ? 409 : 422 }
      );
    }
    if (code === 'P0002') {
      return NextResponse.json({ error: 'Item or target cluster not found' }, { status: 404 });
    }
    console.error('[newsroom.clusters.move-item] reassign_cluster_items failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not move item' }, { status: 500 });
  }

  // 5. Audit (best-effort).
  await recordAdminAction({
    action: 'cluster.move',
    targetTable: 'feed_clusters',
    targetId: clusterId,
    reason: null,
    oldValue: null,
    newValue: data ?? { item_id: itemId, target_cluster_id: targetClusterId, audience },
  });

  return NextResponse.json(data ?? { ok: true });
}
