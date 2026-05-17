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

import { buttonPrimaryStyle, buttonSecondaryStyle, textareaStyle } from '../_components/Field';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { useToast } from '../_components/Toast';
import { C, F, FONT, R, S, SH } from '../_lib/palette';
import { ExpertChatPanel } from './ExpertChatPanel';

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
  const [items, setItems] = useState<QueueItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (loading) return;
    if (tab === 'back-channel') return; // ExpertChatPanel manages its own load + poll
    loadItems(tab);
  }, [tab, loadItems, loading]);

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
    toast.success('Item declined.');
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

  if (loading) return <SkeletonBlock height={160} />;

  // Note: do NOT early-return when categories.length === 0. An expert with
  // no approved areas yet can still receive directly-targeted questions
  // (target_type='expert', target_expert_id=user.id) which the queue API
  // serves regardless of category coverage. The Expert chat tab handles
  // its own no-category placeholder below.

  const tabs: { k: Tab; l: string }[] = [
    { k: 'pending', l: 'Pending' },
    { k: 'claimed', l: 'Claimed' },
    { k: 'answered', l: 'Answered' },
    { k: 'back-channel', l: 'Expert chat' },
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
      </div>

      {tab === 'back-channel' && categories.length === 0 ? (
        <EmptyState
          title="Expert chat is verified-only"
          body="Each area has a private channel for its verified experts. Get verified in one to join the conversation."
          cta={{ label: 'Apply to be a verified expert', href: '/profile/settings/expert' }}
          variant="full"
        />
      ) : tab === 'back-channel' ? (
        <ExpertChatPanel
          categories={categories}
          isAdminScope={isAdminScope}
          preview={preview}
        />
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
              ? 'You’re all caught up — new questions in your areas land here.'
              : tab === 'claimed'
                ? 'Questions you claim sit here until you answer them.'
                : 'Once you answer a question, it shows up here.'
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
