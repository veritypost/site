/**
 * Wave 4 — Stream D Run Feed UI
 *
 * GET /api/admin/newsroom/research/feeds
 *
 * Lightweight feed list for the source-scope multi-select on the
 * Research panel. Returns { id, name, source_name, feed_type } only —
 * no per-feed counts, no totals (those live on /api/admin/feeds/list
 * behind admin.feeds.manage).
 *
 * Permission: admin.pipeline.run_ingest (Run Feed gate).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('feeds')
    .select('id, name, source_name, feed_type, is_active')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('source_name', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (error) {
    console.error('[research.feeds.list]', error.message);
    return NextResponse.json({ error: 'Could not load feeds' }, { status: 500 });
  }
  return NextResponse.json({ feeds: data ?? [] });
}
