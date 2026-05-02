/**
 * POST  /api/admin/newsroom/outlets/mute
 *   body: { outlet_name, days, reason? }
 *   Mutes an outlet for N days. If the outlet is already muted, extends
 *   to GREATEST(existing, new) via the upsert_muted_outlet RPC.
 *   Returns { ok: true, muted_until: ISO }
 *
 * DELETE /api/admin/newsroom/outlets/mute
 *   body: { outlet_name }
 *   Removes an active mute immediately.
 *   Returns { ok: true }
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_mutate (60/60s, shared bucket)
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

const PostSchema = z.object({
  outlet_name: z.string().min(1).max(100),
  days: z.number().int().min(1).max(30),
  reason: z.string().max(500).optional(),
});

const DeleteSchema = z.object({
  outlet_name: z.string().min(1).max(100),
});

async function gate(): Promise<{ actorId: string } | NextResponse> {
  const supabase = createClient();
  let actor;
  try {
    actor = await requirePermission(
      ['newsroom.skip', 'admin.pipeline.clusters.manage'],
      supabase
    );
  } catch (err) {
    return permissionError(err);
  }
  return { actorId: actor.id as string };
}

async function rateLimit(actorId: string, service: ReturnType<typeof createServiceClient>): Promise<NextResponse | null> {
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

export async function POST(req: Request) {
  const gateResult = await gate();
  if (gateResult instanceof NextResponse) return gateResult;
  const { actorId } = gateResult;

  const service = createServiceClient();
  const rlRes = await rateLimit(actorId, service);
  if (rlRes) return rlRes;

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 422 }
    );
  }
  const { outlet_name, days, reason } = parsed.data;

  type RpcResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;
  const { data: mutedUntil, error } = await (
    service.rpc as unknown as (name: string, args: Record<string, unknown>) => RpcResult<string>
  )('upsert_muted_outlet', {
    p_outlet_name: outlet_name,
    p_days: days,
    p_muted_by: actorId,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error('[newsroom.outlets.mute.upsert]', error.message);
    return NextResponse.json({ error: 'Could not mute outlet' }, { status: 500 });
  }

  try {
    await recordAdminAction({
      action: 'outlet.mute',
      targetTable: 'muted_outlets',
      newValue: { outlet_name, days, muted_until: mutedUntil, reason },
    });
  } catch (auditErr) {
    console.error('[newsroom.outlets.mute.audit]', auditErr);
  }

  return NextResponse.json({ ok: true, muted_until: mutedUntil });
}

export async function DELETE(req: Request) {
  const gateResult = await gate();
  if (gateResult instanceof NextResponse) return gateResult;
  const { actorId } = gateResult;

  const service = createServiceClient();
  const rlRes = await rateLimit(actorId, service);
  if (rlRes) return rlRes;

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 422 }
    );
  }
  const { outlet_name } = parsed.data;

  type RpcResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;
  const { data: deleted, error } = await (
    service.rpc as unknown as (name: string, args: Record<string, unknown>) => RpcResult<boolean>
  )('delete_muted_outlet', {
    p_outlet_name: outlet_name,
  });
  if (error) {
    console.error('[newsroom.outlets.mute.delete]', error.message);
    return NextResponse.json({ error: 'Could not unmute outlet' }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: 'Outlet is not currently muted' }, { status: 404 });
  }

  try {
    await recordAdminAction({
      action: 'outlet.unmute',
      targetTable: 'muted_outlets',
      newValue: { outlet_name },
    });
  } catch (auditErr) {
    console.error('[newsroom.outlets.mute.audit]', auditErr);
  }

  return NextResponse.json({ ok: true });
}
