'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

// ─── STYLES ─────────────────────────────────────────────────────────────────
const STATUS_STYLES = {
  none:      { bg: 'transparent', color: '#666666', label: '\u2014' },
  draft:     { bg: 'transparent', color: '#666666', label: 'Draft' },
  published: { bg: '#22c55e22', color: '#22c55e', label: 'Published' },
  updated:   { bg: '#22c55e22', color: '#22c55e', label: 'Updated' },
  scheduled: { bg: '#f59e0b22', color: '#f59e0b', label: 'Scheduled' },
};

function Badge({ bg, color, children }) {
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', background: bg, color, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{children}</span>;
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return 'scheduled';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── AUDIENCE ROW ───────────────────────────────────────────────────────────
function AudienceRow({ audience, status, slug, category, subcategory, onAction, isLast }) {
  const ac = audience === 'adult' ? { bg: '#111111', color: '#ffffff' } : { bg: '#2563eb', color: '#fff' };
  const ss = STATUS_STYLES[status] || STATUS_STYLES.none;

  const btnS = { padding: '4px 10px', fontSize: 11, borderRadius: 8, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' };
  const btnDefault = { ...btnS, background: 'none', color: '#111111', border: '1px solid #222222' };
  const btnGhost = { ...btnS, background: '#f7f7f7', color: '#666666', border: '1px solid #222222' };
  const btnPrimary = { ...btnS, background: audience === 'adult' ? '#111111' : '#2563eb', color: audience === 'adult' ? '#ffffff' : '#fff', border: 'none', fontWeight: 600 };
  const btnDanger = { ...btnS, background: 'none', color: '#ef4444', border: '1px solid #ef444433' };

  const actions = () => {
    if (status === 'none') return <button onClick={() => onAction('create')} style={btnPrimary}>Create {audience === 'adult' ? 'Adult' : 'Kids'} Draft</button>;
    if (status === 'draft') return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onAction('edit')} style={btnDefault}>Edit</button>
        {slug && <button onClick={() => onAction('view')} style={btnGhost}>View</button>}
        <button onClick={() => onAction('publish')} style={btnPrimary}>Publish</button>
        <button onClick={() => onAction('delete')} style={btnDanger}>Delete</button>
      </div>
    );
    if (status === 'published' || status === 'updated') return (
      <div style={{ display: 'flex', gap: 6 }}>
        {slug && <button onClick={() => onAction('view')} style={btnDefault}>View</button>}
        <button onClick={() => onAction('edit')} style={btnGhost}>Edit</button>
        <button onClick={() => onAction('unpublish')} style={btnGhost}>Unpublish</button>
        <button onClick={() => onAction('delete')} style={btnDanger}>Delete</button>
      </div>
    );
    if (status === 'scheduled') return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onAction('edit')} style={btnDefault}>Edit</button>
        <button onClick={() => onAction('unpublish')} style={btnGhost}>Unpublish</button>
        <button onClick={() => onAction('delete')} style={btnDanger}>Delete</button>
      </div>
    );
    return null;
  };

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid #222222',
      background: audience === 'kids' ? '#2563eb08' : '#f7f7f7',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Badge bg={ac.bg} color={ac.color}>{audience === 'adult' ? 'Adult' : 'Kids'}</Badge>
        <Badge bg={ss.bg} color={ss.color}>{ss.label}</Badge>
        <div style={{ flex: 1, minWidth: 20 }} />
        {actions()}
      </div>
      {status !== 'none' && (category || slug) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          {category && <span style={{ fontSize: 10, color: '#666666' }}>{category}</span>}
          {category && subcategory && <span style={{ fontSize: 10, color: '#222222' }}>|</span>}
          {subcategory && <span style={{ fontSize: 10, color: '#666666' }}>{subcategory}</span>}
          {slug && <span style={{ fontSize: 10, color: '#666666', fontFamily: 'monospace' }}>{audience === 'adult' ? `/stories/${slug}` : `/kids/stories/${slug}`}</span>}
        </div>
      )}
    </div>
  );
}

