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
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import sanitizeHtml from 'sanitize-html';
import { JsonLd, newsArticle } from '@/components/JsonLd';
import { getSiteUrlOrNull } from '@/lib/siteUrl';
import { incrementViewCount } from '@/lib/counters';
import { getAnonReadCount } from '@/lib/anonReadCounter';
import { RegistrationWallProvider } from '@/components/RegistrationWall';
import ArticleChrome from '@/components/article/ArticleChrome';
import ArticleSurface from '@/components/article/ArticleSurface';
import ArticleReaderTabs from '@/components/article/ArticleReaderTabs';
import TimelineSection from '@/components/article/TimelineSection';
import SourcesSection from '@/components/article/SourcesSection';
import ArticleEngagementZone from '@/components/ArticleEngagementZone';
import ArticleActions from '@/components/ArticleActions';
import ArticleTracker from '@/components/article/ArticleTracker';
import StoryArticlePicker from '@/components/article/StoryArticlePicker';
// kept-alive — launch-hide pattern (see line 347); do not remove
import AnonArticleCtaBanner from '@/components/article/AnonArticleCtaBanner';
import ArticleFetchFailed from './_ArticleFetchFailed';
import NextStoryFooter from '@/components/NextStoryFooter';
import RelatedStories from '@/components/article/RelatedStories';
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
  cover_image_url: string | null;
  cover_image_alt: string | null;
};

const ARTICLE_SELECT =
  'id, story_id, category_id, title, subtitle, body, body_html, excerpt, status, age_band, is_kids_safe, is_ai_generated, ai_model, ai_provider, published_at, updated_at, deleted_at, cover_image_url, cover_image_alt';

function isCoppaBand(row: { age_band: string | null; is_kids_safe: boolean | null }): boolean {
  return row.age_band === 'kids' || row.age_band === 'tweens' || row.is_kids_safe === true;
}

// React.cache memoizes per-request — generateMetadata and the page
// handler both call fetchBySlug with the same slug, so the second call
// reuses the first's result. Without this, the per-render Supabase
// roundtrip count doubles (stories + articles, twice). Cover image
// fields live in ARTICLE_SELECT so OG/Twitter metadata doesn't need a
// dedicated lookup.
const fetchBySlug = cache(async (
  slug: string,
): Promise<{ story: StoryRow; articles: ArticleRow[]; article: ArticleRow } | null> => {
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
});

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const found = await fetchBySlug(params.slug);
  if (!found) {
    // Slug isn't an article — check if it's a category short-link
    // (`/politics`, `/congress`, etc.). If so, return category-aware
    // metadata so the tab title reads "Politics · Verity Post" instead
    // of "Article not found".
    const service = createServiceClient();
    const { data: cat } = await service
      .from('categories')
      .select('name, slug')
      .eq('slug', params.slug)
      .is('deleted_at', null)
      .maybeSingle<{ name: string; slug: string }>();
    if (cat) {
      return {
        // Layout title template appends " · Verity Post"; just return
        // the section name so we don't double-suffix.
        title: cat.name,
        description: `${cat.name} coverage on Verity Post.`,
        alternates: { canonical: `/${cat.slug}` },
      };
    }
    return { title: 'Article not found · Verity Post' };
  }

  const publishedArticle = found.articles.find((a) => a.status === 'published' && a.published_at !== null);
  if (!publishedArticle) return { title: 'Article not found · Verity Post' };
  const article = publishedArticle;

  // COPPA-band articles stay noindex + skip social cards entirely; the
  // kids iOS app is the canonical surface and we don't want kid content
  // showing in Google or Twitter previews.
  if (isCoppaBand(article)) {
    return {
      title: article.title,
      description: article.excerpt ?? undefined,
      robots: { index: false, follow: false },
    };
  }

  const base = getSiteUrlOrNull();
  const path = `/${found.story.slug}`;
  const title = `${article.title} — Verity Post`;
  const description = article.excerpt?.slice(0, 160) || 'News you can trust.';
  // Cover image when set; else the article-aware opengraph-image route
  // renders title + excerpt on a brand plate. Absolute URL when base is
  // available — required for Twitter card consumption.
  const ogImage = article.cover_image_url
    ? { url: article.cover_image_url, alt: article.cover_image_alt || article.title }
    : {
        url: base ? `${base}${path}/opengraph-image` : `${path}/opengraph-image`,
        alt: article.title,
      };

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: 'article',
      publishedTime: article.published_at || undefined,
      siteName: 'Verity Post',
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage.url],
    },
  };
}

