// Expert queue + back-channel — inline in the profile shell. The legacy
// /expert-queue page still exists; this is the new home for expert work
// inside the master/detail.
//
// Two important fixes vs legacy:
//   1. Back-channel is scoped to **expertise areas only**.
//      - Verified expert → categories the user is approved for
//      - Admin / moderator+ → categories that have at least one approved
//        expert application (NOT every category in the system, which was
//        the legacy "messy" behavior)
//   2. Admin dropdown lets you switch backchannels cleanly without
//      leaving the profile shell.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { hasPermission } from '@/lib/permissions';

import { Card } from '../_components/Card';
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  inputStyle,
  textareaStyle,
} from '../_components/Field';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { useToast } from '../_components/Toast';
import { C, F, FONT, R, S, SH } from '../_lib/palette';

interface CategoryRef {
  id: string;
  name: string;
}

interface QueueItem {
  id: string;
  body: string;
  asker_username: string | null;
  category: CategoryRef | null;
  status: 'pending' | 'claimed' | 'answered' | string;
  created_at: string;
}

interface BackMessage {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  users?: { id: string; username: string | null; avatar_color: string | null } | null;
}

type Tab = 'pending' | 'claimed' | 'answered' | 'back-channel';

interface Props {
  preview: boolean;
}

