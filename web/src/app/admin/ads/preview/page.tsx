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

// Surface → placement list is now derived from live `ad_placements` rows
// at mount. Hardcoded list dropped 2026-05-13 after the iOS landmine
// rename (home_in_feed_1 → ios_home_in_feed_1_{anon,free}) silently
// broke the home preview. DB is canonical; admin tools key off it.
type Placement = { name: string; page: string; platform: string };

// Surface name shown in the dropdown. Most map to `ad_placements.page`
// directly; the one alias is `global → mobile` because the only
// page='global' placement today is the mobile sticky banner.
function surfaceFromPage(page: string): string {
  return page === 'global' ? 'mobile' : page;
}

const TIERS = ['anon', 'free', 'verity_plus'];

// Device viewport simulator. The web Ad component renders the same DOM
// regardless of device, but CSS breakpoints and the mobile_sticky_footer
// placement change at narrow widths — clamping the preview container to
// each device's typical width lets admins eyeball CLS reserves and
// mobile-specific layout without resizing the browser. The 'ios' variant
// is a heads-up: iOS native renders via HomeAdSlot (SwiftUI), not the
// web Ad component — same serve payload, different chrome. Showing the
// web representation alongside the iPhone frame is the most honest
// approximation available without a simulator embed.
type DeviceMode = 'desktop' | 'mobile' | 'ios';

const DEVICE_WIDTH: Record<DeviceMode, number | null> = {
  desktop: null, // fluid up to container max
  mobile: 390,
  ios: 390,
};

function AdPreviewInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [placementRows, setPlacementRows] = useState<Placement[]>([]);

  // Form state
  const [surface, setSurface] = useState<string>('home');
  const [tier, setTier] = useState<string>('free');
  const [articleSlug, setArticleSlug] = useState<string>('');
  const [device, setDevice] = useState<DeviceMode>('desktop');

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
      // Load the live active placement set. Surface dropdown + per-card
      // render derive from this — never hardcoded.
      const { data: rows } = await supabase
        .from('ad_placements')
        .select('name, page, platform')
        .eq('is_active', true)
        .order('platform', { ascending: true })
        .order('page', { ascending: true })
        .order('name', { ascending: true });
      setPlacementRows((rows ?? []) as Placement[]);
      setAuthorized(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group live placements by visible surface name.
  const surfaceMap = useMemo(() => {
    const m: Record<string, Placement[]> = {};
    for (const p of placementRows) (m[surfaceFromPage(p.page)] ??= []).push(p);
    return m;
  }, [placementRows]);
  const SURFACES = useMemo(() => Object.keys(surfaceMap).sort(), [surfaceMap]);

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

  const placements = activeSurface ? (surfaceMap[activeSurface] ?? []) : [];

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

          <Lbl label="Device">
            <DeviceToggle value={device} onChange={setDevice} />
          </Lbl>

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

        <div role="note" style={{
          marginTop: S[2], padding: `${S[2]}px ${S[3]}px`, borderRadius: 6,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          fontSize: F.xs, color: C.ink, lineHeight: 1.55,
        }}>
          <strong style={{ fontWeight: 700 }}>Preview renders unsanitized creative.</strong>{' '}
          This page shows raw <code>creative_html</code> so you can verify what
          you authored. Production strips tags, attributes, and CSS properties
          outside the ad allowlist (see <code>_SsrAdCell.AD_SANITIZE_OPTIONS</code> /{' '}
          <code>Ad.jsx AD_DOMPURIFY_CONFIG</code>). If a creative looks fine here
          but breaks in production, an allowlist rule stripped it.
        </div>
      </PageSection>

      {activeSurface && (
        <PageSection
          title={`Placements — ${activeSurface}`}
          description={`${placements.length} slot${placements.length !== 1 ? 's' : ''} on this surface · ${device}`}
        >
          <DeviceFrame device={device}>
            <div style={{
              display: 'grid',
              // Single column on phone-width previews so each card mirrors the
              // viewport it represents; auto-fill on desktop where horizontal
              // space supports a multi-up grid.
              gridTemplateColumns: device === 'desktop'
                ? 'repeat(auto-fill, minmax(280px, 1fr))'
                : '1fr',
              gap: S[4],
            }}>
              {placements.map((p) => (
                <PlacementCard
                  key={`${previewKey}-${p.name}`}
                  placementKey={p.name}
                  platform={p.platform}
                  tier={tier}
                  articleSlug={surface === 'article' ? articleSlug : ''}
                />
              ))}
            </div>
          </DeviceFrame>
        </PageSection>
      )}
    </Page>
  );
}

