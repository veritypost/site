/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/sources
 *
 * Batch read of discovery rows for a set of clusters. The unified Newsroom
 * feed no longer separates adult/kid clusters — the operator picks audience
 * at generation time, not at ingest — so the read is a single SELECT against
 * `discovery_items`. The legacy `kid_discovery_items` table stays in DB but
 * the kid pipeline now uses the source_urls override path which sources from
 * the same `discovery_items` rows, so this route never needs to query it.
 *
 * The `discovery_items` table carries a SELECT RLS policy that requires
 * `admin.system.view`, which most admin operators do NOT hold (that key is
 * reserved for system/owner roles). The Newsroom workspace previously read
 * the table through the cookie-scoped client, which silently returned 0 rows
 * for any operator without the system perm — surfacing as "0 sources / No
 * source rows linked" on every cluster card even though the rows existed.
 *
 * The fix: route the read through the service-role client (bypasses RLS)
 * gated on the same permission that controls cluster mutation —
 * `admin.pipeline.clusters.manage`. If the operator can manage clusters,
 * they have a legitimate reason to see the source rows backing them.
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_read (120 / 60s, per user)
 *   — read endpoint, slightly more generous than the mutation bucket.
 * No audit (read).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError } from '@/lib/adminMutation';
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLUSTER_IDS = 100;

type DiscoveryRow = {
  id: string;
  cluster_id: string | null;
  feed_id: string | null;
  raw_url: string;
  raw_title: string | null;
  raw_body: string | null;
  fetched_at: string;
  metadata: unknown;
  state: string;
};

export async function POST(req: Request) {
  // 1. Auth + permission gate.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.clusters.manage', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  const service = createServiceClient();

  // 2. Rate limit (after auth so anon callers can't burn the bucket).
  const rl = await checkRateLimit(service, {
    key: `admin_cluster_read:${actorId}`,
    policyKey: 'admin_cluster_read',
    max: 120,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 3. Body parse + validation. The legacy shape included an `audience`
  //    field; we still accept it for back-compat but ignore it — the
  //    discovery_items table is now the single source for the unified feed.
  let body: { cluster_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  const rawIds = body.cluster_ids;
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'cluster_ids must be an array of uuids' }, { status: 422 });
  }
  if (rawIds.length === 0) {
    return NextResponse.json({ rows: [] satisfies DiscoveryRow[] });
  }
  if (rawIds.length > MAX_CLUSTER_IDS) {
    return NextResponse.json(
      { error: `cluster_ids may not exceed ${MAX_CLUSTER_IDS} entries` },
      { status: 422 }
    );
  }

  const clusterIds: string[] = [];
  const seen = new Set<string>();
  for (const v of rawIds) {
    if (typeof v !== 'string' || !UUID_RE.test(v)) {
      return NextResponse.json({ error: 'cluster_ids must be an array of uuids' }, { status: 422 });
    }
    if (!seen.has(v)) {
      seen.add(v);
      clusterIds.push(v);
    }
  }

  // 4. Query — service role bypasses RLS, which is the whole point of this
  //    route. Single source: `discovery_items`. The kid pipeline now uses
  //    the source_urls override against these same rows, not a separate
  //    table.
  const { data, error } = await service
    .from('discovery_items')
    .select('id, cluster_id, feed_id, raw_url, raw_title, raw_body, fetched_at, metadata, state')
    .in('cluster_id', clusterIds)
    .order('fetched_at', { ascending: false });

  if (error) {
    console.error('[newsroom.clusters.sources] read failed:', error.message);
    Sentry.captureException(error);
    return NextResponse.json({ error: 'Could not load source rows' }, { status: 500 });
  }

  return NextResponse.json({ rows: (data || []) as DiscoveryRow[] });
}
