/**
 * Slice 05 — GET /api/articles/by-slug/[slug]
 *
 * Resolves slug via stories table (slug moved from articles to stories).
 * Returns the primary article for the story + permission snapshot.
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

  const { data: story, error: storyErr } = await service
    .from('stories')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (storyErr) {
    console.error('[api.articles.by-slug] story lookup failed:', storyErr.message);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!story) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data, error } = await service
    .from('articles')
    .select(
      'id, story_id, title, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at'
    )
    .eq('story_id', story.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[api.articles.by-slug] article lookup failed:', error.message);
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
    article: { ...data, slug: story.slug },
    permissions: { edit: canEdit, publish: canPublish },
  });
}