// ─── STORY CARD ─────────────────────────────────────────────────────────────
function StoryCard({ story, onAction }) {
  const adultStatus = story.status || 'draft';
  const kidsStatus = story.is_kids_safe ? (story.status || 'draft') : 'none';
  const categoryName = story.categories?.name || story.category || null;
  const authorName = story.users?.username || story.author || '?';

  const borderColor = () => {
    if (['published', 'updated'].includes(adultStatus) || ['published', 'updated'].includes(kidsStatus)) return '#22c55e';
    if (adultStatus === 'draft' || kidsStatus === 'draft') return '#666666';
    return '#222222';
  };

  return (
    <div style={{
      background: '#f7f7f7', border: '1px solid #222222', borderLeft: `3px solid ${borderColor()}`,
      borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #222222' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111111', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {story.title || 'Untitled'}
          </div>
          {story.is_breaking && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: '#ef444422', color: '#ef4444', textTransform: 'uppercase' }}>Breaking</span>}
          {story.is_pinned && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: '#f59e0b22', color: '#f59e0b', textTransform: 'uppercase' }}>Pinned</span>}
          <a href={`/admin/stories/${story.id}/quiz`} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#11111118', color: '#111111', textDecoration: 'none', textTransform: 'uppercase' }}>Quiz pool</a>
        </div>
        <div style={{ fontSize: 11, color: '#666666', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>{authorName}</span>
          <span>{story.source_count || 0} sources</span>
          <span>{story.view_count || 0} views</span>
          <span>{timeAgo(story.created_at)}</span>
        </div>
      </div>
      <AudienceRow audience="adult" status={adultStatus} category={categoryName} subcategory={story.subcategory} slug={story.slug} isLast={false}
        onAction={action => onAction(story, 'adult', action)} />
      <AudienceRow audience="kids" status={kidsStatus} category={kidsStatus !== 'none' ? categoryName : null} subcategory={kidsStatus !== 'none' ? story.subcategory : null} slug={kidsStatus !== 'none' ? story.slug : null} isLast={true}
        onAction={action => onAction(story, 'kids', action)} />
    </div>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
export default function StoriesAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [toast, setToast] = useState(null);
  const [destructive, setDestructive] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name?.toLowerCase()).filter(Boolean);
      const allowed = new Set(['owner', 'admin']);
      if (!profile || !roleNames.some((r) => allowed.has(r))) {
        router.push('/');
        return;
      }

      const [storiesRes, categoriesRes] = await Promise.all([
        supabase
          .from('articles')
          .select('*, categories(name), users!author_id(username)')
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('name').order('name'),
      ]);

      if (!storiesRes.error && storiesRes.data) setStories(storiesRes.data);
      if (!categoriesRes.error && categoriesRes.data) setCategories(categoriesRes.data.map(c => c.name));
      setLoading(false);
    };
    init();
  }, []);

  const input = { border: '1px solid #222222', background: '#ffffff', color: '#111111', outline: 'none', padding: '8px 12px', fontSize: 13, borderRadius: 6, boxSizing: 'border-box' };
  const btnS = { padding: '5px 12px', fontSize: 11, background: 'none', color: '#666666', border: '1px solid #222222', borderRadius: 6, cursor: 'pointer', fontWeight: 500 };
  const btnW = { padding: '5px 12px', fontSize: 11, background: '#111111', color: '#ffffff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
  const filterPill = (active) => ({
    fontSize: 11, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: active ? 600 : 400, border: 'none',
    background: active ? '#111111' : 'transparent', color: active ? '#ffffff' : '#666666', transition: 'all 0.15s',
  });

  const filtered = stories.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    const catName = s.categories?.name || s.category;
    if (categoryFilter !== 'all' && catName !== categoryFilter) return false;
    if (search.trim() && !s.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleAction = async (story, audience, action) => {
    if (action === 'edit') {
      const path = audience === 'kids'
        ? `/admin/kids-story-manager?article=${story.id}`
        : `/admin/story-manager?article=${story.id}`;
      router.push(path);
    } else if (action === 'view') {
      if (typeof window !== 'undefined') {
        window.open(`/story/${story.slug}`, '_blank', 'noopener,noreferrer');
      }
    } else if (action === 'publish') {
      const { error } = await supabase
        .from('articles')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', story.id);
      if (!error) {
        setStories(prev => prev.map(s => s.id === story.id ? { ...s, status: 'published', published_at: new Date().toISOString() } : s));
        showToast(`${audience === 'adult' ? 'Adult' : 'Kids'} version published!`);
      }
    } else if (action === 'unpublish') {
      const { error } = await supabase.from('articles').update({ status: 'draft' }).eq('id', story.id);
      if (!error) {
        setStories(prev => prev.map(s => s.id === story.id ? { ...s, status: 'draft' } : s));
        showToast(`${audience === 'adult' ? 'Adult' : 'Kids'} version unpublished.`);
      }
    } else if (action === 'delete') {
      // Pull impact counts to show in the confirm modal — readers and
      // comments anchor the decision. Best-effort: a failed count query
      // still lets the admin delete but the modal shows "?" for counts.
      let readerCount = '?';
      let commentCount = '?';
      try {
        const [{ count: rc }, { count: cc }] = await Promise.all([
          supabase.from('reading_log').select('id', { count: 'exact', head: true }).eq('article_id', story.id),
          supabase.from('comments').select('id', { count: 'exact', head: true }).eq('article_id', story.id),
        ]);
        readerCount = rc ?? '?';
        commentCount = cc ?? '?';
      } catch {}
      setDestructive({
        title: `Delete "${story.title}"?`,
        message: (
          <div>
            <div style={{ marginBottom: 8 }}>This removes the article and every row keyed to it. Cannot be undone.</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              Impact: <b style={{ color: '#fff' }}>{readerCount}</b> recorded reads · <b style={{ color: '#fff' }}>{commentCount}</b> comments.
            </div>
          </div>
        ),
        confirmText: 'delete',
        confirmLabel: 'Delete article',
        reasonRequired: true,
        action: 'article.delete',
        targetTable: 'articles',
        targetId: story.id,
        oldValue: { title: story.title, status: story.status, slug: story.slug },
        newValue: null,
        run: async () => {
          const { error } = await supabase.from('articles').delete().eq('id', story.id);
          if (error) throw new Error(error.message);
          setStories(prev => prev.filter(s => s.id !== story.id));
          showToast('Article deleted.');
        },
      });
    } else if (action === 'create') {
      if (audience === 'kids') {
        const { error } = await supabase.from('articles').update({ is_kids_safe: true }).eq('id', story.id);
        if (!error) {
          setStories(prev => prev.map(s => s.id === story.id ? { ...s, is_kids_safe: true } : s));
          showToast('Kids version enabled.');
        }
      }
    }
  };

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (categoryFilter !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#111111', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <a href="/admin" style={{ fontSize: 11, color: '#666666', textDecoration: 'none' }}>Back to hub</a>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0', letterSpacing: '-0.03em' }}>Articles</h1>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: '#111111', color: '#ffffff', padding: '10px 20px', borderRadius: 10,
            fontSize: 13, zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,.35)',
          }}>{toast}</div>
        )}

        {/* Top action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { showToast('Creating new article...'); }} style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 500, background: '#111111', color: '#ffffff', border: 'none', borderRadius: 8, cursor: 'pointer', textDecoration: 'none',
          }}>+ New Article</button>
          <button onClick={() => setShowFind(!showFind)} style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 500,
            background: showFind ? '#111111' : '#f7f7f7', color: showFind ? '#ffffff' : '#111111',
            border: '1px solid #222222', borderRadius: 8, cursor: 'pointer',
          }}>Find Articles</button>
          <button onClick={() => setShowFilters(!showFilters)} style={{
            padding: '8px 12px', fontSize: 12, fontWeight: 500, background: '#f7f7f7', color: '#111111',
            border: '1px solid #222222', borderRadius: 8, cursor: 'pointer',
          }}>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</button>
          <div style={{ flex: 1, minWidth: 0 }} />
          <span style={{ fontSize: 11, color: '#666666', whiteSpace: 'nowrap' }}>{filtered.length} article{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filters */}
        {showFilters && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: '#f7f7f7', border: '1px solid #222222', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 2, background: '#ffffff', borderRadius: 20, padding: 2, border: '1px solid #222222' }}>
              {['all', 'published', 'draft', 'scheduled', 'updated'].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={filterPill(statusFilter === s)}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12, border: '1px solid #222222', background: '#ffffff', color: '#111111', borderRadius: 6, outline: 'none' }}>
              <option value="all">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ flex: 1, position: 'relative', minWidth: 140 }}>
              <input type="text" placeholder="Filter by title..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, width: '100%' }} />
            </div>
          </div>
        )}

        {/* Find Stories Panel */}
        {showFind && (
          <div style={{ background: '#f7f7f7', border: '1px solid #222222', borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111111' }}>Find New Articles</span>
                <span style={{ fontSize: 11, color: '#666666' }}>$0.003</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnS}>Clear</button>
                <button style={{ ...btnW }}>Scan New</button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#666666', padding: '20px 0', textAlign: 'center' }}>
              No clusters found. Click Scan New to search for stories.
            </div>
          </div>
        )}

        {/* Story list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(story => (
            <StoryCard key={story.id} story={story} onAction={handleAction} />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#666666', fontSize: 13 }}>
              {search.trim() ? `No stories matching "${search}"` : 'No stories found.'}
            </div>
          )}
        </div>
      </div>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { alert(err?.message || 'Action failed'); }
        }}
      />
    </div>
  );
}
