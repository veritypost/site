'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import QuizPoolEditor from '@/components/QuizPoolEditor';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C } from '@/lib/adminPalette';
const C = { ...ADMIN_C, now: '#c2410c', nowBg: '#fff3e0' };

const CATEGORIES = ['Politics', 'Technology', 'Business', 'Science', 'Health', 'World', 'Environment'];
const SUBCATEGORIES = { Politics: ['Congress', 'Supreme Court', 'White House', 'Elections'], Technology: ['AI', 'Social Media', 'Cybersecurity'], Business: ['Markets', 'Economy', 'Startups'] };


const EMPTY_STORY = {
  title: '', slug: '', summary: '', status: 'draft',
  category: 'Politics', category_id: null, subcategory: '', is_breaking: false, is_developing: false,
  sources: [],
};

export default function StoryEditorAdmin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState(EMPTY_STORY);
  const [entries, setEntries] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [storyId, setStoryId] = useState(null); // Supabase story id
  const [expandedEntry, setExpandedEntry] = useState(null);
  const [viewMode, setViewMode] = useState('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [showSources, setShowSources] = useState(true);

  // For story list / selector
  const [storyList, setStoryList] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [destructive, setDestructive] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!profile || !['owner', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      // Load story list
      const { data: stories } = await supabase
        .from('articles')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });

      setStoryList(stories || []);
      setLoading(false);

      // Admin stories list can deep-link in with ?article=<id> — auto-load
      // the article when present so Edit round-trips to the right row.
      const requestedId = searchParams?.get('article');
      if (requestedId) loadStory(requestedId);
    }
    init();
  }, []);

  const loadStory = async (id) => {
    setLoading(true);
    const { data: storyData } = await supabase
      .from('articles')
      .select('*, categories(name, slug)')
      .eq('id', id)
      .single();

    if (storyData) {
      // Load sources from source_links
      const { data: sourceData } = await supabase
        .from('sources')
        .select('*')
        .eq('article_id', id);

      setStory({
        title: storyData.title || '',
        slug: storyData.slug || '',
        summary: storyData.excerpt || '',
        status: storyData.status || 'draft',
        category: storyData.categories?.name || 'Politics',
        category_id: storyData.category_id || null,
        subcategory: storyData.subcategory_id || '',
        is_breaking: storyData.is_breaking || false,
        is_developing: false || false,
        created_at: storyData.created_at || '',
        sources: (sourceData || []).map(s => ({
          id: s.id, outlet: s.publisher, url: s.url, headline: s.title || '',
        })),
      });
      setStoryId(id);

      // Load timeline events
      const { data: eventData } = await supabase
        .from('timelines')
        .select('*')
        .eq('article_id', id)
        .order('event_date', { ascending: true });

      const loadedEntries = (eventData || []).map(e => ({
        id: e.id,
        event_date: e.date,
        is_current: e.is_current,
        type: e.type || (e.content ? 'story' : 'event'),
        title: e.text,
        summary: e.summary || '',
        content: e.content || '',
        timeline_date: e.date,
        timeline_headline: e.text,
        comment_count: 0,
      }));
      setEntries(loadedEntries);

      // Load quizzes (jsonb questions array)
      const { data: quizData } = await supabase
        .from('quizzes')
        .select('*')
        .eq('article_id', id);

      const loadedQuizzes = [];
      (quizData || []).forEach(quiz => {
        (quiz.questions || []).forEach((q, i) => {
          loadedQuizzes.push({
            id: `${quiz.id}_${i}`,
            entry_id: q.entry_id || loadedEntries.find(e => e.type === 'story')?.id || null,
            question: q.question || '',
            options: q.options || ['', '', '', ''],
            correct: q.correct ?? 0,
            _isNew: false,
          });
        });
      });
      setQuizzes(loadedQuizzes);

      const current = loadedEntries.find(e => e.is_current);
      if (current) setExpandedEntry(current.id);
      else if (loadedEntries.length > 0) setExpandedEntry(loadedEntries[loadedEntries.length - 1].id);
    }

    setIsDirty(false);
    setShowPicker(false);
    setLoading(false);
  };

  const newStory = () => {
    setStory(EMPTY_STORY);
    setStoryId(null);
    setEntries([]);
    setQuizzes([]);
    setExpandedEntry(null);
    setIsDirty(false);
    setShowPicker(false);
  };

  const updateStory = (key, val) => { setStory(prev => ({ ...prev, [key]: val })); setIsDirty(true); };
  const updateEntry = (id, key, val) => { setEntries(prev => prev.map(e => e.id === id ? { ...e, [key]: val } : e)); setIsDirty(true); };
  const updateQuiz = (id, key, val) => { setQuizzes(prev => prev.map(q => q.id === id ? { ...q, [key]: val } : q)); setIsDirty(true); };
  const updateQuizOption = (id, idx, val) => { setQuizzes(prev => prev.map(q => q.id === id ? { ...q, options: q.options.map((o, i) => i === idx ? val : o) } : q)); setIsDirty(true); };

  const markCurrent = (id) => { setEntries(prev => prev.map(e => ({ ...e, is_current: e.id === id }))); setIsDirty(true); };

  const addStory = () => {
    const id = 'new_' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    setEntries(prev => [...prev, { id, event_date: today, is_current: false, type: 'story', title: '', summary: '', content: '', timeline_date: today, timeline_headline: '', comment_count: 0, _isNew: true }]);
    // Auto-add 1 source
    const sourceId = 'new_s_' + Date.now();
    setStory(prev => ({ ...prev, sources: [...(prev.sources || []), { id: sourceId, outlet: '', url: '', headline: '' }] }));
    // Auto-add 1 MC quiz
    const quizId = 'new_q_' + Date.now();
    setQuizzes(prev => [...prev, { id: quizId, entry_id: id, question: '', options: ['', '', '', ''], correct: 0, _isNew: true }]);
    setExpandedEntry(id);
    setIsDirty(true);
  };

  const addEvent = () => {
    const id = 'new_' + Date.now();
    setEntries(prev => [...prev, { id, event_date: new Date().toISOString().split('T')[0], is_current: false, type: 'event', title: '', summary: '', content: '', comment_count: 0, _isNew: true }]);
    setExpandedEntry(id);
    setIsDirty(true);
  };

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    setQuizzes(prev => prev.filter(q => q.entry_id !== id));
    setIsDirty(true);
  };

  const addQuiz = (entryId) => {
    const id = 'new_q_' + Date.now();
    setQuizzes(prev => [...prev, { id, entry_id: entryId, question: '', options: ['', '', '', ''], correct: 0, _isNew: true }]);
    setIsDirty(true);
  };

  const deleteQuiz = (id) => { setQuizzes(prev => prev.filter(q => q.id !== id)); setIsDirty(true); };

  const addSource = () => {
    const id = 'new_s_' + Date.now();
    setStory(prev => ({ ...prev, sources: [...(prev.sources || []), { id, outlet: '', url: '', headline: '' }] }));
    setIsDirty(true);
  };

  const updateSource = (id, key, val) => {
    setStory(prev => ({ ...prev, sources: prev.sources.map(s => s.id === id ? { ...s, [key]: val } : s) }));
    setIsDirty(true);
  };

  const deleteSource = (id) => {
    setStory(prev => ({ ...prev, sources: prev.sources.filter(s => s.id !== id) }));
    setIsDirty(true);
  };

  const saveAll = async () => {
    let savedStoryId = storyId;
    const { data: { user } } = await supabase.auth.getUser();

    // Look up category_id by name if needed
    let categoryId = story.category_id;
    if (!categoryId && story.category) {
      const { data: catData } = await supabase
        .from('categories')
        .select('id')
        .eq('name', story.category)
        .single();
      if (catData) categoryId = catData.id;
    }

    // Build slug if empty
    const slug = story.slug || story.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();

    // Upsert story
    const storyPayload = {
      title: story.title,
      slug,
      excerpt: story.summary || story.excerpt || '',
      body: story.content || story.body || '',
      status: story.status,
      category_id: categoryId,
      is_breaking: story.is_breaking || false,
    };

    if (storyId) {
      storyPayload.updated_at = new Date().toISOString();
      await supabase.from('articles').update(storyPayload).eq('id', storyId);
    } else {
      storyPayload.author_id = user?.id;
      const { data } = await supabase.from('articles').insert(storyPayload).select().single();
      if (data) { savedStoryId = data.id; setStoryId(data.id); }
    }

    if (!savedStoryId) return;

    // Save timeline events
    for (const entry of entries) {
      const eventPayload = {
        article_id: savedStoryId,
        event_date: entry.type === 'story' ? (entry.timeline_date || entry.event_date) : entry.event_date,
        event_label: entry.type === 'story' ? (entry.timeline_headline || entry.title) : entry.title,
        event_body: entry.summary || entry.event_body || null,
        sort_order: entry.sort_order || 0,
      };
      if (entry._isNew) {
        const { data: newEvent } = await supabase.from('timelines').insert(eventPayload).select().single();
        if (newEvent) {
          setQuizzes(prev => prev.map(q => q.entry_id === entry.id ? { ...q, entry_id: newEvent.id } : q));
          setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, id: newEvent.id, _isNew: false } : e));
        }
      } else {
        await supabase.from('timelines').update(eventPayload).eq('id', entry.id);
      }
    }

    // Save sources to source_links (delete + re-insert)
    await supabase.from('sources').delete().eq('article_id', savedStoryId);
    const sourcesToInsert = (story.sources || []).filter(s => s.outlet || s.url || s.headline).map((s, i) => ({
      article_id: savedStoryId,
      publisher: s.outlet || s.publisher || '',
      url: s.url || '',
      title: s.headline || '',
      sort_order: i,
    }));
    if (sourcesToInsert.length > 0) {
      await supabase.from('sources').insert(sourcesToInsert);
    }

    // Quiz saves moved to the dedicated per-article pool editor at
    // /admin/stories/[id]/quiz. v2 stores one row per question, not a
    // jsonb blob on a single row, so the legacy logic here is disabled
    // to avoid corrupting the pool. The inline UI below is now read-only.

    // Update story content from current story entry
    const currentEntry = entries.find(e => e.is_current && e.type === 'story') || entries.filter(e => e.type === 'story').pop();
    if (currentEntry) {
      await supabase.from('articles').update({
        title: currentEntry.title || story.title,
        excerpt: currentEntry.summary || story.summary,
        body: currentEntry.content || '',
      }).eq('id', savedStoryId);
    }

    setIsDirty(false);
    const { data: stories } = await supabase
      .from('articles')
      .select('*, categories(name)')
      .order('created_at', { ascending: false });
    setStoryList(stories || []);
  };

  const publishStory = async () => {
    updateStory('status', 'published');
    await saveAll();
  };

  const deleteStory = () => {
    if (!storyId) return;
    const titleRaw = story.title || 'Untitled';
    const titleShort = titleRaw.length > 40 ? titleRaw.slice(0, 40) : titleRaw;
    setDestructive({
      title: `Delete article "${titleShort}"?`,
      message: 'This removes the article and every row keyed to it (timelines, sources, quiz pool). This is irreversible.',
      confirmText: titleShort,
      confirmLabel: 'Delete article',
      reasonRequired: false,
      action: 'article.delete',
      targetTable: 'articles',
      targetId: storyId,
      oldValue: {
        id: storyId,
        title: story.title,
        slug: story.slug,
        status: story.status,
      },
      newValue: null,
      run: async () => {
        const { error } = await supabase.from('articles').delete().eq('id', storyId);
        if (error) throw new Error(error.message);
        newStory();
        const { data: stories } = await supabase
          .from('articles')
          .select('*, categories(name)')
          .order('created_at', { ascending: false });
        setStoryList(stories || []);
      },
    });
  };

  const currentEntry = entries.find(e => e.is_current) || entries[entries.length - 1];
  const sortedEntries = [...entries].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  const storiesCount = entries.filter(e => e.content?.trim()).length;
  const eventsCount = entries.filter(e => !e.content?.trim()).length;

  const fieldStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.dim, marginBottom: 6 };

  // ── PREVIEW MODE ──
  if (viewMode === 'preview') {
    const e = currentEntry;
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.card, borderBottom: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: C.accent + '22', color: C.accent, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview</span>
          <button onClick={() => setViewMode('edit')} style={{ fontSize: 11, fontWeight: 600, color: C.dim, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Close Preview</button>
        </div>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 20px' }}>
          {e?.is_current && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: C.nowBg, color: C.now, textTransform: 'uppercase', letterSpacing: '0.1em', border: `1px solid ${C.now}30` }}>Now</span>
              <span style={{ fontSize: 12, color: C.dim }}>{e.event_date}</span>
            </div>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3, marginBottom: 16, letterSpacing: '-0.02em' }}>{e?.title || 'Untitled'}</h1>
          {e?.summary && <p style={{ fontSize: 15, color: C.soft, lineHeight: 1.7, marginBottom: 24, borderLeft: `3px solid ${C.accent}30`, paddingLeft: 16, fontStyle: 'italic' }}>{e.summary}</p>}
          {e?.content && <div style={{ fontSize: 15, color: C.white, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{e.content}</div>}
          {(story.sources || []).length > 0 && (
            <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.dim, marginBottom: 12 }}>Sources</div>
              {story.sources.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, minWidth: 60 }}>{s.outlet}</span>
                  <span style={{ fontSize: 13, color: C.soft, flex: 1, lineHeight: 1.4 }}>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── TIMELINE MODE ──
  if (viewMode === 'timeline') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.card, borderBottom: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.soft }}>Timeline Preview</span>
          <button onClick={() => setViewMode('edit')} style={{ fontSize: 11, fontWeight: 600, color: C.dim, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>Close</button>
        </div>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 20px 80px', position: 'relative', paddingLeft: 52 }}>
          <div style={{ position: 'absolute', left: 28, top: 40, bottom: 80, width: 2, background: C.border, borderRadius: 1 }} />
          {sortedEntries.map((e) => {
            const hasContent = !!e.content?.trim();
            return (
              <div key={e.id} style={{ position: 'relative', marginBottom: 32 }}>
                <div style={{
                  position: 'absolute', left: -24, top: 5,
                  width: e.is_current ? 14 : 10, height: e.is_current ? 14 : 10,
                  borderRadius: '50%',
                  background: e.is_current ? C.now : hasContent ? C.success : C.muted,
                  border: `3px solid ${C.bg}`,
                  boxShadow: e.is_current ? `0 0 0 4px ${C.now}25` : 'none',
                }} />
                {e.is_current && (
                  <span style={{ position: 'absolute', left: -80, top: 2, fontSize: 9, fontWeight: 700, color: C.now, background: C.nowBg, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>NOW</span>
                )}
                <div style={{ fontSize: 11, fontWeight: e.is_current ? 700 : 500, color: e.is_current ? C.now : C.dim, marginBottom: 4 }}>{e.event_date}</div>
                <div style={{ fontSize: 14, fontWeight: e.is_current ? 600 : hasContent ? 500 : 400, color: e.is_current ? C.white : hasContent ? C.soft : C.dim, lineHeight: 1.5 }}>
                  {e.title || 'Untitled'}
                  {hasContent && !e.is_current && <span style={{ color: C.success, marginLeft: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>link</span>}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            {[{ color: C.now, l: 'Now' }, { color: C.success, l: 'Has article' }, { color: C.muted, l: 'Event only' }].map(x => (
              <span key={x.l} style={{ fontSize: 11, color: C.dim, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: x.color }} />{x.l}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── EDIT MODE ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: `${C.card}ee`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
            <button onClick={() => setShowPicker(!showPicker)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.dim, cursor: 'pointer' }}>
              {showPicker ? 'Close' : 'Open Article'}
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {story.title || 'New Story'}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: story.status === 'published' ? C.success + '22' : C.muted + '22', color: story.status === 'published' ? C.success : C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {story.status}
            </span>
            {isDirty && <span style={{ fontSize: 10, color: C.danger, fontWeight: 600 }}>unsaved</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setViewMode('timeline')} style={{ fontSize: 11, fontWeight: 500, padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.dim, cursor: 'pointer' }}>Timeline</button>
            <button onClick={() => setViewMode('preview')} style={{ fontSize: 11, fontWeight: 500, padding: '7px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.dim, cursor: 'pointer' }}>Preview</button>
            <button onClick={saveAll} style={{ fontSize: 11, fontWeight: 700, padding: '7px 14px', borderRadius: 7, border: 'none', background: C.white, color: C.bg, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      </div>

      {/* Story picker dropdown */}
      {showPicker && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '12px 20px', background: C.card, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={newStory} style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer' }}>+ New Article</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {storyList.map(s => (
              <button key={s.id} onClick={() => loadStory(s.id)} style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: `1px solid ${s.id === storyId ? C.accent : C.border}`,
                background: s.id === storyId ? C.accent + '10' : 'transparent', cursor: 'pointer',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.white }}>{s.title || 'Untitled'}</div>
                <div style={{ fontSize: 10, color: C.dim }}>{s.categories?.name || s.category} | {s.status} | {s.created_at?.split('T')[0]}</div>
              </button>
            ))}
            {storyList.length === 0 && <div style={{ color: C.dim, fontSize: 12, padding: 8 }}>No articles yet</div>}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 20px 80px' }}>

        {/* AI + Publish controls */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={async () => {
            try {
              const res = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, type: 'story' }) });
              if (res.status === 503) alert('AI API key not configured. Add OPENAI_API_KEY to .env.local');
              else if (!res.ok) alert('AI generation failed');
              else alert('AI content generated — reload to see changes');
            } catch { alert('AI API key not configured'); }
          }} style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', cursor: 'pointer' }}>
            AI Generate
          </button>
          <button onClick={async () => {
            try {
              const res = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, type: 'timeline' }) });
              if (res.status === 503) alert('AI API key not configured');
              else if (!res.ok) alert('Timeline enrichment failed');
              else alert('Timeline enriched — reload to see changes');
            } catch { alert('AI API key not configured'); }
          }} style={{ fontSize: 11, fontWeight: 500, padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.soft, cursor: 'pointer' }}>
            Enrich Timeline
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={publishStory} style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 7, border: 'none', background: C.success, color: '#fff', cursor: 'pointer' }}>
            {story.status === 'published' ? 'Update & Publish' : 'Publish'}
          </button>
          <button onClick={deleteStory} style={{ fontSize: 11, fontWeight: 500, padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, cursor: 'pointer' }}>
            Delete
          </button>
        </div>

        {/* Story metadata */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label style={labelStyle}>Category</label>
              <select value={story.category} onChange={e => updateStory('category', e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label style={labelStyle}>Subcategory</label>
              <select value={story.subcategory} onChange={e => updateStory('subcategory', e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
                <option value="">Select...</option>
                {(SUBCATEGORIES[story.category] || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Slug</label>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace', padding: '10px 0 10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRight: 'none', borderRadius: '8px 0 0 8px' }}>/stories/</span>
              <input value={story.slug} onChange={e => updateStory('slug', e.target.value)} style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 13, borderRadius: '0 8px 8px 0', flex: 1 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            {[
              { key: 'is_breaking', label: 'breaking', color: C.danger },
              { key: 'is_developing', label: 'developing', color: C.warn },
            ].map(t => (
              <button key={t.key} onClick={() => updateStory(t.key, !story[t.key])} style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: story[t.key] ? 700 : 500, cursor: 'pointer',
                border: `1px solid ${story[t.key] ? t.color : C.border}`,
                background: story[t.key] ? t.color + '15' : 'transparent',
                color: story[t.key] ? t.color : C.muted,
              }}>
                {t.label}{story[t.key] ? ' (on)' : ''}
              </button>
            ))}
            {story.author && <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto', alignSelf: 'center' }}>by {story.author} | {story.created_at?.split('T')[0]}</span>}
          </div>
        </div>

        {/* Add buttons + count */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <button onClick={addStory} style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 7, border: 'none', background: C.white, color: C.bg, cursor: 'pointer' }}>+ Add Article</button>
          <button onClick={addEvent} style={{ fontSize: 11, fontWeight: 500, padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.soft, cursor: 'pointer' }}>+ Add Event</button>
          <span style={{ fontSize: 11, color: C.dim, marginLeft: 4 }}>{storiesCount} articles, {eventsCount} events</span>
        </div>

        {/* Timeline entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedEntries.map(entry => {
            const isExpanded = expandedEntry === entry.id;
            const hasContent = !!entry.content?.trim();
            const entryQuizzes = quizzes.filter(q => q.entry_id === entry.id);
            const dots = [!!entry.title?.trim(), !!entry.content?.trim(), !!entry.summary?.trim(), !!entry.event_date];
            const doneCount = dots.filter(Boolean).length;

            return (
              <div key={entry.id} style={{ background: C.card, border: `1px solid ${entry.is_current ? C.now : C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div onClick={() => setExpandedEntry(isExpanded ? null : entry.id)} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', gap: 8, borderBottom: isExpanded ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: entry.is_current ? C.nowBg : hasContent ? C.accent + '15' : C.muted + '15', color: entry.is_current ? C.now : hasContent ? C.accent : C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {hasContent ? 'Story' : 'Event'}
                  </span>
                  {entry.is_current && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: C.nowBg, color: C.now, textTransform: 'uppercase' }}>NOW</span>}
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.white, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.title || 'Untitled'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      {dots.map((d, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: d ? C.success : C.border }} />)}
                      <span style={{ fontSize: 10, color: C.muted, marginLeft: 3 }}>{doneCount}/4</span>
                    </div>
                    {hasContent && <span style={{ fontSize: 10, color: C.dim }}>{entryQuizzes.length}Q</span>}
                    {hasContent && <span style={{ fontSize: 10, color: C.dim }}>{entry.comment_count || 0}C</span>}
                  </div>
                  <span style={{ fontSize: 12, color: C.muted }}>{isExpanded ? 'Hide' : 'Show'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '16px 14px 20px' }}>
                    {entry.type === 'event' ? (
                      /* ── EVENT: just timeline date + headline ── */
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: '0 0 auto', width: 150 }}>
                          <label style={labelStyle}>Timeline Date</label>
                          <input type="date" value={entry.event_date || ''} onChange={e => updateEntry(entry.id, 'event_date', e.target.value)} style={fieldStyle} />
                        </div>
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <label style={labelStyle}>Timeline Headline</label>
                          <input
                            value={entry.title || ''}
                            onChange={e => updateEntry(entry.id, 'title', e.target.value)}
                            placeholder="What happened on the timeline?"
                            style={{ ...fieldStyle, fontSize: 14, fontWeight: 600 }}
                          />
                        </div>
                      </div>
                    ) : (
                      /* ── STORY: full article + timeline fields ── */
                      <>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            <label style={labelStyle}>Headline</label>
                            <input
                              value={entry.title || ''}
                              onChange={e => updateEntry(entry.id, 'title', e.target.value)}
                              placeholder="What happened?"
                              style={{ ...fieldStyle, fontSize: 16, fontWeight: 600 }}
                            />
                          </div>
                          <div style={{ flex: '0 0 auto', width: 150 }}>
                            <label style={labelStyle}>Article Date</label>
                            <input type="date" value={entry.event_date || ''} onChange={e => updateEntry(entry.id, 'event_date', e.target.value)} style={fieldStyle} />
                          </div>
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <label style={labelStyle}>Summary</label>
                          <textarea value={entry.summary || ''} onChange={e => updateEntry(entry.id, 'summary', e.target.value)} placeholder="Brief summary..." rows={2} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.6 }} />
                        </div>
                        <div style={{ marginTop: 14 }}>
                          <label style={labelStyle}>Article Body</label>
                          <textarea value={entry.content || ''} onChange={e => updateEntry(entry.id, 'content', e.target.value)} placeholder="Write the full article..." rows={8} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.7 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                          <div style={{ flex: '0 0 auto', width: 150 }}>
                            <label style={labelStyle}>Timeline Date</label>
                            <input type="date" value={entry.timeline_date || entry.event_date || ''} onChange={e => updateEntry(entry.id, 'timeline_date', e.target.value)} style={fieldStyle} />
                          </div>
                          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            <label style={labelStyle}>Timeline Headline</label>
                            <input
                              value={entry.timeline_headline || ''}
                              onChange={e => updateEntry(entry.id, 'timeline_headline', e.target.value)}
                              placeholder="Short headline for the timeline"
                              style={{ ...fieldStyle, fontSize: 14 }}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => markCurrent(entry.id)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: entry.is_current ? 700 : 500, cursor: 'pointer',
                        border: `1px solid ${entry.is_current ? C.now : C.border}`,
                        background: entry.is_current ? C.now + '15' : 'transparent',
                        color: entry.is_current ? C.now : C.muted,
                      }}>now</button>
                      {entry.type === 'event' && (
                        <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>Events appear on timeline only — no link, no quiz, no comments</span>
                      )}
                      <div style={{ flex: 1 }} />
                      <button onClick={() => { if (confirm('Delete this entry?')) deleteEntry(entry.id); }} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, cursor: 'pointer' }}>Delete</button>
                    </div>

                    {/* Sources inside story card */}
                    {entry.type === 'story' && <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.soft, letterSpacing: '0.04em' }}>Sources ({(story.sources || []).length})</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                        {(story.sources || []).map(s => (
                          <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                            <input value={s.outlet} onChange={e => updateSource(s.id, 'outlet', e.target.value)} placeholder="Outlet" style={{ ...fieldStyle, width: 90, flex: '0 0 auto' }} />
                            <input value={s.url} onChange={e => updateSource(s.id, 'url', e.target.value)} placeholder="https://..." style={{ ...fieldStyle, fontFamily: 'monospace', fontSize: 12, width: 140, flex: '0 0 auto' }} />
                            <input value={s.headline} onChange={e => updateSource(s.id, 'headline', e.target.value)} placeholder="Original headline" style={{ ...fieldStyle, flex: 1 }} />
                            <button onClick={() => deleteSource(s.id)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}>Remove</button>
                          </div>
                        ))}
                        {(
                          <button onClick={addSource} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1.5px dashed ${C.border}`, background: 'none', color: C.dim, fontSize: 11, cursor: 'pointer' }}>+ Add Source</button>
                        )}
                      </div>
                    </div>}

                    {entry.type === 'story' && <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, letterSpacing: '0.04em', marginBottom: 8 }}>Quiz</div>
                      {story.id ? (
                        <QuizPoolEditor articleId={story.id} compact />
                      ) : (
                        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
                          Save the article first to start building its quiz pool (10–15 questions per D1).
                        </div>
                      )}
                    </div>}
                  </div>
                )}
              </div>
            );
          })}
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
          catch (err) { alert(err?.message || 'Action failed'); setDestructive(null); }
        }}
      />
    </div>
  );
}
