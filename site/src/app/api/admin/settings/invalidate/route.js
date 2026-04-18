import { requireRole } from '@/lib/auth';
import { clearSettingsCache } from '@/lib/settings';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    await requireRole('admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    clearSettingsCache();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
