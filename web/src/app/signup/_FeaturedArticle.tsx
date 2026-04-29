import 'server-only';

import { createServiceClient } from '@/lib/supabase/server';
import { renderBodyHtml } from '@/lib/pipeline/render-body';

const ARTICLE_SELECT =
  'id, title, story_id, subtitle, body, body_html, excerpt, published_at, author_id, stories(slug)';

type ArticleRow = {
  id: string;
  title: string;
  story_id: string | null;
  stories: { slug: string } | null;
  subtitle: string | null;
  body: string;
  body_html: string | null;
  excerpt: string | null;
  published_at: string | null;
  author_id: string | null;
};

function firstTwoParagraphs(html: string): string {
  const matches = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) ?? [];
  return matches.slice(0, 2).join('');
}

function tierLabel(tier: string | null): string | null {
  if (!tier || tier === 'free') return null;
  if (tier === 'verity_pro') return 'pro';
  if (tier === 'verity_family') return 'family';
  return tier.replace(/_/g, ' ');
}

export default async function FeaturedArticle() {
  const service = createServiceClient();

  const { data: settingRow } = await service
    .from('settings')
    .select('value')
    .eq('key', 'signup_featured_article_id')
    .maybeSingle();

  const featuredId = (settingRow as { value: string } | null)?.value?.trim() ?? '';

  let article: ArticleRow | null = null;

  if (featuredId) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(featuredId);
    if (isUuid) {
      const { data } = await service
        .from('articles')
        .select(ARTICLE_SELECT)
        .eq('id', featuredId)
        .eq('status', 'published')
        .is('deleted_at', null)
        .maybeSingle();
      article = data as ArticleRow | null;
    } else {
      // slug lookup: resolve via stories table (slug moved in Slice 05)
      const { data: story } = await service
        .from('stories')
        .select('id')
        .eq('slug', featuredId)
        .maybeSingle();
      if (story) {
        const { data } = await service
          .from('articles')
          .select(ARTICLE_SELECT)
          .eq('story_id', story.id)
          .eq('status', 'published')
          .is('deleted_at', null)
          .maybeSingle();
        article = data as ArticleRow | null;
      }
    }
  }

  if (!article) {
    const { data } = await service
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('status', 'published')
      .is('deleted_at', null)
      .eq('is_kids_safe', false)
      .eq('is_verified', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    article = data as ArticleRow | null;
  }

  if (!article) {
    const { data } = await service
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('status', 'published')
      .is('deleted_at', null)
      .eq('is_kids_safe', false)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    article = data as ArticleRow | null;
  }

  if (!article) return null;

  // Author + tier
  let authorName: string | null = null;
  let label: string | null = null;

  if (article.author_id) {
    const { data: user } = await service
      .from('users')
      .select('display_name, username, plan_id')
      .eq('id', article.author_id)
      .maybeSingle();

    if (user) {
      const u = user as { display_name: string | null; username: string | null; plan_id: string | null };
      authorName = u.display_name ?? u.username ?? null;

      if (u.plan_id) {
        const { data: plan } = await service
          .from('plans')
          .select('tier')
          .eq('id', u.plan_id)
          .maybeSingle();
        label = tierLabel((plan as { tier: string } | null)?.tier ?? null);
      }
    }
  }

  const bodyHtml = article.body_html ?? renderBodyHtml(article.body ?? '');
  const snippetHtml = firstTwoParagraphs(bodyHtml);

  const publishDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <article
      style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        padding: '32px 0',
        margin: '40px 0',
      }}
    >
      {/* Byline row */}
      {(authorName || publishDate) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          {authorName && (
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>{authorName}</span>
          )}
          {label && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--dim)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '1px 6px',
                letterSpacing: 0.3,
              }}
            >
              {label}
            </span>
          )}
          {publishDate && (
            <span style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 'auto' }}>
              {publishDate}
            </span>
          )}
        </div>
      )}

      {/* Headline */}
      <h2
        style={{
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.25,
          margin: '0 0 8px 0',
          color: 'var(--text)',
          fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
          letterSpacing: '-0.02em',
        }}
      >
        {article.title}
      </h2>

      {article.subtitle && (
        <p
          style={{
            fontSize: 16,
            color: 'var(--dim)',
            margin: '0 0 20px 0',
            lineHeight: 1.5,
          }}
        >
          {article.subtitle}
        </p>
      )}

      {/* Body snippet — first 2 paragraphs, inline links preserved */}
      {snippetHtml && (
        <div
          style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--text)' }}
          // body_html is sanitized server-side by renderBodyHtml before storage
          dangerouslySetInnerHTML={{ __html: snippetHtml }}
        />
      )}

      <a
        href={article.stories?.slug ? `/${article.stories.slug}` : '#'}
        style={{
          display: 'inline-block',
          marginTop: 16,
          fontSize: 13,
          color: 'var(--accent)',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        read the full story →
      </a>
    </article>
  );
}