// ---- Placement card ----
// Renders the Ad component for one slot and shows status metadata.

function PlacementCard({
  placementKey,
  platform,
  tier,
  articleSlug,
}: {
  placementKey: string;
  platform: string;
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
          {platform} · tier: {tier}
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

  // Admin authoring preview — renders raw creative_html (skipSanitize)
  // so admins see exactly what they wrote, including any syntax errors
  // or stripped-by-sanitizer markup. Production renders sanitize via
  // _SsrAdCell's AD_SANITIZE_OPTIONS (server) or Ad.jsx's
  // AD_DOMPURIFY_CONFIG (client). Self-XSS surface only — admin-gated.
  return <Ad placement={placementKey} skipSanitize />;
}

// Segmented control. Three discrete viewport modes; treat as radio
// buttons styled to fit alongside the form's Select inputs.
function DeviceToggle({
  value,
  onChange,
}: {
  value: DeviceMode;
  onChange: (next: DeviceMode) => void;
}) {
  const opts: { key: DeviceMode; label: string }[] = [
    { key: 'desktop', label: 'Desktop' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'ios', label: 'iOS' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Device preview"
      style={{
        display: 'inline-flex',
        border: `1px solid ${C.divider}`,
        borderRadius: 6,
        overflow: 'hidden',
        background: C.bg,
      }}
    >
      {opts.map((o, i) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            style={{
              padding: `${S[2]}px ${S[3]}px`,
              fontSize: F.sm,
              fontWeight: active ? 600 : 500,
              color: active ? C.ink : C.dim,
              background: active ? C.card : 'transparent',
              border: 'none',
              borderLeft: i === 0 ? 'none' : `1px solid ${C.divider}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Width-clamped wrapper that simulates the chosen device viewport. The
// iOS variant additionally renders an iPhone-frame chrome (rounded
// rectangle, gutter) plus a heads-up that native iOS renders through
// HomeAdSlot, not the web Ad component — same serve payload, different
// chrome. Without this caption admins might assume a passing web preview
// implies a passing native render.
function DeviceFrame({
  device,
  children,
}: {
  device: DeviceMode;
  children: React.ReactNode;
}) {
  const width = DEVICE_WIDTH[device];
  if (width == null) {
    return <div>{children}</div>;
  }
  const isIos = device === 'ios';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3] }}>
      <div
        aria-label={`${device} viewport preview`}
        style={{
          width,
          maxWidth: '100%',
          padding: isIos ? S[3] : 0,
          borderRadius: isIos ? 28 : 8,
          border: isIos ? `1px solid ${C.divider}` : `1px dashed ${C.divider}`,
          background: isIos ? C.bg : 'transparent',
          boxShadow: isIos ? '0 1px 2px rgba(0,0,0,0.04)' : undefined,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
      {isIos && (
        <div style={{
          maxWidth: 520, fontSize: F.xs, color: C.dim,
          textAlign: 'center', lineHeight: 1.5,
        }}>
          iOS native renders ads via HomeAdSlot (SwiftUI), not the web Ad
          component. The serve payload is identical; the chrome here is the
          web representation of what iOS would receive.
        </div>
      )}
    </div>
  );
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
