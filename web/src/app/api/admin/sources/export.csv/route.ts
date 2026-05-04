/**
 * Wave 6 — Stream F provenance UI
 *
 * GET /api/admin/sources/export.csv
 *
 * CSV export of the current `article_sources` filter. Load-bearing for
 * "show me every CNN article you've cited" asks once the redesign is
 * public (per § Stream F in AI_Redesign.md).
 *
 * Same filter shape as GET /api/admin/sources (outlet ilike, date range).
 * No keyset pagination — exports up to MAX_EXPORT_ROWS in a single
 * Response (defensive ceiling; today the table is ~hundreds of rows
 * so this is comfortably above ceiling).
 *
 * Rows are sorted oldest-first so an export pasted into a sheet reads
 * chronologically (the screen list defaults newest-first, but for an
 * audit artifact "oldest cite first" is the conventional order).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_EXPORT_ROWS = 50000;

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
};

type FeedStub = {
  id: string;
  source_name: string | null;
  name: string;
};

function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function csvCell(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const url = new URL(req.url);

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
    .order('created_at', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
    .limit(MAX_EXPORT_ROWS);

  if (outlet) q = q.ilike('outlet_snapshot', `%${escapeIlike(outlet)}%`);
  if (fromValid) q = q.gte('created_at', fromValid);
  if (toValid) q = q.lte('created_at', toValid);

  const { data: rowsRaw, error: rowsErr } = await q;
  if (rowsErr) {
    console.error('[admin.sources.export]', rowsErr.message);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
  const rows = (rowsRaw ?? []) as SourceRow[];

  const articleIds = Array.from(new Set(rows.map((r) => r.article_id)));
  const articleById = new Map<string, ArticleStub>();
  if (articleIds.length > 0) {
    // Chunk to keep the IN clause reasonable.
    const CHUNK = 500;
    for (let i = 0; i < articleIds.length; i += CHUNK) {
      const slice = articleIds.slice(i, i + CHUNK);
      const { data: articlesRaw, error: articlesErr } = await service
        .from('articles')
        .select('id, title, status')
        .in('id', slice);
      if (articlesErr) {
        console.error('[admin.sources.export.articles]', articlesErr.message);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
      }
      for (const a of (articlesRaw ?? []) as ArticleStub[]) {
        articleById.set(a.id, a);
      }
    }
  }

  const feedIds = Array.from(new Set(rows.map((r) => r.feed_id).filter((id): id is string => id !== null)));
  const feedById = new Map<string, FeedStub>();
  if (feedIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < feedIds.length; i += CHUNK) {
      const slice = feedIds.slice(i, i + CHUNK);
      const { data: feedsRaw, error: feedsErr } = await service
        .from('feeds')
        .select('id, source_name, name')
        .in('id', slice);
      if (feedsErr) {
        console.error('[admin.sources.export.feeds]', feedsErr.message);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
      }
      for (const f of (feedsRaw ?? []) as FeedStub[]) {
        feedById.set(f.id, f);
      }
    }
  }

  const header = [
    'created_at',
    'outlet',
    'url',
    'title',
    'source_class',
    'fetched_at',
    'article_id',
    'article_title',
    'article_status',
    'feed_name',
    'feed_id',
  ];

  const lines: string[] = [header.join(',')];
  for (const r of rows) {
    const a = articleById.get(r.article_id);
    const f = r.feed_id ? feedById.get(r.feed_id) : undefined;
    lines.push(
      [
        r.created_at,
        r.outlet_snapshot,
        r.url_snapshot,
        r.title_snapshot,
        r.source_class,
        r.fetched_at,
        r.article_id,
        a?.title ?? null,
        a?.status ?? null,
        f ? (f.source_name ?? f.name) : null,
        r.feed_id,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  // Trailing newline for POSIX CSV consumers.
  const body = lines.join('\n') + '\n';

  // Filename includes UTC date for clarity in downloads.
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `verity-sources-${stamp}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
