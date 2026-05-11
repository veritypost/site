// Types for the v2 templated homepage. Slots are first-class rows; items
// are what's been dropped into a slot by editorial. Article projection
// matches the v1 `HomeStory` shape so cards can be styled identically.

import type { HomeStory as HomeStoryV1 } from '../_homeShared';

// v2 slots need cover_image_url/alt; v1's `HomeStory` Pick doesn't include
// them. Extend here so SlotItem.article carries them through to slot
// components without per-file casts. Exported so slot files can import
// the canonical v2 shape.
export type HomeStory = HomeStoryV1 & {
  cover_image_url: string | null;
  cover_image_alt: string | null;
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
  | 'editors_picks';

export type SlotSpan = 3 | 4 | 6 | 8 | 12;

export type SlotItemContentType = 'article' | 'quiz' | 'feature' | 'custom';

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
  slots: SlotRow[];
};
