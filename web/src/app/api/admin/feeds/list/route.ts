// Admin feeds list endpoint — returns feeds joined with per-feed discovery_items
// counts for the last 24h and 7d. One permission gate: admin.feeds.manage.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

type FeedCountRow = {
  feed_id: string;
  count_24h: number;
  count_7d: number;
};

export async function GET() {
  try {
    await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  // Fetch all feeds ordered by name.
  // Soft-deleted rows excluded; DBA-only cleanup path can show them via direct DB.
  const { data: feedRows, error: feedsError } = await service
    .from('feeds')
    .select('*')
    .is('deleted_at', null)
    .order('name');

  if (feedsError) {
    console.error('[admin.feeds.list] feeds select failed:', feedsError.message);
    return NextResponse.json({ error: 'Could not load feeds' }, { status: 500 });
  }

  const feeds = feedRows ?? [];

  // Single GROUP BY query for discovery_items counts per feed, last 7 days.
  // We derive 24h and 7d in one pass: a conditional aggregate for 24h.
  const { data: countRows, error: countError } = await service.rpc(
    'admin_feed_item_counts' as never,
    {} as never
  );

  // If the RPC doesn't exist yet, fall back to a raw SQL approach via JS aggregation.
  // We query all discovery_items from the last 7 days and group in JS.
  const feedCounts: Record<string, { count_24h: number; count_7d: number }> = {};

  if (countError || !countRows) {
    // Fallback: query discovery_items directly.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: items, error: itemsError } = await service
      .from('discovery_items')
      .select('feed_id, fetched_at')
      .gte('fetched_at', sevenDaysAgo)
      .not('feed_id', 'is', null);

    if (itemsError) {
      console.error('[admin.feeds.list] discovery_items select failed:', itemsError.message);
      // Non-fatal — return feeds with zero counts.
    } else {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const item of items ?? []) {
        if (!item.feed_id) continue;
        const entry = feedCounts[item.feed_id] ?? { count_24h: 0, count_7d: 0 };
        entry.count_7d += 1;
        if (new Date(item.fetched_at).getTime() >= oneDayAgo) {
          entry.count_24h += 1;
        }
        feedCounts[item.feed_id] = entry;
      }
    }
  } else {
    // RPC returned rows — map them.
    for (const row of countRows as FeedCountRow[]) {
      feedCounts[row.feed_id] = {
        count_24h: row.count_24h ?? 0,
        count_7d: row.count_7d ?? 0,
      };
    }
  }

  // Join counts onto feed rows.
  const enriched = feeds.map((f) => {
    const counts = feedCounts[f.id] ?? { count_24h: 0, count_7d: 0 };
    return {
      ...f,
      items_24h: counts.count_24h,
      items_7d: counts.count_7d,
    };
  });

  // Compute totals.
  let totalItems24h = 0;
  let totalItems7d = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  let silent7d = 0;
  let failingCount = 0;

  for (const f of enriched) {
    totalItems24h += f.items_24h;
    totalItems7d += f.items_7d;
    if (f.is_active) {
      activeCount += 1;
      if (f.items_7d === 0) silent7d += 1;
    } else {
      inactiveCount += 1;
    }
    if ((f.error_count ?? 0) > 0) failingCount += 1;
  }

  // Top contributor by items_7d.
  let topContributor: {
    feed_id: string;
    outlet: string;
    items_7d: number;
    share_pct: number;
  } | null = null;

  if (enriched.length > 0 && totalItems7d > 0) {
    const top = enriched.reduce((best, f) =>
      f.items_7d > (best?.items_7d ?? 0) ? f : best
    );
    if (top && top.items_7d > 0) {
      topContributor = {
        feed_id: top.id,
        outlet: top.source_name || top.name || '',
        items_7d: top.items_7d,
        share_pct: Math.round((top.items_7d / totalItems7d) * 100),
      };
    }
  }

  return NextResponse.json({
    feeds: enriched,
    topContributor,
    totals: {
      items_24h: totalItems24h,
      items_7d: totalItems7d,
      active: activeCount,
      inactive: inactiveCount,
      silent_7d: silent7d,
      failing: failingCount,
    },
  });
}
