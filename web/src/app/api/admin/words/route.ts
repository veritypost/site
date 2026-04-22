// T-005 — server route for admin/words (reserved_usernames + blocked_words).
// Replaces client writes + client-side record_admin_action calls.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Kind = 'reserved' | 'blocked';

function resolveTable(kind: Kind) {
  return kind === 'reserved' ? 'reserved_usernames' : 'blocked_words';
}
function resolveColumn(kind: Kind) {
  return kind === 'reserved' ? 'username' : 'word';
}
function resolvePermKey(kind: Kind) {
  return kind === 'reserved' ? 'admin.reserved_usernames.manage' : 'admin.blocked_words.manage';
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: Kind; words?: string[] };
  const kind: Kind = body.kind === 'blocked' ? 'blocked' : 'reserved';
  const words = Array.isArray(body.words)
    ? body.words.map((w) => (typeof w === 'string' ? w.trim().toLowerCase() : '')).filter(Boolean)
    : [];
  if (words.length === 0) return NextResponse.json({ error: 'words required' }, { status: 400 });

  try {
    await requirePermission(resolvePermKey(kind));
  } catch (err) {
    return permissionError(err);
  }

  const table = resolveTable(kind);
  const col = resolveColumn(kind);
  const service = createServiceClient();

  const rows = words.map((w) => ({ [col]: w }));
  // @ts-expect-error — union of two table shapes narrows per-kind; runtime uses the right col.
  const { error } = await service.from(table).insert(rows);
  if (error) {
    console.error(`[admin.words.add.${kind}]`, error.message);
    return NextResponse.json({ error: 'Could not add words' }, { status: 500 });
  }

  await recordAdminAction({
    action: kind === 'reserved' ? 'reserved_username.add' : 'banned_word.add',
    targetTable: table,
    targetId: null,
    newValue: { [kind === 'reserved' ? 'usernames' : 'words']: words },
  });

  return NextResponse.json({ ok: true, added: words });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: Kind; word?: string };
  const kind: Kind = body.kind === 'blocked' ? 'blocked' : 'reserved';
  const word = typeof body.word === 'string' ? body.word.trim().toLowerCase() : '';
  if (!word) return NextResponse.json({ error: 'word required' }, { status: 400 });

  try {
    await requirePermission(resolvePermKey(kind));
  } catch (err) {
    return permissionError(err);
  }

  const table = resolveTable(kind);
  const col = resolveColumn(kind);
  const service = createServiceClient();

  await recordAdminAction({
    action: kind === 'reserved' ? 'reserved_username.delete' : 'banned_word.delete',
    targetTable: table,
    targetId: null,
    oldValue: { [col]: word },
  });

  // @ts-expect-error — per-kind column; runtime is correct.
  const { error } = await service.from(table).delete().eq(col, word);
  if (error) {
    console.error(`[admin.words.delete.${kind}]`, error.message);
    return NextResponse.json({ error: 'Could not remove word' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
