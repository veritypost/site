/**
 * Session B — GET /api/admin/articles/list
 *
 * Backend for the Articles tab in the new Newsroom (Decision 18). Filters
 * sync to URL querystring on the client; the route accepts the same
 * shape:
 *
 *   ?audience=adult,kids        comma list of: adult | tweens | kids
 *   ?status=draft,published     comma list of: draft | published | archived | failed
 *   ?q=trump                    free-text search against articles.search_tsv
 *   ?limit=50                   default 50, max 100
 *   ?cursor=<iso>               older-than updated_at for pagination
 *
 * Default sort: articles.updated_at DESC.
 * Default audience filter (when omitted): all 3 bands.
 * Default status filter (when omitted): all four statuses.
 *
 * Permission: dual-check (articles.edit, admin.articles.edit.any).
 * Rate limit: gentle (60/60s) — share the cluster bucket.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

type AudienceBand = 'adult' | 'tweens' | 'kids';
type ArticleStatus = 'draft' | 'published' | 'archived' | 'failed';

const ALL_BANDS: AudienceBand[] = ['adult', 'tweens', 'kids'];
const ALL_STATUSES: ArticleStatus[] = ['draft', 'published', 'archived', 'failed'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseEnumCsv<T extends string>(raw: string | null, allowed: T[]): T[] {
  if (!raw) return allowed;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is T => (allowed as string[]).includes(s));
  return parts.length > 0 ? parts : allowed;
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function escapeForWebsearch(input: string): string {
  return input.replace(/['"\\]/g, ' ').slice(0, 200);
}

export async function GET(req: Request) {
  // 1. Permission gate.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission(['articles.edit', 'admin.articles.edit.any'], supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // 2. Rate limit.
  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_cluster_mutate:${actorId}`,
    policyKey: 'admin_cluster_mutate',
    max: 60,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 3. Query parsing.
  const url = new URL(req.url);
  const audience = parseEnumCsv<AudienceBand>(url.searchParams.get('audience'), ALL_BANDS);
  const status = parseEnumCsv<ArticleStatus>(url.searchParams.get('status'), ALL_STATUSES);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursorRaw = url.searchParams.get('cursor');
  const cursor = cursorRaw && !Number.isNaN(Date.parse(cursorRaw)) ? cursorRaw : null;

  // 4. Build query.
  let query = service
    .from('articles')
    .select(
      'id, title, status, age_band, category_id, author_id, published_at, updated_at, is_ai_generated, stories(slug)'
    )
    .is('deleted_at', null)
    .in('status', status)
    .in('age_band', audience)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('updated_at', cursor);
  if (q.length > 0) {
    // search_tsv is a generated tsvector column; @@ websearch_to_tsquery is
    // exposed through PostgREST as `textSearch` with type='websearch'.
    query = query.textSearch('search_tsv', escapeForWebsearch(q), {
      type: 'websearch',
      config: 'english',
    });
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin.articles.list]', error.message);
    return NextResponse.json({ error: 'Could not load articles' }, { status: 500 });
  }
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.updated_at ?? null : null;

  return NextResponse.json({ articles: page, cursor: nextCursor });
}
