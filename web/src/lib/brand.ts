// Brand single-source-of-truth.
//
// The lowercase wordmark "verity post" is the visual canonical — used
// for the on-page wordmark, email templates, and the iOS apps. The
// Title-cased "Verity Post" is used in SEO titles, manifest, OG cards,
// and body copy on legal / editorial pages, where Title Case reads
// naturally. "Verity Post LLC" is the registered entity name and is
// only used in legal / copyright contexts.
//
// Display, on-page wordmark:        verity post   (BRAND_NAME_LOWER)
// SEO titles / OG / metadata:       Verity Post   (BRAND_NAME)
// Kids product, on-page wordmark:   verity post kids
// Kids product, SEO / metadata:     Verity Post Kids   (BRAND_KIDS_NAME)
// Legal entity:                     Verity Post LLC    (BRAND_LEGAL_ENTITY)
//
// Use `BRAND_DOMAIN` only where the literal hostname is intended (e.g.
// inside a URL, a JSON-LD schema, a mailto). Never as a display name —
// the bare domain reads as a test deployment.
//
// Adding a new locale-specific or sub-brand string? Export it from this
// file. Do not introduce string literals matching /verity\s*post/i in
// any other file — the eventual ESLint rule will flag them.

export const BRAND_NAME = 'Verity Post';
export const BRAND_NAME_LOWER = 'verity post';
export const BRAND_KIDS_NAME = 'Verity Post Kids';
export const BRAND_KIDS_NAME_LOWER = 'verity post kids';
export const BRAND_DOMAIN = 'veritypost.com';
export const BRAND_LEGAL_ENTITY = 'Verity Post LLC';
export const BRAND_SUPPORT_EMAIL = 'support@veritypost.com';
export const BRAND_LEGAL_EMAIL = 'legal@veritypost.com';
