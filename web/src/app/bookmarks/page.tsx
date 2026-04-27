// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
'use client';
import { useState, useEffect, useRef, CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import LockedFeatureCTA from '@/components/LockedFeatureCTA';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { getPlanLimitValue } from '@/lib/plans';
import { formatDate } from '@/lib/dates';
import { useToast } from '../../components/Toast';
import type { Tables } from '@/types/database-helpers';

// T-016: bookmark cap is now DB-driven via plan_features.bookmarks
// (limit_value=10 for free, NULL=unlimited for paid). The hard-coded
// `FREE_BOOKMARK_CAP = 10` is gone; the value below is only a safety
// fallback if the plan_features row is missing.
const FALLBACK_BOOKMARK_CAP = 10;

// H5 follow-up — cursor pagination. PAGE_SIZE rows per request; the
// cursor is the last loaded row's created_at (desc order). `hasMore`
// is inferred: if the fetch returned a full page, there MAY be more.
const PAGE_SIZE = 50;

// Shape of a row returned by the bookmarks list query: Row + nested article
// projection + nested category name. Kept local because this is the only place
// that slices it this way.
type BookmarkRow = Tables<'bookmarks'> & {
  articles:
    | (Pick<Tables<'articles'>, 'id' | 'title' | 'slug' | 'excerpt' | 'published_at'> & {
        categories: { name: string | null } | null;
      })
    | null;
};

type CollectionRow = Pick<Tables<'bookmark_collections'>, 'id' | 'name'> & {
  bookmark_count?: number | null;
};

interface PendingDelete {
  id: string;
  name: string;
}

// Same strip-the-Kids-tag rule used across the site.
function stripKidsTag(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .replace(/\s*\(kids?\)\s*$/i, '')
    .replace(/\s+kids?\s*$/i, '')
    .replace(/^kids?\s+/i, '')
    .trim();
}

export default function BookmarksPage() {
  const supabase = createClient();
  const { show, dismiss } = useToast();
  const undoTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [items, setItems] = useState<BookmarkRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [activeCollection, setActiveCollection] = useState<string>('all'); // 'all' | 'uncategorised' | collection_id
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Permission flags: replace former `isPaidTier(userTier)` derivations.
  // `canUnlimited` gates the cap banner + the per-row count display.
  // `canCollections` gates the collection chip row, +Collection button, and
  // per-row collection selectors.
  // `canNote` gates the per-row Notes UI (add / edit).
  // `canExport` gates the Export JSON button.
  const [canUnlimited, setCanUnlimited] = useState<boolean>(false);
  const [canCollections, setCanCollections] = useState<boolean>(false);
  const [canNote, setCanNote] = useState<boolean>(false);
  const [canExport, setCanExport] = useState<boolean>(false);
  const [bookmarkCap, setBookmarkCap] = useState<number>(FALLBACK_BOOKMARK_CAP);

  const [editingNotes, setEditingNotes] = useState<string | null>(null); // bookmark id
  const [noteDraft, setNoteDraft] = useState<string>('');

  const [showNewCollection, setShowNewCollection] = useState<boolean>(false);
  const [newCollectionName, setNewCollectionName] = useState<string>('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<boolean>(false);

  // Cursor pagination state. `hasMore` flips false once a fetch returns
  // fewer than PAGE_SIZE rows. `loadingMore` gates the Load more button
  // so rapid clicks don't fire overlapping queries.
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const atCap = !canUnlimited && items.length >= bookmarkCap;
  // T-088: show a proactive cap counter when a free user is at or above 50% of their cap.
  // Tone escalates: neutral (50–69%), amber (70–89% i.e. >= cap-3), danger (>= cap-1 i.e. 9/10).
  const nearCap = !canUnlimited && items.length >= Math.floor(bookmarkCap * 0.5);
  const capCounterTone: 'neutral' | 'amber' | 'danger' =
    items.length >= bookmarkCap - 1
      ? 'danger'
      : items.length >= bookmarkCap - 3
        ? 'amber'
        : 'neutral';

  async function load() {
    setLoading(true);
    setError('');
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setLoading(false);
      return;
    }

    // Wave 1 permission hydrate: refresh the cache once, then read the gates
    // this page cares about. Replaces the three former `isPaidTier(userTier)`
    // checks (cap banner, collections surface, note/export affordances).
    await refreshAllPermissions();
    await refreshIfStale();
    const unlimited = hasPermission('bookmarks.unlimited');
    const collectionsOk = hasPermission('bookmarks.collection.create');
    const noteOk = hasPermission('bookmarks.note.add');
    const exportOk = hasPermission('bookmarks.export');
    setCanUnlimited(unlimited);
    setCanCollections(collectionsOk);
    setCanNote(noteOk);
    setCanExport(exportOk);

    // T-016: resolve bookmark cap for the user's plan. getPlanLimitValue
    // returns null when unlimited; we only care about it for capped users.
    if (!unlimited) {
      const { data: profile } = await supabase
        .from('users')
        .select('plan_id')
        .eq('id', authUser.id)
        .maybeSingle();
      const cap = await getPlanLimitValue(
        supabase,
        profile?.plan_id ?? null,
        'bookmarks',
        FALLBACK_BOOKMARK_CAP
      );
      if (typeof cap === 'number') setBookmarkCap(cap);
    }

    // First page: PAGE_SIZE most recent bookmarks, cursor-paginated by
    // created_at desc. Subsequent pages fetched by loadMore() using the
    // last row's created_at as the keyset cursor.
    const { data: bms, error: bmsErr } = await supabase
      .from('bookmarks')
      .select(
        'id, notes, created_at, collection_id, articles!fk_bookmarks_article_id(id, title, slug, excerpt, published_at, categories!fk_articles_category_id(name))'
      )
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (bmsErr) console.error('[bookmarks] load failed', bmsErr);
    const firstPage = (bms as unknown as BookmarkRow[] | null) || [];
    setItems(firstPage);
    setHasMore(firstPage.length === PAGE_SIZE);

    if (collectionsOk) {
      const { data: cols, error: colsErr } = await supabase
        .from('bookmark_collections')
        .select('id, name, bookmark_count')
        .eq('user_id', authUser.id)
        .order('sort_order')
        .order('created_at');
      if (colsErr) console.error('[bookmarks] collections load failed', colsErr);
      setCollections((cols as unknown as CollectionRow[] | null) || []);
    } else {
      setCollections([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timers = undoTimerRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setError('');
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setLoadingMore(false);
      return;
    }
    const { data: bms, error: bmsErr } = await supabase
      .from('bookmarks')
      .select(
        'id, notes, created_at, collection_id, articles!fk_bookmarks_article_id(id, title, slug, excerpt, published_at, categories!fk_articles_category_id(name))'
      )
      .eq('user_id', authUser.id)
      .lt('created_at', last.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (bmsErr) {
      console.error('[bookmarks] loadMore failed', bmsErr);
      setError('Could not load more bookmarks.');
      setLoadingMore(false);
      return;
    }
    const next = (bms as unknown as BookmarkRow[] | null) || [];
    setItems((prev) => [...prev, ...next]);
    setHasMore(next.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  function removeBookmark(bookmark: BookmarkRow) {
    const id = bookmark.id;
    const originalIndex = items.findIndex((b) => b.id === id);
    setItems((prev) => prev.filter((b) => b.id !== id));

    const toastId = show(
      <span>
        Bookmark removed{' '}
        <button
          onClick={() => {
            dismiss(toastId);
            const t = undoTimerRef.current.get(id);
            if (t !== undefined) {
              clearTimeout(t);
              undoTimerRef.current.delete(id);
            }
            setItems((prev) => {
              const idx =
                originalIndex >= 0 && originalIndex <= prev.length ? originalIndex : prev.length;
              const next = [...prev];
              next.splice(idx, 0, bookmark);
              return next;
            });
          }}
          style={{
            color: '#fff',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: 4,
            fontSize: 11,
            padding: '2px 8px',
            cursor: 'pointer',
            marginLeft: 8,
          }}
        >
          Undo
        </button>
      </span>,
      { duration: 0 }
    );

    const timer = setTimeout(async () => {
      undoTimerRef.current.delete(id);
      dismiss(toastId);
      const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setItems((prev) => {
          const idx =
            originalIndex >= 0 && originalIndex <= prev.length ? originalIndex : prev.length;
          const next = [...prev];
          next.splice(idx, 0, bookmark);
          return next;
        });
        setError(d?.error || 'Remove failed');
      }
    }, 5000);
    undoTimerRef.current.set(id, timer);
  }

  async function saveNotes(id: string) {
    const res = await fetch(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: noteDraft }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error || 'Save failed');
      return;
    }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, notes: noteDraft } : b)));
    setEditingNotes(null);
    setNoteDraft('');
  }

  async function moveToCollection(id: string, collectionId: string | null) {
    const res = await fetch(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection_id: collectionId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error || 'Move failed');
      return;
    }
    await load();
  }

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    const res = await fetch('/api/bookmark-collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error || 'Create failed');
      return;
    }
    setNewCollectionName('');
    setShowNewCollection(false);
    load();
  }

  function requestDeleteCollection(col: CollectionRow) {
    setPendingDelete({ id: col.id, name: col.name });
  }

  async function confirmDeleteCollection() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/bookmark-collections/${pendingDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Delete failed');
        return;
      }
      if (activeCollection === pendingDelete.id) setActiveCollection('all');
      setPendingDelete(null);
      load();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function exportAll() {
    window.location.href = '/api/bookmarks/export';
  }

  const filtered = items.filter((b) => {
    if (activeCollection === 'all') return true;
    if (activeCollection === 'uncategorised') return !b.collection_id;
    return b.collection_id === activeCollection;
  });

  if (loading) {
    return (
      <main style={{ minHeight: '100vh', background: '#fff', padding: '20px 16px 80px' }}>
        <style>{`
          @keyframes vp-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{
                  background: '#f7f7f7',
                  border: '1px solid #e5e5e5',
                  borderRadius: 10,
                  padding: 16,
                  animation: 'vp-pulse 1.4s ease-in-out infinite',
                  animationDelay: `${(n - 1) * 0.1}s`,
                }}
              >
                <div
                  style={{
                    height: 14,
                    borderRadius: 4,
                    background: '#e5e5e5',
                    marginBottom: 10,
                    width: n % 2 === 0 ? '60%' : '75%',
                  }}
                />
                <div style={{ height: 11, borderRadius: 4, background: '#e5e5e5', width: '40%' }} />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    // Ext-NN1 — main landmark for screen readers.
    <main style={{ minHeight: '100vh', background: '#fff', padding: '20px 16px 80px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Bookmarks ·{' '}
            {/* M14 — when a collection filter is active, show
                "<filtered> of <total>" so the count matches the visible
                rows; "<total>" alone hid empty/sparse collections. */}
            {activeCollection !== 'all'
              ? `${filtered.length} of ${items.length}`
              : canUnlimited
                ? items.length
                : `${items.length} of ${bookmarkCap}`}
          </h1>
          {/* T-088: proactive cap counter — appears at 50%+ for free users.
              Neutral gray at 5+, amber at 7+, red at 9+. Separate from the
              full-cap banner below; provides urgency color without blocking UI. */}
          {nearCap && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  capCounterTone === 'danger'
                    ? '#dc2626'
                    : capCounterTone === 'amber'
                      ? '#b45309'
                      : '#666',
              }}
            >
              {items.length} / {bookmarkCap} bookmarks
            </span>
          )}
          {(canExport || canCollections) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {canExport && (
                <button onClick={exportAll} style={btnGhost}>
                  Download my bookmarks
                </button>
              )}
              {canCollections && (
                <button onClick={() => setShowNewCollection(true)} style={btnSolid}>
                  New collection
                </button>
              )}
            </div>
          )}
        </div>

        {atCap && (
          // T-044 / T144: LockedFeatureCTA renders the cap nudge as a
          // benefit-unlock (headline "Upgrade to unlock", neutral card
          // styling, single CTA into billing). The "X of Y" count is
          // already in the page header, so this strip carries only the
          // unlocked-on-upgrade benefits — no punishment framing, no
          // duplicated counter. Copy lists the four concrete things
          // paid plans add to bookmarks specifically; intentionally
          // avoids generic "sync across devices" claims since free
          // accounts already sync across devices.
          <LockedFeatureCTA
            gateType="plan"
            lockMessage="Upgrade to save unlimited articles, organize them into collections, add private notes, and export them anytime."
            style={{ marginBottom: 12 }}
          />
        )}
        {error && (
          <ErrorState inline message={error} onRetry={() => load()} style={{ marginBottom: 16 }} />
        )}

        {showNewCollection && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="Collection name…"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #e5e5e5',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button onClick={createCollection} style={btnSolid}>
              Create
            </button>
            <button onClick={() => setShowNewCollection(false)} style={btnGhost}>
              Cancel
            </button>
          </div>
        )}

        {canCollections && collections.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { id: 'all', name: `All (${items.length})` } as CollectionRow,
              { id: 'uncategorised', name: 'Uncategorised' } as CollectionRow,
              ...collections,
            ].map((c) => {
              const active = activeCollection === c.id;
              const countSuffix =
                c.bookmark_count != null && c.id !== 'all' && c.id !== 'uncategorised'
                  ? ` (${c.bookmark_count})`
                  : '';
              return (
                <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setActiveCollection(c.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: active ? 'none' : '1px solid #e5e5e5',
                      background: active ? '#111' : '#f7f7f7',
                      color: active ? '#fff' : '#666',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: 36,
                    }}
                  >
                    {c.name}
                    {countSuffix}
                  </button>
                  {c.id !== 'all' && c.id !== 'uncategorised' && (
                    <button
                      type="button"
                      onClick={() => requestDeleteCollection(c)}
                      aria-label={`Delete collection ${c.name}`}
                      title="Delete collection"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        fontSize: 12,
                        cursor: 'pointer',
                        minHeight: 44,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((b) => (
            <div
              key={b.id}
              style={{
                background: '#f7f7f7',
                border: '1px solid #e5e5e5',
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>
                <Link
                  href={b.articles?.slug ? `/story/${b.articles.slug}` : '#'}
                  prefetch={false}
                  style={{ color: '#111', textDecoration: 'none' }}
                >
                  {b.articles?.title || 'Untitled'}
                </Link>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {b.articles?.categories?.name && (
                    <span style={{ fontSize: 12, fontWeight: 600 }}>
                      {stripKidsTag(b.articles.categories.name)}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#666' }}>
                    Saved {formatDate(b.created_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {canCollections && (
                    <select
                      value={b.collection_id || ''}
                      onChange={(e) => moveToCollection(b.id, e.target.value || null)}
                      style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #e5e5e5',
                        background: '#fff',
                      }}
                    >
                      <option value="">Uncategorised</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => removeBookmark(b)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 12,
                      color: '#dc2626',
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: 44,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {canNote &&
                (editingNotes === b.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={2}
                      style={{
                        flex: 1,
                        padding: 8,
                        borderRadius: 6,
                        border: '1px solid #e5e5e5',
                        fontSize: 13,
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={() => saveNotes(b.id)} style={btnSolid}>
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingNotes(null);
                        setNoteDraft('');
                      }}
                      style={btnGhost}
                    >
                      Cancel
                    </button>
                  </div>
                ) : b.notes ? (
                  <div
                    onClick={() => {
                      setEditingNotes(b.id);
                      setNoteDraft(b.notes || '');
                    }}
                    style={{
                      fontSize: 12,
                      color: '#444',
                      background: '#fff',
                      padding: 8,
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: '1px solid #e5e5e5',
                    }}
                  >
                    {b.notes}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingNotes(b.id);
                      setNoteDraft('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 11,
                      color: '#666',
                      cursor: 'pointer',
                      padding: 0,
                      fontStyle: 'italic',
                      minHeight: 44,
                    }}
                  >
                    + Add note
                  </button>
                ))}
            </div>
          ))}
          {filtered.length === 0 && (
            // T-041: replaced inline empty-state div with shared EmptyState component.
            <EmptyState
              headline="No bookmarks yet"
              body="Save articles here. Tap the bookmark icon on any story to come back later."
              cta={{ label: 'Browse articles', href: '/browse' }}
            />
          )}
          {/* Load more — keyset cursor on created_at desc. Only shown
              when the last fetch returned a full page (hasMore). Hidden
              when a collection filter is active because the cursor
              operates on the unfiltered timeline; mixing cursor
              advance with client-side filter would yield gaps. */}
          {hasMore && activeCollection === 'all' && items.length > 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0 0' }}>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  padding: '10px 20px',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: loadingMore ? 'default' : 'pointer',
                  opacity: loadingMore ? 0.6 : 1,
                }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete collection?"
        message={
          pendingDelete
            ? `Bookmarks inside "${pendingDelete.name}" become uncategorised. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDeleteCollection}
        onClose={() => !deleteBusy && setPendingDelete(null)}
      />
    </main>
  );
}

const btnSolid: CSSProperties = {
  padding: '8px 14px',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: 36,
};
const btnGhost: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: '#111',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 36,
};
