-- home_layouts / home_slots / home_slot_items
--
-- Templated homepage v2. A "layout" is a named, status-gated definition
-- of the front-page composition. Slots are first-class rows belonging to
-- a layout; items are the actual content placed inside each slot. v1's
-- flat `top_stories` pin list stays untouched — v2 lives alongside it.
--
-- Read path: public homepage selects the single layout with
-- status='live', then slots → items → articles. RLS enforces that only
-- the live layout (and its descendants) is publicly readable. Admin
-- writes go through service-role API routes (same pattern as
-- daily_features and top_stories), so no admin RLS policy is required.
--
-- Flip mechanism: `status='live'` is enforced exactly-once via a partial
-- unique index. Promoting v2 over v1 is a one-row UPDATE inside admin.

-- ---------------------------------------------------------------------------
-- home_layouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_layouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'live', 'archived')),
  -- variant_of lets a future A/B layout reference its parent without
  -- coupling them at schema time. Self-FK; SET NULL on parent delete so
  -- archiving the parent doesn't cascade away the variant row.
  variant_of   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  CONSTRAINT fk_home_layouts_variant_of
    FOREIGN KEY (variant_of) REFERENCES public.home_layouts(id) ON DELETE SET NULL
);

-- Exactly one layout may be live at a time. Promoting v2 = transactional
-- pair (UPDATE old SET status='archived'; UPDATE new SET status='live').
CREATE UNIQUE INDEX IF NOT EXISTS home_layouts_one_live
  ON public.home_layouts ((1)) WHERE status = 'live';

-- ---------------------------------------------------------------------------
-- home_slots — the named regions inside a layout
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id   UUID NOT NULL,
  key         TEXT NOT NULL,
  -- Editorial role, not visual shape. Keep this list short — new slot
  -- types belong here only when there's a real editorial role to fill.
  -- Variations within a kind go through `config`.
  kind        TEXT NOT NULL
                 CHECK (kind IN (
                   'lead', 'second_lead', 'breaking_strip',
                   'cluster', 'list_rail', 'feature',
                   'engagement', 'promo'
                 )),
  -- 12-column grid. Span is the only sizing knob editors get; pixels and
  -- min-heights are deliberately out of scope.
  span        SMALLINT NOT NULL DEFAULT 12
                 CHECK (span IN (3, 4, 6, 8, 12)),
  position    INT NOT NULL,
  -- Per-kind tuning (item-count cap, eyebrow override, autoplay flag for
  -- future modes). Free-form so we don't migrate every iteration.
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_home_slots_layout_id
    FOREIGN KEY (layout_id) REFERENCES public.home_layouts(id) ON DELETE CASCADE,
  CONSTRAINT home_slots_layout_key_uniq UNIQUE (layout_id, key)
);

CREATE INDEX IF NOT EXISTS home_slots_layout_pos
  ON public.home_slots (layout_id, position);

