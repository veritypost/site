'use client';

// Word lists admin — reserved_usernames + blocked_words. Writes go
// through record_admin_action first (audit-log guard) then the table
// write. Removing a row on either table uses the single-column
// primary-ish lookup (username / word) rather than id.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Toolbar from '@/components/admin/Toolbar';
import { confirm } from '@/components/admin/ConfirmDialog';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

type Tab = 'reserved' | 'profanity';

export default function WordsAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('reserved');
  const [reserved, setReserved] = useState<string[]>([]);
  const [profanity, setProfanity] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newWord, setNewWord] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];

      if (!profile || !roleNames.some((r: string) => ADMIN_ROLES.has(r))) {
        router.push('/');
        return;
      }

      const [reservedRes, profanityRes] = await Promise.all([
        supabase.from('reserved_usernames').select('username').order('username', { ascending: true }),
        supabase.from('blocked_words').select('word').order('word', { ascending: true }),
      ]);

      if (cancelled) return;
      const resRows = (reservedRes.data || []) as Array<{ username: string | null }>;
      const proRows = (profanityRes.data || []) as Array<{ word: string | null }>;
      setReserved(resRows.map((r) => r.username).filter(Boolean).sort() as string[]);
      setProfanity(proRows.map((r) => r.word).filter(Boolean).sort() as string[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = tab === 'reserved' ? reserved : profanity;
  const setList = tab === 'reserved' ? setReserved : setProfanity;

  const filtered = search
    ? list.filter((w) => w.toLowerCase().includes(search.toLowerCase()))
    : list;

  const addWord = async (words: string[]) => {
    const isReserved = tab === 'reserved';
    const kind = isReserved ? 'reserved' : 'blocked';
    const toAdd = words.filter((w) => !list.includes(w));
    if (toAdd.length === 0) { setNewWord(''); return; }

    const res = await fetch('/api/admin/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, words: toAdd }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: `Add failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    setList((prev) => [...prev, ...toAdd].sort());
    toast.push({ message: `Added ${toAdd.length} word${toAdd.length === 1 ? '' : 's'}`, variant: 'success' });
    setNewWord('');
  };

  const addSingle = () => {
    const w = newWord.trim().toLowerCase();
    if (!w) return;
    addWord([w]);
  };

  const addBulk = () => {
    const words = newWord.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    addWord(words);
  };

  const removeWord = async (word: string) => {
    const ok = await confirm({
      title: `Remove "${word}"?`,
      message: tab === 'reserved'
        ? 'This frees the username for new signups.'
        : 'This removes the word from the profanity filter.',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;

    const isReserved = tab === 'reserved';
    const kind = isReserved ? 'reserved' : 'blocked';
    const res = await fetch('/api/admin/words', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, word }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: `Remove failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    setList((prev) => prev.filter((w) => w !== word));
    toast.push({ message: `Removed "${word}"`, variant: 'success' });
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading words
        </div>
      </Page>
    );
  }

  const tabs: Array<{ k: Tab; label: string; count: number }> = [
    { k: 'reserved', label: 'Reserved Usernames', count: reserved.length },
    { k: 'profanity', label: 'Profanity Filter', count: profanity.length },
  ];

  return (
    <Page maxWidth={900}>
      <PageHeader
        title="Word Lists"
        subtitle="Reserved usernames and profanity filter words"
      />

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => { setTab(t.k); setSearch(''); }}
              style={{
                padding: `${S[2]}px ${S[4]}px`,
                borderRadius: 6,
                border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.divider}`,
                background: active ? ADMIN_C.accent : ADMIN_C.bg,
                color: active ? '#ffffff' : ADMIN_C.soft,
                fontSize: F.base,
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
              <span style={{ marginLeft: S[2], opacity: 0.85, fontWeight: 400 }}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <Toolbar
        left={
          <>
            <TextInput
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (newWord.includes(',')) addBulk();
                  else addSingle();
                }
              }}
              placeholder="Add word (or comma-separated)"
              style={{ flex: '1 1 280px', minWidth: 220 }}
            />
            <Button
              variant="primary"
              disabled={!newWord.trim()}
              onClick={() => (newWord.includes(',') ? addBulk() : addSingle())}
            >
              Add
            </Button>
          </>
        }
        right={
          <TextInput
            type="search"
            size="sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter"
            style={{ width: 200 }}
          />
        }
      />

      <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginBottom: S[2] }}>
        {filtered.length} word{filtered.length === 1 ? '' : 's'}
      </div>

      <PageSection boxed divider={false} title={undefined}>
        {filtered.length === 0 ? (
          <EmptyState
            title="No words"
            description={search
              ? 'Nothing matches that filter. Clear the filter to see the full list.'
              : tab === 'reserved'
                ? 'No reserved usernames yet. Add one above to block it at signup.'
                : 'No profanity filter words yet. Add one above.'}
          />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
            {filtered.map((word) => (
              <div
                key={word}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: S[2],
                  padding: `${S[1]}px ${S[2]}px`,
                  borderRadius: 6,
                  border: `1px solid ${ADMIN_C.divider}`,
                  background: ADMIN_C.card,
                  fontSize: F.sm,
                  color: ADMIN_C.white,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {word}
                <button
                  onClick={() => removeWord(word)}
                  aria-label={`Remove ${word}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: ADMIN_C.dim,
                    cursor: 'pointer',
                    fontSize: F.xs,
                    padding: '0 2px',
                    lineHeight: 1,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = ADMIN_C.danger; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = ADMIN_C.dim; }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <div
        style={{
          marginTop: S[4],
          padding: S[4],
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 8,
          background: ADMIN_C.card,
          fontSize: F.xs,
          color: ADMIN_C.dim,
          lineHeight: 1.6,
          display: 'flex',
          alignItems: 'flex-start',
          gap: S[2],
        }}
      >
        <Badge variant="info" size="xs">INFO</Badge>
        <span>
          {tab === 'reserved'
            ? 'Reserved usernames cannot be claimed by any user. Used for system routes, brand protection, and staff-only names. Checked during signup and username change.'
            : 'Profanity filter words trigger a warning + 30-second cooldown when used in comments. The comment is rejected entirely (not posted with asterisks). User must retype without the word.'}
        </span>
      </div>
    </Page>
  );
}