export function ExpertQueueSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [categories, setCategories] = useState<CategoryRef[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [backMessages, setBackMessages] = useState<BackMessage[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [backDraft, setBackDraft] = useState('');
  const [isAdminScope, setIsAdminScope] = useState(false);

  // Initial scope load — pick the right category list for this user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const oversight = hasPermission('expert.queue.oversight_all_categories');
      setIsAdminScope(oversight);

      let list: CategoryRef[] = [];
      // Verified expert: their own approved categories
      const { data: own } = await supabase
        .from('expert_application_categories')
        .select('categories(id, name), expert_applications!inner(user_id, status)')
        .eq('expert_applications.user_id', user.id)
        .eq('expert_applications.status', 'approved');
      const ownRows = (own ?? []) as unknown as Array<{
        categories: CategoryRef | null;
      }>;
      list = ownRows.map((r) => r.categories).filter((c): c is CategoryRef => !!c);

      // Admin scope: union of every category that has at least one
      // approved expert application — NOT the full categories table.
      // Cleaner than "all categories" because the back-channel is only
      // meaningful where there are actual experts to listen to.
      if (oversight) {
        const { data: union } = await supabase
          .from('expert_application_categories')
          .select('categories(id, name), expert_applications!inner(status)')
          .eq('expert_applications.status', 'approved');
        const unionRows = (union ?? []) as unknown as Array<{
          categories: CategoryRef | null;
        }>;
        const seen = new Set<string>();
        const merged: CategoryRef[] = [];
        for (const r of unionRows) {
          const cat = r.categories;
          if (!cat) continue;
          if (seen.has(cat.id)) continue;
          seen.add(cat.id);
          merged.push(cat);
        }
        merged.sort((a, b) => a.name.localeCompare(b.name));
        list = merged;
      }

      if (cancelled) return;
      setCategories(list);
      setActiveCategory(list[0]?.id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  const loadItems = useCallback(
    async (status: Exclude<Tab, 'back-channel'>) => {
      if (preview) return;
      try {
        const res = await fetch(`/api/expert/queue?status=${status}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'Could not load queue.');
        setItems((data.items ?? []) as QueueItem[]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Queue load failed.');
      }
    },
    [preview, toast]
  );

  const loadBackChannel = useCallback(
    async (categoryId: string | null) => {
      if (!categoryId || preview) return;
      try {
        const res = await fetch(
          `/api/expert/back-channel?category_id=${encodeURIComponent(categoryId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'Could not load back-channel.');
        setBackMessages((data.messages ?? []) as BackMessage[]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Back-channel load failed.');
      }
    },
    [preview, toast]
  );

  useEffect(() => {
    if (loading) return;
    if (tab === 'back-channel') loadBackChannel(activeCategory);
    else loadItems(tab);
  }, [tab, activeCategory, loadBackChannel, loadItems, loading]);

  const claim = async (id: string) => {
    if (preview) return;
    const res = await fetch(`/api/expert/queue/${id}/claim`, { method: 'POST' });
    if (!res.ok) {
      toast.error('Could not claim.');
      return;
    }
    toast.success('Claimed.');
    loadItems('pending');
  };

  const decline = async (id: string) => {
    if (preview) return;
    const res = await fetch(`/api/expert/queue/${id}/decline`, { method: 'POST' });
    if (!res.ok) {
      toast.error('Could not decline.');
      return;
    }
    loadItems('pending');
  };

  const answer = async (id: string) => {
    const body = (draft[id] ?? '').trim();
    if (!body) return;
    if (preview) {
      toast.info('Sign in to post an answer.');
      return;
    }
    const res = await fetch(`/api/expert/queue/${id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error ?? 'Answer failed.');
      return;
    }
    toast.success(
      (data as { pending_review?: boolean }).pending_review
        ? 'Saved — pending editor review.'
        : 'Answer posted.'
    );
    setDraft((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    loadItems('claimed');
  };

  const postBack = async () => {
    if (!activeCategory) return;
    const body = backDraft.trim();
    if (!body) return;
    if (preview) {
      toast.info('Sign in to post in the back-channel.');
      return;
    }
    const res = await fetch('/api/expert/back-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: activeCategory, body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error((data as { error?: string }).error ?? 'Post failed.');
      return;
    }
    setBackDraft('');
    loadBackChannel(activeCategory);
  };

  if (loading) return <SkeletonBlock height={160} />;

  if (categories.length === 0) {
    return (
      <EmptyState
        title="No verified expert areas yet"
        body="Apply for expert verification to start answering questions in your fields."
        cta={{ label: 'Open expert profile', href: '/profile?section=expert-profile' }}
        variant="full"
      />
    );
  }

  const tabs: { k: Tab; l: string }[] = [
    { k: 'pending', l: 'Pending' },
    { k: 'claimed', l: 'Claimed' },
    { k: 'answered', l: 'Answered' },
    { k: 'back-channel', l: 'Back-channel' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4], fontFamily: FONT.sans }}>
      {/* Top bar: tab pills + (for admin) area dropdown */}
      <div
        style={{
          display: 'flex',
          gap: S[3],
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
          {tabs.map((t) => {
            const active = t.k === tab;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                style={{
                  padding: `${S[1]}px ${S[3]}px`,
                  background: active ? C.ink : 'transparent',
                  color: active ? C.bg : C.inkSoft,
                  border: `1px solid ${active ? C.ink : C.border}`,
                  borderRadius: R.pill,
                  fontSize: F.sm,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t.l}
              </button>
            );
          })}
        </div>
        {tab === 'back-channel' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginLeft: 'auto' }}>
            <label
              htmlFor="ex-back-cat"
              style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}
            >
              {isAdminScope ? 'Backchannel:' : 'Your area:'}
            </label>
            <select
              id="ex-back-cat"
              value={activeCategory ?? ''}
              onChange={(e) => setActiveCategory(e.target.value)}
              style={{
                ...inputStyle,
                width: 'auto',
                padding: `${S[1]}px ${S[3]}px`,
                fontSize: F.sm,
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {tab === 'back-channel' ? (
        <Card
          title={
            categories.find((c) => c.id === activeCategory)?.name
              ? `${categories.find((c) => c.id === activeCategory)?.name} · back-channel`
              : 'Back-channel'
          }
          description={
            isAdminScope
              ? 'Admin view. Pick any category that has approved experts to read its back-channel.'
              : 'A private space among verified experts in this area. Threads do not appear publicly.'
          }
        >
          {backMessages.length === 0 ? (
            <p style={{ fontSize: F.sm, color: C.inkMuted, margin: 0 }}>
              {isAdminScope
                ? 'No experts have posted here yet.'
                : 'No messages in this back-channel yet.'}
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: S[2],
              }}
            >
              {backMessages.map((m) => (
                <li
                  key={m.id}
                  style={{
                    background: C.surfaceSunken,
                    border: `1px solid ${C.border}`,
                    borderRadius: R.md,
                    padding: S[3],
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: S[2],
                      alignItems: 'center',
                      fontSize: F.xs,
                      color: C.inkMuted,
                      marginBottom: S[1],
                    }}
                  >
                    <span style={{ fontWeight: 600, color: C.inkSoft }}>
                      @{m.users?.username ?? 'unknown'}
                    </span>
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: F.sm, color: C.ink, lineHeight: 1.55 }}>
                    {m.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: S[3] }}>
            <textarea
              value={backDraft}
              onChange={(e) => setBackDraft(e.target.value)}
              placeholder="Post a note for other experts in this area…"
              style={{ ...textareaStyle, minHeight: 70 }}
            />
            <div style={{ marginTop: S[2], display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={postBack}
                disabled={!backDraft.trim()}
                style={{
                  ...buttonPrimaryStyle,
                  opacity: backDraft.trim() ? 1 : 0.55,
                  cursor: backDraft.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Post
              </button>
            </div>
          </div>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          title={
            tab === 'pending'
              ? 'Nothing pending'
              : tab === 'claimed'
                ? 'Nothing claimed'
                : 'No answered questions yet'
          }
          body={
            tab === 'pending'
              ? 'You’re all caught up. New questions in your areas land here.'
              : tab === 'claimed'
                ? 'Questions you’ve claimed but not yet answered will appear here.'
                : 'Once you answer a question, it will appear in this list.'
          }
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: S[3],
          }}
        >
          {items.map((it) => (
            <li
              key={it.id}
              style={{
                background: C.surfaceRaised,
                border: `1px solid ${C.border}`,
                borderRadius: R.lg,
                padding: S[4],
                boxShadow: SH.ambient,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: F.xs,
                  color: C.inkMuted,
                  marginBottom: S[2],
                  fontWeight: 600,
                }}
              >
                <span style={{ textTransform: 'uppercase' }}>
                  {it.category?.name ?? 'Uncategorized'}
                </span>
                <span style={{ color: C.inkFaint, fontWeight: 500 }}>
                  {new Date(it.created_at).toLocaleString()}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  marginBottom: S[3],
                  fontSize: F.base,
                  color: C.ink,
                  lineHeight: 1.55,
                }}
              >
                {it.body}
              </p>
              {it.asker_username ? (
                <div style={{ fontSize: F.xs, color: C.inkMuted, marginBottom: S[3] }}>
                  Asked by @{it.asker_username}
                </div>
              ) : null}
              {tab === 'pending' ? (
                <div style={{ display: 'flex', gap: S[2] }}>
                  <button type="button" onClick={() => claim(it.id)} style={buttonPrimaryStyle}>
                    Claim
                  </button>
                  <button type="button" onClick={() => decline(it.id)} style={buttonSecondaryStyle}>
                    Decline
                  </button>
                </div>
              ) : null}
              {tab === 'claimed' ? (
                <div>
                  <textarea
                    value={draft[it.id] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [it.id]: e.target.value }))}
                    placeholder="Write your answer (markdown allowed)…"
                    style={textareaStyle}
                  />
                  <div style={{ marginTop: S[2], display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => answer(it.id)}
                      disabled={!(draft[it.id] ?? '').trim()}
                      style={{
                        ...buttonPrimaryStyle,
                        opacity: (draft[it.id] ?? '').trim() ? 1 : 0.55,
                        cursor: (draft[it.id] ?? '').trim() ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Post answer
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