-- ---------------------------------------------------------------------------
-- home_slot_items — what's inside each slot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_slot_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id       UUID NOT NULL,
  -- Order within the slot (cluster row 1/2/3, list-rail item 1..N).
  position      INT NOT NULL,
  -- Discriminator. `article` covers ~95% of items; the rest let us point
  -- at quizzes or render a custom block from `payload` without a polymorphic
  -- table family.
  content_type  TEXT NOT NULL DEFAULT 'article'
                  CHECK (content_type IN ('article', 'quiz', 'feature', 'custom')),
  article_id    UUID,
  ref_id        UUID,
  -- Custom blocks (Editor's Note, promo card, embed) live entirely in
  -- payload. Article rows leave it as '{}'.
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_home_slot_items_slot_id
    FOREIGN KEY (slot_id) REFERENCES public.home_slots(id) ON DELETE CASCADE,
  CONSTRAINT fk_home_slot_items_article_id
    FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE,
  CONSTRAINT home_slot_items_slot_pos_uniq UNIQUE (slot_id, position),
  -- Content invariants: an `article` row must have article_id set and
  -- ref_id null; a non-article row must have article_id null.
  CONSTRAINT home_slot_items_content_check CHECK (
    (content_type = 'article' AND article_id IS NOT NULL AND ref_id IS NULL) OR
    (content_type <> 'article' AND article_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS home_slot_items_slot_pos
  ON public.home_slot_items (slot_id, position);

CREATE INDEX IF NOT EXISTS home_slot_items_article
  ON public.home_slot_items (article_id) WHERE article_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.home_layouts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_layouts_updated_at ON public.home_layouts;
CREATE TRIGGER home_layouts_updated_at BEFORE UPDATE ON public.home_layouts
  FOR EACH ROW EXECUTE FUNCTION public.home_layouts_set_updated_at();

CREATE OR REPLACE FUNCTION public.home_slots_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS home_slots_updated_at ON public.home_slots;
CREATE TRIGGER home_slots_updated_at BEFORE UPDATE ON public.home_slots
  FOR EACH ROW EXECUTE FUNCTION public.home_slots_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — public reads of the live layout only; writes go through service role
-- ---------------------------------------------------------------------------
ALTER TABLE public.home_layouts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_slots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_slot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS home_layouts_public_read ON public.home_layouts;
CREATE POLICY home_layouts_public_read ON public.home_layouts
  FOR SELECT USING (status = 'live');

DROP POLICY IF EXISTS home_slots_public_read ON public.home_slots;
CREATE POLICY home_slots_public_read ON public.home_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.home_layouts l
      WHERE l.id = home_slots.layout_id AND l.status = 'live'
    )
  );

DROP POLICY IF EXISTS home_slot_items_public_read ON public.home_slot_items;
CREATE POLICY home_slot_items_public_read ON public.home_slot_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.home_slots s
      JOIN public.home_layouts l ON l.id = s.layout_id
      WHERE s.id = home_slot_items.slot_id AND l.status = 'live'
    )
  );

-- ---------------------------------------------------------------------------
-- Permission seed
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (
  key, display_name, description, category, is_active, sort_order
) VALUES (
  'admin.home_v2.manage',
  'Manage homepage v2',
  'Edit homepage v2 layouts, slots, and slot assignments.',
  'admin',
  TRUE,
  100
) ON CONFLICT (key) DO NOTHING;

-- Attach the new permission to the admin + owner permission sets so
-- existing admins/owners pick it up without a manual grant.
INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT ps.id, p.id
FROM public.permission_sets ps, public.permissions p
WHERE p.key = 'admin.home_v2.manage'
  AND ps.key IN ('admin', 'owner')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: a 'v2' layout in DRAFT with the eight-role slot scaffold. Empty
-- by design — owner fills slots through /admin/home-v2 before promoting
-- the layout to status='live'.
-- ---------------------------------------------------------------------------
INSERT INTO public.home_layouts (slug, name, status, description)
VALUES (
  'v2',
  'Homepage v2',
  'draft',
  'Templated homepage scaffold — first version after the flat top_stories pin list.'
)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_layout_id UUID;
BEGIN
  SELECT id INTO v_layout_id FROM public.home_layouts WHERE slug = 'v2';
  IF v_layout_id IS NULL THEN RETURN; END IF;

  -- Position increments of 10 leave headroom for inserting new slots
  -- between existing ones without renumbering everything.
  INSERT INTO public.home_slots (layout_id, key, kind, span, position) VALUES
    (v_layout_id, 'breaking',         'breaking_strip', 12,  10),
    (v_layout_id, 'lead',             'lead',            8,  20),
    (v_layout_id, 'rail_top',         'list_rail',       4,  30),
    (v_layout_id, 'second_lead',      'second_lead',     8,  40),
    (v_layout_id, 'cluster_1',        'cluster',        12,  50),
    (v_layout_id, 'feature',          'feature',        12,  60),
    (v_layout_id, 'cluster_2',        'cluster',         8,  70),
    (v_layout_id, 'engagement',       'engagement',      4,  80),
    (v_layout_id, 'list_rail_bottom', 'list_rail',      12,  90),
    (v_layout_id, 'promo',            'promo',          12, 100)
  ON CONFLICT (layout_id, key) DO NOTHING;
END $$;
