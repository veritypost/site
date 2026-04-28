// Brand single-source-of-truth.
//
// Every user-visible reference to the product name imports from this
// module. Mixed casing in the wild ("verity post" / "veritypost.com" /
// "Verity Kids") used to drift across pages, social unfurls,
// transactional emails, and legal documents — owner-locked decision
// 2026-04-27 picked Title Case "Verity Post" as canonical.
//
// Adult product:  Verity Post
// Kids product:   Verity Post Kids   (matches iOS bundle identifier)
// Legal entity:   Verity Post LLC
//
// Use `BRAND_DOMAIN` only where the literal hostname is intended (e.g.
// inside a URL, a JSON-LD schema, a mailto). Never as a display name —
// the bare domain reads as a test deployment.
//
// Adding a new locale-specific or sub-brand string? Export it from this
// file. Do not introduce string literals matching /verity\s*post/i in
// any other file — the eventual ESLint rule will flag them.

export const BRAND_NAME = 'Verity Post';
export const BRAND_KIDS_NAME = 'Verity Post Kids';
export const BRAND_DOMAIN = 'veritypost.com';
export const BRAND_LEGAL_ENTITY = 'Verity Post LLC';
export const BRAND_SUPPORT_EMAIL = 'support@veritypost.com';
export const BRAND_LEGAL_EMAIL = 'legal@veritypost.com';
