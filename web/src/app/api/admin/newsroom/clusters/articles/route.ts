/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/articles
 *
 * Batch lookup of generated-article existence per cluster, across BOTH
 * audiences (adult `articles` + `kid_articles`). The unified Newsroom feed
 * needs to render "Adult: View" / "Kid: View" badges per cluster row, so the
 * UI ships one POST with the visible cluster_ids and gets back the article
 * id + status for each (audience, cluster_id) pair that has been generated.
 *
 * The two tables have different SELECT RLS policies — `articles_select` lets
 * editors-and-above read drafts, but `kid_articles_read_kid_jwt` only opens
 * read access to active kid JWTs. Admin operators don't hold a kid JWT, so
 * the read MUST go through the service-role client. This route is the
 * canonical service-role read for both tables (mirrors the sources route's
 * pattern for the discovery tables).
 *
 * Permission: admin.pipeline.clusters.manage
 *   — Same gate as the cluster mutation routes. If the operator can manage
 *     a cluster, they can see whether it has produced articles yet.
 * Rate limit: admin_cluster_read (120 / 60s, per user) — shared bucket with
 *   the sources route since both fire on cluster-list page loads.
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

type ArticleHitRow = {
  cluster_id: string;
  audience: 'adult' | 'kid';
  article_id: string;
  status: string;
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

  // 2. Rate limit.
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

  // 3. Body parse + validation.
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
    return NextResponse.json({ rows: [] satisfies ArticleHitRow[] });
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

  // 4. Parallel reads — adult `articles` + kid `kid_articles`. Service-role
  //    bypasses RLS on both. Filtering deleted_at IS NULL on adult only —
  //    kid_articles has no soft-delete column. The Newsroom view wants the
  //    "latest" article per (cluster, audience), so we order by created_at
  //    desc and take the first match per cluster_id; if a cluster was
  //    re-generated and the prior article is now archived, we still surface
  //    the newest pointer.
  const [adultRes, kidRes] = await Promise.all([
    service
      .from('articles')
      .select('id, cluster_id, status, created_at')
      .in('cluster_id', clusterIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    service
      .from('kid_articles')
      .select('id, cluster_id, status, created_at')
      .in('cluster_id', clusterIds)
      .order('created_at', { ascending: false }),
  ]);

  if (adultRes.error) {
    console.error('[newsroom.clusters.articles] adult read failed:', adultRes.error.message);
    Sentry.captureException(adultRes.error);
    return NextResponse.json({ error: 'Could not load article rows' }, { status: 500 });
  }
  if (kidRes.error) {
    console.error('[newsroom.clusters.articles] kid read failed:', kidRes.error.message);
    Sentry.captureException(kidRes.error);
    return NextResponse.json({ error: 'Could not load article rows' }, { status: 500 });
  }

  // 5. Collapse to one (audience, cluster_id) → article tuple. Both queries
  //    already came back ordered desc, so first-write-wins gives the latest.
  const rows: ArticleHitRow[] = [];
  const adultSeen = new Set<string>();
  for (const r of adultRes.data ?? []) {
    if (!r.cluster_id || adultSeen.has(r.cluster_id)) continue;
    adultSeen.add(r.cluster_id);
    rows.push({
      cluster_id: r.cluster_id,
      audience: 'adult',
      article_id: r.id as string,
      status: String(r.status ?? ''),
    });
  }
  const kidSeen = new Set<string>();
  for (const r of kidRes.data ?? []) {
    if (!r.cluster_id || kidSeen.has(r.cluster_id)) continue;
    kidSeen.add(r.cluster_id);
    rows.push({
      cluster_id: r.cluster_id,
      audience: 'kid',
      article_id: r.id as string,
      status: String(r.status ?? ''),
    });
  }

  return NextResponse.json({ rows });
}
