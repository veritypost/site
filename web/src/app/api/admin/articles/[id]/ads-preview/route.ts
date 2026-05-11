/**
 * Wave 3 — GET /api/admin/articles/:id/ads-preview
 *
 * Read-only diagnostic backing the "Ads on this story" panel inside the
 * admin StoryEditor. Simulates what serve_ad would return for an anon
 * visitor on each of the four article-page placements, plus the targeting
 * roster (include/exclude) that points at this article (directly or via
 * its category / subcategory).
 *
 * If serve_ad returns NULL for a placement we run a follow-up diagnostic
 * to surface a single human-readable reason. The check order mirrors the
 * serve_ad filter chain so the first failing gate is reported — that's
 * the one the operator should fix.
 *
 * This route is pure read-side: no mutation, no audit, no targeting
 * changes. Permission gated to admin.articles.detail.view to match the
 * sibling GET /api/admin/articles/:id route.
 */
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';
import { BLOCKING_SENSITIVITY_TAG_IDS } from '@/lib/sensitivityTags';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Four article-page placements covered by the diagnostic. The fifth slot
// (article_quiz_sponsor) is wave 4 territory — left off until the
// placement row exists in ad_placements.
const PLACEMENT_NAMES = [
  'article_header',
  'article_in_body',
  'article_rail',
  'article_end',
] as const;

type PlacementName = (typeof PLACEMENT_NAMES)[number];

// Reason strings — stable identifiers the UI maps to copy. Keep in sync
// with the renderer in StoryEditor.tsx.
type Reason =
  | 'placement_inactive'
  | 'article_ineligible'
  | 'article_sensitive'
  | 'no_active_unit'
  | 'campaigns_paused'
  | 'excluded_by_targeting'
  | 'no_include_match'
  | 'unknown';

type WouldServe = {
  ad_unit_id: string;
  advertiser_name: string | null;
  ad_format: string;
};

type TargetedUnit = {
  ad_unit_id: string;
  advertiser_name: string | null;
  mode: 'include' | 'exclude';
  via: 'article' | 'category' | 'subcategory';
};

type PlacementResult = {
  placement_name: PlacementName;
  display_name: string;
  would_serve: WouldServe | null;
  reason: Reason | null;
  targeted_units: TargetedUnit[];
};

type ArticleSummary = {
  id: string;
  slug: string | null;
  ad_eligible: boolean;
  sensitivity_tags: string[];
  is_kids_safe: boolean;
};

// ---------------------------------------------------------------------------
// Diagnostic — invoked only when serve_ad returns NULL. Order mirrors the
// serve_ad filter chain; the first match wins.
// ---------------------------------------------------------------------------

