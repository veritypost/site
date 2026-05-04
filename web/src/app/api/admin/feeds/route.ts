// T-005 — server route for admin/feeds create.
// Replaces direct `supabase.from('feeds').insert(...)` from the client.
import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type CreateBody = {
  name?: string;
  source_name?: string;
  url?: string;
  feed_type?: string;
  is_active?: boolean;
  audience?: 'adult' | 'kid' | string; // F7 migration 114 — routes feed into adult vs kid pool
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.feeds.create:${actor.id}`,
    policyKey: 'admin.feeds.create',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!name || !url) return NextResponse.json({ error: 'name and url required' }, { status: 400 });

  // Ext-KK1 — URL safety. Prior code accepted any string. Tighten:
  //   - parseable as URL
  //   - http(s) only (no file://, javascript:, data:, etc.)
  //   - host not in private/loopback ranges (defense against the
  //     ingest worker scraping internal services if an admin
  //     account is compromised)
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'url must use http or https' }, { status: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '::1';
  if (isPrivate) {
    return NextResponse.json({ error: 'url host must be a public hostname' }, { status: 400 });
  }

  // Content validation — verify the URL returns a parseable RSS/Atom feed
  // before writing to DB. Capped at 200KB to prevent memory abuse.
  try {
    const feedRes = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VerityPost/1.0; +https://veritypost.com)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });
    if (!feedRes.ok) {
      return NextResponse.json(
        {
          error: `Feed URL returned status ${feedRes.status}`,
          detail: `Expected 2xx response from ${url}; got ${feedRes.status} ${feedRes.statusText}`,
        },
        { status: 422 }
      );
    }
    const rawText = await feedRes.text();
    const text = rawText.slice(0, 200_000);
    // Strip BOM + leading whitespace for heuristic check
    const trimmed = text.replace(/^﻿/, '').trimStart();
    const looksLikeFeed =
      trimmed.startsWith('<?xml') ||
      trimmed.startsWith('<rss') ||
      trimmed.startsWith('<feed') ||
      trimmed.startsWith('<rdf');
    if (!looksLikeFeed) {
      return NextResponse.json(
        {
          error: 'URL does not return RSS/Atom feed',
          detail: `Expected XML; got ${trimmed.slice(0, 80)}`,
        },
        { status: 422 }
      );
    }
    const feedParser = new Parser({ timeout: 8000 });
    await feedParser.parseString(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish network/timeout errors from parser errors
    const isParseError =
      msg.toLowerCase().includes('non-whitespace') ||
      msg.toLowerCase().includes('invalid xml') ||
      msg.toLowerCase().includes('unexpected token');
    if (isParseError) {
      return NextResponse.json(
        { error: 'Feed XML is not valid RSS/Atom', detail: msg },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: 'Could not fetch feed URL', detail: msg },
      { status: 422 }
    );
  }

  const rawAudience = typeof body.audience === 'string' ? body.audience : 'adult';
  const audience: 'adult' | 'kid' = rawAudience === 'kid' ? 'kid' : 'adult';
  const source_name =
    typeof body.source_name === 'string' && body.source_name.trim()
      ? body.source_name.trim()
      : name;
  const feed_type = typeof body.feed_type === 'string' && body.feed_type ? body.feed_type : 'rss';
  const is_active = body.is_active !== false;

  // Un-delete-on-re-add: if the URL already exists with deleted_at IS NOT NULL,
  // restore it instead of failing on the unique constraint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceAny = service as any;
  const { data: existing } = await serviceAny
    .from('feeds')
    .select('id, deleted_at')
    .eq('url', url)
    .maybeSingle() as { data: { id: string; deleted_at: string | null } | null };

  if (existing && existing.deleted_at !== null) {
    const restore = {
      name,
      source_name,
      feed_type,
      is_active,
      audience,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };
    const { data: restored, error: restoreErr } = await serviceAny
      .from('feeds')
      .update(restore)
      .eq('id', existing.id)
      .select('*')
      .single() as { data: Record<string, unknown> | null; error: { message: string } | null };
    if (restoreErr || !restored) {
      console.error('[admin.feeds.restore]', restoreErr?.message || 'no row');
      return NextResponse.json({ error: 'Could not restore feed' }, { status: 500 });
    }
    await recordAdminAction({
      action: 'feed.create',
      targetTable: 'feeds',
      targetId: restored.id as string,
      newValue: { name: restored.name, url: restored.url, feed_type: restored.feed_type, restored: true },
    });
    return NextResponse.json({ ok: true, row: restored });
  }

  const row = {
    name,
    source_name,
    url,
    feed_type,
    is_active,
    error_count: 0,
    audience, // F7 migration 114 — feeds.audience NOT NULL, defaults to 'adult'; admin can tag 'kid' to route into kid pool
  };

  const { data, error } = await service.from('feeds').insert(row).select('*').single();
  if (error || !data) {
    console.error('[admin.feeds.create]', error?.message || 'no row');
    return NextResponse.json({ error: 'Could not create feed' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'feed.create',
    targetTable: 'feeds',
    targetId: data.id,
    newValue: { name: data.name, url: data.url, feed_type: data.feed_type },
  });

  return NextResponse.json({ ok: true, row: data });
}
