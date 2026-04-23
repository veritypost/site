/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/:id/split
 *
 * Creates a new sibling cluster (same audience + category as the source)
 * and moves the supplied item_ids into it. Wraps SECURITY DEFINER RPC
 * `split_cluster`.
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_mutate (60 / 60s, per user)
 * Audit: cluster.split
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
// Title/summary caps — match the Newsroom UI inputs (Stream 6) and prevent
// arbitrary-size writes via API.
const MAX_TITLE = 200;
const MAX_SUMMARY = 2000;
// Defensive cap on items per call. Splits are operator-driven; >500 items in
// a single click is almost certainly a mistake (and the RPC takes a row lock).
const MAX_ITEMS = 500;

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

  let body: { item_ids?: unknown; title?: unknown; summary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  if (!Array.isArray(body.item_ids) || body.item_ids.length === 0) {
    return NextResponse.json({ error: 'item_ids must be a non-empty array' }, { status: 422 });
  }
  if (body.item_ids.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `item_ids may not exceed ${MAX_ITEMS} entries` },
      { status: 422 }
    );
  }
  const itemIds: string[] = [];
  for (const raw of body.item_ids) {
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
      return NextResponse.json({ error: 'item_ids must all be uuids' }, { status: 422 });
    }
    itemIds.push(raw);
  }

  let title: string | null = null;
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== 'string') {
      return NextResponse.json({ error: 'title must be a string' }, { status: 422 });
    }
    const trimmed = body.title.trim();
    if (trimmed.length === 0) {
      // Treat empty/whitespace as omitted so the RPC's COALESCE default kicks in.
      title = null;
    } else if (trimmed.length > MAX_TITLE) {
      return NextResponse.json(
        { error: `title may not exceed ${MAX_TITLE} characters` },
        { status: 422 }
      );
    } else {
      title = trimmed;
    }
  }

  let summary: string | null = null;
  if (body.summary !== undefined && body.summary !== null) {
    if (typeof body.summary !== 'string') {
      return NextResponse.json({ error: 'summary must be a string' }, { status: 422 });
    }
    const trimmed = body.summary.trim();
    if (trimmed.length === 0) {
      summary = null;
    } else if (trimmed.length > MAX_SUMMARY) {
      return NextResponse.json(
        { error: `summary may not exceed ${MAX_SUMMARY} characters` },
        { status: 422 }
      );
    } else {
      summary = trimmed;
    }
  }

  const rpc = service.rpc as unknown as RpcCall;
  const { data, error } = await rpc('split_cluster', {
    p_source_id: sourceId,
    p_item_ids: itemIds,
    p_new_title: title,
    p_new_summary: summary,
  });

  if (error) {
    const code = error.code;
    if (code === '22023') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
    }
    if (code === 'P0002') {
      return NextResponse.json({ error: 'Source cluster not found' }, { status: 404 });
    }
    console.error('[newsroom.clusters.split] split_cluster failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not split cluster' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'cluster.split',
    targetTable: 'feed_clusters',
    targetId: sourceId,
    reason: null,
    oldValue: { source_id: sourceId, item_count: itemIds.length },
    newValue: data ?? { source_id: sourceId, item_ids: itemIds, title, summary },
  });

  return NextResponse.json(data ?? { ok: true });
}
