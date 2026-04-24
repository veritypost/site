/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/:id/archive
 *
 * Soft-archives a cluster (hides from default Newsroom view, preserves
 * audit trail). Wraps SECURITY DEFINER RPC `archive_cluster`. Idempotent
 * at the RPC level — re-archiving keeps the original archived_at.
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_mutate (60 / 60s, per user)
 * Audit: cluster.archive
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

  // Body is optional (reason). Tolerate missing/empty body.
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

  // M7 — pre-check archived_at so we can skip writing a duplicate audit
  // row when the cluster is already archived. The RPC itself is idempotent
  // at the data layer (COALESCE preserves the original archived_at), but
  // recordAdminAction was firing on every call, generating one audit row
  // per click. Rapid double-clicks produced a phantom-audit-trail.
  const { data: existing, error: existingErr } = await service
    .from('feed_clusters')
    .select('id, archived_at')
    .eq('id', clusterId)
    .maybeSingle();

  if (existingErr) {
    console.error('[newsroom.clusters.archive] cluster lookup failed:', existingErr.message);
    Sentry.captureException(existingErr);
    return NextResponse.json({ error: 'Could not archive cluster' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
  }
  const wasAlreadyArchived = existing.archived_at != null;

  const rpc = service.rpc as unknown as RpcCall;
  const { data, error } = await rpc('archive_cluster', {
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
    console.error('[newsroom.clusters.archive] archive_cluster failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not archive cluster' }, { status: 500 });
  }

  if (!wasAlreadyArchived) {
    await recordAdminAction({
      action: 'cluster.archive',
      targetTable: 'feed_clusters',
      targetId: clusterId,
      reason,
      oldValue: null,
      newValue: data ?? { cluster_id: clusterId, reason },
    });
  }

  return NextResponse.json(data ?? { ok: true });
}
