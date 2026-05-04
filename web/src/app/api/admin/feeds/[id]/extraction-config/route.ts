// Phase B — discovery scraper extraction-config save endpoint.
// Writes feeds.extraction_config (jsonb) for feed_type='scrape_json' rows.
// Permission gate: admin.feeds.manage. Mirrors the canonical mutation
// order from /lib/adminMutation.ts (auth → service client → rate → body
// validate → mutate → audit).
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import {
  redactExtractionConfigForAudit,
  validateExtractionConfig,
} from '@/lib/pipeline/extraction-config';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'invalid feed id' },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.feeds.extraction_config:${actor.id}`,
    policyKey: 'admin.feeds.update',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid json body' },
      { status: 400 }
    );
  }

  // Body shape: { extraction_config: <object> } OR { extraction_config: {} } to clear.
  const incoming = (body as Record<string, unknown> | null)?.extraction_config;
  if (incoming === undefined) {
    return NextResponse.json(
      { ok: false, error: 'missing extraction_config' },
      { status: 400 }
    );
  }

  // Empty object is a valid "clear" — we don't run validate on {}.
  // Non-empty object MUST pass validateExtractionConfig.
  const isObject =
    incoming !== null && typeof incoming === 'object' && !Array.isArray(incoming);
  if (!isObject) {
    return NextResponse.json(
      { ok: false, error: 'extraction_config must be an object' },
      { status: 400 }
    );
  }
  const isEmpty = Object.keys(incoming as object).length === 0;
  if (!isEmpty && !validateExtractionConfig(incoming)) {
    return NextResponse.json(
      { ok: false, error: 'invalid extraction_config — see scrape-json validator' },
      { status: 400 }
    );
  }

  // Verify feed exists and is feed_type='scrape_json' before writing.
  const { data: feed, error: lookupErr } = await service
    .from('feeds')
    .select('id, feed_type, source_name, name')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr || !feed) {
    return NextResponse.json(
      { ok: false, error: 'feed not found' },
      { status: 404 }
    );
  }
  if (feed.feed_type !== 'scrape_json') {
    return NextResponse.json(
      {
        ok: false,
        error: `extraction_config only applies to feed_type='scrape_json' (this row is '${feed.feed_type}')`,
      },
      { status: 400 }
    );
  }

  // Cast the update payload to bypass the typed-jsonb generic narrowing —
  // extraction_config is `Json` in database.ts and our validated object
  // satisfies that contract structurally.
  const { error: updateErr } = await service
    .from('feeds')
    .update({ extraction_config: incoming as never })
    .eq('id', id);
  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: updateErr.message },
      { status: 500 }
    );
  }

  // Audit payload — header values + secret-keyed query_params are scrubbed
  // even if the operator pasted inline literals. The DB column itself stores
  // the operator's input verbatim; only the audit surface is redacted.
  await recordAdminAction({
    action: 'feed.extraction_config.update',
    targetTable: 'feeds',
    targetId: id,
    newValue: {
      extraction_config: redactExtractionConfigForAudit(incoming),
      outlet: feed.source_name || feed.name || null,
    },
  });

  return NextResponse.json({ ok: true });
}
