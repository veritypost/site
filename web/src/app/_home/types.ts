// Types for the templated homepage. Slots are first-class rows; items
// are what's been dropped into a slot by editorial. Article projection
// matches the legacy `HomeStory` shape so cards can be styled identically.

import type { HomeStory as HomeStoryLegacy } from './_shared';

// Home slots need cover_image_url/alt; the legacy `HomeStory` Pick doesn't
// include them. Extend here so SlotItem.article carries them through to
// slot components without per-file casts. Exported so slot files can
// import the canonical home shape.
export type HomeStory = HomeStoryLegacy & {
  cover_image_url: string | null;
  cover_image_alt: string | null;
  story_id: string | null;
  // Editorial-adjacency fields. Read by data.ts to drop flagged articles
  // from home slot feature spots (see ADJACENCY_FILTER in data.ts). Kept
  // on the type so callers can still introspect if needed, but slot
  // renderers never read these directly — the filter has already nulled
  // the article on items that should be hidden.
  ad_eligible: boolean | null;
  sensitivity_tags: string[] | null;
};

export type SlotKind =
  | 'lead'
  | 'second_lead'
  | 'breaking_strip'
  | 'cluster'
  | 'list_rail'
  | 'feature'
  | 'engagement'
  | 'promo'
  | 'secondary_pair'
  | 'wide_strip'
  | 'editors_picks'
  | 'data_ticker'
  | 'insight_row'
  | 'discovery_feed';

export type SlotSpan = 3 | 4 | 6 | 8 | 12;

export type SlotItemContentType =
  | 'article'
  | 'quiz'
  | 'feature'
  | 'custom'
  | 'ad';

export type SlotItem = {
  id: string;
  position: number;
  content_type: SlotItemContentType;
  article: HomeStory | null;
  ref_id: string | null;
  payload: Record<string, unknown>;
};

export type SlotRow = {
  id: string;
  key: string;
  kind: SlotKind;
  span: SlotSpan;
  position: number;
  config: Record<string, unknown>;
  items: SlotItem[];
};

export type LayoutRow = {
  id: string;
  slug: string;
  name: string;
  status: 'draft' | 'live' | 'archived';
  description: string | null;
  ads_enabled: boolean;
  slots: SlotRow[];
};
