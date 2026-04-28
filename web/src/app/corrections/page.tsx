// S7-F1 — public corrections + retractions register.
//
// Per Q4.19 owner-lock: trust-transparency surface; launch-blocker.
// Surfaces the wired-but-not-rendered E5 fields
// (`articles.retraction_reason`, `articles.unpublished_at`, the
// `verified_by` join) so the editorial discipline is visible to
// readers, AdSense reviewers, and Apple App Review.
//
// Server component — reads directly from the articles table with the
// service-side client (RLS-enforced; only published-then-retracted
// rows surface). 100-row cap with month grouping when the list grows.
//
// Empty state: present-tense "no corrections" copy. NOT "no
// corrections yet" — that implies a future delivery (rule 3.1).

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Corrections — ${BRAND_NAME}`,
  description: `Public register of corrections, retractions, and unpublished articles on ${BRAND_NAME}.`,
  robots: { index: true, follow: true },
};

export const dynamic = 'force-dynamic';

interface CorrectionRow {
  id: string;
  title: string | null;
  slug: string | null;
  retraction_reason: string | null;
  unpublished_at: string | null;
  verified_by_user: { username: string | null; display_name: string | null } | null;
}

function monthKey(iso: string | null): string {
  if (!iso) return 'Undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Undated';
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function CorrectionsPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('articles')
    .select(
      'id, title, slug, retraction_reason, unpublished_at, verified_by_user:users!fk_articles_verified_by(username, display_name)',
    )
    .or('retraction_reason.not.is.null,unpublished_at.not.is.null')
    .order('unpublished_at', { ascending: false, nullsFirst: false })
    .limit(100)
    .returns<CorrectionRow[]>();

  // Group by month for readability.
  const groups: Record<string, CorrectionRow[]> = {};
  if (data) {
    data.forEach((row) => {
      const k = monthKey(row.unpublished_at);
      if (!groups[k]) groups[k] = [];
      groups[k].push(row);
    });
  }
  const groupOrder = Object.keys(groups);

  return (
    <main style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: '#111111',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Corrections
          </h1>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.6, margin: 0 }}>
            Public register of articles that have been corrected, retracted, or unpublished. Read
            our{' '}
            <Link href="/editorial-standards" style={{ color: '#111', fontWeight: 600 }}>
              editorial standards
            </Link>{' '}
            for the underlying policy.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: 14,
            }}
          >
            We could not load the corrections register. Try again in a moment.
          </div>
        ) : !data || data.length === 0 ? (
          <div
            style={{
              padding: '32px 24px',
              borderRadius: 12,
              border: '1px solid #e5e5e5',
              background: '#fafafa',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>
              No articles have been corrected or retracted.
            </h2>
            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, margin: 0 }}>
              When an article is corrected, retracted, or unpublished it appears here with the
              reason and date.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {groupOrder.map((month) => (
              <section key={month}>
                <h2
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: '#666',
                    margin: '0 0 12px',
                  }}
                >
                  {month}
                </h2>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {groups[month].map((row) => (
                    <li
                      key={row.id}
                      style={{
                        padding: '14px 16px',
                        background: '#fafafa',
                        border: '1px solid #e5e5e5',
                        borderRadius: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: '#111',
                          marginBottom: 4,
                        }}
                      >
                        {row.title || '(Untitled article)'}
                      </div>
                      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>
                        {row.retraction_reason || 'Unpublished by editorial decision.'}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#888',
                          marginTop: 8,
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{formatDate(row.unpublished_at)}</span>
                        {row.verified_by_user?.display_name && (
                          <span>
                            Reviewed by{' '}
                            <span style={{ color: '#555', fontWeight: 600 }}>
                              {row.verified_by_user.display_name}
                            </span>
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
