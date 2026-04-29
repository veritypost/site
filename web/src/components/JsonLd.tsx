// Ext-SS.2 — server-rendered JSON-LD structured data.
//
// One small component, used at three callsites:
//   - app/layout.js     -> Organization + WebSite (constant; site root)
//   - app/story/[slug]/ -> NewsArticle (per-article)
//   - app/u/[username]/ -> Person (verified profile / expert)
//
// Inline injection is intentional: search-engine crawlers parse the
// HTML response directly; client-side React injection wouldn't be
// indexed reliably. Keep the component server-only — no `'use client'`.

import { JSX } from 'react';

interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Drop one of these into a server component. The serialized JSON is
 * dangerouslySet because that's the only way to embed inert text into
 * a `<script>` tag; the input is a typed object that we control, never
 * user input, so XSS surface is zero. We escape `</` to `<\/` per OWASP
 * to neutralize the only known break-out vector for JSON-in-script.
 */
export function JsonLd({ data }: JsonLdProps): JSX.Element {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

// ---- Schema builders --------------------------------------------------

/**
 * Constant Organization + WebSite pair. Use in app/layout.js so it
 * appears on every page. Both are required for Google's News carousel
 * + sitelinks.
 */
export function organizationAndWebSite(siteUrl: string) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Verity Post',
      url: siteUrl,
      logo: `${siteUrl}/icon.svg`,
      sameAs: [],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Verity Post',
      url: siteUrl,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ];
}

interface NewsArticleInput {
  headline: string;
  url: string;
  datePublished?: string | null;
  dateModified?: string | null;
  authorName?: string | null;
  authorUrl?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  siteUrl: string;
}

export function newsArticle(input: NewsArticleInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': input.url,
    },
    headline: input.headline,
    datePublished: input.datePublished || undefined,
    dateModified: input.dateModified || input.datePublished || undefined,
    description: input.description || undefined,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    author: input.authorName
      ? {
          '@type': 'Person',
          name: input.authorName,
          url: input.authorUrl || undefined,
        }
      : undefined,
    publisher: {
      '@type': 'Organization',
      name: 'Verity Post',
      url: input.siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${input.siteUrl}/icon.svg`,
      },
    },
  };
}

interface PersonInput {
  name: string;
  url: string;
  jobTitle?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  sameAs?: string[];
}

export function person(input: PersonInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: input.name,
    url: input.url,
    jobTitle: input.jobTitle || undefined,
    description: input.description || undefined,
    image: input.imageUrl || undefined,
    sameAs: input.sameAs && input.sameAs.length > 0 ? input.sameAs : undefined,
  };
}
