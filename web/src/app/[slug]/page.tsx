/**
 * Slice 05 — `/<slug>` is a story page (Decision 10).
 *
 * Resolves the slug against `stories.slug`. Stories own the canonical URL;
 * articles hang off stories via story_id. Supports multi-article stories via
 * the `?a=<article-id>` search param; defaults to the most-recent article.
 *
 * Metadata:
 *   - adult       → JsonLd NewsArticle + indexable
 *   - kids/tweens → robots noindex,nofollow (COPPA; kids iOS app is canonical)
 */
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import { JsonLd, newsArticle } from '@/components/JsonLd';
import { getSiteUrlOrNull } from '@/lib/siteUrl';
import { incrementViewCount } from '@/lib/counters';
import { getAnonReadCount } from '@/lib/anonReadCounter';
import { RegistrationWallProvider } from '@/components/RegistrationWall';
import ArticleSurface from '@/components/article/ArticleSurface';
import ArticleReaderTabs from '@/components/article/ArticleReaderTabs';
import TimelineSection from '@/components/article/TimelineSection';
import SourcesSection from '@/components/article/SourcesSection';
import ArticleEngagementZone from '@/components/ArticleEngagementZone';
import ArticleActions from '@/components/ArticleActions';
import ArticleTracker from '@/components/article/ArticleTracker';
import StoryArticlePicker from '@/components/article/StoryArticlePicker';
import AnonArticleCtaBanner from '@/components/article/AnonArticleCtaBanner';
import ArticleFetchFailed from './_ArticleFetchFailed';
import NextStoryFooter from '@/components/NextStoryFooter';
import Ad from '@/components/Ad';

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
  category_id: string | null;
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
  'id, story_id, category_id, title, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at';

function isCoppaBand(row: { age_band: string | null; is_kids_safe: boolean | null }): boolean {
  return row.age_band === 'kids' || row.age_band === 'tweens' || row.is_kids_safe === true;
}

async function fetchBySlug(
  slug: string,
): Promise<{ story: StoryRow; articles: ArticleRow[]; article: ArticleRow } | null> {
  const service = createServiceClient();
  const { data: story } = await service
    .from('stories')
    .select('id, slug, title, published_at')
    .eq('slug', slug)
    .maybeSingle();
  if (!story) return null;

  const { data: articles } = await service
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('story_id', story.id)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (!articles || articles.length === 0) return null;

  return {
    story: story as StoryRow,
    articles: articles as ArticleRow[],
    article: articles[0] as ArticleRow,
  };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const found = await fetchBySlug(params.slug);
  if (!found) return { title: 'Article not found · Verity Post' };

  const publishedArticle = found.articles.find((a) => a.status === 'published' && a.published_at !== null);
  if (!publishedArticle) return { title: 'Article not found · Verity Post' };
  const article = publishedArticle;
  const meta: Metadata = {
    title: article.title,
    description: article.excerpt ?? undefined,
  };
  if (isCoppaBand(article)) {
    meta.robots = { index: false, follow: false };
  }
  return meta;
}

