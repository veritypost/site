// Data fetchers for the templated homepage. The public page reads the layout
// where status='live' (RLS enforces this — non-live rows aren't visible
// to anon users). The admin preview path reads any layout by slug via
// the service client.

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { BLOCKING_SENSITIVITY_TAG_IDS } from '@/lib/sensitivityTags';
import type {
  HomeStory,
  LayoutRow,
  SlotItem,
  SlotKind,
  SlotRow,
  SlotSpan,
} from './types';

// ad_eligible + sensitivity_tags are pulled so we can enforce editorial
// adjacency at the home layer. serve_ad's editorial gates only fire on
// article-page placements (they hang off p_article_id), so home placements
// (home_top, home_ticker_sponsor, home_insight_row, home_discovery_*, etc.)
// would otherwise bypass the gate and could surface an ad above a tragedy
// hero. Strategy: keep ads on the home page, but null out the article on
// any slot item whose article is flagged — the article still lives on its
// own URL with its own ad gating, it just loses its home spotlight.
const ARTICLE_SELECT =
  'id, title, stories(slug, lifecycle_status), excerpt, category_id, story_id, is_breaking, is_developing, published_at, updated_at, cover_image_url, cover_image_alt, ad_eligible, sensitivity_tags';

type RawSlotItem = {
  id: string;
  position: number;
  content_type: string;
  ref_id: string | null;
  payload: Record<string, unknown> | null;
  articles: HomeStory | null;
};

type RawSlot = {
  id: string;
  key: string;
  kind: string;
  span: number;
  position: number;
  config: Record<string, unknown> | null;
  home_slot_items: RawSlotItem[] | null;
};

type RawLayout = {
  id: string;
  slug: string;
  name: string;
  status: string;
  description: string | null;
  ads_enabled: boolean | null;
  home_slots: RawSlot[] | null;
};

const SLOT_KINDS: ReadonlySet<SlotKind> = new Set([
  'lead',
  'second_lead',
  'breaking_strip',
  'cluster',
  'list_rail',
  'engagement',
  'promo',
  'secondary_pair',
  'wide_strip',
  'editors_picks',
  'data_ticker',
  'insight_row',
  'discovery_feed',
  'top_banner',
  'story_card',
  'rail_card',
  'square_row',
]);

// Editorial adjacency filter for home feature slots. Returns true when the
// article should NOT be featured on home (ad_eligible=false OR any
// blocking sensitivity tag). The article still publishes at its own URL —
// serve_ad's article-page gates handle ad suppression there. The home
// page just doesn't spotlight it, so an ad in home_top / home_in_feed_*
// / home_ticker_sponsor / home_insight_row / home_discovery_* can't land
// adjacent to a tragedy hero.
function isHomeBlocked(a: HomeStory): boolean {
  if (a.ad_eligible === false) return true;
  const tags = a.sensitivity_tags;
  if (!Array.isArray(tags) || tags.length === 0) return false;
  return tags.some((t) => BLOCKING_SENSITIVITY_TAG_IDS.has(t));
}

function shapeLayout(raw: RawLayout): LayoutRow {
  const slots: SlotRow[] = (raw.home_slots ?? [])
    .filter((s) => SLOT_KINDS.has(s.kind as SlotKind))
    .map((s) => ({
      id: s.id,
      key: s.key,
      kind: s.kind as SlotKind,
      span: (s.span as SlotSpan) ?? 12,
      position: s.position,
      config: s.config ?? {},
      items: (s.home_slot_items ?? [])
        .map((item) => {
          const hasValidArticle =
            item.content_type === 'article' &&
            !!item.articles?.stories?.slug;
          // Apply the adjacency filter: null out the article on flagged
          // rows. Slot renderers (Lead, Cluster, EditorsPicks, ListRail,
          // SecondLead, SecondaryPair, WideStrip) already skip items
          // whose article is null, so the slot either falls back to its
          // next eligible item or renders empty.
          const blocked =
            hasValidArticle && item.articles
              ? isHomeBlocked(item.articles)
              : false;
          return {
            id: item.id,
            position: item.position,
            content_type: item.content_type as SlotItem['content_type'],
            article: hasValidArticle && !blocked ? item.articles : null,
            ref_id: item.ref_id,
            payload: item.payload ?? {},
          };
        })
        .sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    status: raw.status as LayoutRow['status'],
    description: raw.description,
    ads_enabled: raw.ads_enabled ?? true,
    slots,
  };
}

const LAYOUT_SELECT = `
  id, slug, name, status, description, ads_enabled,
  home_slots (
    id, key, kind, span, position, config,
    home_slot_items (
      id, position, content_type, ref_id, payload,
      articles!fk_home_slot_items_article_id (${ARTICLE_SELECT})
    )
  )
`;

// Inner uncached implementation. Kept around in case any caller already
// holds a service client and wants to bypass the cache (none do today).
async function fetchLiveLayoutInner(
  client: SupabaseClient,
): Promise<LayoutRow | null> {
  const { data, error } = await client
    .from('home_layouts')
    .select(LAYOUT_SELECT)
    .eq('status', 'live')
    .limit(1)
    .maybeSingle<RawLayout>();

  if (error) {
    console.error('[home.fetchLiveLayout]', error.message);
    return null;
  }
  if (!data) return null;
  return shapeLayout(data);
}

// Public read — cached with tag 'home-layout' + 60s TTL safety net. The
// admin write routes call revalidateTag('home-layout') after every
// mutation so editors see their edits immediately; the TTL is the
// defense if any admin route forgets to invalidate. Cache key has no
// args (the only knob is 'status=live', which can't vary per caller).
// Service client is built inside the cached function so the cache key
// stays serializable — SupabaseClient is non-serializable and identity-
// unstable, would defeat the cache if passed in.
export const fetchLiveLayout = unstable_cache(
  async (): Promise<LayoutRow | null> => {
    return fetchLiveLayoutInner(createServiceClient());
  },
  ['home-layout-live'],
  { tags: ['home-layout'], revalidate: 60 },
);

// Admin / preview read — fetches any layout by slug, including drafts.
// Caller must use the service client.
export async function fetchLayoutBySlug(
  service: SupabaseClient,
  slug: string,
): Promise<LayoutRow | null> {
  const { data, error } = await service
    .from('home_layouts')
    .select(LAYOUT_SELECT)
    .eq('slug', slug)
    .maybeSingle<RawLayout>();

  if (error) {
    console.error('[home.fetchLayoutBySlug]', error.message);
    return null;
  }
  if (!data) return null;
  return shapeLayout(data);
}

// Lightweight check used by the root router to decide whether to render
// the templated home or fall through to the legacy v1 home. Cheap — single
// indexed row lookup.
export async function isHomeLive(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client
    .from('home_layouts')
    .select('slug')
    .eq('status', 'live')
    .eq('slug', 'home')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[home.isHomeLive]', error.message);
    return false;
  }
  return !!data;
}
