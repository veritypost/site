// @migrated-to-permissions 2026-04-18
// @feature-verified expert_queue 2026-04-18
'use client';

import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '../../lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';
import { formatDate, formatDateTime } from '@/lib/dates';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// D33: Expert Queue. Experts see pending questions in their categories
// (or directed at them), claim/decline/answer, and flip between the
// queue and the back-channel.
//
// Gate swap: the former `is_user_expert` RPC + role bypass branch is
// replaced by a single `hasPermission('expert.queue.view')` check. The
// resolver applies moderator+/admin inheritance, and the oversight
// fallback uses `expert.queue.oversight_all_categories` to load every
// category for reviewers whose accounts aren't tied to an expert
// application.

const C = {
  bg: '#fff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111',
  dim: '#666',
  accent: '#111',
  success: '#16a34a',
  warn: '#b45309',
  danger: '#dc2626',
} as const;

type CategoryRef = Pick<Tables<'categories'>, 'id' | 'name'>;

type Tab = 'pending' | 'claimed' | 'answered' | 'back-channel';

interface QueueItem {
  id: string;
  target_type: string | null;
  articles: { title: string | null } | null;
  comments: { body: string | null } | null;
  created_at: string;
  answered_at: string | null;
  answer: { status: string | null } | null;
  asker?: { username: string; verity_score: number } | null;
  category?: { id: string; name: string } | null;
}

interface BackChannelMessage {
  id: string;
  body: string;
  created_at: string;
  users: { username: string | null } | null;
}

interface QueueResponse {
  items?: QueueItem[];
  error?: string;
}
interface BackChannelResponse {
  messages?: BackChannelMessage[];
  error?: string;
}
interface AnswerResponse {
  pending_review?: boolean;
  error?: string;
}

// Row shape returned by the expert_application_categories join (nested
// `categories(id, name)` + a nested `expert_applications` row used only for
// the filter join).
interface ExpertApplicationCategoryRow {
  categories: CategoryRef | null;
  expert_applications: { user_id: string | null; status: string | null } | null;
}

