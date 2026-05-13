// Stream B — directory permission key constants.
// Migration 20260513000200 inserts these rows. Importing the constants
// rather than literals keeps the four call sites (SortPill, ExpertDepthTooltip,
// /api/directory/articles, /api/directory/expert-coverage) consistent and
// gives us one place to flip if a key gets renamed during review.

export const PERM_DIRECTORY_SORT_TRENDING = 'directory.sort_trending';
export const PERM_DIRECTORY_EXPERT_DEPTH = 'directory.expert_depth';
export const PERM_DIRECTORY_ADVANCED_FILTERS = 'directory.advanced_filters';
export const PERM_DIRECTORY_ALERTS_SUBCATEGORY = 'directory.alerts_subcategory';
