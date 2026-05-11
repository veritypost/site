-- ============================================================================
-- Migration: Article-level editorial ad eligibility (hard exclusions)
-- ============================================================================
--
-- PURPOSE
--   Adds the data model that gives editorial a single source of truth for
--   blocking ads on an article. Two independent gates:
--     1) `ad_eligible boolean`         — manual editorial override per article
--     2) `sensitivity_tags text[]`     — content tags; certain values hard-block
--   Both gates are wired into the `serve_ad` RPC and short-circuit to NULL
--   before any ad-unit lookup runs. No targeting rule, no campaign override,
--   no frequency-cap edge case can revive an ad on a blocked article.
--
-- DESIGN CITE
--   Editorial review verdict — single most important pre-launch item.
--   "One ad next to a school-shooting story ends sales conversations."
--   This is the floor the rest of the ad system sits on.
--
-- NAMING
--   Tag names mirror GARM (Global Alliance for Responsible Media) Brand
--   Safety Floor categories so advertisers and adtech partners recognize
--   them on sight without a translation layer.
--
-- IDEMPOTENCY
--   Both column adds use IF NOT EXISTS; index uses IF NOT EXISTS;
--   serve_ad uses CREATE OR REPLACE. Safe to re-run.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PART A — Schema additions on `articles`
-- ----------------------------------------------------------------------------

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS ad_eligible boolean NOT NULL DEFAULT true;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS sensitivity_tags text[] NOT NULL DEFAULT '{}';

-- Partial index — ad_eligible=false is the rare case (override flips),
-- so index only those rows for cheap lookups from editorial tooling.
CREATE INDEX IF NOT EXISTS articles_ad_ineligible_idx
  ON public.articles (id)
  WHERE ad_eligible = false;


-- ----------------------------------------------------------------------------
-- PART B — Update serve_ad RPC with editorial gates
-- ----------------------------------------------------------------------------
-- Preserves every existing line of serve_ad. The only changes are:
--   (1) Two new DECLARE variables: v_ad_eligible, v_sensitivity_tags
--   (2) Two new INTO targets in the existing per-article SELECT
--   (3) Two new early-return gates immediately after the article-fetch block,
--       before the ad_units SELECT.
-- No refactors, no renames, no behavioral change to any other branch.

CREATE OR REPLACE FUNCTION public.serve_ad(p_placement_name text, p_user_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_placement public.ad_placements%ROWTYPE;
  v_tier text := public._user_tier_or_anon(p_user_id);
  v_reduced boolean;
  v_pick public.ad_units%ROWTYPE;
  v_cat uuid;
  v_sub uuid;
  v_cat_parent uuid;
  v_sub_parent uuid;
  v_ad_eligible boolean;
  v_sensitivity_tags text[];
BEGIN
  SELECT * INTO v_placement
    FROM public.ad_placements
   WHERE name = p_placement_name AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_tier = ANY(COALESCE(v_placement.hidden_for_tiers, '{}')) THEN
    RETURN NULL;
  END IF;
  v_reduced := v_tier = ANY(COALESCE(v_placement.reduced_for_tiers, '{}'));

  IF p_article_id IS NOT NULL THEN
    SELECT a.category_id, a.subcategory_id, cc.parent_id, sc.parent_id, a.ad_eligible, a.sensitivity_tags
      INTO v_cat, v_sub, v_cat_parent, v_sub_parent, v_ad_eligible, v_sensitivity_tags
      FROM public.articles a
      LEFT JOIN public.categories cc ON cc.id = a.category_id
      LEFT JOIN public.categories sc ON sc.id = a.subcategory_id
     WHERE a.id = p_article_id;

    -- Editorial hard exclusion: manual override
    IF v_ad_eligible IS FALSE THEN RETURN NULL; END IF;

    -- Editorial hard exclusion: blocking content tags
    IF v_sensitivity_tags && ARRAY[
      'tragedy',
      'breaking_casualty',
      'suicide_coverage',
      'cw_sa',
      'cw_violence',
      'obit'
    ]::text[] THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT au.* INTO v_pick
    FROM public.ad_units au
   WHERE au.placement_id = v_placement.id
     AND au.is_active
     AND au.approval_status = 'approved'
     AND (au.start_date IS NULL OR au.start_date <= now())
     AND (au.end_date   IS NULL OR au.end_date   >= now())

     -- NEW: campaign-status gate. NULL campaign_id = legacy house ad
     -- with no campaign, still serves. Otherwise the parent campaign
     -- must be 'active' (i.e. not 'paused', 'draft', 'ended', 'rejected').
     AND (
       au.campaign_id IS NULL
       OR EXISTS (
         SELECT 1 FROM public.ad_campaigns c
          WHERE c.id = au.campaign_id AND c.status = 'active'
       )
     )

     -- INCLUDE: ad is untargeted (no include rows) OR article matches one
     AND (
       NOT EXISTS (
         SELECT 1 FROM public.ad_targets t
          WHERE t.ad_unit_id = au.id AND t.mode = 'include'
       )
       OR EXISTS (
         SELECT 1 FROM public.ad_targets t
          WHERE t.ad_unit_id = au.id AND t.mode = 'include'
            AND (
              (t.target_type = 'article'     AND t.target_id = p_article_id)
              OR (t.target_type = 'category'    AND t.target_id IN (v_cat, v_cat_parent, v_sub_parent))
              OR (t.target_type = 'subcategory' AND t.target_id IN (v_cat, v_sub))
            )
       )
     )

     -- EXCLUDE: any matching exclude rule kills the ad
     AND NOT EXISTS (
       SELECT 1 FROM public.ad_targets t
        WHERE t.ad_unit_id = au.id AND t.mode = 'exclude'
          AND (
            (t.target_type = 'article'     AND t.target_id = p_article_id)
            OR (t.target_type = 'category'    AND t.target_id IN (v_cat, v_cat_parent, v_sub_parent))
            OR (t.target_type = 'subcategory' AND t.target_id IN (v_cat, v_sub))
          )
     )

     -- Per-user freq cap
     AND (
       au.frequency_cap_per_user IS NULL
       OR p_user_id IS NULL
       OR (SELECT COUNT(*) FROM public.ad_impressions ai
             WHERE ai.ad_unit_id = au.id AND ai.user_id = p_user_id) <
          CASE WHEN v_reduced THEN au.frequency_cap_per_user / 2
               ELSE au.frequency_cap_per_user END
     )
     -- Per-session freq cap
     AND (
       au.frequency_cap_per_session IS NULL
       OR p_session_id IS NULL
       OR (SELECT COUNT(*) FROM public.ad_impressions ai
             WHERE ai.ad_unit_id = au.id AND ai.session_id = p_session_id) <
          CASE WHEN v_reduced THEN au.frequency_cap_per_session / 2
               ELSE au.frequency_cap_per_session END
     )
     -- Ad-unit-wide daily impression cap
     AND (
       au.daily_impression_cap IS NULL
       OR (SELECT COUNT(*) FROM public.ad_impressions ai
             WHERE ai.ad_unit_id = au.id
               AND ai.created_at >= date_trunc('day', now()))
          < au.daily_impression_cap
     )
   ORDER BY au.weight * random() DESC
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'ad_unit_id', v_pick.id,
    'placement_id', v_placement.id,
    'campaign_id', v_pick.campaign_id,
    'ad_network', v_pick.ad_network,
    'ad_network_unit_id', v_pick.ad_network_unit_id,
    'ad_format', v_pick.ad_format,
    'creative_url', v_pick.creative_url,
    'creative_html', v_pick.creative_html,
    'click_url', v_pick.click_url,
    'alt_text', v_pick.alt_text,
    'cta_text', v_pick.cta_text,
    'advertiser_name', v_pick.advertiser_name,
    'reduced', v_reduced
  );
