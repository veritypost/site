/**
 * F7 Newsroom Redesign — POST /api/admin/newsroom/clusters/articles
 *
 * Batch lookup of generated-article existence per cluster across BOTH
 * audiences. Reads `articles` and partitions by is_kids_safe to surface
 * "Adult: View" / "Kid: View" badges per cluster row.
 *
 * Permission: admin.pipeline.clusters.manage
 * Rate limit: admin_cluster_read (120 / 60s, per user)
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

  // 4. Single read against `articles`, partitioned by is_kids_safe. Service-
  //    role bypasses RLS. Order by created_at desc so first-match per
  //    (cluster_id, audience) is the newest.
  const articlesRes = await service
    .from('articles')
    .select('id, cluster_id, status, created_at, is_kids_safe')
    .in('cluster_id', clusterIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (articlesRes.error) {
    console.error('[newsroom.clusters.articles] read failed:', articlesRes.error.message);
    Sentry.captureException(articlesRes.error);
    return NextResponse.json({ error: 'Could not load article rows' }, { status: 500 });
  }

  // 5. Collapse to one (audience, cluster_id) → article tuple. Single read
  //    came back ordered desc, so first-write-wins gives the latest per pair.
  const rows: ArticleHitRow[] = [];
  const adultSeen = new Set<string>();
  const kidSeen = new Set<string>();
  for (const r of articlesRes.data ?? []) {
    if (!r.cluster_id) continue;
    const audience: 'adult' | 'kid' = r.is_kids_safe ? 'kid' : 'adult';
    const seen = audience === 'adult' ? adultSeen : kidSeen;
    if (seen.has(r.cluster_id)) continue;
    seen.add(r.cluster_id);
    rows.push({
      cluster_id: r.cluster_id,
      audience,
      article_id: r.id as string,
      status: String(r.status ?? ''),
    });
  }

  return NextResponse.json({ rows });
}
