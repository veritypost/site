-- Seed `Local` as a top-level parent category so the new home sidebar /
-- mobile sheet can render it from the live `categories` query without
-- hardcoded labels. Subcategories are owner-curated via /admin/categories.
INSERT INTO categories (name, slug, sort_order, is_active, is_kids_safe, is_premium, description)
VALUES ('Local', 'local', 17, true, false, false, 'Local news — owner-curated subcategories. Add subcategories via /admin/categories.')
ON CONFLICT (slug) DO NOTHING;
