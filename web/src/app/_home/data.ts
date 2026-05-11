// Data fetchers for the v2 homepage. The public page reads the layout
// where status='live' (RLS enforces this — non-live rows aren't visible
// to anon users). The admin preview path reads any layout by slug via
// the service client.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HomeStory,
  LayoutRow,
  SlotItem,
  SlotKind,
  SlotRow,
  SlotSpan,
} from './types';

const ARTICLE_SELECT =
  'id, title, stories(slug, lifecycle_status), excerpt, category_id, is_breaking, is_developing, published_at, cover_image_url, cover_image_alt';

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
  home_slots: RawSlot[] | null;
};

const SLOT_KINDS: ReadonlySet<SlotKind> = new Set([
  'lead',
  'second_lead',
  'breaking_strip',
  'cluster',
  'list_rail',
  'feature',
  'engagement',
  'promo',
  'secondary_pair',
  'wide_strip',
  'editors_picks',
]);

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
        .map((item) => ({
          id: item.id,
          position: item.position,
          content_type: item.content_type as SlotItem['content_type'],
          article:
            item.content_type === 'article' && item.articles?.stories?.slug
              ? item.articles
              : null,
          ref_id: item.ref_id,
          payload: item.payload ?? {},
        }))
        .sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    status: raw.status as LayoutRow['status'],
    description: raw.description,
    slots,
  };
}

const LAYOUT_SELECT = `
  id, slug, name, status, description,
  home_slots (
    id, key, kind, span, position, config,
    home_slot_items (
      id, position, content_type, ref_id, payload,
      articles!fk_home_slot_items_article_id (${ARTICLE_SELECT})
    )
  )
`;

// Public read — relies on RLS to gate non-live rows. Returns null when
// no layout is currently live.
export async function fetchLiveLayout(
  client: SupabaseClient,
): Promise<LayoutRow | null> {
  const { data, error } = await client
    .from('home_layouts')
    .select(LAYOUT_SELECT)
    .eq('status', 'live')
    .limit(1)
    .maybeSingle<RawLayout>();

  if (error) {
    console.error('[home_v2.fetchLiveLayout]', error.message);
    return null;
  }
  if (!data) return null;
  return shapeLayout(data);
}

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
    console.error('[home_v2.fetchLayoutBySlug]', error.message);
    return null;
  }
  if (!data) return null;
  return shapeLayout(data);
}

// Lightweight check used by the root router to decide whether to render
// v2 or fall through to v1. Cheap — single indexed row lookup.
export async function isV2Live(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client
    .from('home_layouts')
    .select('slug')
    .eq('status', 'live')
    .eq('slug', 'v2')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[home_v2.isV2Live]', error.message);
    return false;
  }
  return !!data;
}