export default function ExpertQueuePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [categories, setCategories] = useState<CategoryRef[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [backMessages, setBackMessages] = useState<BackChannelMessage[]>([]);
  const [backDraft, setBackDraft] = useState<string>('');
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [answerTab, setAnswerTab] = useState<Record<string, 'edit' | 'preview'>>({});
  const [error, setError] = useState<string>('');
  const [flash, setFlash] = useState<string>('');

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Permission gate: expert queue access unified behind one key.
    // The permission resolver applies any moderator+/admin inheritance.
    await refreshAllPermissions();
    await refreshIfStale();
    const allowed = hasPermission('expert.queue.view');
    setAuthorized(allowed);
    if (!allowed) {
      setLoading(false);
      return;
    }

    const { data: cats } = await supabase
      .from('expert_application_categories')
      .select('categories(id, name), expert_applications!inner(user_id, status)')
      .eq('expert_applications.user_id', user.id)
      .eq('expert_applications.status', 'approved');
    const rows = (cats as unknown as ExpertApplicationCategoryRow[] | null) || [];
    let list: CategoryRef[] = rows.map((r) => r.categories).filter((c): c is CategoryRef => !!c);

    // Users granted expert.queue.view via role inheritance (moderator+) may
    // have no expert application, so the join returns empty. Fall back to
    // every category so oversight isn't scoped out.
    if (list.length === 0 && hasPermission('expert.queue.oversight_all_categories')) {
      const { data: allCats } = await supabase.from('categories').select('id, name').order('name');
      list = (allCats as CategoryRef[] | null) || [];
    }

    setCategories(list);
    if (list.length > 0) setActiveCategory(list[0].id);

    setLoading(false);
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadItems(status: string) {
    try {
      const res = await fetch(`/api/expert/queue?status=${status}`);
      const data = (await res.json().catch(() => ({}))) as QueueResponse;
      if (!res.ok) throw new Error(data?.error || 'Queue load failed');
      setItems(data.items || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Queue load failed';
      setError(msg);
    }
  }
  async function loadBackChannel(categoryId: string | null) {
    if (!categoryId) return;
    try {
      const res = await fetch(`/api/expert/back-channel?category_id=${categoryId}`);
      const data = (await res.json().catch(() => ({}))) as BackChannelResponse;
      if (!res.ok) throw new Error(data?.error || 'Back-channel load failed');
      setBackMessages(data.messages || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Back-channel load failed';
      setError(msg);
    }
  }

  useEffect(() => {
    if (!authorized) return;
    setError('');
    if (tab === 'back-channel') loadBackChannel(activeCategory);
    else loadItems(tab);
  }, [tab, authorized, activeCategory]);

  async function handleClaim(id: string) {
    const res = await fetch(`/api/expert/queue/${id}/claim`, { method: 'POST' });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) {
      setError(data?.error || 'Claim failed');
      return;
    }
    loadItems(tab);
  }
  async function handleDecline(id: string) {
    const res = await fetch(`/api/expert/queue/${id}/decline`, { method: 'POST' });
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (!res.ok) {
      setError(data?.error || 'Decline failed');
      return;
    }
    loadItems(tab);
  }
  async function handleAnswer(id: string) {
    const body = (answerDraft[id] || '').trim();
    if (!body) return;
    const res = await fetch(`/api/expert/queue/${id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const data = (await res.json().catch(() => ({}))) as AnswerResponse;
    if (!res.ok) {
      setError(data?.error || 'Answer failed');
      return;
    }
    if (data.pending_review) {
      setFlash(
        'Saved. Your answer is in probation review and will go live once an editor approves it.'
      );
      setTimeout(() => setFlash(''), 5000);
    }
    setAnswerDraft((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    loadItems(tab);
  }
  async function postBackMessage() {
    const body = backDraft.trim();
    if (!body || !activeCategory) return;
    const res = await fetch('/api/expert/back-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: activeCategory, body }),
    });
    const data = (await res.json().catch(() => ({}))) as BackChannelResponse;
    if (!res.ok) {
      setError(data?.error || 'Post failed');
      return;
    }
    setBackDraft('');
    loadBackChannel(activeCategory);
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: 20, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Experts only</h2>
        <p style={{ color: C.dim, fontSize: 14 }}>
          This page is visible to verified Expert / Educator / Journalist accounts.
        </p>
        <a href="/profile/settings/expert" style={{ color: C.accent, fontWeight: 600 }}>
          Apply to be an expert →
        </a>
      </div>
    );
  }

  const tabs: Array<{ k: Tab; l: string }> = [
    { k: 'pending', l: 'Pending' },
    { k: 'claimed', l: 'Claimed' },
    { k: 'answered', l: 'Answered' },
    { k: 'back-channel', l: 'Back-channel' },
  ];

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Expert Queue</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 18 }}>
        Questions routed to you via @expert or @category (D20 / D33).
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: 'none',
              background: tab === t.k ? C.accent : C.card,
              color: tab === t.k ? '#fff' : C.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}
      {flash && (
        <div
          style={{
            fontSize: 12,
            color: '#166534',
            background: '#ecfdf5',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
          }}
        >
          {flash}
        </div>
      )}

      {tab !== 'back-channel' &&
        (items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>
            {tab === 'pending' && 'No pending questions in your categories.'}
            {tab === 'claimed' && 'You haven\u2019t claimed any questions yet.'}
            {tab === 'answered' && 'You haven\u2019t answered any questions yet.'}
          </div>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 14,
                marginBottom: 10,
              }}
            >
              {it.category?.name && (
                <div
                  style={{
                    fontSize: 10,
                    color: C.dim,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 2,
                  }}
                >
                  {it.category.name}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>
                {it.target_type === 'expert' ? 'Directed at you' : 'Category question'}
                {it.articles?.title ? ` · ${it.articles.title}` : ''}
                {' · '}
                {formatDate(it.created_at)}
              </div>
              <div
                style={{ fontSize: 14, color: C.text, marginBottom: 4, wordBreak: 'break-word' }}
              >
                {it.comments?.body}
              </div>
              {it.asker?.username && (
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>
                  Asked by {it.asker.username}
                </div>
              )}

              {tab === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleClaim(it.id)} style={btn(C.accent)}>
                    Claim
                  </button>
                  <button onClick={() => handleDecline(it.id)} style={btnGhost}>
                    Decline
                  </button>
                </div>
              )}
              {tab === 'claimed' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 0,
                      marginBottom: 8,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: `1px solid ${C.border}`,
                      width: 'fit-content',
                    }}
                  >
                    {(['edit', 'preview'] as const).map((t) => {
                      const active = (answerTab[it.id] ?? 'edit') === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setAnswerTab((prev) => ({ ...prev, [it.id]: t }))}
                          style={{
                            padding: '5px 14px',
                            border: 'none',
                            background: active ? C.accent : 'transparent',
                            color: active ? '#fff' : C.dim,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {t === 'edit' ? 'Edit' : 'Preview'}
                        </button>
                      );
                    })}
                  </div>
                  {(answerTab[it.id] ?? 'edit') === 'edit' ? (
                    <textarea
                      value={answerDraft[it.id] || ''}
                      onChange={(e) =>
                        setAnswerDraft((prev) => ({ ...prev, [it.id]: e.target.value }))
                      }
                      rows={3}
                      placeholder="Your answer… (markdown supported)"
                      style={{
                        width: '100%',
                        padding: 8,
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        fontSize: 13,
                        outline: 'none',
                        fontFamily: 'inherit',
                        marginBottom: 8,
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          marked.parse(answerDraft[it.id] || '', { async: false }) as string,
                          { USE_PROFILES: { html: true } }
                        ),
                      }}
                      style={{
                        minHeight: 72,
                        padding: 8,
                        borderRadius: 8,
                        border: `1px solid ${C.border}`,
                        fontSize: 13,
                        marginBottom: 8,
                        wordBreak: 'break-word',
                        color: (answerDraft[it.id] || '').trim() ? C.text : C.dim,
                      }}
                    />
                  )}
                  <button
                    onClick={() => handleAnswer(it.id)}
                    disabled={!(answerDraft[it.id] || '').trim()}
                    style={btn(C.accent)}
                  >
                    Post answer
                  </button>
                </div>
              )}
              {tab === 'answered' && (
                <div
                  style={{
                    fontSize: 12,
                    color: C.dim,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Answered {formatDateTime(it.answered_at)}</span>
                  {it.answer?.status === 'pending_review' && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      Pending editor review
                    </span>
                  )}
                  {it.answer?.status === 'visible' && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: '#dcfce7',
                        color: '#166534',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      Published
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        ))}

      {tab === 'back-channel' && (
        <>
          {categories.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 999,
                    border: `1px solid ${activeCategory === c.id ? C.accent : C.border}`,
                    background: activeCategory === c.id ? C.accent : 'transparent',
                    color: activeCategory === c.id ? '#fff' : C.text,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 8 }}>
              Private channel — experts, editors, admins only (D33)
            </div>
            {backMessages.length === 0 ? (
              <div style={{ fontSize: 13, color: C.dim, padding: 10 }}>No messages yet.</div>
            ) : (
              backMessages.map((m) => (
                <div key={m.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>
                    {m.users?.username || 'user'} · {formatDateTime(m.created_at)}
                  </div>
                  <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{m.body}</div>
                </div>
              ))
            )}
            <textarea
              value={backDraft}
              onChange={(e) => setBackDraft(e.target.value)}
              rows={2}
              placeholder="Post to the back-channel…"
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                fontSize: 13,
                outline: 'none',
                fontFamily: 'inherit',
                marginTop: 8,
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={postBackMessage}
              disabled={!backDraft.trim()}
              style={{ ...btn(C.accent), marginTop: 6 }}
            >
              Post
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function btn(color: string): CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: 7,
    border: 'none',
    background: color,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
}
const btnGhost: CSSProperties = {
  padding: '7px 14px',
  borderRadius: 7,
  border: '1px solid #e5e5e5',
  background: 'transparent',
  color: '#111',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
