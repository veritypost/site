// Phase B — discovery scraper extraction-config TEST endpoint.
// Read-only: invokes scrapeJson once and returns up to 5 sample articles.
// Writes nowhere (no discovery_items, no feeds, no admin_audit_log).
// Per-actor rate limit 10/60s in-process map.
//
// CRITICAL: the response echoes the *unresolved* config (placeholders intact);
// env-var values resolved inside scrape-json never leak back to the client.
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { permissionError } from '@/lib/adminMutation';
import { createServiceClient } from '@/lib/supabase/server';
import { validateExtractionConfig } from '@/lib/pipeline/extraction-config';
import { scrapeJson } from '@/lib/pipeline/scrape-json';

// Per-actor sliding-window rate limit. 10 requests / 60s. Module scope reuses
// across warm Node lambda instances; multi-instance / cold starts loosen this,
// which is acceptable for an admin-only test endpoint.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateState = new Map<string, number[]>();

function checkRate(actorId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const prior = (rateState.get(actorId) ?? []).filter((t) => t > cutoff);
  if (prior.length >= RATE_MAX) {
    rateState.set(actorId, prior);
    return false;
  }
  prior.push(now);
  rateState.set(actorId, prior);
  // Bound map growth on warm lambdas — drop stale buckets opportunistically.
  if (rateState.size > 256) {
    for (const [k, v] of rateState) {
      const fresh = v.filter((t) => t > cutoff);
      if (fresh.length === 0) rateState.delete(k);
      else if (fresh.length !== v.length) rateState.set(k, fresh);
    }
  }
  return true;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  if (!checkRate(actor.id)) {
    return NextResponse.json(
      { ok: false, error: 'rate limit — 10 tests per 60s per actor' },
      { status: 429 }
    );
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'invalid feed id' },
      { status: 400 }
    );
  }

  // Body MAY include an override extraction_config; if absent, use the
  // row's saved one. Empty body is fine.
  let bodyOverride: unknown = undefined;
  try {
    const text = await req.text();
    if (text) {
      const parsed = JSON.parse(text);
      bodyOverride = (parsed as Record<string, unknown> | null)?.extraction_config;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid json body' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: feed, error: lookupErr } = await service
    .from('feeds')
    .select('id, url, feed_type, extraction_config')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr || !feed) {
    return NextResponse.json(
      { ok: false, error: 'feed not found' },
      { status: 404 }
    );
  }
  if (feed.feed_type !== 'scrape_json') {
    return NextResponse.json(
      {
        ok: false,
        error: `test only applies to feed_type='scrape_json' (this row is '${feed.feed_type}')`,
      },
      { status: 400 }
    );
  }

  // `config` here is the unresolved DB / body payload — placeholders like
  // ${NEWSAPI_KEY} are still strings. scrape-json resolves env refs internally;
  // this variable, which we echo back below, never sees resolved values.
  const config = bodyOverride !== undefined ? bodyOverride : feed.extraction_config;
  if (!validateExtractionConfig(config)) {
    return NextResponse.json(
      { ok: false, error: 'invalid extraction_config — fix and re-test' },
      { status: 400 }
    );
  }

  let articles;
  try {
    articles = await scrapeJson(feed.url, config);
  } catch (e: unknown) {
    // scrape-json is silent-fail on inner errors; this catch is defense-in-depth.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'scrape failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    feed_url: feed.url,
    // Echo the placeholder-bearing config, never the resolved-env version.
    config_used: config,
    article_count: articles.length,
    sample: articles.slice(0, 5),
  });
}
