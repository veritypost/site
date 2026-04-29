import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import FeaturedArticle from './_FeaturedArticle';
import AccessFlow from './_AccessFlow';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/');

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '64px 24px 96px',
          boxSizing: 'border-box',
        }}
      >
        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: 'var(--accent)',
                letterSpacing: '-0.02em',
              }}
            >
              verity post
            </span>
          </a>
        </div>

        {/* Manifesto — 3 lines, lowercase, centered. Copy polished in Session 6. */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text)',
              margin: '0 0 12px 0',
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
              fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
            }}
          >
            news that&rsquo;s been checked, not just published.
          </p>
          <p style={{ fontSize: 16, color: 'var(--dim)', margin: '0 0 8px 0', lineHeight: 1.55 }}>
            every story is verified before it reaches you.
          </p>
          <p style={{ fontSize: 16, color: 'var(--dim)', margin: 0, lineHeight: 1.55 }}>
            we&rsquo;re invite-only while we build it right.
          </p>
        </div>

        {/* Featured article snippet — live article, server-fetched */}
        <FeaturedArticle />

        {/* 4-step access flow + CTAs */}
        <AccessFlow />
      </div>
    </div>
  );
}