export default async function ArticleSlugPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { a?: string };
}) {
  const found = await fetchBySlug(params.slug);
  if (!found) notFound();

  const { story, articles } = found;
  const defaultArticle =
    articles.find((a) => a.status === 'published' && a.published_at !== null) ?? articles[0];
  let article = defaultArticle;
  if (searchParams.a) {
    const matched = found.articles.find((a) => a.id === searchParams.a);
    if (!matched) redirect(`/${story.slug}`);
    article = matched;
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isAnon = !user;
  const cookieStore = cookies();
  const anonReadCount = isAnon
    ? getAnonReadCount(cookieStore.get('vp_anon_reads')?.value)
    : 0;
  const wallSuppressed = cookieStore.get('vp_wall_supp')?.value === '1';
  const WALL_THRESHOLD = 2;

  const service = createServiceClient();
  const fetchResult = await (async () => {
    try {
      return {
        ok: true as const,
        data: await Promise.all([
          hasPermissionServer('articles.edit', supabase),
          hasPermissionServer('admin.articles.edit.any', supabase),
          hasPermissionServer('article.view.body', supabase),
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
            .select('id, event_date, event_label, event_body, type, linked_article_id')
            .eq('story_id', story.id)
            .order('event_date', { ascending: true }),
          article.category_id
            ? service
                .from('categories')
                .select('name, slug')
                .eq('id', article.category_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          article.category_id
            ? service
                .from('articles')
                .select('title, story_id, stories!articles_story_id_fkey(slug)')
                .eq('category_id', article.category_id)
                .eq('status', 'published')
                .is('deleted_at', null)
                .neq('story_id', story.id)
                .order('published_at', { ascending: false })
                .limit(3)
            : Promise.resolve({ data: [], error: null }),
        ]),
      };
    } catch (e) {
      console.error('[article.fetch]', e);
      return { ok: false as const };
    }
  })();

  if (!fetchResult.ok) {
    return <ArticleFetchFailed />;
  }

  const [
    canEditNew,
    canEditLegacy,
    canViewBody,
    quizCountResult,
    passCheckResult,
    sourcesResult,
    timelineResult,
    categoryResult,
    nearbyStoriesResult,
  ] = fetchResult.data;

  if (quizCountResult.error) console.error('[article] quiz count query failed', quizCountResult.error);
  if (passCheckResult.error) console.error('[article] quiz pass query failed', passCheckResult.error);
  if (categoryResult.error) console.error('[article] category query failed', categoryResult.error);
  if (nearbyStoriesResult.error) console.error('[article] nearby stories query failed', nearbyStoriesResult.error);

  const canEdit = canEditNew || canEditLegacy;
  const hasQuiz = quizCountResult.error ? false : (quizCountResult.count ?? 0) > 0;
  const initialPassed = passCheckResult.error ? false : !!passCheckResult.data;
  const sources = sourcesResult.data ?? [];
  const timeline = timelineResult.data ?? [];
  const category = categoryResult.error ? null : (categoryResult.data as { name: string; slug: string } | null);
  type NearbyRow = { title: string; story_id: string | null; stories: { slug: string } | null };
  const nearbyStories: { slug: string; title: string }[] = nearbyStoriesResult.error
    ? []
    : ((nearbyStoriesResult.data ?? []) as NearbyRow[])
        .filter((r) => r.stories?.slug)
        .map((r) => ({ slug: r.stories!.slug, title: r.title }));

  if (article.status !== 'published' && !canEdit) redirect(`/${story.slug}`);

  // Suppress view-count writes for Owner Mode holders so owner reading
  // their own articles doesn't pollute the read counter. The companion
  // ArticleTracker (analytics events) is gated client-side via
  // auth.isOwnerMode.
  const isOwnerModeViewer = await hasPermissionServer('admin.owner_mode');
  if (article.status === 'published' && !isOwnerModeViewer) {
    incrementViewCount(service, article.id).catch((e) => console.error('[article] incrementViewCount failed', e));
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
        })
      : null;

  const pickerArticles = (canEdit ? articles : articles.filter((a) => a.status === 'published'))
    .map((a) => ({ id: a.id, title: a.title, published_at: a.published_at, status: a.status }));

  return (
    <RegistrationWallProvider
      isAnon={isAnon}
      initialSuppressed={wallSuppressed}
    >
      <>
      {jsonLd && <JsonLd data={jsonLd} />}
      {!isCoppa && article.status === 'published' && (
        <ArticleTracker articleId={article.id} articleSlug={story.slug} />
      )}
      {pickerArticles.length > 1 && (
        <StoryArticlePicker
          articles={pickerArticles}
          currentArticleId={article.id}
          storySlug={story.slug}
        />
      )}
      <ArticleReaderTabs
        articleSlot={
          <>
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
              canViewBody={canViewBody}
            />
            {!isCoppa && (article.status === 'published' || canEdit || isOwnerModeViewer) && (
              <ArticleActions
                articleId={article.id}
                currentUserId={user?.id ?? null}
              />
            )}
            {isAnon && <AnonArticleCtaBanner />}
          </>
        }
        timelineSlot={
          <>
            <TimelineSection events={!isAnon ? timeline : []} storySlug={story.slug} showTease={isAnon && timeline.length > 0} articleCountReached={anonReadCount >= WALL_THRESHOLD} />
            <SourcesSection sources={!isAnon ? sources : []} showTease={isAnon && sources.length > 0} articleCountReached={anonReadCount >= WALL_THRESHOLD} />
            {/* article_rail: sticky right-rail ad on desktop (non-COPPA articles only) */}
            {!isCoppa && <Ad placement="article_rail" page="article" position="rail" articleId={article.id} />}
          </>
        }
        engagementSlot={
          isCoppa ? (
            <div style={{
              padding: '20px 0',
              fontSize: 14,
              color: 'var(--dim, #666)',
              lineHeight: 1.6,
            }}>
              <p style={{ margin: '0 0 12px' }}>
                From the Kids edition. The quiz, discussion, and reactions live in the Verity Kids iOS app.
              </p>
              {process.env.NEXT_PUBLIC_KIDS_APP_URL ? (
                <a
                  href={process.env.NEXT_PUBLIC_KIDS_APP_URL}
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: 'var(--accent, #111)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Open in Verity Kids
                </a>
              ) : (
                <span style={{ fontSize: 13 }}>Download the Verity Kids app to join.</span>
              )}
            </div>
          ) : (article.status === 'published' || canEdit || isOwnerModeViewer) ? (
            <ArticleEngagementZone
              key={article.id}
              articleId={article.id}
              articleCategoryId={article.category_id}
              hasQuiz={hasQuiz}
              initialPassed={initialPassed}
              currentUserId={user?.id ?? null}
              canBypassQuiz={canEdit || isOwnerModeViewer}
              isPreview={article.status !== 'published'}
            />
          ) : null
        }
      />
      {/* article_end: before NextStoryFooter */}
      <Ad placement="article_end" page="article" position="end" articleId={article.id} />
      <NextStoryFooter category={category} nearbyStories={nearbyStories} />
      </>
    </RegistrationWallProvider>
  );
}
