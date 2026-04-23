// @migrated-to-permissions 2026-04-18
// @feature-verified profile_card 2026-04-18
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import StatRow from '../../../../components/StatRow';

// Per-category subcategory drill-in. Shows the viewer's own reads /
// quizzes passed / comments posted / upvotes received across each
// subcategory of a single category. Owned-profile only; other users'
// drill-in is paid-tier territory per D5 and not in this scope.
//
// Thresholds chosen to feel rewarding at sustained engagement but not
// trivial at a single session. Mirror profile/page.js CAT_THRESHOLDS.
const SUB_THRESHOLDS = { reads: 25, quizzes: 15, comments: 10, upvotes: 25 };

export default function ProfileCategoryDrillIn() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [category, setCategory] = useState(null);
  const [subMetrics, setSubMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login?next=' + encodeURIComponent(`/profile/category/${id}`));
        return;
      }

      const { data: cat, error: catErr } = await supabase
        .from('categories')
        .select('id, name, slug, metadata')
        .eq('id', id)
        .maybeSingle();

      if (catErr || !cat) {
        setError('Category not found.');
        setLoading(false);
        return;
      }
      setCategory(cat);

      const { data: metrics, error: metErr } = await supabase.rpc('get_user_category_metrics', {
        p_user_id: user.id,
        p_category_id: id,
      });
      if (metErr) {
        setError(metErr.message || 'Could not load subcategory metrics.');
        setLoading(false);
        return;
      }

      setSubMetrics(metrics || []);
      setLoading(false);
    })();
  }, [id]);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      <a
        href="/profile?tab=Categories"
        style={{
          display: 'inline-block',
          fontSize: 12,
          color: 'var(--dim)',
          textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        Back to profile
      </a>

      {loading && (
        <div style={{ color: 'var(--dim)', fontSize: 13, padding: 24, textAlign: 'center' }}>
          Loading...
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && category && (
        <>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 4px',
            }}
          >
            {category.name}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 20 }}>
            Your activity across every subcategory.
          </div>

          {subMetrics.length === 0 && (
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--dim)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              This category has no subcategories yet.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subMetrics.map((row) => (
              <div
                key={row.subcategory_id || row.name}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: 10,
                  }}
                >
                  {row.name}
                </div>
                <StatRow
                  label="Reads"
                  value={Number(row.reads) || 0}
                  total={SUB_THRESHOLDS.reads}
                />
                <StatRow
                  label="Quizzes"
                  value={Number(row.quizzes_passed) || 0}
                  total={SUB_THRESHOLDS.quizzes}
                />
                <StatRow
                  label="Comments"
                  value={Number(row.comments) || 0}
                  total={SUB_THRESHOLDS.comments}
                />
                <StatRow
                  label="Upvotes"
                  value={Number(row.upvotes_received) || 0}
                  total={SUB_THRESHOLDS.upvotes}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
