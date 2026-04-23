/**
 * F7 Newsroom Redesign — /api/admin/newsroom/clusters/:id/dismiss
 *
 * POST   → dismiss_cluster (operator marked not-newsworthy)
 * DELETE → undismiss_cluster (restore to default view)
 *
 * Both wrap SECURITY DEFINER RPCs. dismiss_cluster captures auth.uid() into
 * `dismissed_by`, so the dismiss POST runs the RPC on the cookie-scoped
 * client (the service client has no session). undismiss has no such
 * requirement and runs on the service client.
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_mutate (60 / 60s, per user) — shared bucket
 *   across POST+DELETE so an operator toggling rapidly can't sidestep it.
 * Audit: cluster.dismiss / cluster.undismiss
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
const MAX_REASON = 500;

type RpcCall = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1. Auth + permission gate.
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

  // 2. Rate limit.
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

  // 3. Body parse.
  let body: { reason?: unknown } = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  let reason: string | null = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string' }, { status: 422 });
    }
    const trimmed = body.reason.trim();
    if (trimmed.length > MAX_REASON) {
      return NextResponse.json(
        { error: `reason may not exceed ${MAX_REASON} characters` },
        { status: 422 }
      );
    }
    reason = trimmed.length === 0 ? null : trimmed;
  }

  // 4. RPC. dismiss_cluster captures auth.uid() into dismissed_by, so we
  //    invoke on the cookie-scoped client (carries the admin's JWT). The
  //    service client above is kept for the rate-limit RPC + audit lookup.
  const authed = createClient();
  const rpc = authed.rpc as unknown as RpcCall;
  const { data, error } = await rpc('dismiss_cluster', {
    p_cluster_id: clusterId,
    p_reason: reason,
  });

  if (error) {
    const code = error.code;
    if (code === '22023') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
    }
    if (code === 'P0002') {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }
    console.error('[newsroom.clusters.dismiss] dismiss_cluster failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not dismiss cluster' }, { status: 500 });
  }

  // 5. Audit.
  await recordAdminAction({
    action: 'cluster.dismiss',
    targetTable: 'feed_clusters',
    targetId: clusterId,
    reason,
    oldValue: null,
    newValue: data ?? { cluster_id: clusterId, reason },
  });

  return NextResponse.json(data ?? { ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  // 1. Auth + permission gate.
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

  // 2. Rate limit (shared bucket with POST so toggle storms can't sidestep).
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

  // 3. RPC — undismiss has no auth.uid() capture, service client is fine.
  const rpc = service.rpc as unknown as RpcCall;
  const { data, error } = await rpc('undismiss_cluster', {
    p_cluster_id: clusterId,
  });

  if (error) {
    const code = error.code;
    if (code === '22023') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
    }
    if (code === 'P0002') {
      return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
    }
    console.error('[newsroom.clusters.dismiss] undismiss_cluster failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not restore cluster' }, { status: 500 });
  }

  // 4. Audit.
  await recordAdminAction({
    action: 'cluster.undismiss',
    targetTable: 'feed_clusters',
    targetId: clusterId,
    reason: null,
    oldValue: null,
    newValue: data ?? { cluster_id: clusterId },
  });

  return NextResponse.json(data ?? { ok: true });
}
