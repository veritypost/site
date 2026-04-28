/**
 * Session C — `/<slug>` IS the article page (Decision 10).
 *
 * Resolves the path segment to a row in `articles.slug` and renders the
 * body server-side. Editors (articles.edit) get the inline editor +
 * toolbar layered on top via a client subtree; non-editors get a pure
 * read-only render. The editor bundle is code-split via next/dynamic so
 * the read-only path never pays for it.
 *
 * Drafts (status != 'published') are 404 to non-editors. RLS on the
 * articles table is intentionally NOT changed in this session — the
 * status check below is the gate.
 *
 * Metadata:
 *   - adult       → JsonLd NewsArticle + indexable
 *   - kids/tweens → robots noindex,nofollow (Decision 22 — COPPA risk
 *                   reduction; the kids iOS app is the canonical surface)
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import { JsonLd, newsArticle } from '@/components/JsonLd';
import { getSiteUrlOrNull } from '@/lib/siteUrl';
import ArticleSurface from '@/components/article/ArticleSurface';

export const dynamic = 'force-dynamic';

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  body: string | null;
  body_html: string | null;
  excerpt: string | null;
  status: string;
  age_band: string | null;
  is_kids_safe: boolean | null;
  is_ai_generated: boolean | null;
  ai_model: string | null;
  ai_provider: string | null;
  published_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

const ARTICLE_SELECT =
  'id, title, slug, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at';

function isCoppaBand(row: { age_band: string | null; is_kids_safe: boolean | null }): boolean {
  return row.age_band === 'kids' || row.age_band === 'tweens' || row.is_kids_safe === true;
}

async function fetchBySlug(slug: string): Promise<ArticleRow | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as ArticleRow | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const article = await fetchBySlug(params.slug);
  if (!article) return { title: 'Article not found · Verity Post' };

  const meta: Metadata = {
    title: article.title,
    description: article.excerpt ?? undefined,
  };
  if (isCoppaBand(article)) {
    meta.robots = { index: false, follow: false };
  }
  return meta;
}

export default async function ArticleSlugPage({ params }: { params: { slug: string } }) {
  const article = await fetchBySlug(params.slug);
  if (!article) notFound();

  // Permission snapshot — dual-check legacy admin keys alongside the new
  // 5-key set so the existing admin role works without a re-grant. Session
  // E drops the legacy half.
  const supabase = createClient();
  const [canEditNew, canEditLegacy, canPublishNew, canPublishLegacy] = await Promise.all([
    hasPermissionServer('articles.edit', supabase),
    hasPermissionServer('admin.articles.edit.any', supabase),
    hasPermissionServer('articles.publish', supabase),
    hasPermissionServer('admin.articles.publish', supabase),
  ]);
  const canEdit = canEditNew || canEditLegacy;
  const canPublish = canPublishNew || canPublishLegacy;

  // Drafts and archived: hidden from non-editors (404 — same surface as a
  // missing slug, no draft existence leak).
  if (article.status !== 'published' && !canEdit) notFound();

  const bodyHtml = article.body_html ?? (article.body ? renderBodyHtml(article.body) : '');
  const isCoppa = isCoppaBand(article);
  const siteUrl = getSiteUrlOrNull() ?? '';

  const jsonLd =
    !isCoppa && article.status === 'published' && siteUrl
      ? newsArticle({
          headline: article.title,
          url: `${siteUrl}/${article.slug}`,
          datePublished: article.published_at,
          dateModified: article.updated_at ?? article.published_at,
          description: article.excerpt,
          siteUrl,
          isAiGenerated: !!article.is_ai_generated,
          aiModel: article.ai_model,
          aiProvider: article.ai_provider,
        })
      : null;

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ArticleSurface
        article={{
          id: article.id,
          slug: article.slug,
          title: article.title,
          subtitle: article.subtitle,
          excerpt: article.excerpt,
          body: article.body ?? '',
          status: article.status,
          age_band: article.age_band,
          published_at: article.published_at,
          updated_at: article.updated_at,
        }}
        bodyHtml={bodyHtml}
        canEdit={canEdit}
        canPublish={canPublish}
      />
    </>
  );
}
