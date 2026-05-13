// Homepage admin editor — click-to-assign over a fixed slot scaffold.
// Two-pane pattern (slot list + per-slot inline search); panel agents
// rejected drag-and-drop in favor of this for accessibility / undo /
// mobile reasons.
//
// Live-status flip lives at the top of the page: one button promotes
// the new homepage or rolls back to the legacy hardcoded route.
// Promote also calls revalidatePath('/') server-side so visitors see
// the new layout immediately.

'use client';

import {
  Fragment,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { LayoutRow, SlotKind, SlotRow, SlotSpan } from '@/app/_home/types';
import RhStyles from '@/app/_home/styles';
import IndividualAdsList, {
  type AdUnitRow,
  type IndividualAdStatus,
} from '@/components/admin/ads/IndividualAdsList';

// Live serve_ad status, computed server-side per ad placement at page-load
// time. Pill renders next to each `AD ·` chip so owner can see at a glance
// whether the placement is firing. Reflects layout-load time; refresh page
// after toggling a campaign / master ads switch to recompute.
type AdStatus = 'LIVE' | 'NO AD' | 'UNKNOWN';

// Internal nullable variant used across the editor: orphan placements
// (no ad_unit attached) appear as rows with null id/name/is_active so the
// canvas can render the amber "no ad unit attached" hint. The imported
// IndividualAdsList expects the cleaned non-null `AdUnitRow` contract;
// see the call site below where orphans are filtered out before passing.
type LocalAdUnitRow = {
  placement_name: string;
  placement_display_name: string;
  ad_unit_id: string | null;
  ad_unit_name: string | null;
  is_active: boolean | null;
  campaign_status: string | null;
  // creative_html is included so the inline canvas can render the ad
  // visually inside the admin preview without firing impressions via
  // resolveAdAndLog. Empty string / null = blank placeholder.
  creative_html: string | null;
};

type SearchResult = {
  id: string;
  title: string | null;
  published_at: string | null;
  categories: { name: string | null } | null;
};

// Timeline events for the lead card's right-side aside. Matches the public
// Lead renderer's TimelineRow shape; the GET /api/admin/home endpoint
// returns this alongside the layout so the admin canvas can render the
// timeline aside without firing a client-side service call.
type LeadTimelineRow = {
  id: string;
  event_date: string;
  event_label: string;
  sort_order: number;
  metadata: { current?: boolean } | null;
};

// Active-placement option for the "Place ad" dropdown. Returned by the
// GET /api/admin/home endpoint so the owner doesn't have to type a
// placement name from memory. has_active_ad_unit lets the UI gray out
// (but not disable) placements with no approved + active ad_unit yet.
type PlacementOption = {
  name: string;
  display_name: string;
  page: string;
  position: string;
  has_active_ad_unit: boolean;
};

// Inline-editor state. Three flavors of popover:
//   article_cell   — cluster cell / list_rail cell / lead / etc. (the
//                    Article/Ad/Clear picker, scoped to a single position)
//   ad_placement   — baked ad tiles (ticker / insight / per-discovery cell);
//                    creative-edit link + per-ad toggle, no position writes
//   payload        — feature / engagement / promo block editor
type ActiveEdit =
  | { kind: 'article_cell'; slotId: string; position: number }
  | { kind: 'ad_placement'; slotId: string; placement: string; slotKind: SlotKind }
  | { kind: 'payload'; slotId: string };

const ARTICLE_KINDS: ReadonlySet<SlotKind> = new Set([
  'lead',
  'second_lead',
  'breaking_strip',
  'cluster',
  'list_rail',
  'secondary_pair',
  'wide_strip',
  'editors_picks',
]);

// Default capacities per slot kind. The owner can override per slot by
// PATCHing `config.capacity` on a home_slots row — see slotCapacity()
// below. Keep these as visual defaults that line up with each kind's
// historic chrome (e.g. cluster ships as a 3-card grid; list_rail as
// an 8-row list). The renderers fall back to these same numbers when
// no override is set.
const KIND_DEFAULT_CAPACITY: Record<SlotKind, number> = {
  lead: 1,
  second_lead: 1,
  breaking_strip: 1,
  cluster: 15,
  list_rail: 8,
  feature: 1,
  engagement: 1,
  promo: 1,
  secondary_pair: 6,
  wide_strip: 1,
  editors_picks: 5,
  data_ticker: 1,
  insight_row: 1,
  discovery_feed: 1,
};

// Hard cap on `config.capacity` overrides. Mirrored server-side in
// /api/admin/home/slots/[id]/route.ts and in the renderers. 30 keeps
// the cluster grid sane on widescreens without blocking a "stuff the
// feed" day on a big news cycle.
const MAX_SLOT_CAPACITY = 30;

function slotCapacity(slot: SlotRow): number {
  const cfg = slot.config?.capacity;
  if (typeof cfg === 'number' && cfg > 0 && cfg <= MAX_SLOT_CAPACITY) return cfg;
  return KIND_DEFAULT_CAPACITY[slot.kind] ?? 1;
}

const KIND_LABEL: Record<SlotKind, string> = {
  lead: 'Hero',
  second_lead: 'Second lead',
  breaking_strip: 'Breaking strip',
  cluster: 'Cluster',
  list_rail: 'List rail',
  feature: 'Feature',
  engagement: 'Daily quiz',
  promo: 'Promo',
  secondary_pair: 'Secondary pair',
  wide_strip: 'Wide strip',
  editors_picks: "Editor's picks",
  data_ticker: 'Data Ticker',
  insight_row: 'Insight Row (Sponsored)',
  discovery_feed: 'Discovery Feed (Promoted)',
};

const SPAN_OPTIONS: SlotSpan[] = [3, 4, 6, 8, 12];

// Visual top-to-bottom order on the live page for the renderer-baked ad
// placements + the placement injected by cluster inline ads. Matches the
// way slots stack on `/` (ticker → insight → discovery 1-4 → cluster
// signup). Keep in sync with web/src/app/_home/slots/* and the seed
// data in supabase/migrations/...home_layouts_v2.sql. Anything not listed
// sorts to the end (default rank = 99) so new placements stay visible
// rather than disappearing into the middle.
const HOME_PLACEMENT_ORDER: Record<string, number> = {
  home_ticker_sponsor: 1,
  home_insight_row: 2,
  home_discovery_1: 3,
  home_discovery_2: 4,
  home_discovery_3: 5,
  home_discovery_4: 6,
  home_signup_inline: 7,
};

const SPAN_LABEL: Record<SlotSpan, string> = {
  3: 'Quarter (3)',
  4: 'Third (4)',
  6: 'Half (6)',
  8: 'Two-thirds (8)',
  12: 'Full (12)',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function HomeEditorInner() {
  const router = useRouter();
  const supabase = createClient();
  const { push } = useToast();

  const [layout, setLayout] = useState<LayoutRow | null>(null);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);
  const [adStatuses, setAdStatuses] = useState<Record<string, AdStatus>>({});
  const [adUnits, setAdUnits] = useState<LocalAdUnitRow[]>([]);
  const [placements, setPlacements] = useState<PlacementOption[]>([]);
  const [leadTimeline, setLeadTimeline] = useState<LeadTimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  // Tracks which ad_unit row is currently mid-toggle, so we can disable
  // just that button instead of locking the whole page on a single flip.
  const [togglingAdId, setTogglingAdId] = useState<string | null>(null);

  // Inline editor — clicking a tile opens an absolutely-positioned popover
  // anchored to the tile. The visual is the only editing surface; there is
  // no row-based editor below. ESC + backdrop click close the popover.
  const [activeEdit, setActiveEdit] = useState<ActiveEdit | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const closeEditor = useCallback(() => {
    setActiveEdit(null);
    setQuery('');
    setResults([]);
  }, []);

  useEffect(() => {
    if (!activeEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditor();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeEdit, closeEditor]);

  // Article picker query state lives at the page level so the popover can
  // open with a clean panel each time. openSearch is set only when the
  // active editor is an article-bearing cell; the existing fetch effect
  // below uses this to drive the supabase query. Memoized so the fetch
  // effect doesn't re-fire on unrelated parent re-renders.
  const openSearch = useMemo(
    () =>
      activeEdit && activeEdit.kind === 'article_cell'
        ? { slotId: activeEdit.slotId, position: activeEdit.position }
        : null,
    [activeEdit],
  );
  // Category filter dropdown — null = all categories. Populated once at
  // page mount so the filter is always available without per-slot re-fetch.
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; parent_id: string | null }>
  >([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const fetchLayout = useCallback(async () => {
    const res = await fetch('/api/admin/home', { cache: 'no-store' });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Load failed: ${j.error ?? res.statusText}`, variant: 'danger' });
      return;
    }
    const json = (await res.json()) as {
      layout: LayoutRow;
      liveSlug: string | null;
      adStatuses?: Record<string, AdStatus>;
      adUnits?: LocalAdUnitRow[];
      placements?: PlacementOption[];
      leadTimeline?: LeadTimelineRow[];
    };
    setLayout(json.layout);
    setLiveSlug(json.liveSlug);
    setAdStatuses(json.adStatuses ?? {});
    setAdUnits(json.adUnits ?? []);
    setPlacements(json.placements ?? []);
    setLeadTimeline(json.leadTimeline ?? []);
  }, [push]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      await refreshAllPermissions();
      if (!hasPermission('admin.home.manage')) {
        router.push('/admin');
        return;
      }
      // Categories list for the filter dropdown — fetched once at mount.
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, parent_id')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true, nullsFirst: false });
      setCategories(
        (catData || []).filter(
          (c) => !c.name?.toLowerCase().startsWith('kids'),
        ) as Array<{ id: string; name: string; parent_id: string | null }>,
      );
      await fetchLayout();
      setLoading(false);
    })();
  }, [router, supabase, fetchLayout]);

  // Article picker query — runs whenever a slot opens, query changes, or
  // category filter changes. Empty query → 20 most-recent matches (no
  // typing required to start browsing); typed query → ilike narrow.
  useEffect(() => {
    if (!openSearch) return;
    const t = setTimeout(async () => {
      setSearching(true);
      let q = supabase
        .from('articles')
        .select(
          'id, title, published_at, categories!fk_articles_category_id(name)',
        )
        .eq('status', 'published')
        .eq('visibility', 'public')
        .is('deleted_at', null);
      if (categoryFilter) {
        q = q.eq('category_id', categoryFilter);
      }
      if (query && query.length >= 1) {
        q = q.ilike('title', `%${query}%`);
      }
      const { data } = await q
        .order('published_at', { ascending: false })
        .limit(20);
      setResults((data || []) as SearchResult[]);
      setSearching(false);
    }, query.length === 0 ? 0 : 250);
    return () => clearTimeout(t);
  }, [query, openSearch, supabase, categoryFilter]);

  const assignArticle = async (slotId: string, position: number, articleId: string) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch('/api/admin/home/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: slotId,
        position,
        content_type: 'article',
        article_id: articleId,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Assign failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Assigned.' });
      closeEditor();
      await fetchLayout();
    }
    setMutating(false);
  };

  // Place an ad in an article-bearing slot position. Mirrors assignArticle
  // but sends content_type:'ad' with the placement payload shape the items
  // API expects ({ placement, page, position }). Upsert semantics on the
  // server replace any existing article/ad at the same (slot_id, position).
  const placeAd = async (
    slotId: string,
    position: number,
    placement: string,
    slotKind: string,
  ): Promise<boolean> => {
    if (mutating) return false;
    setMutating(true);
    const payloadPositionFor = (kind: string): string => {
      switch (kind) {
        case 'cluster': return 'cluster';
        case 'list_rail': return 'list_rail';
        case 'secondary_pair': return 'secondary_pair';
        case 'wide_strip': return 'wide_strip';
        case 'editors_picks': return 'editors_picks';
        default: return 'inline';
      }
    };
    const res = await fetch('/api/admin/home/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: slotId,
        position,
        content_type: 'ad',
        payload: { placement, page: 'home', position: payloadPositionFor(slotKind) },
      }),
    });
    let ok = false;
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Place ad failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Ad placed.' });
      closeEditor();
      await fetchLayout();
      ok = true;
    }
    setMutating(false);
    return ok;
  };

  // Create a brand-new ad_unit AND place it as an ad item at this
  // (slot, position) in one server-side flow. Hits the dedicated
  // /api/admin/home/items/create-inline-ad endpoint, which derives
  // the placement from the slot's kind (cluster cells default to
  // `home_signup_inline`). Re-fetches layout on success so the new
  // ad shows up in the canvas + Individual ads panel without a
  // page reload.
  const createInlineAd = async (
    slotId: string,
    position: number,
    fields: { ad_name: string; creative_html: string; click_url: string },
  ): Promise<boolean> => {
    if (mutating) return false;
    setMutating(true);
    const res = await fetch('/api/admin/home/items/create-inline-ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: slotId,
        position,
        ad_name: fields.ad_name,
        creative_html: fields.creative_html,
        click_url: fields.click_url,
      }),
    });
    let ok = false;
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({
        message: `Create ad failed: ${j.error ?? res.statusText}`,
        variant: 'danger',
      });
    } else {
      push({ message: 'Ad created and placed.' });
      closeEditor();
      await fetchLayout();
      ok = true;
    }
    setMutating(false);
    return ok;
  };

  const clearItem = async (itemId: string) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch(`/api/admin/home/items/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Clear failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Cleared.' });
      closeEditor();
      await fetchLayout();
    }
    setMutating(false);
  };

  const updateSlot = async (slotId: string, patch: { span?: SlotSpan; config?: unknown }) => {
    if (mutating) return;
    setMutating(true);
    const res = await fetch(`/api/admin/home/slots/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Slot update failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      await fetchLayout();
    }
    setMutating(false);
  };

  const savePayload = async (
    slot: SlotRow,
    payload: Record<string, unknown>,
  ) => {
    if (mutating) return;
    setMutating(true);
    const contentType =
      slot.kind === 'feature'
        ? 'feature'
        : slot.kind === 'engagement'
          ? 'quiz'
          : 'custom';
    const res = await fetch('/api/admin/home/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: slot.id,
        position: 0,
        content_type: contentType,
        payload,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Save failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({ message: 'Saved.' });
      closeEditor();
      await fetchLayout();
    }
    setMutating(false);
  };

  const toggleAds = async () => {
    if (mutating || !layout) return;
    const next = !layout.ads_enabled;
    setMutating(true);
    // Optimistic flip so the dot updates instantly.
    setLayout({ ...layout, ads_enabled: next });
    const res = await fetch('/api/admin/home/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads_enabled: next }),
    });
    if (!res.ok) {
      // Roll back the optimistic flip and refetch authoritative state.
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Ads toggle failed: ${j.error ?? res.statusText}`, variant: 'danger' });
      await fetchLayout();
    } else {
      push({ message: next ? 'Ads enabled sitewide.' : 'Ads disabled sitewide.' });
    }
    setMutating(false);
  };

  // Per-ad-unit toggle. Optimistic flip of the matching adUnits row, with
  // rollback + refetch on failure. Per-row spinner (togglingAdId) leaves
  // every other button live so the owner can flip multiple ads quickly.
  const toggleAdUnit = async (adUnitId: string, nextValue: boolean) => {
    if (togglingAdId) return;
    setTogglingAdId(adUnitId);
    const before = adUnits;
    setAdUnits((rows) =>
      rows.map((r) =>
        r.ad_unit_id === adUnitId ? { ...r, is_active: nextValue } : r,
      ),
    );
    const res = await fetch(`/api/admin/ad-units/${adUnitId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextValue }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({
        message: `Toggle failed: ${j.error ?? res.statusText}`,
        variant: 'danger',
      });
      setAdUnits(before);
      await fetchLayout();
    } else {
      push({ message: nextValue ? 'Ad turned on.' : 'Ad turned off.' });
      // Refetch so adStatuses (LIVE/NO AD) recomputes against the new flag.
      await fetchLayout();
    }
    setTogglingAdId(null);
  };

  const promote = async (target: 'legacy' | 'home') => {
    if (mutating) return;
    if (
      target === 'home' &&
      !confirm('Make the templated homepage the live front page? Visitors will see it immediately.')
    )
      return;
    if (
      target === 'legacy' &&
      !confirm('Roll back to the legacy homepage? The templated homepage stays as a draft.')
    )
      return;
    setMutating(true);
    const res = await fetch('/api/admin/home/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({ message: `Flip failed: ${j.error ?? res.statusText}`, variant: 'danger' });
    } else {
      push({
        message:
          target === 'home' ? 'Templated homepage is now live.' : 'Rolled back to legacy homepage.',
      });
      await fetchLayout();
    }
    setMutating(false);
  };

  if (loading || !layout) {
    return (
      <Page maxWidth={960}>
        <div
          style={{
            padding: S[8],
            color: C.dim,
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
          }}
        >
          <Spinner /> <span>Loading…</span>
        </div>
      </Page>
    );
  }

  const isLive = liveSlug === 'home';

  return (
    <Page maxWidth={960}>
      <PageHeader
        title="Homepage"
        subtitle="Templated front page. Fill slots with articles or content blocks; flip the toggle to make it the live homepage."
      />

      <PageSection title="Live status">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[4],
            padding: `${S[3]}px 0`,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: F.base, fontWeight: 600, color: C.ink }}>
              {isLive ? 'Templated homepage is live' : 'Legacy homepage is live'}
            </div>
            <div style={{ fontSize: F.sm, color: C.dim, marginTop: S[1] }}>
              {isLive
                ? 'Visitors see the templated homepage. Roll back to the legacy homepage anytime.'
                : 'Visitors see the existing top-stories homepage. Promote the templated homepage when you’re ready.'}
            </div>
          </div>
          <a
            href="/preview/home"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: F.sm,
              fontWeight: 600,
              color: C.ink,
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              padding: `${S[2]}px ${S[3]}px`,
            }}
          >
            Preview ↗
          </a>
          {isLive ? (
            <Button variant="secondary" onClick={() => promote('legacy')} disabled={mutating}>
              Roll back to legacy homepage
            </Button>
          ) : (
            <Button variant="primary" onClick={() => promote('home')} disabled={mutating}>
              Make templated homepage live
            </Button>
          )}
        </div>
      </PageSection>

      <PageSection title="Ads sitewide">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[4],
            padding: `${S[3]}px 0`,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[2],
                fontSize: F.base,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: layout.ads_enabled ? '#16a34a' : C.muted,
                }}
              />
              <span>Ads sitewide: {layout.ads_enabled ? 'ON' : 'OFF'}</span>
            </div>
            <div style={{ fontSize: F.sm, color: C.dim, marginTop: S[1] }}>
              When OFF, every ad on /home renders nothing.
            </div>
          </div>
          <Button
            variant={layout.ads_enabled ? 'secondary' : 'primary'}
            onClick={toggleAds}
            disabled={mutating}
          >
            {layout.ads_enabled ? 'Turn ads OFF' : 'Turn ads ON'}
          </Button>
        </div>
        {!layout.ads_enabled && (
          <div
            style={{
              marginTop: S[2],
              padding: `${S[2]}px ${S[3]}px`,
              border: '1px solid #f59e0b',
              background: '#fef3c7',
              color: '#78350f',
              borderRadius: 4,
              fontSize: F.sm,
            }}
            role="status"
          >
            Ads are currently disabled sitewide. Individual slot ad assignments still saved — flip back to ON to resume.
          </div>
        )}
      </PageSection>

      <PageSection
        title="Layout"
        description="Live shape of the home page. Click any tile to edit it inline."
      >
        {/*
          layout.slots arrives from the API already sorted by position ASC
          (shapeLayout in web/src/app/_home/data.ts sorts slots before
          returning), so iterating as-is here yields the same visual order
          as the live HomeLayout renderer. Do not re-sort or reverse.
        */}
        <LayoutCanvas
          layout={layout}
          adStatuses={adStatuses}
          adUnits={adUnits}
          placements={placements}
          leadTimeline={leadTimeline}
          mutating={mutating}
          togglingAdId={togglingAdId}
          activeEdit={activeEdit}
          query={query}
          results={results}
          searching={searching}
          categories={categories}
          categoryFilter={categoryFilter}
          onChangeCategoryFilter={setCategoryFilter}
          onChangeQuery={setQuery}
          onOpenEdit={(next) => {
            // Reset the article picker between opens so each tile starts
            // with a clean panel + "most recent" results.
            setQuery('');
            setResults([]);
            setActiveEdit(next);
          }}
          onClose={closeEditor}
          onAssign={assignArticle}
          onPlaceAd={placeAd}
          onCreateInlineAd={createInlineAd}
          onClear={clearItem}
          onSpanChange={(slotId, span) => updateSlot(slotId, { span })}
          onCapacityChange={(slot, capacity) =>
            // Merge into existing config so we don't clobber label /
            // numbered / timestamps on rail-style slots.
            updateSlot(slot.id, {
              config: { ...(slot.config ?? {}), capacity },
            })
          }
          onSavePayload={savePayload}
          onToggleAdUnit={toggleAdUnit}
        />
      </PageSection>

      <PageSection
        title="Individual ads"
        description="Turn specific ads on or off. The master switch above overrides everything below. Listed in the same top-to-bottom order they appear on the live page."
      >
        <IndividualAdsList
          adUnits={[...adUnits]
            .filter(
              (r): r is LocalAdUnitRow & {
                ad_unit_id: string;
                ad_unit_name: string;
                is_active: boolean;
              } =>
                r.ad_unit_id !== null &&
                r.ad_unit_name !== null &&
                r.is_active !== null,
            )
            .sort(
              (a, b) =>
                (HOME_PLACEMENT_ORDER[a.placement_name] ?? 99) -
                (HOME_PLACEMENT_ORDER[b.placement_name] ?? 99),
            )
            .map<AdUnitRow>((r) => ({
              ad_unit_id: r.ad_unit_id,
              ad_unit_name: r.ad_unit_name,
              placement_name: r.placement_name,
              placement_display_name: r.placement_display_name,
              is_active: r.is_active,
              campaign_status: r.campaign_status,
              creative_html: r.creative_html,
            }))}
          adsEnabled={layout.ads_enabled}
          togglingAdId={togglingAdId}
          onToggleAdUnit={async (adUnitId, newIsActive) => {
            await toggleAdUnit(adUnitId, newIsActive);
          }}
        />
      </PageSection>
    </Page>
  );
}

// "Individual ads" panel moved to @/components/admin/ads/IndividualAdsList
// (imported at the top of this file). Status synthesis + orphan handling
// now live there; this page passes only the non-orphan rows through.

// Inline-editable home-screen canvas. Tiles are click-targets that open a
// SlotInlineEditor popover anchored next to the clicked tile. There is no
// separate row-based editor; the visual IS the editing surface. ads_enabled
// =false greys all ad tiles and shows OFF; per-placement LIVE/NO AD probes
// come from adStatuses. No new fetches — reads the same `layout`, `adUnits`,
// `adStatuses` and `placements` the parent already has.
function LayoutCanvas({
  layout,
  adStatuses,
  adUnits,
  placements,
  leadTimeline,
  mutating,
  togglingAdId,
  activeEdit,
  query,
  results,
  searching,
  categories,
  categoryFilter,
  onChangeCategoryFilter,
  onChangeQuery,
  onOpenEdit,
  onClose,
  onAssign,
  onPlaceAd,
  onCreateInlineAd,
  onClear,
  onSpanChange,
  onCapacityChange,
  onSavePayload,
  onToggleAdUnit,
}: {
  layout: LayoutRow;
  adStatuses: Record<string, AdStatus>;
  adUnits: LocalAdUnitRow[];
  placements: PlacementOption[];
  leadTimeline: LeadTimelineRow[];
  mutating: boolean;
  togglingAdId: string | null;
  activeEdit: ActiveEdit | null;
  query: string;
  results: SearchResult[];
  searching: boolean;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
  categoryFilter: string | null;
  onChangeCategoryFilter: (id: string | null) => void;
  onChangeQuery: (q: string) => void;
  onOpenEdit: (next: ActiveEdit) => void;
  onClose: () => void;
  onAssign: (slotId: string, position: number, articleId: string) => void;
  onPlaceAd: (slotId: string, position: number, placement: string, slotKind: string) => Promise<boolean>;
  onCreateInlineAd: (
    slotId: string,
    position: number,
    fields: { ad_name: string; creative_html: string; click_url: string },
  ) => Promise<boolean>;
  onClear: (itemId: string) => void;
  onSpanChange: (slotId: string, span: SlotSpan) => void;
  onCapacityChange: (slot: SlotRow, capacity: number) => void;
  onSavePayload: (slot: SlotRow, payload: Record<string, unknown>) => void;
  onToggleAdUnit: (adUnitId: string, nextValue: boolean) => void;
}) {
  const adsOn = layout.ads_enabled !== false;

  // Refs to anchor the popover next to the clicked tile. Keyed by a stable
  // string per tile: `slot.id` for whole-slot tiles, `slot.id:pos` for cells
  // inside cluster/list_rail/etc., and `placement` for baked ad cells. The
  // popover reads the matching ref's bounding box on render to position.
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Status pill for a single ad placement name. Returns null when no
  // placement is wired so empty cells stay quiet.
  const adPill = (placement: string | null) => {
    if (!placement) return null;
    if (!adsOn) {
      return { label: 'OFF', bg: '#9ca3af', fg: '#fff' };
    }
    const s = adStatuses[placement];
    if (s === 'LIVE') return { label: 'LIVE', bg: '#10b981', fg: '#fff' };
    if (s === 'NO AD') return { label: 'NO AD', bg: '#f59e0b', fg: '#fff' };
    return { label: '—', bg: '#d1d5db', fg: '#374151' };
  };

  // Selected? Used to draw the red outline while a popover is open against
  // this tile / cell / placement.
  const isSelected = (anchor: string): boolean => {
    if (!activeEdit) return false;
    if (activeEdit.kind === 'article_cell') {
      return anchor === `${activeEdit.slotId}:${activeEdit.position}`;
    }
    if (activeEdit.kind === 'ad_placement') {
      return anchor === `placement:${activeEdit.placement}`;
    }
    return anchor === `payload:${activeEdit.slotId}`;
  };

  // Build a categoryById map (id -> name) from the existing categories
  // array so cluster + lead cards can render the real category eyebrow.
  // The public renderer also pulls .color_hex etc., but admin preview
  // only needs name + a stable id key.
  const categoryById = useMemo(() => {
    const out: Record<string, { id: string; name: string }> = {};
    for (const c of categories) out[c.id] = { id: c.id, name: c.name };
    return out;
  }, [categories]);

  const categoryName = (categoryId: string | null): string => {
    if (!categoryId) return 'News';
    return categoryById[categoryId]?.name ?? 'News';
  };

  // Lookup the first creative_html for a placement, falling back to null.
  // Multiple ad_units per placement: take the first active+approved with
  // creative_html present; otherwise take the first row with creative_html.
  const creativeFor = (placement: string | null | undefined): string | null => {
    if (!placement) return null;
    const rows = adUnits.filter((r) => r.placement_name === placement);
    if (rows.length === 0) return null;
    const activeRow = rows.find(
      (r) =>
        r.is_active === true &&
        r.campaign_status === 'approved' &&
        r.creative_html,
    );
    if (activeRow?.creative_html) return activeRow.creative_html;
    const anyWithHtml = rows.find((r) => r.creative_html);
    return anyWithHtml?.creative_html ?? null;
  };

  // Red-outline overlay for the selected tile + click-to-edit hover
  // affordance. Applied as a positioned `<span>` over each tile because
  // many tiles render real vp-rh-* markup whose borders we don't want
  // to override directly.
  const selectionOutline = (anchor: string): CSSProperties => {
    const sel = isSelected(anchor);
    return {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      border: sel ? '2px solid #ef4444' : '2px solid transparent',
      transition: 'border-color 120ms ease',
      zIndex: 2,
    };
  };

  // Wrapper props for every clickable cell — anchors a ref for popover
  // positioning, hooks click + hover, and stamps a relative-positioned
  // container so the outline overlay sits correctly. ref accepts any
  // HTMLElement so the same helper works on both <a> and <div> cells;
  // the popover only needs getBoundingClientRect from the target.
  const cellProps = (
    anchor: string,
    onClick: () => void,
    extraStyle: CSSProperties = {},
  ) => ({
    ref: (el: HTMLElement | null) => {
      // The popover positions itself off the bounding rect alone, so
      // narrow the stored type to HTMLDivElement-shaped without losing
      // <a> compatibility at the call site.
      tileRefs.current[anchor] = el as HTMLDivElement | null;
    },
    onClick,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const span = e.currentTarget.querySelector<HTMLSpanElement>(
        ':scope > .vp-admin-outline',
      );
      if (span && !isSelected(anchor)) span.style.borderColor = '#ef4444';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      const span = e.currentTarget.querySelector<HTMLSpanElement>(
        ':scope > .vp-admin-outline',
      );
      if (span && !isSelected(anchor)) span.style.borderColor = 'transparent';
    },
    style: {
      position: 'relative',
      cursor: 'pointer',
      ...extraStyle,
    } as CSSProperties,
  });


  // Empty-cell placeholder shown when a position has no article/ad.
  // Dashed border + centered "+" + position number, sized to match the
  // surrounding vp-rh-card so the grid keeps its rhythm.
  const EmptyCell = ({
    anchor,
    pos,
    onClick,
    label,
    minHeight = 140,
    ordinal,
    gridSpanFull = false,
  }: {
    anchor: string;
    pos: number;
    onClick: () => void;
    label?: string;
    minHeight?: number;
    ordinal?: number;
    gridSpanFull?: boolean;
  }) => (
    <div
      {...cellProps(anchor, onClick, {
        minHeight,
        border: '1px dashed #b3b3b3',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: 16,
        color: '#888',
        gridColumn: gridSpanFull ? '1 / -1' : undefined,
      })}
    >
      {typeof ordinal === 'number' && <PosChip n={ordinal} />}
      <span className="vp-admin-outline" style={selectionOutline(anchor)} />
      <span style={{ fontSize: 24, fontWeight: 300, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label ?? `+ Add article or ad · position ${pos + 1}`}
      </span>
    </div>
  );

  // Tiny mono position chip layered into the top-right corner of each
  // editable cell. Replaces the loud `01.` ordinal column + standalone
  // SectionLabel rows that used to chrome the admin preview — the public
  // page has neither, so neither does this one. The chip is admin-only
  // edit-mode info; it doesn't affect grid flow because it's positioned
  // absolute and pointer-events: none (the parent cell still owns clicks).
  const PosChip = ({ n }: { n: number }) => (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 6,
        right: 8,
        zIndex: 3,
        fontFamily:
          '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 9,
        letterSpacing: '0.08em',
        color: 'rgba(0,0,0,0.45)',
        background: 'rgba(255,255,255,0.7)',
        padding: '1px 4px',
        borderRadius: 2,
        pointerEvents: 'none',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      [{n}]
    </span>
  );

  // Article card body (eyebrow + serif title + dek + arrow). Used by every
  // article-bearing slot (lead, cluster, list_rail, secondary_pair, etc.).
  // Lead variant uses the larger vp-rh-lead-title; everything else uses
  // vp-rh-title for the standard card headline size.
  const ArticleCardInner = ({
    story,
    isLead,
  }: {
    story: { title: string | null; excerpt: string | null; category_id: string | null };
    isLead: boolean;
  }) => (
    <>
      <span
        className={isLead ? 'vp-rh-tag vp-rh-tag-accent' : 'vp-rh-tag'}
      >
        {categoryName(story.category_id)}
      </span>
      {isLead ? (
        <>
          <div className="vp-rh-lead-content" style={{ padding: 0 }}>
            <h2 className="vp-rh-lead-title">{story.title}</h2>
            {story.excerpt && (
              <p className="vp-rh-lead-summary">{story.excerpt}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="vp-rh-title">{story.title}</h2>
          {story.excerpt && <p className="vp-rh-summary">{story.excerpt}</p>}
          <span className="vp-rh-arrow" aria-hidden>
            →
          </span>
        </>
      )}
    </>
  );

  // Render a single position inside an article-bearing slot as a DIRECT
  // grid child of <main class="vp-rh-grid">. Lead spans the full row + may
  // include a right-side timeline aside (vp-rh-lead-with-timeline). Cluster
  // / list_rail / etc. cells are individual vp-rh-card grid cells that
  // flow into the 3-col grid alongside the lead, matching the public page.
  //
  // Handles all three states: article cell, ad cell, empty placeholder.
  // Returns a React element (not a fragment) so the caller can use a stable
  // key. The position chip `[N]` overlays each cell in the top-right corner.
  const renderArticlePositionRow = (
    slot: SlotRow,
    pos: number,
    ordinal: number,
  ): React.ReactElement => {
    const anchor = `${slot.id}:${pos}`;
    const item = slot.items.find((i) => i.position === pos);
    const onClick = () =>
      onOpenEdit({
        kind: 'article_cell',
        slotId: slot.id,
        position: pos,
      });
    const isLead = slot.kind === 'lead';
    const minH = isLead ? 200 : 140;

    if (!item) {
      return (
        <EmptyCell
          key={`${slot.id}:${pos}`}
          anchor={anchor}
          pos={pos}
          minHeight={minH}
          onClick={onClick}
          ordinal={ordinal}
          gridSpanFull={isLead}
        />
      );
    }

    if (item.content_type === 'ad') {
      const placement =
        typeof item.payload?.placement === 'string'
          ? (item.payload.placement as string)
          : null;
      const html = creativeFor(placement);
      return (
        <div
          key={item.id}
          {...cellProps(anchor, onClick, {
            opacity: adsOn ? 1 : 0.5,
            minHeight: minH,
            gridColumn: isLead ? '1 / -1' : undefined,
          })}
          className="vp-rh-card vp-rh-card-ad"
          title={`pos ${pos + 1} · AD · ${placement ?? 'no placement'}`}
        >
          <PosChip n={ordinal} />
          <span
            className="vp-admin-outline"
            style={selectionOutline(anchor)}
          />
          <div
            style={{
              fontFamily:
                '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: '#666',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            AD · {placement ?? 'no placement'}
          </div>
          {html ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div style={{ fontSize: 12, color: '#888' }}>
              no creative attached
            </div>
          )}
        </div>
      );
    }

    const story = item.article;
    if (!story) {
      return (
        <EmptyCell
          key={item.id}
          anchor={anchor}
          pos={pos}
          minHeight={minH}
          onClick={onClick}
          ordinal={ordinal}
          gridSpanFull={isLead}
        />
      );
    }

    // Lead rendered as an <article> matching the public Lead.tsx markup,
    // including the optional <aside class="vp-rh-timeline"> when the API
    // returned events for the parent story. Timeline triggers the
    // vp-rh-lead-with-timeline class on the parent <article> so the
    // 1.618:1 split kicks in via the shared RhStyles rules.
    if (isLead) {
      const hasTimeline = leadTimeline.length > 0;
      return (
        <article
          key={item.id}
          {...cellProps(anchor, onClick, {
            minHeight: minH,
            gridColumn: '1 / -1',
          })}
          className={`vp-rh-card vp-rh-lead ${hasTimeline ? 'vp-rh-lead-with-timeline' : ''}`}
          title={`pos ${pos + 1} · ${story.title ?? ''}`}
        >
          <PosChip n={ordinal} />
          <span className="vp-admin-outline" style={selectionOutline(anchor)} />
          <div className="vp-rh-lead-link">
            <div className="vp-rh-lead-content">
              <span className="vp-rh-tag vp-rh-tag-accent">
                {categoryName(story.category_id)}
              </span>
              <h2 className="vp-rh-lead-title">{story.title}</h2>
              {story.excerpt && (
                <p className="vp-rh-lead-summary">{story.excerpt}</p>
              )}
            </div>
          </div>
          {hasTimeline && (
            <aside className="vp-rh-timeline">
              <span className="vp-rh-tl-label">Timeline</span>
              <ul>
                {leadTimeline.map((t, i) => {
                  const isNow =
                    !!t.metadata?.current || i === leadTimeline.length - 1;
                  const dateLabel = (() => {
                    const d = new Date(t.event_date);
                    if (Number.isNaN(d.getTime())) return '';
                    return d
                      .toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                      .toUpperCase();
                  })();
                  return (
                    <li key={t.id} className={isNow ? 'now' : undefined}>
                      <strong>{isNow ? 'Today: ' : `${dateLabel}: `}</strong>
                      <span>{t.event_label}</span>
                    </li>
                  );
                })}
              </ul>
              <span className="vp-rh-readmore">Read full report →</span>
            </aside>
          )}
        </article>
      );
    }

    return (
      <a
        key={item.id}
        {...cellProps(anchor, onClick, { minHeight: minH, display: 'block' })}
        className="vp-rh-card"
        title={`pos ${pos + 1} · ${story.title ?? ''}`}
      >
        <PosChip n={ordinal} />
        <span className="vp-admin-outline" style={selectionOutline(anchor)} />
        <ArticleCardInner story={story} isLead={false} />
      </a>
    );
  };

  // Friendly title for the popover header given the current activeEdit.
  const popoverTitle = (slot: SlotRow): string => {
    if (!activeEdit) return '';
    if (activeEdit.kind === 'article_cell') {
      if (slot.kind === 'lead') return 'Lead article';
      if (slot.kind === 'cluster')
        return `Cluster position ${activeEdit.position + 1}`;
      return `${KIND_LABEL[slot.kind]} position ${activeEdit.position + 1}`;
    }
    if (activeEdit.kind === 'ad_placement') {
      return `${KIND_LABEL[slot.kind]} ad`;
    }
    return `${KIND_LABEL[slot.kind]} block`;
  };

  // Resolve the slot the popover is currently editing. Slots are normalized
  // by id so we can render the editor independent of which tile was clicked.
  const editingSlot = activeEdit
    ? layout.slots.find((s) => s.id === activeEdit.slotId) ?? null
    : null;

  // Find the adUnits row matching a baked placement (for the Edit creative
  // link + per-ad toggle in the ad-placement popover).
  const adUnitForPlacement = (placement: string): LocalAdUnitRow | null => {
    return adUnits.find((r) => r.placement_name === placement) ?? null;
  };

  // Render a single slot as DIRECT children of the outer <main class=
  // "vp-rh-grid"> wrapper. Each render returns a React node — either a
  // single cell or a Fragment of cells — that lands directly in the grid
  // alongside cells from neighbouring slots, exactly like the public page.
  //
  // Lead spans 1/-1, cluster cells flow into the 3-col grid, ad-style slots
  // (ticker / insight / discovery) own their grid-column: 1/-1 via their
  // vp-rh-* CSS. No <section> wrapper, no SectionLabel — those were admin
  // chrome that diverged the preview from the live page. Position info now
  // lives in a tiny `[N]` PosChip in each cell's top-right corner.
  const renderSlot = (slot: SlotRow): React.ReactNode => {
    const kind = slot.kind;

    // LEAD — single hero article. renderArticlePositionRow handles the
    // optional vp-rh-lead-with-timeline split when leadTimeline has events.
    if (kind === 'lead') {
      return renderArticlePositionRow(slot, 0, 1);
    }

    // DATA TICKER — vp-rh-ticker rail (grid-column: 1/-1 via its own CSS).
    // Clicking the sponsor cell opens the ad_placement popover; clicking
    // elsewhere opens the payload editor for the ticker items.
    if (kind === 'data_ticker') {
      const placement = 'home_ticker_sponsor';
      const sponsorAnchor = `placement:${placement}`;
      const payloadAnchor = `payload:${slot.id}`;
      const rawItems = Array.isArray(slot.config?.items)
        ? (slot.config.items as Array<{ label?: unknown; value?: unknown }>)
        : [];
      const items = rawItems.filter(
        (v): v is { label: string; value: string } =>
          typeof v?.label === 'string' && typeof v?.value === 'string',
      );
      const sponsorHtml = creativeFor(placement);
      return (
        <div
          key={slot.id}
          {...cellProps(payloadAnchor, () =>
            onOpenEdit({ kind: 'payload', slotId: slot.id }),
          )}
          className="vp-rh-ticker"
        >
          <PosChip n={slot.position} />
          <span className="vp-admin-outline" style={selectionOutline(payloadAnchor)} />
          {items.length === 0 && (
            <div className="item" style={{ fontStyle: 'italic', opacity: 0.6 }}>
              + Add ticker items
            </div>
          )}
          {items.map((it, i) => (
            <div className="item" key={i}>
              {it.label} <span>{it.value}</span>
            </div>
          ))}
          <div
            {...cellProps(
              sponsorAnchor,
              () =>
                onOpenEdit({
                  kind: 'ad_placement',
                  slotId: slot.id,
                  placement,
                  slotKind: kind,
                }),
              { display: 'inline-block', marginLeft: 'auto' },
            )}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
              // Sponsor click must not bubble up to the payload-edit
              // handler on the parent ticker bar.
              e.stopPropagation();
              onOpenEdit({
                kind: 'ad_placement',
                slotId: slot.id,
                placement,
                slotKind: kind,
              });
            }}
            className="item sponsor"
          >
            <span className="vp-admin-outline" style={selectionOutline(sponsorAnchor)} />
            {sponsorHtml ? (
              <span dangerouslySetInnerHTML={{ __html: sponsorHtml }} />
            ) : adsOn ? (
              <span style={{ opacity: 0.6 }}>+ sponsor</span>
            ) : (
              <span style={{ opacity: 0.6 }}>OFF</span>
            )}
          </div>
        </div>
      );
    }

    // INSIGHT ROW — vp-rh-insight band (grid-column: 1/-1).
    if (kind === 'insight_row') {
      const placement = 'home_insight_row';
      const anchor = `placement:${placement}`;
      const html = creativeFor(placement);
      const pill = adPill(placement);
      return (
        <div
          key={slot.id}
          {...cellProps(
            anchor,
            () =>
              onOpenEdit({
                kind: 'ad_placement',
                slotId: slot.id,
                placement,
                slotKind: kind,
              }),
            {
              opacity: adsOn ? 1 : 0.5,
              minHeight: 180,
              border: html ? undefined : '1px dashed #b3b3b3',
              gridColumn: '1 / -1',
            },
          )}
          className={html ? 'vp-rh-insight' : undefined}
        >
          <PosChip n={slot.position} />
          <span className="vp-admin-outline" style={selectionOutline(anchor)} />
          {html ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 180,
                color: '#888',
                gap: 6,
                padding: 24,
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>+</span>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
              >
                Add insight ad
              </span>
              {pill && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: pill.bg,
                    color: pill.fg,
                    letterSpacing: 0.5,
                  }}
                >
                  {pill.label}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    // DISCOVERY FEED — 4-cell vp-rh-discovery row (grid-column: 1/-1).
    if (kind === 'discovery_feed') {
      const placements4 = [
        'home_discovery_1',
        'home_discovery_2',
        'home_discovery_3',
        'home_discovery_4',
      ];
      return (
        <div key={slot.id} className="vp-rh-discovery">
          {placements4.map((p, i) => {
            const anchor = `placement:${p}`;
            const html = creativeFor(p);
            const pill = adPill(p);
            return (
              <div
                key={p}
                {...cellProps(
                  anchor,
                  () =>
                    onOpenEdit({
                      kind: 'ad_placement',
                      slotId: slot.id,
                      placement: p,
                      slotKind: kind,
                    }),
                  {
                    opacity: adsOn ? 1 : 0.5,
                    minHeight: 120,
                    border: html ? undefined : '1px dashed #b3b3b3',
                    background: '#fff',
                    padding: html ? 0 : 16,
                  },
                )}
                className="discovery-cell"
                data-placement={p}
              >
                <PosChip n={slot.position + i} />
                <span className="vp-admin-outline" style={selectionOutline(anchor)} />
                {html ? (
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 100,
                      color: '#888',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                      Add ad
                    </span>
                    {pill && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 4px',
                          borderRadius: 2,
                          background: pill.bg,
                          color: pill.fg,
                          letterSpacing: 0.4,
                        }}
                      >
                        {pill.label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // CLUSTER and every other ARTICLE_KIND — emit cells as DIRECT children
    // of the parent vp-rh-grid so they flow into the 3-col grid alongside
    // the lead, matching the public page. A React Fragment wrapper keeps
    // the call site uniform but doesn't introduce an extra DOM element.
    if (ARTICLE_KINDS.has(kind)) {
      const capacity = slotCapacity(slot);
      const cells = Array.from({ length: capacity }, (_, i) => i);
      return (
        <Fragment key={slot.id}>
          {cells.map((pos) =>
            renderArticlePositionRow(slot, pos, slot.position + pos),
          )}
        </Fragment>
      );
    }

    // Payload-only kinds: feature, engagement, promo. No
    // vp-rh-* equivalent — render a single labeled block that opens the
    // block editor on click. Spans full row so it doesn't break the grid.
    const anchor = `payload:${slot.id}`;
    const itemCount = slot.items.length;
    return (
      <div
        key={slot.id}
        {...cellProps(
          anchor,
          () => onOpenEdit({ kind: 'payload', slotId: slot.id }),
          {
            minHeight: 100,
            border: '1px solid var(--p-ink, #000)',
            background: 'var(--p-surface, #f6f4ef)',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            justifyContent: 'center',
            gridColumn: '1 / -1',
          },
        )}
      >
        <PosChip n={slot.position} />
        <span className="vp-admin-outline" style={selectionOutline(anchor)} />
        <span
          style={{
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#666',
            fontWeight: 700,
          }}
        >
          {KIND_LABEL[kind] ?? kind}
        </span>
        <span style={{ fontSize: 14, color: '#444' }}>
          {itemCount > 0
            ? `${itemCount} item${itemCount === 1 ? '' : 's'} — click to edit block`
            : 'Click to edit block'}
        </span>
      </div>
    );
  };

  // Compute the popover anchor key for the current activeEdit. Drives the
  // ref lookup that positions the popover.
  const anchorKey = (() => {
    if (!activeEdit) return null;
    if (activeEdit.kind === 'article_cell')
      return `${activeEdit.slotId}:${activeEdit.position}`;
    if (activeEdit.kind === 'ad_placement')
      return `placement:${activeEdit.placement}`;
    return `payload:${activeEdit.slotId}`;
  })();

  // Sort by position ASC to match the public renderer's order. Same
  // filter rule too: breaking_strip is hidden on the live page so the
  // admin preview hides it as well (keeps the preview honest).
  const orderedSlots = [...layout.slots]
    .filter((s) => s.kind !== 'breaking_strip')
    .sort((a, b) => a.position - b.position);

  return (
    <div style={{ position: 'relative' }}>
      <RhStyles />
      <div
        style={{
          padding: S[3],
          border: `1px solid ${C.divider}`,
          background: '#fff',
          maxWidth: '100%',
        }}
      >
        {/* Visually mirror the public home (web/src/app/page.tsx →
            _home/HomeLayout.tsx). Cells emit straight into vp-rh-grid so
            the 3-col cluster grid, full-width lead with timeline aside,
            and ad-style rows (ticker / insight / discovery) all sit in
            the same place they do at /. Admin-only chrome is limited to
            the tiny `[N]` PosChip + the red selection outline on click.
            No section headers, no ordinal column. */}
        <div className="vp-rh" style={{ width: '100%' }}>
          <main className="vp-rh-grid">
            {orderedSlots.map((slot) => renderSlot(slot))}
          </main>
        </div>
      </div>

      {activeEdit && editingSlot && anchorKey && (
        <SlotInlineEditor
          anchorEl={tileRefs.current[anchorKey] ?? null}
          slot={editingSlot}
          activeEdit={activeEdit}
          title={popoverTitle(editingSlot)}
          placements={placements}
          adStatuses={adStatuses}
          adsOn={adsOn}
          mutating={mutating}
          togglingAdId={togglingAdId}
          query={query}
          results={results}
          searching={searching}
          categories={categories}
          categoryFilter={categoryFilter}
          onChangeCategoryFilter={onChangeCategoryFilter}
          onChangeQuery={onChangeQuery}
          onClose={onClose}
          onAssign={onAssign}
          onPlaceAd={onPlaceAd}
          onCreateInlineAd={onCreateInlineAd}
          onClear={onClear}
          onSpanChange={onSpanChange}
          onCapacityChange={onCapacityChange}
          onSavePayload={onSavePayload}
          onToggleAdUnit={onToggleAdUnit}
          adUnitForPlacement={adUnitForPlacement}
        />
      )}
    </div>
  );
}

// Floating popover anchored next to the clicked tile. Three variants:
//   article_cell  — full Article/Ad picker scoped to one (slot, position)
//   ad_placement  — Edit creative link + per-ad toggle (baked placements)
//   payload       — feature/engagement/promo block editor
// Click-outside (backdrop) + ESC close (ESC wired in HomeEditorInner).
function SlotInlineEditor({
  anchorEl,
  slot,
  activeEdit,
  title,
  placements,
  adStatuses,
  adsOn,
  mutating,
  togglingAdId,
  query,
  results,
  searching,
  categories,
  categoryFilter,
  onChangeCategoryFilter,
  onChangeQuery,
  onClose,
  onAssign,
  onPlaceAd,
  onCreateInlineAd,
  onClear,
  onSpanChange,
  onCapacityChange,
  onSavePayload,
  onToggleAdUnit,
  adUnitForPlacement,
}: {
  anchorEl: HTMLDivElement | null;
  slot: SlotRow;
  activeEdit: ActiveEdit;
  title: string;
  placements: PlacementOption[];
  adStatuses: Record<string, AdStatus>;
  adsOn: boolean;
  mutating: boolean;
  togglingAdId: string | null;
  query: string;
  results: SearchResult[];
  searching: boolean;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
  categoryFilter: string | null;
  onChangeCategoryFilter: (id: string | null) => void;
  onChangeQuery: (q: string) => void;
  onClose: () => void;
  onAssign: (slotId: string, position: number, articleId: string) => void;
  onPlaceAd: (slotId: string, position: number, placement: string, slotKind: string) => Promise<boolean>;
  onCreateInlineAd: (
    slotId: string,
    position: number,
    fields: { ad_name: string; creative_html: string; click_url: string },
  ) => Promise<boolean>;
  onClear: (itemId: string) => void;
  onSpanChange: (slotId: string, span: SlotSpan) => void;
  onCapacityChange: (slot: SlotRow, capacity: number) => void;
  onSavePayload: (slot: SlotRow, payload: Record<string, unknown>) => void;
  onToggleAdUnit: (adUnitId: string, nextValue: boolean) => void;
  adUnitForPlacement: (placement: string) => LocalAdUnitRow | null;
}) {
  // Anchor-relative positioning. Read the tile's bounding rect once on
  // first render + on viewport resize. Falls back to a fixed top-center
  // overlay if the anchor element isn't yet measurable (e.g. layout shift).
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!anchorEl) return;
    const measure = () => setAnchorRect(anchorEl.getBoundingClientRect());
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchorEl]);

  // Inline-mode selector. For article_cell tiles we offer 3 buttons across
  // the top: Article / Ad / Clear. Default mode = article picker so the
  // common case is one click away. Switching modes does NOT save anything.
  type Mode = 'article' | 'ad';
  const initialMode: Mode = (() => {
    if (activeEdit.kind !== 'article_cell') return 'article';
    const item = slot.items.find((i) => i.position === activeEdit.position);
    return item?.content_type === 'ad' ? 'ad' : 'article';
  })();
  const [mode, setMode] = useState<Mode>(initialMode);

  // Ad-form local state mirrors the previous SlotRowEditor: placement name
  // string. Default-select prefills the existing ad's placement OR the
  // most-relevant home placement matching this slot.kind.
  const itemAtPosition =
    activeEdit.kind === 'article_cell'
      ? slot.items.find((i) => i.position === activeEdit.position)
      : null;
  const existingAd =
    itemAtPosition?.content_type === 'ad' ? itemAtPosition : null;
  const existingAdPlacement =
    existingAd && typeof existingAd.payload?.placement === 'string'
      ? (existingAd.payload.placement as string)
      : '';
  const defaultAdPlacement = (() => {
    if (existingAdPlacement) return existingAdPlacement;
    if (activeEdit.kind !== 'article_cell') return '';
    const targetPosition =
      slot.kind === 'cluster'
        ? 'cluster_inline'
        : slot.kind === 'list_rail'
          ? 'list_rail_inline'
          : slot.kind === 'secondary_pair'
            ? 'secondary_pair_inline'
            : slot.kind === 'wide_strip'
              ? 'wide_strip_inline'
              : slot.kind === 'editors_picks'
                ? 'editors_picks_inline'
                : 'inline';
    const onHome = placements.filter((p) => p.page === 'home');
    const exact = onHome.find((p) => p.position === targetPosition);
    if (exact) return exact.name;
    const anywhere = placements.find((p) => p.position === targetPosition);
    return anywhere?.name ?? '';
  })();
  const [adPlacement, setAdPlacement] = useState(defaultAdPlacement);
  // Reset adPlacement whenever the editor target changes — otherwise the
  // value from the previously-edited cell sticks around.
  useEffect(() => {
    setAdPlacement(defaultAdPlacement);
    setMode(initialMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEdit]);

  // Position math. Prefer right-of-anchor; fall back to left or below
  // when there isn't room. Width pinned to 360.
  const POPOVER_WIDTH = 360;
  const popoverStyle: CSSProperties = (() => {
    if (!anchorRect) {
      return {
        position: 'fixed',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        width: POPOVER_WIDTH,
        maxWidth: 'calc(100vw - 32px)',
      };
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const gap = 8;
    let left = anchorRect.right + gap;
    if (left + POPOVER_WIDTH > vw - 8) {
      // Try left of anchor.
      left = anchorRect.left - POPOVER_WIDTH - gap;
      if (left < 8) {
        // Center within viewport as a last resort.
        left = Math.max(8, (vw - POPOVER_WIDTH) / 2);
      }
    }
    let top = anchorRect.top;
    // Clamp so the popover never falls off the bottom.
    const ESTIMATED_HEIGHT = 480;
    if (top + ESTIMATED_HEIGHT > vh - 8) {
      top = Math.max(8, vh - ESTIMATED_HEIGHT - 8);
    }
    if (top < 8) top = 8;
    return {
      position: 'fixed',
      top,
      left,
      width: POPOVER_WIDTH,
      maxWidth: 'calc(100vw - 32px)',
    };
  })();

  // Common header (title + close button). Used by all variants.
  const Header = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${S[3]}px ${S[3]}px ${S[2]}px`,
        borderBottom: `1px solid ${C.divider}`,
      }}
    >
      <div style={{ fontSize: F.base, fontWeight: 700, color: C.ink }}>
        {title}
      </div>
      <Button size="sm" variant="secondary" onClick={onClose}>
        Close
      </Button>
    </div>
  );

  // Footer used on article_cell + payload popovers: width + (for article
  // kinds) capacity controls. Lets the owner reshape the slot without a
  // separate row editor.
  const SlotShapeFooter = () => {
    if (activeEdit.kind === 'ad_placement') return null;
    const capacity = slotCapacity(slot);
    const showCapacity = ARTICLE_KINDS.has(slot.kind);
    return (
      <div
        style={{
          padding: `${S[2]}px ${S[3]}px`,
          borderTop: `1px solid ${C.divider}`,
          background: C.hover,
          display: 'flex',
          flexWrap: 'wrap',
          gap: S[3],
          alignItems: 'center',
        }}
      >
        <label style={{ fontSize: F.sm, color: C.dim, display: 'flex', alignItems: 'center', gap: S[1] }}>
          Width
          <select
            value={slot.span}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              onSpanChange(slot.id, Number(e.target.value) as SlotSpan)
            }
            disabled={mutating}
            style={{
              fontSize: F.sm,
              padding: `${S[1]}px ${S[2]}px`,
              border: `1px solid ${C.divider}`,
              borderRadius: 4,
              background: C.bg,
              color: C.ink,
            }}
          >
            {SPAN_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SPAN_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {showCapacity && (
          <span
            title={`Cell count. Default for ${slot.kind} is ${KIND_DEFAULT_CAPACITY[slot.kind]}. Range 1–${MAX_SLOT_CAPACITY}.`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: S[1],
              fontSize: F.sm,
              color: C.dim,
            }}
          >
            Capacity
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onCapacityChange(slot, Math.max(1, capacity - 1))}
              disabled={mutating || capacity <= 1}
            >
              −
            </Button>
            <span
              style={{
                minWidth: 24,
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                color: C.ink,
              }}
            >
              {capacity}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onCapacityChange(slot, Math.min(MAX_SLOT_CAPACITY, capacity + 1))}
              disabled={mutating || capacity >= MAX_SLOT_CAPACITY}
            >
              +
            </Button>
          </span>
        )}
      </div>
    );
  };

  // ----- Variant: article_cell -----
  const articleVariant = () => {
    if (activeEdit.kind !== 'article_cell') return null;
    const item = itemAtPosition;
    const story = item?.article;
    const isAd = item?.content_type === 'ad';
    const adPlacementLabel = existingAdPlacement;
    // Hero (lead) only allows Article + Clear per the spec — no Ad mode.
    const allowAd = slot.kind !== 'lead';
    const status: AdStatus =
      adPlacementLabel ? adStatuses[adPlacementLabel] ?? 'UNKNOWN' : 'UNKNOWN';

    return (
      <>
        <Header />

        {/* Current-state strip */}
        <div
          style={{
            padding: `${S[2]}px ${S[3]}px`,
            borderBottom: `1px solid ${C.divider}`,
            background: C.bg,
            fontSize: F.sm,
            color: C.dim,
          }}
        >
          {story ? (
            <>
              <div style={{ color: C.ink, fontWeight: 600, lineHeight: 1.3 }}>
                {story.title}
              </div>
              <div style={{ marginTop: 2 }}>
                {formatDate(story.published_at ?? null)}
              </div>
            </>
          ) : isAd ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  padding: `${S[1]}px ${S[2]}px`,
                  borderRadius: 4,
                  border: `1px solid ${C.divider}`,
                  background: C.hover,
                  color: C.ink,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                }}
              >
                AD · {adPlacementLabel || '(no placement)'}
              </span>
              {adPlacementLabel && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    padding: '2px 6px',
                    borderRadius: 4,
                    marginLeft: 8,
                    background:
                      status === 'LIVE'
                        ? '#10b981'
                        : status === 'NO AD'
                          ? '#f59e0b'
                          : '#9ca3af',
                    color: '#fff',
                  }}
                >
                  {status}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontStyle: 'italic' }}>Empty — pick something</span>
          )}
        </div>

        {/* Mode tabs */}
        {allowAd && (
          <div
            style={{
              display: 'flex',
              gap: S[2],
              padding: `${S[2]}px ${S[3]}px`,
              borderBottom: `1px solid ${C.divider}`,
              background: C.hover,
            }}
          >
            <Button
              size="sm"
              variant={mode === 'article' ? 'primary' : 'secondary'}
              onClick={() => setMode('article')}
              disabled={mutating}
            >
              Article
            </Button>
            <Button
              size="sm"
              variant={mode === 'ad' ? 'primary' : 'secondary'}
              onClick={() => setMode('ad')}
              disabled={mutating}
            >
              Ad
            </Button>
            <span style={{ flex: 1 }} />
            {item && (story || isAd) && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => onClear(item.id)}
                disabled={mutating}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {!allowAd && item && story && (
          <div
            style={{
              display: 'flex',
              padding: `${S[2]}px ${S[3]}px`,
              borderBottom: `1px solid ${C.divider}`,
              background: C.hover,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              size="sm"
              variant="danger"
              onClick={() => onClear(item.id)}
              disabled={mutating}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Body */}
        <div
          style={{
            maxHeight: 360,
            overflowY: 'auto',
            padding: S[3],
          }}
        >
          {mode === 'article' ? (
            <ArticlePickerPanel
              slotId={slot.id}
              position={activeEdit.position}
              query={query}
              results={results}
              searching={searching}
              categories={categories}
              categoryFilter={categoryFilter}
              mutating={mutating}
              onChangeQuery={onChangeQuery}
              onChangeCategoryFilter={onChangeCategoryFilter}
              onAssign={onAssign}
            />
          ) : (
            <>
              <AdPlacementPicker
                placements={placements}
                value={adPlacement}
                mutating={mutating}
                onChange={setAdPlacement}
                onCancel={onClose}
                onSave={async () => {
                  const placement = adPlacement.trim();
                  if (!placement) return;
                  await onPlaceAd(slot.id, activeEdit.position, placement, slot.kind);
                }}
              />
              {/* "or" divider — sits between the existing-placement picker
                  above and the inline create form below. Two coexisting
                  paths: pick from a pre-built ad_unit + placement, OR
                  mint a new ad_unit and place it in one click. */}
              <div
                aria-hidden
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[2],
                  margin: `${S[3]}px 0`,
                  color: C.dim,
                  fontSize: F.sm,
                }}
              >
                <span style={{ flex: 1, height: 1, background: C.divider }} />
                <span>or</span>
                <span style={{ flex: 1, height: 1, background: C.divider }} />
              </div>
              <InlineAdCreator
                mutating={mutating}
                onCreate={async (fields) => {
                  await onCreateInlineAd(slot.id, activeEdit.position, fields);
                }}
              />
            </>
          )}
        </div>

        <SlotShapeFooter />
      </>
    );
  };

  // ----- Variant: ad_placement (baked ticker / insight / discovery cells) -----
  const adPlacementVariant = () => {
    if (activeEdit.kind !== 'ad_placement') return null;
    const placement = activeEdit.placement;
    const unit = adUnitForPlacement(placement);
    const status: AdStatus = adStatuses[placement] ?? 'UNKNOWN';
    const active = unit?.is_active === true;
    const orphan = !unit || unit.ad_unit_id === null;
    const isToggling = unit?.ad_unit_id != null && togglingAdId === unit.ad_unit_id;

    return (
      <>
        <Header />
        <div
          style={{
            padding: `${S[3]}px`,
            borderBottom: `1px solid ${C.divider}`,
            background: C.bg,
            display: 'flex',
            flexDirection: 'column',
            gap: S[2],
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '2px 6px',
                borderRadius: 4,
                background:
                  !adsOn
                    ? '#9ca3af'
                    : status === 'LIVE'
                      ? '#10b981'
                      : status === 'NO AD'
                        ? '#f59e0b'
                        : '#9ca3af',
                color: '#fff',
              }}
            >
              {!adsOn ? 'OFF (master)' : status}
            </span>
            <span style={{ fontSize: F.sm, color: C.dim }}>{placement}</span>
          </div>
          <div style={{ fontSize: F.sm, color: C.ink }}>
            {orphan ? (
              <span
                style={{
                  display: 'inline-block',
                  padding: `${S[1]}px ${S[2]}px`,
                  border: '1px solid #f59e0b',
                  background: '#fef3c7',
                  color: '#78350f',
                  borderRadius: 4,
                  fontSize: F.sm,
                }}
              >
                No ad unit attached to this placement.
              </span>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>{unit?.ad_unit_name}</div>
                <div style={{ color: C.dim, marginTop: 2 }}>
                  Campaign: {unit?.campaign_status ?? '—'}
                </div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            padding: `${S[3]}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: S[2],
          }}
        >
          {!orphan && unit?.ad_unit_id && (
            <>
              <a
                href={`/admin/ad-units/${unit.ad_unit_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: F.sm,
                  color: C.ink,
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  fontWeight: 600,
                }}
              >
                Edit this ad’s creative ↗
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                <span style={{ fontSize: F.sm, color: C.dim, flex: 1 }}>
                  Per-ad toggle
                </span>
                <Button
                  size="sm"
                  variant={active ? 'secondary' : 'primary'}
                  onClick={() =>
                    unit.ad_unit_id && onToggleAdUnit(unit.ad_unit_id, !active)
                  }
                  disabled={isToggling || togglingAdId !== null || !adsOn}
                >
                  {isToggling ? '…' : active ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
              {!adsOn && (
                <div
                  style={{
                    fontSize: F.sm,
                    color: '#92400e',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    padding: `${S[1]}px ${S[2]}px`,
                    borderRadius: 4,
                  }}
                >
                  Sitewide ads are OFF. Per-ad toggle is locked.
                </div>
              )}
            </>
          )}
          {orphan && (
            <a
              href={`/admin/ad-placements`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: F.sm,
                color: C.ink,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                fontWeight: 600,
              }}
            >
              Create or attach an ad for this placement ↗
            </a>
          )}
        </div>
      </>
    );
  };

  // ----- Variant: payload (feature / engagement / promo) -----
  const payloadVariant = () => {
    if (activeEdit.kind !== 'payload') return null;
    return (
      <>
        <Header />
        <div style={{ padding: S[3], maxHeight: 420, overflowY: 'auto' }}>
          <PayloadEditor
            slot={slot}
            mutating={mutating}
            onSave={(payload) => onSavePayload(slot, payload)}
          />
        </div>
        <SlotShapeFooter />
      </>
    );
  };

  return (
    <>
      {/* Backdrop — click anywhere outside the popover to close. */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.04)',
          zIndex: 40,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...popoverStyle,
          zIndex: 41,
          background: C.bg,
          border: `1px solid ${C.divider}`,
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 32px)',
        }}
      >
        {activeEdit.kind === 'article_cell' && articleVariant()}
        {activeEdit.kind === 'ad_placement' && adPlacementVariant()}
        {activeEdit.kind === 'payload' && payloadVariant()}
      </div>
    </>
  );
}