async function diagnoseEmpty(
  service: SupabaseClient<Database>,
  placementName: PlacementName,
  article: ArticleSummary,
  categoryId: string | null,
  subcategoryId: string | null
): Promise<Reason> {
  // 1. Placement row absent or inactive
  const { data: placement } = await service
    .from('ad_placements')
    .select('id, is_active')
    .eq('name', placementName)
    .maybeSingle();

  if (!placement || !placement.is_active) {
    return 'placement_inactive';
  }

  // 2. Article-level editorial override
  if (article.ad_eligible === false) {
    return 'article_ineligible';
  }

  // 3. Article-level blocking sensitivity tag
  const hasBlocking = (article.sensitivity_tags ?? []).some((t) =>
    BLOCKING_SENSITIVITY_TAG_IDS.has(t)
  );
  if (hasBlocking) {
    return 'article_sensitive';
  }

  // 4. Any active+approved ad_unit on this placement at all?
  const now = new Date().toISOString();
  const { data: candidates } = await service
    .from('ad_units')
    .select('id, campaign_id, start_date, end_date')
    .eq('placement_id', placement.id)
    .eq('is_active', true)
    .eq('approval_status', 'approved');

  const dateValid = (candidates ?? []).filter((u) => {
    if (u.start_date && u.start_date > now) return false;
    if (u.end_date && u.end_date < now) return false;
    return true;
  });

  if (dateValid.length === 0) {
    return 'no_active_unit';
  }

  // 5. All ad_units gated behind paused/ended campaigns?
  const campaignIds = Array.from(
    new Set(dateValid.map((u) => u.campaign_id).filter((c): c is string => !!c))
  );
  let activeCampaigns = new Set<string>();
  if (campaignIds.length > 0) {
    const { data: camps } = await service
      .from('ad_campaigns')
      .select('id, status')
      .in('id', campaignIds);
    activeCampaigns = new Set(
      (camps ?? []).filter((c) => c.status === 'active').map((c) => c.id)
    );
  }
  const passCampaign = dateValid.filter(
    (u) => u.campaign_id == null || activeCampaigns.has(u.campaign_id)
  );
  if (passCampaign.length === 0) {
    return 'campaigns_paused';
  }

  // 6. Targeting — are all units excluded by ad_targets, or do none have a
  //    matching include rule?
  const unitIds = passCampaign.map((u) => u.id);
  const { data: targetRows } = await service
    .from('ad_targets')
    .select('ad_unit_id, mode, target_type, target_id')
    .in('ad_unit_id', unitIds);

  const rows = targetRows ?? [];

  // Build the category-include set (mirrors serve_ad: category targets
  // match the article's direct category, its category parent, and the
  // subcategory's parent — all three IDs). For a category-level article
  // (no subcategory) category_id IS the target.
  //
  // Parent-of resolution is not strictly needed for the empty diagnostic
  // — we just need to know whether any match exists. We approximate by
  // matching target_id ∈ {category_id, subcategory_id}. This may miss
  // grand-parent matches in deeply nested taxonomies, but those are not
  // present in the current schema.
  const articleId = article.id;
  function matchesArticle(t: {
    target_type: string;
    target_id: string;
  }): boolean {
    if (t.target_type === 'article') return t.target_id === articleId;
    if (t.target_type === 'category') {
      return (
        (categoryId != null && t.target_id === categoryId) ||
        (subcategoryId != null && t.target_id === subcategoryId)
      );
    }
    if (t.target_type === 'subcategory') {
      return (
        (subcategoryId != null && t.target_id === subcategoryId) ||
        (categoryId != null && t.target_id === categoryId)
      );
    }
    return false;
  }

  const excludedUnitIds = new Set(
    rows
      .filter((r) => r.mode === 'exclude' && matchesArticle(r))
      .map((r) => r.ad_unit_id)
  );
  const survivors = passCampaign.filter((u) => !excludedUnitIds.has(u.id));
  if (survivors.length === 0) {
    return 'excluded_by_targeting';
  }

  // Include gate — a unit passes if (a) it has no include rows or (b) at
  // least one of its include rows matches this article.
  const includeRowsByUnit = new Map<
    string,
    Array<{ target_type: string; target_id: string }>
  >();
  for (const r of rows) {
    if (r.mode !== 'include') continue;
    const list = includeRowsByUnit.get(r.ad_unit_id) ?? [];
    list.push({ target_type: r.target_type, target_id: r.target_id });
    includeRowsByUnit.set(r.ad_unit_id, list);
  }

  const passInclude = survivors.filter((u) => {
    const list = includeRowsByUnit.get(u.id);
    if (!list || list.length === 0) return true;
    return list.some((t) => matchesArticle(t));
  });
  if (passInclude.length === 0) {
    return 'no_include_match';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const cookieClient = createClient();
    await requirePermission('admin.articles.detail.view', cookieClient);
  } catch (err) {
    return permissionError(err);
  }

  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid article id' }, { status: 400 });
  }

  const service = createServiceClient();

  // Fetch the article row + slug. We need category_id, subcategory_id,
  // ad_eligible, sensitivity_tags, is_kids_safe, and the story slug. The
  // generated database.ts doesn't include ad_eligible/sensitivity_tags on
  // articles yet (Wave 2 migration); cast through unknown the same way
  // StoryEditor does in loadStory.
  const { data: rawArticle, error: artErr } = await service
    .from('articles')
    .select('*, stories(slug)')
    .eq('id', id)
    .maybeSingle();
  if (artErr) {
    console.error(
      '[admin.articles.ads-preview] article load failed:',
      artErr.message
    );
    return NextResponse.json({ error: 'Could not load article' }, { status: 500 });
  }
  if (!rawArticle) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  const articleRow = rawArticle as unknown as {
    id: string;
    category_id: string | null;
    subcategory_id: string | null;
    is_kids_safe: boolean | null;
    ad_eligible: boolean | null;
    sensitivity_tags: string[] | null;
    stories: { slug: string | null } | null;
  };

  const article: ArticleSummary = {
    id: articleRow.id,
    slug: articleRow.stories?.slug ?? null,
    ad_eligible:
      articleRow.ad_eligible == null ? true : !!articleRow.ad_eligible,
    sensitivity_tags: Array.isArray(articleRow.sensitivity_tags)
      ? articleRow.sensitivity_tags.filter(
          (t): t is string => typeof t === 'string'
        )
      : [],
    is_kids_safe: !!articleRow.is_kids_safe,
  };

  // Pre-fetch placement display names and ids for the diagnostic.
  const { data: placementRows } = await service
    .from('ad_placements')
    .select('id, name, display_name, is_active')
    .in('name', PLACEMENT_NAMES as unknown as string[]);
  const placementByName = new Map(
    (placementRows ?? []).map((p) => [p.name as PlacementName, p])
  );

  // Pre-fetch the per-article targeting roster once. Three target_type
  // values matter for an article: 'article' (this id), 'category' (this
  // article's category_id), 'subcategory' (this article's subcategory_id).
  // For each, we capture all include + exclude rows that point at this
  // article via that path so the UI can list them.
  const targetIds: string[] = [article.id];
  if (articleRow.category_id) targetIds.push(articleRow.category_id);
  if (articleRow.subcategory_id) targetIds.push(articleRow.subcategory_id);

  const { data: rosterRows } = await service
    .from('ad_targets')
    .select('ad_unit_id, mode, target_type, target_id')
    .in('target_id', targetIds);

  // Map ad_unit_id → advertiser_name + placement_id for the roster display.
  // We need placement_id so the per-placement target list only shows
  // units that actually live under that placement (a unit can be
  // targeted at this article but belong to a totally different slot).
  const rosterUnitIds = Array.from(
    new Set((rosterRows ?? []).map((r) => r.ad_unit_id))
  );
  const advertiserByUnit = new Map<string, string | null>();
  const unitToPlacementId = new Map<string, string>();
  if (rosterUnitIds.length > 0) {
    const { data: units } = await service
      .from('ad_units')
      .select('id, advertiser_name, placement_id')
      .in('id', rosterUnitIds);
    for (const u of units ?? []) {
      advertiserByUnit.set(u.id, u.advertiser_name);
      unitToPlacementId.set(u.id, u.placement_id);
    }
  }

  // Build per-placement target lists. A target row applies to a placement
  // only if its ad_unit lives under that placement.
  function targetedUnitsFor(placementId: string | undefined): TargetedUnit[] {
    if (!placementId) return [];
    const list: TargetedUnit[] = [];
    for (const r of rosterRows ?? []) {
      if (unitToPlacementId.get(r.ad_unit_id) !== placementId) continue;
      let via: 'article' | 'category' | 'subcategory';
      if (r.target_type === 'article' && r.target_id === article.id) via = 'article';
      else if (
        r.target_type === 'category' &&
        articleRow.category_id != null &&
        r.target_id === articleRow.category_id
      ) {
        via = 'category';
      } else if (
        r.target_type === 'subcategory' &&
        articleRow.subcategory_id != null &&
        r.target_id === articleRow.subcategory_id
      ) {
        via = 'subcategory';
      } else {
        continue;
      }
      const mode = r.mode === 'exclude' ? 'exclude' : 'include';
      list.push({
        ad_unit_id: r.ad_unit_id,
        advertiser_name: advertiserByUnit.get(r.ad_unit_id) ?? null,
        mode,
        via,
      });
    }
    return list;
  }

  // serve_ad simulation — one RPC call per placement, anon (user/session
  // null). Errors are captured per-placement so one bad RPC doesn't take
  // down the whole panel.
  const placements: PlacementResult[] = [];
  for (const name of PLACEMENT_NAMES) {
    const placementMeta = placementByName.get(name);
    const display = placementMeta?.display_name ?? name;

    let wouldServe: WouldServe | null = null;
    let reason: Reason | null = null;

    // Anon simulation — omit p_user_id + p_session_id so the RPC's
    // SQL defaults (NULL) apply. Frequency caps are bypassed for anon
    // users in serve_ad, so the response reflects what an unauthenticated
    // visitor's first impression on this article would see.
    const { data: rpcData, error: rpcErr } = await service.rpc('serve_ad', {
      p_placement_name: name,
      p_article_id: article.id,
    });

    if (rpcErr) {
      console.error(
        `[admin.articles.ads-preview] serve_ad(${name}) failed:`,
        rpcErr.message
      );
      reason = 'unknown';
    } else if (rpcData && typeof rpcData === 'object') {
      const obj = rpcData as Record<string, unknown>;
      if (typeof obj.ad_unit_id === 'string') {
        wouldServe = {
          ad_unit_id: obj.ad_unit_id,
          advertiser_name:
            typeof obj.advertiser_name === 'string' ? obj.advertiser_name : null,
          ad_format: typeof obj.ad_format === 'string' ? obj.ad_format : 'unknown',
        };
      }
    }

    if (!wouldServe && reason == null) {
      reason = await diagnoseEmpty(
        service,
        name,
        article,
        articleRow.category_id,
        articleRow.subcategory_id
      );
    }

    placements.push({
      placement_name: name,
      display_name: display,
      would_serve: wouldServe,
      reason: wouldServe ? null : reason,
      targeted_units: targetedUnitsFor(placementMeta?.id),
    });
  }

  return NextResponse.json({
    article: {
      id: article.id,
      slug: article.slug,
      ad_eligible: article.ad_eligible,
      sensitivity_tags: article.sensitivity_tags,
      is_kids_safe: article.is_kids_safe,
    },
    placements,
  });
}
