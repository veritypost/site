/**
 * Stage 1 — Admin categories CRUD: POST (create).
 *
 * Replaces the older route that gated on `admin.categories.manage` /
 * `admin.subcategories.manage`. The Newsroom redesign collapses both
 * into the single `admin.pipeline.categories.manage` permission introduced
 * by migration 126 (categories belong to the pipeline surface — the
 * pipeline editor picks from this taxonomy when persisting articles).
 *
 * Shape:
 *   requirePermission(admin.pipeline.categories.manage)
 *     → createServiceClient
 *     → checkRateLimit (admin_categories_mutate, 30/60s per actor)
 *     → validate body
 *     → enforce 2-level depth cap (parent must be a top-level row)
 *     → insert
 *     → record_admin_action audit (best-effort)
 *
 * Body:
 *   {
 *     name: string (required, 1..120 chars after trim)
 *     slug: string (required, [a-z0-9-], 1..120 chars)
 *     description?: string | null
 *     parent_id?: uuid | null   (omitted/null = top-level)
 *     color_hex?: string | null (#RRGGBB)
 *     icon_name?: string | null
 *     is_active?: boolean (default true)
 *     is_kids_safe?: boolean (default false)
 *     is_premium?: boolean (default false)
 *     sort_order?: number (default 0, integer >= 0)
 *   }
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const RATE_WINDOW_SEC = 60;
const RATE_MAX = 30;

type CreateBody = {
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  parent_id?: unknown;
  color_hex?: unknown;
  icon_name?: unknown;
  is_active?: unknown;
  is_kids_safe?: unknown;
  is_premium?: unknown;
  sort_order?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  // 1. Permission gate — cookie-scoped client so SECURITY DEFINER RPCs
  //    (record_admin_action) can resolve auth.uid().
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.categories.manage', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // 2. Rate limit — service-role client bypasses RLS on rate_limits.
  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_categories_mutate:${actorId}`,
    policyKey: 'admin_categories_mutate',
    max: RATE_MAX,
    windowSec: RATE_WINDOW_SEC,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec || RATE_WINDOW_SEC) } }
    );
  }

  // 3. Parse + validate.
  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 120) return badRequest('Name is required (1..120 chars)');

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!slug || slug.length > 120 || !SLUG_RE.test(slug)) {
    return badRequest('Slug must be lowercase letters, numbers, and hyphens');
  }

  let parentId: string | null = null;
  if (body.parent_id != null && body.parent_id !== '') {
    if (typeof body.parent_id !== 'string' || !UUID_RE.test(body.parent_id)) {
      return badRequest('Invalid parent_id');
    }
    parentId = body.parent_id;
  }

  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null;

  let colorHex: string | null = null;
  if (body.color_hex != null && body.color_hex !== '') {
    if (typeof body.color_hex !== 'string' || !HEX_RE.test(body.color_hex)) {
      return badRequest('color_hex must be a #RRGGBB value');
    }
    colorHex = body.color_hex.toLowerCase();
  }

  const iconName =
    typeof body.icon_name === 'string' && body.icon_name.trim() ? body.icon_name.trim() : null;

  const isActive = body.is_active === undefined ? true : body.is_active === true;
  const isKidsSafe = body.is_kids_safe === true;
  const isPremium = body.is_premium === true;

  let sortOrder = 0;
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return badRequest('sort_order must be a non-negative integer');
    }
    sortOrder = n;
  }

  // 4. Depth cap — parent (if any) must itself be top-level. The DB
  //    column supports unlimited hierarchy, but the product caps at
  //    category → subcategory. Enforce here to keep drift impossible.
  if (parentId) {
    const { data: parent, error: parentErr } = await service
      .from('categories')
      .select('id, parent_id, deleted_at')
      .eq('id', parentId)
      .maybeSingle();
    if (parentErr) {
      console.error('[admin.categories.create] parent lookup failed:', parentErr.message);
      return NextResponse.json({ error: 'Could not validate parent' }, { status: 500 });
    }
    if (!parent || parent.deleted_at) {
      return NextResponse.json({ error: 'Parent category not found' }, { status: 404 });
    }
    if (parent.parent_id) {
      return badRequest('Subcategories cannot have children (max 2 levels)');
    }
  }

  // 5. Insert.
  const { data, error } = await service
    .from('categories')
    .insert({
      name,
      slug,
      description,
      parent_id: parentId,
      color_hex: colorHex,
      icon_name: iconName,
      is_active: isActive,
      is_kids_safe: isKidsSafe,
      is_premium: isPremium,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[admin.categories.create]', error?.message || 'no row');
    // Slug uniqueness — Postgres surfaces 23505 unique_violation.
    const code = (error as { code?: string } | null)?.code;
    if (code === '23505') {
      return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not create category' }, { status: 500 });
  }

  // 6. Audit — best-effort, never blocks response.
  await recordAdminAction({
    action: parentId ? 'category.subcategory.create' : 'category.create',
    targetTable: 'categories',
    targetId: data.id,
    newValue: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      parent_id: data.parent_id,
    },
  });

  return NextResponse.json({ ok: true, row: data });
}
