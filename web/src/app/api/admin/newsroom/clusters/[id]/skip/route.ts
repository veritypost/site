/**
 * Session A — /api/admin/newsroom/clusters/:id/skip
 *
 * Decision 9 (AI-today.md): each Story audience can be skipped
 * independently. Skipping moves the audience-state row to 'skipped';
 * un-skipping resets it to 'pending'. The Discovery toggle between
 * Active and Completed is derived from v_cluster_lifecycle, so a Story
 * with all 3 audiences resolved (generated OR skipped) drops out of
 * Active automatically.
 *
 * POST   { audience_band: 'adult'|'tweens'|'kids' } → state='skipped'
 * DELETE { audience_band: 'adult'|'tweens'|'kids' } → state='pending'
 *
 * Permission: dual-check (newsroom.skip, admin.pipeline.clusters.manage)
 *   — Session A bridge so existing admin role works without a re-grant.
 *   Session E drops the legacy half.
 * Rate limit: admin_cluster_mutate (60/60s, shared with sibling routes).
 * Audit: cluster.audience_skip / cluster.audience_unskip.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  audience_band: z.enum(['adult', 'tweens', 'kids']),
});

async function gate(): Promise<{ actorId: string } | NextResponse> {
  const supabase = createClient();
  let actor;
  try {
    actor = await requirePermission(['newsroom.skip', 'admin.pipeline.clusters.manage'], supabase);
  } catch (err) {
    return permissionError(err);
  }
  return { actorId: actor.id as string };
}

async function rateLimit(actorId: string): Promise<NextResponse | null> {
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
  return null;
}

async function parseAudienceBand(req: Request): Promise<'adult' | 'tweens' | 'kids' | NextResponse> {
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'audience_band must be adult|tweens|kids' }, { status: 422 });
  }
  return parsed.data.audience_band;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gateResult = await gate();
  if (gateResult instanceof NextResponse) return gateResult;
  const { actorId } = gateResult;

  const clusterId = params.id;
  if (!UUID_RE.test(clusterId)) {
    return NextResponse.json({ error: 'Invalid cluster id' }, { status: 400 });
  }

  const rateRes = await rateLimit(actorId);
  if (rateRes) return rateRes;

  const audienceBand = await parseAudienceBand(req);
  if (audienceBand instanceof NextResponse) return audienceBand;

  const service = createServiceClient();
  const skippedAt = new Date().toISOString();
  const { error: updErr } = await service
    .from('feed_cluster_audience_state')
    .update({
      state: 'skipped',
      skipped_by: actorId,
      skipped_at: skippedAt,
    })
    .eq('cluster_id', clusterId)
    .eq('audience_band', audienceBand);
  if (updErr) {
    console.error('[newsroom.clusters.skip.update]', updErr.message);
    return NextResponse.json({ error: 'Could not skip audience' }, { status: 500 });
  }

  try {
    await recordAdminAction({
      action: 'cluster.audience_skip',
      targetTable: 'feed_cluster_audience_state',
      targetId: clusterId,
      newValue: { cluster_id: clusterId, audience_band: audienceBand, skipped_at: skippedAt },
    });
  } catch (auditErr) {
    console.error('[newsroom.clusters.skip.audit]', auditErr);
  }

  return NextResponse.json({ ok: true, cluster_id: clusterId, audience_band: audienceBand });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gateResult = await gate();
  if (gateResult instanceof NextResponse) return gateResult;
  const { actorId } = gateResult;

  const clusterId = params.id;
  if (!UUID_RE.test(clusterId)) {
    return NextResponse.json({ error: 'Invalid cluster id' }, { status: 400 });
  }

  const rateRes = await rateLimit(actorId);
  if (rateRes) return rateRes;

  const audienceBand = await parseAudienceBand(req);
  if (audienceBand instanceof NextResponse) return audienceBand;

  const service = createServiceClient();
  const { error: updErr } = await service
    .from('feed_cluster_audience_state')
    .update({
      state: 'pending',
      skipped_by: null,
      skipped_at: null,
    })
    .eq('cluster_id', clusterId)
    .eq('audience_band', audienceBand)
    .eq('state', 'skipped');
  if (updErr) {
    console.error('[newsroom.clusters.skip.unskip]', updErr.message);
    return NextResponse.json({ error: 'Could not un-skip audience' }, { status: 500 });
  }

  try {
    await recordAdminAction({
      action: 'cluster.audience_unskip',
      targetTable: 'feed_cluster_audience_state',
      targetId: clusterId,
      newValue: { cluster_id: clusterId, audience_band: audienceBand },
    });
  } catch (auditErr) {
    console.error('[newsroom.clusters.skip.audit]', auditErr);
  }

  return NextResponse.json({ ok: true, cluster_id: clusterId, audience_band: audienceBand });
}