END;
$function$;


-- ----------------------------------------------------------------------------
-- PART C — Tag taxonomy reference (comment-only, no DML)
-- ----------------------------------------------------------------------------
--
-- BLOCKING TAGS (hard-exclude ads via serve_ad). All six are in the
-- short-circuit array above. Source: editorial review verdict.
--
--   tragedy              — large-scale loss-of-life event coverage
--                          (school shootings, mass-casualty incidents,
--                          natural-disaster death tolls). Editorial floor.
--   breaking_casualty    — developing story with confirmed deaths/injuries
--                          where commercial adjacency reads as exploitation.
--   suicide_coverage     — any article touching suicide, attempt, or
--                          ideation. Mirrors WHO/AFSP reporting guidelines;
--                          ad adjacency is a known retraumatization vector.
--   cw_sa                — sexual assault / abuse reporting. GARM Brand
--                          Safety Floor: "Adult & Explicit Sexual Content"
--                          and "Crime & Harmful acts" overlap.
--   cw_violence          — graphic violence (terror attacks, war crimes,
--                          executions, torture coverage). GARM "Arms &
--                          Ammunition" / "Crime & Harmful acts" floor.
--   obit                 — obituaries and death notices. Even a celebratory
--                          obituary is wrong adjacency for commercial.
--
-- NON-BLOCKING TAGS (descriptive only — recorded for editorial filtering,
-- contextual targeting, or future reduced-bid logic, but do NOT trigger
-- the hard-exclusion gate). These can be added to articles freely without
-- killing monetization, and the list can grow without a code change:
--
--   cw_strong_language   — profanity / strong language in quoted source
--                          material. Not a brand-safety floor item on its
--                          own; some advertisers may exclude via targeting.
--   cw_drug              — drug-policy reporting, addiction stories.
--                          Editorially sensitive but not a blanket block.
--   cw_mental_health     — broader mental-health coverage that doesn't
--                          touch suicide_coverage; advertiser-choice, not
--                          editorial floor.
--   cw_political         — political reporting. Sensitive but legal,
--                          legitimate ad inventory; handled via targeting
--                          rules, not the floor.
--   cw_legal             — court / criminal-justice coverage that isn't
--                          cw_violence or cw_sa.
--   cw_financial_loss    — fraud / bankruptcy / market-crash coverage.
--                          Advertiser-choice exclusion, not editorial floor.
--
-- ADDING A NEW BLOCKING TAG
--   Requires a serve_ad migration to extend the ARRAY[...] literal.
--   TypeScript side: web/src/lib/sensitivityTags.ts
--   Intentional: editorial floor is a code-reviewed decision, not a
--   row-level toggle anyone with table access can flip.
--
-- ADDING A NEW NON-BLOCKING TAG
--   No migration needed. Just start writing the string into
--   articles.sensitivity_tags. The taxonomy is the rule; the column is
--   plain text[].
-- ----------------------------------------------------------------------------
