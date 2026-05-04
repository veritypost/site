/**
 * Wave 6 — Stream F provenance UI
 *
 * GET /api/admin/sources
 *
 * Reads the no-delete provenance log (`article_sources`). This is the
 * "every URL Verity Post has ever cited" receipts list. The article
 * reader's citation list lives on `sources` (editor-mutable, delete-
 * and-reinsert on every PATCH). This endpoint is the historical record.
 *
 * Filters (all optional):
 *   outlet      text   — ilike on outlet_snapshot
 *   date_from   ISO    — created_at >= date_from (first cited)
 *   date_to     ISO    — created_at <= date_to
 *
 * Pagination (keyset, older-than tuple on (created_at, id)):
 *   limit       1..100 (default 50)
 *   cursor      `${created_at}|${id}`
 *
 * The article join (id → title/slug/status) is denormalized in the
 * response so the UI can link straight to the citing article without
 * a second round-trip per row.
 *
 * Permission: admin.pipeline.run_ingest (matches the rest of the
 * research-redesign surfaces).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type SourceRow = {
  id: string;
  article_id: string;
  url_snapshot: string;
  title_snapshot: string | null;
  outlet_snapshot: string;
  source_class: string | null;
  fetched_at: string;
  created_at: string;
  feed_id: string | null;
};

type ArticleStub = {
  id: string;
  title: string | null;
  status: string | null;
  age_band: string | null;
  deleted_at: string | null;
};

type FeedStub = {
  id: string;
  source_name: string | null;
  name: string;
  deleted_at: string | null;
};

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseCursor(raw: string | null): { ts: string; id: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf('|');
  if (idx <= 0) return null;
  const ts = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (Number.isNaN(Date.parse(ts))) return null;
  if (!UUID_RE.test(id)) return null;
  return { ts, id };
}

function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursor = parseCursor(url.searchParams.get('cursor'));

  const outletRaw = url.searchParams.get('outlet');
  const outlet = outletRaw ? outletRaw.trim().slice(0, 200) : null;

  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const fromValid = dateFrom && !Number.isNaN(Date.parse(dateFrom)) ? dateFrom : null;
  const toValid = dateTo && !Number.isNaN(Date.parse(dateTo)) ? dateTo : null;

  const service = createServiceClient();

  let q = service
    .from('article_sources')
    .select(
      'id, article_id, url_snapshot, title_snapshot, outlet_snapshot, source_class, fetched_at, created_at, feed_id',
    )
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (outlet) q = q.ilike('outlet_snapshot', `%${escapeIlike(outlet)}%`);
  if (fromValid) q = q.gte('created_at', fromValid);
  if (toValid) q = q.lte('created_at', toValid);
  if (cursor) {
    // (created_at, id) < (cursor.ts, cursor.id)
    q = q.or(
      `created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`,
    );
  }

  const { data: rowsRaw, error: rowsErr } = await q;
  if (rowsErr) {
    console.error('[admin.sources.list]', rowsErr.message);
    return NextResponse.json({ error: 'Could not load sources' }, { status: 500 });
  }
  const rows = (rowsRaw ?? []) as SourceRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = hasMore ? page[page.length - 1] : null;
  const nextCursor = last ? `${last.created_at}|${last.id}` : null;

  if (page.length === 0) {
    return NextResponse.json({ sources: [], cursor: null });
  }

  const articleIds = Array.from(new Set(page.map((r) => r.article_id)));
  const { data: articlesRaw, error: articlesErr } = await service
    .from('articles')
    .select('id, title, status, age_band, deleted_at')
    .in('id', articleIds);
  if (articlesErr) {
    console.error('[admin.sources.list.articles]', articlesErr.message);
    return NextResponse.json({ error: 'Could not load citing articles' }, { status: 500 });
  }
  const articleById = new Map<string, ArticleStub>();
  for (const a of (articlesRaw ?? []) as ArticleStub[]) {
    articleById.set(a.id, a);
  }

  const feedIds = Array.from(new Set(page.map((r) => r.feed_id).filter((id): id is string => id !== null)));
  const feedById = new Map<string, FeedStub>();
  if (feedIds.length > 0) {
    const { data: feedsRaw, error: feedsErr } = await service
      .from('feeds')
      .select('id, source_name, name, deleted_at')
      .in('id', feedIds);
    if (feedsErr) {
      console.error('[admin.sources.list.feeds]', feedsErr.message);
      return NextResponse.json({ error: 'Could not load feed names' }, { status: 500 });
    }
    for (const f of (feedsRaw ?? []) as FeedStub[]) {
      feedById.set(f.id, f);
    }
  }

  const sources = page.map((r) => {
    const a = articleById.get(r.article_id);
    const f = r.feed_id ? feedById.get(r.feed_id) : undefined;
    return {
      id: r.id,
      article_id: r.article_id,
      url_snapshot: r.url_snapshot,
      title_snapshot: r.title_snapshot,
      outlet_snapshot: r.outlet_snapshot,
      source_class: r.source_class,
      fetched_at: r.fetched_at,
      created_at: r.created_at,
      feed_id: r.feed_id,
      article_title: a?.title ?? null,
      article_status: a?.status ?? null,
      article_age_band: a?.age_band ?? null,
      article_deleted: a ? a.deleted_at !== null : false,
      feed_name: f ? (f.source_name ?? f.name) : null,
      feed_deleted: f ? f.deleted_at !== null : false,
    };
  });

  return NextResponse.json({ sources, cursor: nextCursor });
}
