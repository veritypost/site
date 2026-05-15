// web/src/app/api/admin/ads/pins/recent/route.ts
// Wave 3: returns the current operator's recent pin targets for the
// AdUnitPicker "Recent picks" row. Sourced from admin_audit_log for
// actor_user_id = auth.uid() with action LIKE 'ad_pin.%' (excludes
// cascaded_delete because that has actor_user_id = NULL by design).
// Last 30 days, dedupe by ad_unit_id (newest first), cap at 5.
// admin_audit_log column is actor_user_id (verified live, not actor_id).

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export async function GET() {
  let actor;
  try {
    actor = await requirePermission('admin.ads.pins.view');
  } catch (err) {
    return permissionError(err);
  }
  const service = createServiceClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await service
    .from('admin_audit_log')
    .select('new_value, created_at')
    .eq('actor_user_id', actor.id)
    // Plan v3 (M1) / v4 (N6): only create/update actions surface as recent picks.
    // Excluding `.delete` rows (new_value=null) AND `.cascaded_delete` rows
    // means the LIMIT 50 over-fetch budget is spent only on action rows
    // whose new_value carries an ad_unit_id worth dedup'ing on.
    //
    // EXTEND THIS LIST when new ad_pin.* "create-like" actions land. § 11
    // Out-of-scope mentions a planned Wave 9 `ad_pin.extend` Stripe-style
    // flow — its action key should be added here so extended pins surface
    // as recent picks. Forgetting to extend = silent UX regression.
    .in('action', ['ad_pin.create', 'ad_pin.update'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50); // over-fetch then dedupe in memory

  type AuditRow = { new_value: unknown; created_at: string };
  const seen = new Set<string>();
  const unitIds: string[] = [];
  for (const r of (rows ?? []) as AuditRow[]) {
    const nv = r.new_value as { ad_unit_id?: unknown } | null;
    const id = nv && typeof nv.ad_unit_id === 'string' ? nv.ad_unit_id : null;
    if (id && !seen.has(id)) {
      seen.add(id);
      unitIds.push(id);
      if (unitIds.length >= 5) break;
    }
  }

  if (unitIds.length === 0) {
    return NextResponse.json({ units: [] });
  }

  const { data: units } = await service
    .from('ad_units')
    .select('id, name, advertiser_name, ad_format, placement_id')
    .in('id', unitIds)
    .eq('is_active', true)
    .eq('approval_status', 'approved');

  // Preserve the recency order.
  const byId = new Map((units ?? []).map((u: any) => [u.id, u]));
  const ordered = unitIds
    .map((id) => byId.get(id))
    .filter((u) => u != null);

  return NextResponse.json({ units: ordered });
}
