// T-005 — server route for admin/promo create.
// Replaces direct `supabase.from('promo_codes').insert(...)` from the client.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Body = {
  code?: string;
  description?: string | null;
  discount_type?: 'percent' | 'amount';
  discount_value?: number;
  applies_to_plans?: string[] | null;
  duration?: 'once' | 'repeating' | 'forever';
  duration_months?: number | null;
  max_uses?: number | null;
  max_uses_per_user?: number;
  starts_at?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.promo.create');
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const body = (await request.json().catch(() => ({}))) as Body;
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  if (!body.discount_type || !['percent', 'amount'].includes(body.discount_type)) {
    return NextResponse.json({ error: 'discount_type must be percent|amount' }, { status: 400 });
  }
  if (typeof body.discount_value !== 'number' || body.discount_value < 0) {
    return NextResponse.json({ error: 'discount_value must be >= 0' }, { status: 400 });
  }

  const row = {
    code,
    description: body.description || null,
    discount_type: body.discount_type,
    discount_value: body.discount_value,
    applies_to_plans:
      Array.isArray(body.applies_to_plans) && body.applies_to_plans.length > 0
        ? body.applies_to_plans
        : null,
    duration: body.duration || 'once',
    duration_months: body.duration_months ?? null,
    max_uses: body.max_uses ?? null,
    max_uses_per_user: body.max_uses_per_user ?? 1,
    starts_at: body.starts_at || null,
    expires_at: body.expires_at || null,
    is_active: body.is_active !== false,
  };

  const service = createServiceClient();
  const { data, error } = await service.from('promo_codes').insert(row).select('*').single();
  if (error || !data) {
    console.error('[admin.promo.create]', error?.message);
    return NextResponse.json({ error: 'Could not create promo' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'promo.create',
    targetTable: 'promo_codes',
    targetId: data.id,
    newValue: {
      code: data.code,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
    },
  });

  return NextResponse.json({ ok: true, row: data });
}
