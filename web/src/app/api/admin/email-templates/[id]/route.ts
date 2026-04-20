// T-005 — server route for admin/email-templates edit + toggle.
// Replaces direct `supabase.from('email_templates').update(...)` writes
// from admin/email-templates/page.tsx.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type PatchBody = {
  subject?: string;
  body_text?: string;
  is_active?: boolean;
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try { actor = await requirePermission('admin.email_templates.edit'); }
  catch (err) { return permissionError(err); }
  void actor;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const update: Partial<PatchBody> = {};
  if (typeof body.subject === 'string') update.subject = body.subject;
  if (typeof body.body_text === 'string') update.body_text = body.body_text;
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const service = createServiceClient();

  // Load prior state for audit.
  const { data: prior } = await service
    .from('email_templates')
    .select('id, subject, body_text, is_active')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const { error } = await service.from('email_templates').update(update).eq('id', id);
  if (error) {
    console.error('[admin.email_templates.patch]', error.message);
    return NextResponse.json({ error: 'Could not save template' }, { status: 500 });
  }

  const action = typeof body.is_active === 'boolean' && Object.keys(update).length === 1
    ? 'email_template.toggle'
    : 'email_template.edit';

  await recordAdminAction({
    action,
    targetTable: 'email_templates',
    targetId: id,
    oldValue: prior,
    newValue: update,
  });

  return NextResponse.json({ ok: true });
}
