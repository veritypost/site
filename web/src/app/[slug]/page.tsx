/**
 * Slice 05 — `/<slug>` is a story page (Decision 10).
 *
 * Resolves the slug against `stories.slug`. Stories own the canonical URL;
 * articles hang off stories via story_id. For the current 1:1 shape (one
 * article per story) we load the single article for the story. The `?a=`
 * query param is reserved for future multi-article story pages.
 *
 * Metadata:
 *   - adult       → JsonLd NewsArticle + indexable
 *   - kids/tweens → robots noindex,nofollow (COPPA; kids iOS app is canonical)
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import { JsonLd, newsArticle } from '@/components/JsonLd';
import { getSiteUrlOrNull } from '@/lib/siteUrl';
import { incrementViewCount } from '@/lib/counters';
import ArticleSurface from '@/components/article/ArticleSurface';
import ArticleEngagementZone from '@/components/ArticleEngagementZone';
import ArticleTracker from '@/components/article/ArticleTracker';

export const dynamic = 'force-dynamic';

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
};

type ArticleRow = {
  id: string;
  story_id: string | null;
  title: string;
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
  'id, story_id, title, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at';

function isCoppaBand(row: { age_band: string | null; is_kids_safe: boolean | null }): boolean {
  return row.age_band === 'kids' || row.age_band === 'tweens' || row.is_kids_safe === true;
}

async function fetchBySlug(slug: string): Promise<{ story: StoryRow; article: ArticleRow } | null> {
  const service = createServiceClient();
  const { data: story } = await service
    .from('stories')
    .select('id, slug, title, published_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!story) return null;

  const { data: article } = await service
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('story_id', story.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!article) return null;

  return { story: story as StoryRow, article: article as ArticleRow };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const found = await fetchBySlug(params.slug);
  if (!found) return { title: 'Article not found · Verity Post' };

  const { article } = found;
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
  const found = await fetchBySlug(params.slug);
  if (!found) notFound();

  const { story, article } = found;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const service = createServiceClient();
  const [
    canEditNew,
    canEditLegacy,
    canPublishNew,
    canPublishLegacy,
    quizCountResult,
    passCheckResult,
    sourcesResult,
    timelineResult,
  ] = await Promise.all([
    hasPermissionServer('articles.edit', supabase),
    hasPermissionServer('admin.articles.edit.any', supabase),
    hasPermissionServer('articles.publish', supabase),
    hasPermissionServer('admin.articles.publish', supabase),
    service
      .from('quizzes')
      .select('*', { count: 'exact', head: true })
      .eq('article_id', article.id)
      .eq('is_active', true)
      .is('deleted_at', null),
    user
      ? service.rpc('user_passed_article_quiz', {
          p_user_id: user.id,
          p_article_id: article.id,
        })
      : Promise.resolve({ data: null, error: null }),
    service
      .from('sources')
      .select('title, url, publisher, sort_order')
      .eq('article_id', article.id)
      .order('sort_order', { ascending: true }),
    service
      .from('timelines')
      .select('id, event_date, event_label, event_body')
      .eq('story_id', story.id)
      .eq('type', 'event')
      .order('event_date', { ascending: true }),
  ]);

  const canEdit = canEditNew || canEditLegacy;
  const canPublish = canPublishNew || canPublishLegacy;
  const hasQuiz = (quizCountResult.count ?? 0) > 0;
  const initialPassed = !!passCheckResult.data;
  const sources = sourcesResult.data ?? [];
  const timeline = timelineResult.data ?? [];

  if (article.status !== 'published' && !canEdit) notFound();

  if (article.status === 'published') {
    incrementViewCount(service, article.id).catch(() => {});
  }

  const bodyHtml = article.body_html ?? (article.body ? renderBodyHtml(article.body) : '');
  const isCoppa = isCoppaBand(article);
  const siteUrl = getSiteUrlOrNull() ?? '';

  const jsonLd =
    !isCoppa && article.status === 'published' && siteUrl
      ? newsArticle({
          headline: article.title,
          url: `${siteUrl}/${story.slug}`,
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
      {!isCoppa && article.status === 'published' && (
        <ArticleTracker articleId={article.id} articleSlug={story.slug} />
      )}
      <ArticleSurface
        article={{
          id: article.id,
          slug: story.slug,
          title: article.title,
          subtitle: article.subtitle,
          excerpt: article.excerpt,
          body: article.body ?? '',
          status: article.status,
          age_band: article.age_band,
          is_kids_safe: article.is_kids_safe,
          published_at: article.published_at,
          updated_at: article.updated_at,
        }}
        bodyHtml={bodyHtml}
        canEdit={canEdit}
        canPublish={canPublish}
        sources={sources}
        timeline={timeline}
      />
      {!isCoppa && article.status === 'published' && (
        <ArticleEngagementZone
          key={article.id}
          articleId={article.id}
          hasQuiz={hasQuiz}
          initialPassed={initialPassed}
          currentUserId={user?.id ?? null}
        />
      )}
    </>
  );
}
