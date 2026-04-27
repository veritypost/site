/**
 * Tweens Story Manager — Phase 3 of AI + Plan Change Implementation.
 *
 * Mirrors /admin/kids-story-manager but scoped to age_band='tweens'
 * (ages 10-12). Both managers exist because the pipeline now produces
 * up to two articles per kid-safe cluster (kids 7-9 + tweens 10-12),
 * and editors need a separate surface to review/edit each band.
 *
 * Phase 3 ship is intentionally minimal: a list of tweens articles with
 * status filters, click-through to admin/articles/[id] for the actual
 * edit flow (which itself was consolidated in Phase 1 to handle both
 * audiences via the unified articles table). The richer in-place editor
 * pattern from kids-story-manager will be brought over in a follow-up
 * once the BandedStoryEditor refactor lands (planned post-Phase 6).
 *
 * Permission: admin.system.view (same gate as the rest of /admin/*).
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Page, { PageHeader } from '@/components/admin/Page';
import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database';

type ArticleRow = Tables<'articles'>;

const ADMIN_C = {
  bg: '#fafafa',
  card: '#fff',
  border: '#e5e5e5',
  text: '#0a0a0a',
  dim: '#666',
  accent: '#0070f3',
  success: '#16a34a',
  warn: '#b45309',
};

const STATUS_BADGES: Record<string, string> = {
  draft: '#6b7280',
  review: '#b45309',
  published: '#16a34a',
  archived: '#9ca3af',
  retracted: '#dc2626',
};

export default function TweensStoryManagerPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        router.push('/');
        return;
      }
      try {
        // Cast: generated Database types lag the Phase 3 migration that
        // adds age_band to articles; the column exists post-deploy.
        const { data, error } = await supabase
          .from('articles')
          .select('*')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('is_kids_safe', true)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('age_band' as never, 'tweens')
          .order('created_at', { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setArticles([]);
        } else {
          setArticles((data as unknown as ArticleRow[]) || []);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filtered = articles.filter((a) => {
    if (statusFilter === 'all') return true;
    return a.status === statusFilter;
  });

  return (
    <Page>
      <PageHeader
        title="Tweens Story Manager"
        subtitle="Review + edit articles for ages 10-12. Generated alongside the kids version (ages 7-9) when a kid-safe cluster is published. Edit each in /admin/articles/:id."
      />
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'draft', 'review', 'published', 'archived'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${ADMIN_C.border}`,
              background: statusFilter === s ? ADMIN_C.accent : ADMIN_C.card,
              color: statusFilter === s ? '#fff' : ADMIN_C.text,
              cursor: 'pointer',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: ADMIN_C.dim }}>Loading…</div>}
      {error && (
        <div
          style={{
            padding: 12,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          Couldn&apos;t load: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: ADMIN_C.dim,
            background: ADMIN_C.card,
            border: `1px solid ${ADMIN_C.border}`,
            borderRadius: 8,
          }}
        >
          No tweens articles {statusFilter === 'all' ? 'yet' : `with status="${statusFilter}"`}.
          Tweens articles are generated automatically alongside kids articles when a kid-safe
          cluster is published in the newsroom.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((a) => (
          <Link
            key={a.id}
            href={`/admin/articles/${a.id}`}
            style={{
              display: 'flex',
              gap: 12,
              padding: 12,
              background: ADMIN_C.card,
              border: `1px solid ${ADMIN_C.border}`,
              borderRadius: 8,
              textDecoration: 'none',
              color: ADMIN_C.text,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                {a.title || '(untitled)'}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: ADMIN_C.dim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.kids_summary || a.excerpt || a.slug}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: STATUS_BADGES[a.status] || ADMIN_C.dim,
                }}
              >
                {a.status}
              </span>
              <span style={{ fontSize: 11, color: ADMIN_C.dim }}>
                {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
