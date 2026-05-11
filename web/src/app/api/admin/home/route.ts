// GET — fetch the v2 layout (any status) with slots and items, for the
// admin editor. Goes through the service client so drafts are visible —
// RLS blocks non-live reads from the regular client.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';
import { fetchLayoutBySlug } from '@/app/_home_v2/data';

export async function GET() {
  try {
    await requirePermission('admin.home_v2.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const layout = await fetchLayoutBySlug(service, 'v2');
  if (!layout) {
    return NextResponse.json({ error: 'v2 layout not found' }, { status: 404 });
  }

  // Whether v2 is currently the live layout (drives the promote button).
  const { data: liveRow } = await service
    .from('home_layouts')
    .select('slug')
    .eq('status', 'live')
    .limit(1)
    .maybeSingle();
  const liveSlug = (liveRow as { slug: string } | null)?.slug ?? null;

  return NextResponse.json({ layout, liveSlug });
}
