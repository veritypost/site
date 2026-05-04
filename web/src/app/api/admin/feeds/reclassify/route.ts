// Phase C — Reclassify wizard endpoint.
//
// POST /api/admin/feeds/reclassify
// Permission gate: admin.feeds.manage.
//
// Body shape:
//   { items: [{ feed_id: string, target: 'rss' | 'scrape_html' | 'scrape_json' | 'feed' }] }
//
// For each item, this endpoint:
//   1. Looks up the row, verifies the feed exists and isn't soft-deleted.
//   2. Recomputes the URL-shape heuristic server-side and ONLY accepts the
//      reclassify if the heuristic agrees with `target`. The client preview
//      can drift from server logic; this guard is the source of truth so a
//      bad client can't pivot a feed to an arbitrary type.
//   3. Updates feed_type. Stamps metadata.reclassified_at + metadata.
//      reclassified_via='admin_wizard' so the audit trail differentiates
//      this from Phase A's 'rss_only_default' bulk migration.
//   4. Records a per-row admin_audit_log entry.
//
// Defensive: never touches a row whose URL shape agrees with its current
// feed_type (no-op rows are silently skipped — they don't need a write).
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const MAX_ITEMS = 200;

// URL-shape detection. Mirror logic also lives client-side in the Reclassify
// modal preview; this server copy is authoritative.
const RSS_URL_PATTERNS = [
  /\/rss(\/|$|\?|\.xml)/i,
  /\/feed(\/|$|\?|\.xml)/i,
  /\.atom(\/|$|\?)/i,
  /atom\.xml/i,
  /\/rss\.xml/i,
];

function urlLooksRss(url: string | null | undefined): boolean {
  if (!url) return false;
  return RSS_URL_PATTERNS.some((re) => re.test(url));
}

function suggestedFeedType(
  url: string | null | undefined,
  currentType: string | null | undefined
): 'rss' | 'scrape_html' | null {
  // Phase C scope: only auto-classify between rss <-> scrape_html.
  // scrape_json detection requires per-vendor host knowledge already
  // codified in EXTRACTION_CONFIG_ENV_HOST_BINDINGS — operators set
  // scrape_json explicitly, the wizard doesn't auto-suggest it.
  const isRss = urlLooksRss(url);
  if (isRss && currentType !== 'rss' && currentType !== 'feed') return 'rss';
  if (!isRss && (currentType === 'rss' || currentType === 'feed')) return 'scrape_html';
  return null;
}

type Item = {
  feed_id: string;
  target: 'rss' | 'scrape_html' | 'scrape_json' | 'feed';
};

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.feeds.reclassify:${actor.id}`,
    policyKey: 'admin.feeds.bulk',
    max: 5,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const rawItems = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `items must contain at most ${MAX_ITEMS} entries` },
      { status: 400 }
    );
  }

  const items: Item[] = [];
  for (const raw of rawItems) {
    const r = raw as { feed_id?: unknown; target?: unknown };
    if (typeof r?.feed_id !== 'string' || !r.feed_id) {
      return NextResponse.json({ error: 'each item needs a feed_id string' }, { status: 400 });
    }
    if (
      r.target !== 'rss' &&
      r.target !== 'scrape_html' &&
      r.target !== 'scrape_json' &&
      r.target !== 'feed'
    ) {
      return NextResponse.json(
        { error: `target must be rss | scrape_html | scrape_json | feed (feed_id ${r.feed_id})` },
        { status: 400 }
      );
    }
    items.push({ feed_id: r.feed_id, target: r.target });
  }

  const ids = items.map((i) => i.feed_id);
  const { data: rows, error: rowsErr } = await service
    .from('feeds')
    .select('id, url, feed_type, source_name, name, deleted_at, metadata')
    .in('id', ids);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  const rowMap = new Map<string, NonNullable<typeof rows>[number]>();
  for (const row of rows ?? []) {
    rowMap.set(row.id, row);
  }

  type Result = {
    feed_id: string;
    applied: boolean;
    reason?: string;
    from?: string | null;
    to?: string;
  };
  const results: Result[] = [];

  for (const item of items) {
    const row = rowMap.get(item.feed_id);
    if (!row) {
      results.push({ feed_id: item.feed_id, applied: false, reason: 'feed not found' });
      continue;
    }
    if (row.deleted_at) {
      results.push({ feed_id: item.feed_id, applied: false, reason: 'feed soft-deleted' });
      continue;
    }
    if (row.feed_type === item.target) {
      results.push({ feed_id: item.feed_id, applied: false, reason: 'already at target type' });
      continue;
    }

    // Defensive: only allow reclassify when the URL-shape heuristic agrees
    // with the target. scrape_json -> rss/scrape_html and bespoke types
    // never get auto-rewritten — the operator must edit those individually
    // via the row drawer. The `feed -> rss` alias also requires the URL
    // to be RSS-shaped: the legacy `feed` value is just an old name for
    // RSS, but a row whose URL is a homepage scrape should NOT slip
    // through this alias path.
    const suggested = suggestedFeedType(row.url, row.feed_type);
    const isRssUrl = urlLooksRss(row.url);
    const allowedTransition =
      // rss/scrape_html flips driven by URL shape
      (suggested === item.target && (item.target === 'rss' || item.target === 'scrape_html')) ||
      // feed -> rss alias, only when URL shape agrees
      (item.target === 'rss' && row.feed_type === 'feed' && isRssUrl);

    if (!allowedTransition) {
      results.push({
        feed_id: item.feed_id,
        applied: false,
        reason: `URL shape does not support reclassify ${row.feed_type} -> ${item.target}`,
      });
      continue;
    }

    const previousMetadata =
      (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
        string,
        unknown
      >;
    const newMetadata: Record<string, unknown> = {
      ...previousMetadata,
      reclassified_at: new Date().toISOString().slice(0, 10),
      reclassified_via: 'admin_wizard',
      reclassified_from: row.feed_type ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (service as any)
      .from('feeds')
      .update({
        feed_type: item.target,
        metadata: newMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.feed_id);

    if (updateErr) {
      results.push({
        feed_id: item.feed_id,
        applied: false,
        reason: `update failed: ${updateErr.message}`,
      });
      continue;
    }

    await recordAdminAction({
      action: 'feed.reclassify',
      targetTable: 'feeds',
      targetId: item.feed_id,
      oldValue: { feed_type: row.feed_type, outlet: row.source_name || row.name || null },
      newValue: { feed_type: item.target, via: 'admin_wizard' },
    });

    results.push({
      feed_id: item.feed_id,
      applied: true,
      from: row.feed_type ?? null,
      to: item.target,
    });
  }

  const appliedCount = results.filter((r) => r.applied).length;
  return NextResponse.json({
    ok: true,
    appliedCount,
    skippedCount: results.length - appliedCount,
    results,
  });
}