// Article picker panel. Extracted from the old SlotRowEditor so it can be
// reused inside the article-cell popover without duplicating the search
// fetch wiring (which lives one level up in HomeEditorInner).
function ArticlePickerPanel({
  slotId,
  position,
  query,
  results,
  searching,
  categories,
  categoryFilter,
  mutating,
  onChangeQuery,
  onChangeCategoryFilter,
  onAssign,
}: {
  slotId: string;
  position: number;
  query: string;
  results: SearchResult[];
  searching: boolean;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
  categoryFilter: string | null;
  mutating: boolean;
  onChangeQuery: (q: string) => void;
  onChangeCategoryFilter: (id: string | null) => void;
  onAssign: (slotId: string, position: number, articleId: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: S[2], marginBottom: S[2] }}>
        <select
          value={categoryFilter ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChangeCategoryFilter(e.target.value || null)
          }
          disabled={mutating}
          style={{
            fontSize: F.sm,
            padding: `${S[2]}px ${S[2]}px`,
            border: `1px solid ${C.divider}`,
            borderRadius: 4,
            background: C.bg,
            color: C.ink,
            minWidth: 140,
          }}
        >
          <option value="">All sections</option>
          {categories
            .filter((c) => c.parent_id === null)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <div style={{ flex: 1 }}>
          <TextInput
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChangeQuery(e.target.value)
            }
            placeholder="Type to filter, or pick below…"
            autoFocus
          />
        </div>
      </div>
      {!searching && results.length === 0 && query.length === 0 && (
        <div style={{ padding: `${S[2]}px 0`, color: C.muted, fontSize: F.sm }}>
          No published articles match this filter.
        </div>
      )}
      {searching && (
        <div
          style={{
            padding: `${S[2]}px 0`,
            color: C.dim,
            fontSize: F.sm,
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
          }}
        >
          <Spinner /> Loading…
        </div>
      )}
      {!searching && results.length === 0 && query.length >= 1 && (
        <div style={{ padding: `${S[2]}px 0`, color: C.muted, fontSize: F.sm }}>
          No results.
        </div>
      )}
      {!searching && results.length > 0 && query.length === 0 && (
        <div style={{ padding: `${S[1]}px 0`, color: C.dim, fontSize: F.sm }}>
          {categoryFilter ? 'Recent in section' : 'Most recent'}
        </div>
      )}
      {results.map((r) => (
        <div
          key={r.id}
          onClick={() => onAssign(slotId, position, r.id)}
          style={{
            padding: `${S[2]}px ${S[3]}px`,
            marginTop: S[1],
            cursor: 'pointer',
            borderRadius: 4,
            border: `1px solid ${C.divider}`,
            background: C.bg,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = C.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = C.bg;
          }}
        >
          <div style={{ fontSize: F.base, color: C.ink, fontWeight: 500 }}>
            {r.title}
          </div>
          <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>
            {r.categories?.name ? `${r.categories.name} · ` : ''}
            {formatDate(r.published_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Placement-picker dropdown for the ad-cell variant. Groups placements by
// `page` so home / article don't blur together, and disables the Save
// button until a placement is picked.
function AdPlacementPicker({
  placements,
  value,
  mutating,
  onChange,
  onCancel,
  onSave,
}: {
  placements: PlacementOption[];
  value: string;
  mutating: boolean;
  onChange: (next: string) => void;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
}) {
  const grouped = new Map<string, PlacementOption[]>();
  for (const p of placements) {
    const key = p.page || 'Other';
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }
  const pageKeys = Array.from(grouped.keys()).sort();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <label style={{ display: 'block' }}>
        <span
          style={{
            fontSize: F.sm,
            color: C.dim,
            display: 'block',
            marginBottom: S[1],
          }}
        >
          Placement
        </span>
        <select
          value={value}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange(e.target.value)
          }
          disabled={mutating}
          autoFocus
          style={{
            width: '100%',
            fontSize: F.base,
            padding: `${S[2]}px ${S[3]}px`,
            border: `1px solid ${C.divider}`,
            borderRadius: 4,
            background: C.bg,
            color: C.ink,
          }}
        >
          {placements.length === 0 && (
            <option value="">No active placements — add one first</option>
          )}
          {placements.length > 0 && value === '' && (
            <option value="">Select a placement…</option>
          )}
          {pageKeys.map((page) => (
            <optgroup key={page} label={page}>
              {grouped.get(page)!.map((p) => (
                <option
                  key={p.name}
                  value={p.name}
                  style={{ color: p.has_active_ad_unit ? C.ink : C.muted }}
                >
                  {p.display_name}
                  {p.has_active_ad_unit ? '' : ' (no ad attached)'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[2],
        }}
      >
        <a
          href="/admin/ad-placements"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: F.sm,
            color: C.dim,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          Manage placements ↗
        </a>
        <div style={{ display: 'flex', gap: S[2] }}>
          <Button size="sm" variant="secondary" onClick={onCancel} disabled={mutating}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={onSave}
            disabled={mutating || value.trim().length === 0}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}


// Inline "Create new ad" form rendered below the placement picker in the
// article_cell Ad mode. Collapsed by default to keep the popover compact;
// expanding reveals name + creative_html + click_url fields and a single
// "Create & place" button that mints the ad_unit and pins it to this
// (slot, position) in one server-side call. Placement is derived from
// the slot's kind server-side (cluster cells → home_signup_inline).
function InlineAdCreator({
  mutating,
  onCreate,
}: {
  mutating: boolean;
  onCreate: (fields: {
    ad_name: string;
    creative_html: string;
    click_url: string;
  }) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adName, setAdName] = useState('');
  const [creativeHtml, setCreativeHtml] = useState('');
  const [clickUrl, setClickUrl] = useState('/signup');

  const canSubmit =
    !mutating && adName.trim().length > 0 && creativeHtml.trim().length > 0;

  if (!expanded) {
    return (
      <div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setExpanded(true)}
          disabled={mutating}
        >
          Create new ad inline
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ fontSize: F.sm, color: C.dim, fontWeight: 600 }}>
        Create new ad inline
      </div>
      <label style={{ display: 'block' }}>
        <span
          style={{
            fontSize: F.sm,
            color: C.dim,
            display: 'block',
            marginBottom: S[1],
          }}
        >
          Ad name
        </span>
        <TextInput
          value={adName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setAdName(e.target.value)}
        />
      </label>
      <label style={{ display: 'block' }}>
        <span
          style={{
            fontSize: F.sm,
            color: C.dim,
            display: 'block',
            marginBottom: S[1],
          }}
        >
          Creative HTML
        </span>
        <textarea
          value={creativeHtml}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            setCreativeHtml(e.target.value)
          }
          rows={6}
          style={{
            width: '100%',
            fontSize: F.base,
            padding: `${S[2]}px ${S[3]}px`,
            border: `1px solid ${C.divider}`,
            borderRadius: 4,
            background: C.bg,
            color: C.ink,
            fontFamily: 'monospace',
            resize: 'vertical',
            minHeight: 120,
          }}
        />
      </label>
      <label style={{ display: 'block' }}>
        <span
          style={{
            fontSize: F.sm,
            color: C.dim,
            display: 'block',
            marginBottom: S[1],
          }}
        >
          Click URL
        </span>
        <TextInput
          value={clickUrl}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setClickUrl(e.target.value)
          }
        />
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: S[2] }}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setExpanded(false)}
          disabled={mutating}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            if (!canSubmit) return;
            await onCreate({
              ad_name: adName.trim(),
              creative_html: creativeHtml,
              click_url: clickUrl.trim() || '/signup',
            });
          }}
          disabled={!canSubmit}
        >
          Create & place
        </Button>
      </div>
    </div>
  );
}


function PayloadEditor({
  slot,
  mutating,
  onSave,
}: {
  slot: SlotRow;
  mutating: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const item = slot.items.find((i) => i.content_type !== 'article');
  const initial = (item?.payload ?? {}) as Record<string, unknown>;

  const fields: Array<{ key: string; label: string; multiline?: boolean }> =
    slot.kind === 'feature'
      ? [
          { key: 'label', label: 'Label' },
          { key: 'body', label: 'Body', multiline: true },
        ]
      : slot.kind === 'engagement'
        ? [
            { key: 'label', label: 'Label' },
            { key: 'prompt', label: 'Prompt', multiline: true },
            { key: 'href', label: 'Link URL' },
            { key: 'cta', label: 'Button text' },
          ]
        : [
            { key: 'label', label: 'Label' },
            { key: 'heading', label: 'Heading' },
            { key: 'body', label: 'Body', multiline: true },
            { key: 'href', label: 'Link URL' },
            { key: 'cta', label: 'Button text' },
          ];

  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      v[f.key] = typeof initial[f.key] === 'string' ? (initial[f.key] as string) : '';
    }
    return v;
  });

  const setField = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], paddingTop: S[2] }}>
      {fields.map((f) => (
        <label key={f.key} style={{ display: 'block' }}>
          <span style={{ fontSize: F.sm, color: C.dim, display: 'block', marginBottom: S[1] }}>
            {f.label}
          </span>
          {f.multiline ? (
            <textarea
              value={values[f.key]}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setField(f.key, e.target.value)}
              rows={3}
              style={{
                width: '100%',
                fontSize: F.base,
                padding: `${S[2]}px ${S[3]}px`,
                border: `1px solid ${C.divider}`,
                borderRadius: 4,
                background: C.bg,
                color: C.ink,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          ) : (
            <TextInput
              value={values[f.key]}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setField(f.key, e.target.value)}
            />
          )}
        </label>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: S[2] }}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            const payload: Record<string, unknown> = {};
            for (const f of fields) {
              if (values[f.key]) payload[f.key] = values[f.key];
            }
            onSave(payload);
          }}
          disabled={mutating}
        >
          Save block
        </Button>
      </div>
    </div>
  );
}

export default function HomeEditorPage() {
  return <HomeEditorInner />;
}
