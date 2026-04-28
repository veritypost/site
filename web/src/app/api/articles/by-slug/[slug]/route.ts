/**
 * Session C — GET /api/articles/by-slug/[slug]
 *
 * Resolves a slug → article + permission snapshot. Used by the article
 * page when it needs to refetch client-side (e.g., after a slug change
 * before redirecting to the new URL). Visibility of drafts is governed
 * by the route's own permission gate: non-editors get a 404 for any row
 * with status != 'published'.
 *
 * Permission: any authenticated viewer is allowed; the response itself
 * draws the permission line. Anonymous viewers get the published row
 * with a permissions snapshot of {edit:false, publish:false}.
 */
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params?.slug;
  if (!slug || typeof slug !== 'string' || slug.length === 0) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('articles')
    .select(
      'id, title, slug, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at'
    )
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[api.articles.by-slug] lookup failed:', error.message);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = createClient();
  const [canEditNew, canEditLegacy, canPublishNew, canPublishLegacy] = await Promise.all([
    hasPermissionServer('articles.edit', supabase),
    hasPermissionServer('admin.articles.edit.any', supabase),
    hasPermissionServer('articles.publish', supabase),
    hasPermissionServer('admin.articles.publish', supabase),
  ]);
  const canEdit = canEditNew || canEditLegacy;
  const canPublish = canPublishNew || canPublishLegacy;

  if (data.status !== 'published' && !canEdit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    article: data,
    permissions: { edit: canEdit, publish: canPublish },
  });
}
