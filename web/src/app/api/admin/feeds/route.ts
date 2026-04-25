// T-005 — server route for admin/feeds create.
// Replaces direct `supabase.from('feeds').insert(...)` from the client.
import { NextResponse } from 'next/server';
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

  const rawAudience = typeof body.audience === 'string' ? body.audience : 'adult';
  const audience: 'adult' | 'kid' = rawAudience === 'kid' ? 'kid' : 'adult';
  const row = {
    name,
    source_name:
      typeof body.source_name === 'string' && body.source_name.trim()
        ? body.source_name.trim()
        : name,
    url,
    feed_type: typeof body.feed_type === 'string' && body.feed_type ? body.feed_type : 'rss',
    is_active: body.is_active !== false,
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
