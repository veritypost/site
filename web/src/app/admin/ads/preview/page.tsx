'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import Spinner from '@/components/admin/Spinner';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import Ad from '@/components/Ad';

// Surface → placement key mapping (mirrors actual ad slot definitions).
const SURFACE_PLACEMENTS: Record<string, string[]> = {
  home: ['home_in_feed_1', 'home_in_feed_2'],
  category: ['category_top', 'category_in_feed_1'],
  article: ['article_header', 'article_in_body', 'article_end', 'article_rail'],
  mobile: ['mobile_sticky_footer'],
};

const SURFACES = Object.keys(SURFACE_PLACEMENTS);
const TIERS = ['anon', 'free', 'verity_plus'];

function AdPreviewInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  // Form state
  const [surface, setSurface] = useState<string>('home');
  const [tier, setTier] = useState<string>('free');
  const [articleSlug, setArticleSlug] = useState<string>('');

  // Preview state — incremented on each "Preview" click to force Ad remounts
  const [previewKey, setPreviewKey] = useState(0);
  const [activeSurface, setActiveSurface] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const ok = ((r || []) as Array<{ roles: { name: string | null } | null }>).some(
        (x) => !!x.roles?.name && ADMIN_ROLES.has(x.roles.name)
      );
      if (!ok) { router.push('/'); return; }
      setAuthorized(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePreview() {
    setActiveSurface(surface);
    setPreviewKey((k) => k + 1);
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading…
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const placements = activeSurface ? (SURFACE_PLACEMENTS[activeSurface] ?? []) : [];

  return (
    <Page>
      <PageHeader
        title="Ad preview"
        subtitle="See which ads serve for a given surface and tier."
      />

      <PageSection title="Preview settings" boxed>
        <div style={{
          display: 'flex', gap: S[3], flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <Lbl label="Surface">
            <Select
              value={surface}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSurface(e.target.value)}
            >
              {SURFACES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Lbl>

          <Lbl label="Tier">
            <Select
              value={tier}
              disabled
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTier(e.target.value)}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
              Per-tier preview requires a RPC update — currently shows your session&apos;s ads.
            </div>
          </Lbl>

          {surface === 'article' && (
            <Lbl label="Article slug (optional)">
              <TextInput
                value={articleSlug}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setArticleSlug(e.target.value)}
                placeholder="e.g. my-article-slug"
                style={{ minWidth: 220 }}
              />
            </Lbl>
          )}

          <Button variant="primary" onClick={handlePreview}>
            Preview
          </Button>
        </div>

        <div style={{
          marginTop: S[3], padding: `${S[2]}px ${S[3]}px`, borderRadius: 6,
          background: C.card, border: `1px solid ${C.divider}`,
          fontSize: F.xs, color: C.dim, lineHeight: 1.6,
        }}>
          Preview shows ads as they appear for your current admin session.
          Per-tier simulation is available when the serve_ad RPC supports a
          tier-override parameter (<code>p_preview_tier</code>). Until then,
          the <code>preview_tier={tier}</code> param is passed to the route but
          the RPC uses your session&apos;s actual tier.
        </div>
      </PageSection>

      {activeSurface && (
        <PageSection
          title={`Placements — ${activeSurface}`}
          description={`${placements.length} slot${placements.length !== 1 ? 's' : ''} on this surface`}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: S[4],
          }}>
            {placements.map((key) => (
              <PlacementCard
                key={`${previewKey}-${key}`}
                placementKey={key}
                tier={tier}
                articleSlug={surface === 'article' ? articleSlug : ''}
              />
            ))}
          </div>
        </PageSection>
      )}
    </Page>
  );
}

// ---- Placement card ----
// Renders the Ad component for one slot and shows status metadata.

function PlacementCard({
  placementKey,
  tier,
  articleSlug,
}: {
  placementKey: string;
  tier: string;
  articleSlug: string;
}) {
  return (
    <div style={{
      border: `1px solid ${C.divider}`, borderRadius: 10,
      background: C.bg, overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        padding: `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.divider}`,
        background: C.card,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: F.xs, fontWeight: 700, color: C.soft, fontFamily: 'monospace' }}>
          {placementKey}
        </span>
        <span style={{ fontSize: F.xs, color: C.muted }}>
          tier: {tier}
        </span>
      </div>

      {/* Ad slot */}
      <div style={{ padding: `${S[2]}px ${S[3]}px`, minHeight: 80 }}>
        <AdSlotWithFallback
          placementKey={placementKey}
          tier={tier}
          articleSlug={articleSlug}
        />
      </div>
    </div>
  );
}

// Wraps Ad with an error boundary and a "no ad" fallback using a local state
// flag. Since Ad renders null when the serve returns nothing, we observe
// whether it mounted with content by rendering an outer wrapper.
function AdSlotWithFallback({
  placementKey,
  tier,
  articleSlug,
}: {
  placementKey: string;
  tier: string;
  articleSlug: string;
}) {
  const [status, setStatus] = useState<'loading' | 'served' | 'empty'>('loading');

  // Detect whether Ad rendered anything by checking serve response directly.
  useEffect(() => {
    const params = new URLSearchParams({ placement: placementKey, preview_tier: tier });
    if (articleSlug) params.set('article_slug', articleSlug);
    fetch(`/api/ads/serve?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setStatus(d?.ad_unit ? 'served' : 'empty');
      })
      .catch(() => setStatus('empty'));
  }, [placementKey, tier, articleSlug]);

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], color: C.muted, fontSize: F.sm }}>
        <Spinner /> Fetching…
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div style={{
        padding: `${S[3]}px`, textAlign: 'center',
        color: C.muted, fontSize: F.sm,
        border: `1px dashed ${C.divider}`, borderRadius: 6,
      }}>
        No ad available
      </div>
    );
  }

  // Ad will render its own UI when served.
  return <Ad placement={placementKey} />;
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
        color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</label>
      {children}
    </div>
  );
}

export default function AdPreviewPage() {
  return <AdPreviewInner />;
}
