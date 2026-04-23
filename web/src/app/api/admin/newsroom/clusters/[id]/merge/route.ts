/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/:id/merge
 *
 * Merges all items from the path-param source cluster into the body
 * `target_id` cluster, then soft-archives the source. Wraps SECURITY
 * DEFINER RPC `merge_clusters` which enforces same-audience.
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_mutate (60 / 60s, per user)
 * Audit: cluster.merge
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
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.clusters.manage', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;
  const sourceId = params.id;

  if (!UUID_RE.test(sourceId)) {
    return NextResponse.json({ error: 'Invalid cluster id' }, { status: 400 });
  }

  const service = createServiceClient();

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

  let body: { target_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  const targetId = typeof body.target_id === 'string' ? body.target_id : null;
  if (!targetId || !UUID_RE.test(targetId)) {
    return NextResponse.json({ error: 'target_id must be a uuid' }, { status: 422 });
  }
  if (targetId === sourceId) {
    return NextResponse.json({ error: 'source and target must differ' }, { status: 422 });
  }

  const rpc = service.rpc as unknown as RpcCall;
  const { data, error } = await rpc('merge_clusters', {
    p_source_id: sourceId,
    p_target_id: targetId,
  });

  if (error) {
    const code = error.code;
    if (code === '22023') {
      const isAudience = /audience/i.test(error.message);
      return NextResponse.json(
        { error: isAudience ? 'Cannot merge across audiences' : 'Invalid request' },
        { status: isAudience ? 409 : 422 }
      );
    }
    if (code === 'P0002') {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }
    console.error('[newsroom.clusters.merge] merge_clusters failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not merge clusters' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'cluster.merge',
    targetTable: 'feed_clusters',
    targetId: sourceId,
    reason: null,
    oldValue: { source_id: sourceId },
    newValue: data ?? { source_id: sourceId, target_id: targetId },
  });

  return NextResponse.json(data ?? { ok: true });
}