export default async function ArticleSlugPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { a?: string };
}) {
  // Category short-link — `/politics`, `/world`, etc. resolve to a
  // filtered home view before falling through to the article lookup
  // so owners can ship clean category URLs without a /category prefix.
  // Article slugs win when a slug exists in both tables (articles are
  // editorial content; categories are routing aliases).
  const article404 = await fetchBySlug(params.slug);
  if (!article404) {
    const catService = createServiceClient();
    const { data: cat } = await catService
      .from('categories')
      .select('slug')
      .eq('slug', params.slug)
      .is('deleted_at', null)
      .maybeSingle();
    if (cat) {
      const HomeRoot = (await import('../_home/HomeRoot')).default;
      return <HomeRoot filter={{ topic: params.slug }} />;
    }
    notFound();
  }
  const found = article404;

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
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user ?? null;

  const isAnon = !user;
  const cookieStore = cookies();
  const anonReadCount = isAnon
    ? getAnonReadCount(cookieStore.get('vp_anon_reads')?.value)
    : 0;
  const wallSuppressed = cookieStore.get('vp_wall_supp')?.value === '1';

  // Read wall behavior from the settings table. Both keys are also read by
  // iOS SettingsService — flipping a row from /admin (or directly in the
  // DB) controls both platforms. Web reads fresh on every request (this
  // page is force-dynamic); iOS caches for 60s. If the query fails or the
  // rows are missing, wallEnabled stays false → no tease, fail-open.
  const { data: wallSettingsRows } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['registration_wall', 'free_article_limit']);
  const wallEnabled =
    wallSettingsRows?.find((r) => r.key === 'registration_wall')?.value === 'true';
  const rawWallThreshold = wallSettingsRows?.find(
    (r) => r.key === 'free_article_limit'
  )?.value;
  const parsedThreshold = Number.parseInt(rawWallThreshold ?? '2', 10);
  // Guard against a hand-edited DB row containing junk ("abc", "5.5", "").
  // parseInt would yield NaN and `0 >= NaN` is always false — fail-open
  // but silently — so fall back to the same default we use when the row
  // is missing entirely.
  const wallThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 2;
  const articleCountReached =
    wallEnabled && isAnon && anonReadCount >= wallThreshold;

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
            .select('id, event_date, event_label, event_body, type, linked_article_id, metadata')
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
                .select('id, title, excerpt, story_id, published_at, stories!articles_story_id_fkey(slug)')
                .eq('category_id', article.category_id)
                .eq('status', 'published')
                .is('deleted_at', null)
                .neq('story_id', story.id)
                .order('published_at', { ascending: false })
                .limit(8)
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
  type NearbyRow = {
    id: string;
    title: string;
    excerpt: string | null;
    story_id: string | null;
    published_at: string | null;
    stories: { slug: string } | null;
  };
  const nearbyRows: NearbyRow[] = nearbyStoriesResult.error
    ? []
    : ((nearbyStoriesResult.data ?? []) as NearbyRow[]).filter((r) => r.stories?.slug);
  const nearbyStories: { slug: string; title: string }[] = nearbyRows
    .slice(0, 3)
    .map((r) => ({ slug: r.stories!.slug, title: r.title }));
  // Related stories rail (right column of the article reader). Same
  // category, most recent first, excludes the current story. Sits
  // alongside the story timeline on desktop ≥1180px so readers can
  // jump to adjacent coverage without scrolling to the page foot.
  const relatedStories = nearbyRows.slice(0, 5).map((r) => ({
    slug: r.stories!.slug,
    title: r.title,
    excerpt: r.excerpt,
    published_at: r.published_at,
  }));
  if (article.status !== 'published' && !canEdit) redirect(`/${story.slug}`);

  // Suppress view-count writes for Owner Mode holders so owner reading
  // their own articles doesn't pollute the read counter. The companion
  // ArticleTracker (analytics events) is gated client-side via
  // auth.isOwnerMode.
  const isOwnerModeViewer = await hasPermissionServer('admin.owner_mode');
  if (article.status === 'published' && !isOwnerModeViewer) {
    incrementViewCount(service, article.id).catch((e) => console.error('[article] incrementViewCount failed', e));
  }

  const bodyHtml = article.body_html
    ? sanitizeHtml(article.body_html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'mark', 'abbr', 'cite', 'q', 'small', 'dl', 'dt', 'dd', 's', 'sub', 'sup', 'pre', 'code', 'kbd', 'samp', 'var', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'col', 'colgroup', 'div', 'span']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          a: ['href', 'name', 'target', 'rel', 'title'],
          img: ['src', 'alt', 'title', 'width', 'height'],
          code: ['class'],
          pre: ['class'],
          th: ['scope', 'colspan', 'rowspan'],
          td: ['colspan', 'rowspan'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: { img: ['http', 'https', 'data'] },
        disallowedTagsMode: 'discard',
      })
    : (article.body ? renderBodyHtml(article.body) : '');
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
      <ArticleChrome />
      {jsonLd && <JsonLd data={jsonLd} />}
      {!isCoppa && article.status === 'published' && (
        <ArticleTracker articleId={article.id} articleSlug={story.slug} />
      )}
      {/* StoryArticlePicker hidden — sibling articles are still
          reachable via the "Continue the story" footer at the end of
          the article. The top-of-page tab strip felt redundant. */}
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
              canViewBody={isAnon ? true : canViewBody}
              isSignedIn={!!user}
            />
            {!isCoppa && (article.status === 'published' || canEdit || isOwnerModeViewer) && (
              <ArticleActions
                storyId={article.story_id ?? null}
                currentUserId={user?.id ?? null}
              />
            )}
            {/* Sources block — moved out of the timeline rail per TODO-3.
                Lives inside the article body so readers see provenance in
                the same scroll, not in a side rail they often miss.
                Logo-driven rows with click-to-expand headlines. */}
            <SourcesSection sources={!isAnon ? sources : []} showTease={false} articleCountReached={articleCountReached} />
          </>
        }
        timelineSlot={
          <>
            <TimelineSection events={!isAnon ? timeline : []} storySlug={story.slug} storyTitle={story.title} showTease={false} articleCountReached={articleCountReached} currentArticleId={article.id} />
            {/* Related stories — auto-fetched same-category, recent
                first. Sits between the timeline and the article_rail
                ad so readers can jump to adjacent coverage. */}
            <RelatedStories stories={relatedStories} categoryName={category?.name} />
            {/* article_rail: sticky right-rail on desktop ≥1180px (globals.css:828);
                tabbed inside the Timeline panel on mobile/tablet (display:none under
                the default Article tab — wasted serve calls on <1180px viewports). */}
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
              <a
                href={`veritypostkids://story/${story.slug}`}
                onClick={(e) => {
                  e.preventDefault();
                  window.location.href = `veritypostkids://story/${story.slug}`;
                  // BugList #5 — parse + allowlist before navigating
                  // off-domain. Without these, a typo'd or compromised
                  // env value silently sends every kids-link click
                  // wherever the bad value points. ALLOWED_HOSTS gates
                  // schemes too: javascript:/data:/file: have empty
                  // host strings and fall through.
                  const raw = process.env.NEXT_PUBLIC_KIDS_APP_URL;
                  if (!raw) return;
                  let fallback: string;
                  try {
                    fallback = new URL(raw).href;
                  } catch {
                    console.error('[kids-link] NEXT_PUBLIC_KIDS_APP_URL is not a valid URL:', raw);
                    return;
                  }
                  const ALLOWED_HOSTS = new Set(['apps.apple.com', 'itunes.apple.com']);
                  if (!ALLOWED_HOSTS.has(new URL(fallback).host)) {
                    console.error('[kids-link] host not in allowlist:', fallback);
                    return;
                  }
                  setTimeout(() => { window.location.href = fallback; }, 800);
                }}
                style={{
                  display: 'inline-block',
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'var(--vp-accent)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Open in Verity Kids
              </a>
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
