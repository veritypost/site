// Stream B — shared types for the /directory surface.
// Keeping these in lib/directory so the route handlers, helpers, and
// client components all reference one shape — drift between server
// JSON and client decoder was a recurring class of bug on /search.

export interface DirectoryCategory {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  sort_order: number | null;
  article_count: number | null;
  description?: string | null;
}

export interface DirectoryArticle {
  id: string;
  story_id: string | null;
  story_slug: string | null;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  reading_time_minutes: number | null;
  is_verified: boolean | null;
  view_count: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  source_name: string | null;
  expert_count: number;
  is_editors_edge: boolean;
}

export type DirectorySort = 'latest' | 'trending';

export interface DirectoryArticlesResponse {
  articles: DirectoryArticle[];
  total: number;
  sort_applied: DirectorySort;
  has_more: boolean;
}

export interface EditorsEdgePick extends DirectoryArticle {
  _edge_label: string;
  _valid_to: string;
}

export interface EditorsEdgeResponse {
  pick: EditorsEdgePick | null;
}

export interface DirectoryExpert {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  expert_title: string | null;
  follow_count: number | null;
}

export interface ExpertCoverageResponse {
  experts: DirectoryExpert[];
  total: number;
}
