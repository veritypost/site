'use client';

/**
 * Reusable kids story editor — the full legacy
 * /admin/kids-story-manager surface, refactored as a component so
 * /<slug> (in editor mode) and /admin/kids-story-manager can both
 * mount it.
 *
 * Source: web/src/app/admin/kids-story-manager/page.tsx
 * (KidsStoryManagerInner). Behavior is preserved 1:1 except where
 * `embedded` is true:
 *   - Page / PageHeader / PageSection chrome is dropped.
 *   - The "Open article" picker (Drawer + storyList) is dropped.
 *   - The "+ New article" / `newStory()` flow is dropped.
 *   - router-driven URL changes are skipped; the host owns navigation
 *     via `onArticleChange(id, slug?)`.
 *
 * The save endpoint stays /api/admin/articles/save unchanged.
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { EDITOR_ROLES } from '@/lib/roles';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import DatePicker from '@/components/admin/DatePicker';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// Per-page accent override: kids experience uses a blue accent. `now`/`nowBg`
// are shared story-timeline tokens and live on ADMIN_C directly.
const C = { ...ADMIN_C, accent: '#2563eb' };

type KidsCategory = { id: string; name: string; slug: string | null; parent_id: string | null; sort_order: number | null };

type StorySource = { id: string; outlet: string; url: string; headline: string };
type StoryForm = {
  title: string;
  slug: string;
  summary: string;
  status: string;
  category: string;
  category_id: string | null;
  subcategory: string;
  is_breaking: boolean;
  is_developing: boolean;
  created_at?: string;
  author?: string;
  sources: StorySource[];
};

const EMPTY_STORY: StoryForm = {
  title: '',
  slug: '',
  summary: '',
  status: 'draft',
  category: '',
  category_id: null,
  subcategory: '',
  is_breaking: false,
  is_developing: false,
  sources: [],
};

type TimelineEntry = {
  id: string;
  event_date: string;
  is_current: boolean;
  type: 'story' | 'event';
  title: string;
  summary: string;
  content: string;
  timeline_date?: string;
  timeline_headline?: string;
  comment_count: number;
  sort_order?: number;
  _isNew?: boolean;
};

type QuizLocal = {
  id: string;
  entry_id: string | null;
  question: string;
  options: string[];
  correct: number;
  explanation?: string;
  _isNew?: boolean;
};

type DestructiveState = {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  run: (args: { reason: string }) => Promise<void>;
} | null;

type ArticleRow = Tables<'articles'> & { categories: { name: string | null; is_kids_safe?: boolean } | null };

export type KidsStoryEditorProps = {
  articleId: string | null;
  onArticleChange?: (id: string | null, slug?: string | null) => void;
  embedded?: boolean;
};

export default function KidsStoryEditor({ articleId, onArticleChange, embedded = false }: KidsStoryEditorProps) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState<StoryForm>(EMPTY_STORY);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [quizzes, setQuizzes] = useState<QuizLocal[]>([]);
  const [storyId, setStoryId] = useState<string | null>(null);
  // Tracks the slug as it was last loaded/saved so saveAll can detect a
  // true rename (loaded slug !== about-to-save slug). See StoryEditor for
  // the rationale; comparing against `story.slug` directly is dead code.
  const lastPersistedSlugRef = useRef<string>('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'timeline'>('edit');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [storyList, setStoryList] = useState<ArticleRow[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [categories, setCategories] = useState<KidsCategory[]>([]);
  const [subcategories, setSubcategories] = useState<Record<string, KidsCategory[]>>({});
  const [destructive, setDestructive] = useState<DestructiveState>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Embedded mode: server already gated on articles.edit. See
      // StoryEditor for the full rationale; same pattern here.
      if (!embedded) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/'); return; }

        const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
        const { data: userRoles } = await supabase
          .from('user_roles')
          .select('roles(name)')
          .eq('user_id', user.id);
        const roleNames = (userRoles || [])
          .map((r) => (r as { roles?: { name?: string | null } | null }).roles?.name)
          .filter((n): n is string => Boolean(n));
        if (!profile || !roleNames.some((r) => EDITOR_ROLES.has(r))) {
          router.push('/');
          return;
        }
      }

      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id, sort_order')
        .eq('is_kids_safe', true)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      const parents = ((cats as KidsCategory[] | null) || []).filter((c) => !c.parent_id);
      const subsByParentName: Record<string, KidsCategory[]> = {};
      ((cats as KidsCategory[] | null) || [])
        .filter((c) => c.parent_id)
        .forEach((c) => {
          const parent = parents.find((p) => p.id === c.parent_id);
          if (parent) {
            const key = parent.name;
            (subsByParentName[key] ||= []).push(c);
          }
        });
      setCategories(parents);
      setSubcategories(subsByParentName);

      // Picker list is only used by the legacy admin wrapper.
      if (!embedded) {
        // Kids Story Manager is scoped to age_band='kids' specifically.
        // Historical age_band='tweens' rows stay in the schema but the
        // pipeline no longer produces them pre-AR1 (S6-Cleanup-§D3).
        // NULL age_band rows surface here as legacy single-tier kid content.
        const { data: stories } = await supabase
          .from('articles')
          .select('*, categories!fk_articles_category_id!inner(name, is_kids_safe)')
          .eq('categories.is_kids_safe', true)
          .or('age_band.eq.kids,age_band.is.null')
          .order('created_at', { ascending: false })
          .limit(200);

        if (cancelled) return;
        setStoryList((stories as unknown as ArticleRow[]) || []);
      }

      if (articleId) {
        await loadStory(articleId);
      } else {
        setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load when the host swaps articleId without remounting. The init
  // effect handles first mount; this effect must skip its first run to
  // avoid a parallel double-fetch race that can clobber state.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current === false) { didMountRef.current = true; return; }
    if (articleId && articleId !== storyId) {
      loadStory(articleId);
    } else if (!articleId && storyId) {
      resetToEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  const resetToEmpty = () => {
    setStory(EMPTY_STORY);
    setStoryId(null);
    lastPersistedSlugRef.current = '';
    setEntries([]);
    setQuizzes([]);
    setExpandedEntry(null);
    setIsDirty(false);
    setShowPicker(false);
  };

  const loadStory = async (id: string) => {
    setLoading(true);
    const { data: storyData } = await supabase
      .from('articles')
      .select('*, categories!fk_articles_category_id(name, slug)')
      .eq('id', id)
      .single();

    if (storyData) {
      const { data: sourceData } = await supabase
        .from('sources')
        .select('*')
        .eq('article_id', id);

      const cast = storyData as unknown as ArticleRow;
      lastPersistedSlugRef.current = cast.slug || '';
      setStory({
        title: cast.title || '',
        slug: cast.slug || '',
        summary: cast.excerpt || '',
        status: cast.status || 'draft',
        category: cast.categories?.name || '',
        category_id: cast.category_id || null,
        subcategory: (cast as unknown as { subcategory_id?: string | null }).subcategory_id || '',
        is_breaking: cast.is_breaking || false,
        is_developing: false,
        created_at: cast.created_at || '',
        sources: (sourceData || []).map((s) => ({
          id: s.id,
          outlet: s.publisher || '',
          url: s.url || '',
          headline: s.title || '',
        })),
      });
      setStoryId(id);

      const { data: eventData } = await supabase
        .from('timelines')
        .select('*')
        .eq('article_id', id)
        .order('event_date', { ascending: true });

      const loadedEntries: TimelineEntry[] = (eventData || []).map((e) => {
        const ev = e as unknown as Record<string, unknown>;
        return {
          id: e.id,
          event_date: (ev.date as string | null) || (ev.event_date as string | null) || '',
          is_current: Boolean(ev.is_current),
          type: (ev.type as 'story' | 'event') || ((ev.content as string | null) ? 'story' : 'event'),
          title: (ev.text as string | null) || (ev.event_label as string | null) || '',
          summary: (ev.summary as string | null) || (ev.event_body as string | null) || '',
          content: (ev.content as string | null) || '',
          timeline_date: (ev.date as string | null) || '',
          timeline_headline: (ev.text as string | null) || '',
          comment_count: 0,
        };
      });
      setEntries(loadedEntries);

      const { data: quizData } = await supabase
        .from('quizzes')
        .select('*')
        .eq('article_id', id);

      const loadedQuizzes: QuizLocal[] = [];
      (quizData || []).forEach((quiz) => {
        const qr = quiz as unknown as { id: string; questions?: Array<Record<string, unknown>> };
        (qr.questions || []).forEach((q, i) => {
          loadedQuizzes.push({
            id: `${qr.id}_${i}`,
            entry_id: (q.entry_id as string | null) || loadedEntries.find((e) => e.type === 'story')?.id || null,
            question: (q.question as string | null) || '',
            options: (q.options as string[] | null) || ['', '', '', ''],
            correct: typeof q.correct === 'number' ? q.correct : 0,
            _isNew: false,
          });
        });
      });
      setQuizzes(loadedQuizzes);

      const current = loadedEntries.find((e) => e.is_current);
      if (current) setExpandedEntry(current.id);
      else if (loadedEntries.length > 0) setExpandedEntry(loadedEntries[loadedEntries.length - 1].id);
    }

    setIsDirty(false);
    setShowPicker(false);
    setLoading(false);
  };

  const newStory = () => {
    resetToEmpty();
    onArticleChange?.(null);
  };

  const updateStory = <K extends keyof StoryForm>(key: K, val: StoryForm[K]) => {
    setStory((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };
  const updateEntry = <K extends keyof TimelineEntry>(id: string, key: K, val: TimelineEntry[K]) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [key]: val } : e)));
    setIsDirty(true);
  };
  const updateQuiz = <K extends keyof QuizLocal>(id: string, key: K, val: QuizLocal[K]) => {
    setQuizzes((prev) => prev.map((q) => (q.id === id ? { ...q, [key]: val } : q)));
    setIsDirty(true);
  };
  const updateQuizOption = (id: string, idx: number, val: string) => {
    setQuizzes((prev) =>
      prev.map((q) => (q.id === id ? { ...q, options: q.options.map((o, i) => (i === idx ? val : o)) } : q)),
    );
    setIsDirty(true);
  };
  const markCurrent = (id: string) => {
    setEntries((prev) => prev.map((e) => ({ ...e, is_current: e.id === id })));
    setIsDirty(true);
  };

  const addStoryEntry = () => {
    const id = 'new_' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    setEntries((prev) => [...prev, { id, event_date: today, is_current: false, type: 'story', title: '', summary: '', content: '', timeline_date: today, timeline_headline: '', comment_count: 0, _isNew: true }]);
    const sourceId = 'new_s_' + Date.now();
    setStory((prev) => ({ ...prev, sources: [...(prev.sources || []), { id: sourceId, outlet: '', url: '', headline: '' }] }));
    const quizId = 'new_q_' + Date.now();
    setQuizzes((prev) => [...prev, { id: quizId, entry_id: id, question: '', options: ['', '', '', ''], correct: 0, _isNew: true }]);
    setExpandedEntry(id);
    setIsDirty(true);
  };

  const addEvent = () => {
    const id = 'new_' + Date.now();
    setEntries((prev) => [...prev, { id, event_date: new Date().toISOString().split('T')[0], is_current: false, type: 'event', title: '', summary: '', content: '', comment_count: 0, _isNew: true }]);
    setExpandedEntry(id);
    setIsDirty(true);
  };

  const deleteEntry = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: 'The timeline entry and any quiz questions keyed to it will be removed once you save.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setQuizzes((prev) => prev.filter((q) => q.entry_id !== id));
    setIsDirty(true);
  };

  const addQuiz = (entryId: string) => {
    const id = 'new_q_' + Date.now();
    setQuizzes((prev) => [...prev, { id, entry_id: entryId, question: '', options: ['', '', '', ''], correct: 0, _isNew: true }]);
    setIsDirty(true);
  };

  const deleteQuiz = (id: string) => {
    setQuizzes((prev) => prev.filter((q) => q.id !== id));
    setIsDirty(true);
  };

  const addSource = () => {
    const id = 'new_s_' + Date.now();
    setStory((prev) => ({ ...prev, sources: [...(prev.sources || []), { id, outlet: '', url: '', headline: '' }] }));
    setIsDirty(true);
  };
  const updateSource = <K extends keyof StorySource>(id: string, key: K, val: StorySource[K]) => {
    setStory((prev) => ({ ...prev, sources: prev.sources.map((s) => (s.id === id ? { ...s, [key]: val } : s)) }));
    setIsDirty(true);
  };
  const deleteSource = (id: string) => {
    setStory((prev) => ({ ...prev, sources: prev.sources.filter((s) => s.id !== id) }));
    setIsDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      let categoryId = story.category_id;
      if (!categoryId && story.category) {
        const { data: catData } = await supabase.from('categories').select('id').eq('name', story.category).single();
        if (catData) categoryId = catData.id;
      }

      const slug = story.slug || (story.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now());

      const currentEntry = entries.find((e) => e.is_current && e.type === 'story') || entries.filter((e) => e.type === 'story').pop();

      const res = await fetch('/api/admin/articles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: storyId || null,
          article: {
            title: story.title,
            slug,
            excerpt: story.summary || '',
            status: story.status,
            category_id: categoryId,
            is_breaking: story.is_breaking || false,
            is_kids_safe: true,
            kids_summary: story.summary || '',
            // S6-Cleanup-§D3: this manager saves the kids-band variant.
            // Tweens band is parked pre-AR1 — historical rows readable, no
            // new writes from the pipeline.
            age_band: 'kids',
          },
          timeline_entries: entries.map((entry) => ({
            id: entry.id,
            _isNew: entry._isNew,
            event_date: entry.type === 'story' ? (entry.timeline_date || entry.event_date) : entry.event_date,
            event_label: entry.type === 'story' ? (entry.timeline_headline || entry.title) : entry.title,
            event_body: entry.summary || null,
            sort_order: entry.sort_order || 0,
            type: entry.type,
            content: entry.type === 'story' ? (entry.content || null) : null,
          })),
          sources: (story.sources || []).map((s, i) => ({
            publisher: s.outlet || '',
            url: s.url || '',
            title: s.headline || '',
            sort_order: i,
          })),
          quizzes: quizzes.filter((q) => q.question).map((q, i) => ({
            title: story.title + ' Q' + (i + 1),
            question_text: q.question,
            question_type: 'multiple_choice',
            options: q.options || [],
            explanation: q.explanation || '',
            difficulty: 'standard',
            sort_order: i,
            is_active: true,
            points: 10,
          })),
          kids_summary_stamp: currentEntry ? (currentEntry.summary || story.summary || '') : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.article_id) {
        throw new Error(json.error || 'Save failed');
      }

      const savedStoryId: string = json.article_id;
      const remap = (json.entry_id_remap || {}) as Record<string, string>;
      const wasNew = !storyId;
      const slugChanged = !wasNew && lastPersistedSlugRef.current !== '' && lastPersistedSlugRef.current !== slug;
      lastPersistedSlugRef.current = slug;

      if (wasNew) setStoryId(savedStoryId);
      if (Object.keys(remap).length > 0) {
        setEntries((prev) => prev.map((e) => (remap[e.id] ? { ...e, id: remap[e.id], _isNew: false } : e)));
        setQuizzes((prev) => prev.map((q) => (q.entry_id && remap[q.entry_id] ? { ...q, entry_id: remap[q.entry_id] } : q)));
      }

      // Reflect persisted slug locally.
      setStory((prev) => ({ ...prev, slug }));
      setIsDirty(false);

      if (wasNew || (slugChanged && embedded)) {
        onArticleChange?.(savedStoryId, slug);
      }

      if (!embedded) {
        // Phase 3: refetch scoped to age_band='kids' (or null for legacy).
        const { data: refreshed } = await supabase
          .from('articles')
          .select('*, categories!fk_articles_category_id!inner(name, is_kids_safe)')
          .eq('categories.is_kids_safe', true)
          .or('age_band.eq.kids,age_band.is.null')
          .order('created_at', { ascending: false })
          .limit(200);
        setStoryList((refreshed as unknown as ArticleRow[]) || []);
      }
      toast.push({ message: 'Kids article saved', variant: 'success' });
    } catch (err) {
      toast.push({ message: (err as Error)?.message || 'Save failed', variant: 'danger' });
    } finally {
      setSaving(false);
    }
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
      title: `Delete kids article "${titleShort}"?`,
      message: 'Removes the kids article and every row keyed to it (timelines, sources, quiz pool). Irreversible.',
      confirmText: titleShort,
      confirmLabel: 'Delete kids article',
      reasonRequired: false,
      action: 'article.delete.kids',
      targetTable: 'articles',
      targetId: storyId,
      oldValue: { id: storyId, title: story.title, slug: story.slug, status: story.status },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/articles/${storyId}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Delete failed');
        }
        toast.push({ message: 'Kids article deleted', variant: 'success' });
        if (embedded) {
          resetToEmpty();
          onArticleChange?.(null);
        } else {
          newStory();
          // Phase 3: refetch scoped to age_band='kids' (or null for legacy).
          const { data: refreshed } = await supabase
            .from('articles')
            .select('*, categories!inner(name, is_kids_safe)')
            .eq('categories.is_kids_safe', true)
            .or('age_band.eq.kids,age_band.is.null')
            .order('created_at', { ascending: false })
            .limit(200);
          setStoryList((refreshed as unknown as ArticleRow[]) || []);
        }
      },
    });
  };

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
  );
  const currentEntry = entries.find((e) => e.is_current) || entries[entries.length - 1];
  const storiesCount = entries.filter((e) => e.content?.trim()).length;
  const eventsCount = entries.filter((e) => !e.content?.trim()).length;

  const Frame = ({ children }: { children: React.ReactNode }) =>
    embedded ? <div>{children}</div> : <Page>{children}</Page>;

  if (loading) {
    return (
      <Frame>
        <div style={{ padding: S[12], display: 'flex', justifyContent: 'center' }}>
          <Spinner size={20} />
        </div>
      </Frame>
    );
  }

  if (viewMode === 'preview') {
    const e = currentEntry;
    const previewBody = (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {e?.is_current && (
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[3] }}>
            <Badge variant="warn">Now</Badge>
            <span style={{ fontSize: F.sm, color: C.dim }}>{e.event_date}</span>
          </div>
        )}
        <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0, marginBottom: S[3] }}>
          {e?.title || 'Untitled'}
        </h1>
        {e?.summary && (
          <p style={{ fontSize: F.lg, color: C.soft, lineHeight: 1.6, borderLeft: `3px solid ${C.divider}`, paddingLeft: S[3], marginBottom: S[6], fontStyle: 'italic' }}>
            {e.summary}
          </p>
        )}
        {e?.content && (
          <div style={{ fontSize: F.lg, color: C.white, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {e.content}
          </div>
        )}
      </div>
    );
    if (embedded) {
      return (
        <div style={{ padding: `${S[6]}px ${S[4]}px` }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: S[3] }}>
            <Button variant="secondary" onClick={() => setViewMode('edit')}>Close preview</Button>
          </div>
          {previewBody}
        </div>
      );
    }
    return (
      <Page>
        <PageHeader
          title="Kids preview"
          subtitle="How the kids article renders for readers."
          actions={<Button variant="secondary" onClick={() => setViewMode('edit')}>Close preview</Button>}
        />
        <PageSection>{previewBody}</PageSection>
      </Page>
    );
  }

  if (viewMode === 'timeline') {
    const timelineBody = (
      <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative', paddingLeft: 52 }}>
        <div style={{ position: 'absolute', left: 28, top: 8, bottom: 40, width: 2, background: C.divider }} />
        {sortedEntries.map((e) => {
          const hasContent = !!e.content?.trim();
          return (
            <div key={e.id} style={{ position: 'relative', marginBottom: S[6] }}>
              <div
                style={{
                  position: 'absolute',
                  left: -24,
                  top: 5,
                  width: e.is_current ? 14 : 10,
                  height: e.is_current ? 14 : 10,
                  borderRadius: '50%',
                  background: e.is_current ? C.now : hasContent ? C.success : C.muted,
                  border: `3px solid ${C.bg}`,
                }}
              />
              {e.is_current && (
                <span style={{ position: 'absolute', left: -80, top: 2, fontSize: F.xs, fontWeight: 700, color: C.now, background: C.nowBg, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                  Now
                </span>
              )}
              <div style={{ fontSize: F.sm, fontWeight: e.is_current ? 700 : 500, color: e.is_current ? C.now : C.dim, marginBottom: 2 }}>{e.event_date}</div>
              <div style={{ fontSize: F.base, fontWeight: 600, color: e.is_current ? C.white : C.soft }}>
                {e.title || 'Untitled'}
              </div>
            </div>
          );
        })}
      </div>
    );
    if (embedded) {
      return (
        <div style={{ padding: `${S[6]}px ${S[4]}px` }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: S[3] }}>
            <Button variant="secondary" onClick={() => setViewMode('edit')}>Close</Button>
          </div>
          {timelineBody}
        </div>
      );
    }
    return (
      <Page>
        <PageHeader
          title="Timeline preview"
          subtitle="Chronological view of all entries."
          actions={<Button variant="secondary" onClick={() => setViewMode('edit')}>Close</Button>}
        />
        <PageSection>{timelineBody}</PageSection>
      </Page>
    );
  }

  // ---- Edit mode body. Section helpers respect the embedded flag so
  // the article-page surface gets its content directly without the
  // admin Page chrome.
  const Section = (props: {
    title?: string;
    description?: string;
    aside?: React.ReactNode;
    divider?: boolean;
    children: React.ReactNode;
  }) => {
    if (!embedded) {
      return (
        <PageSection title={props.title} description={props.description} aside={props.aside} divider={props.divider}>
          {props.children}
        </PageSection>
      );
    }
    return (
      <section
        style={{
          padding: `${S[4]}px ${S[4]}px`,
          borderTop: props.divider === false ? 'none' : `1px solid ${C.divider}`,
        }}
      >
        {(props.title || props.aside) && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S[3], marginBottom: S[3], flexWrap: 'wrap' }}>
            <div>
              {props.title && (
                <div style={{ fontSize: F.base, fontWeight: 700, color: C.white }}>{props.title}</div>
              )}
              {props.description && (
                <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>{props.description}</div>
              )}
            </div>
            {props.aside && (
              <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>{props.aside}</div>
            )}
          </div>
        )}
        {props.children}
      </section>
    );
  };

  const headerActions = (
    <>
      {isDirty && <Badge variant="warn">Unsaved</Badge>}
      <Badge variant="info">Kids</Badge>
      <Badge variant={story.status === 'published' ? 'success' : 'neutral'} dot>{story.status}</Badge>
      {!embedded && (
        <Button variant="secondary" size="sm" onClick={() => setShowPicker(true)}>Open article</Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => setViewMode('timeline')}>Timeline</Button>
      <Button variant="secondary" size="sm" onClick={() => setViewMode('preview')}>Preview</Button>
      <Button variant="primary" size="sm" loading={saving} onClick={saveAll}>Save</Button>
    </>
  );

  const editorBody = (
    <>
      <Section divider={false}>
        <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const r = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, type: 'kids_story' }) });
                if (r.status === 503) toast.push({ message: 'AI API key not configured. Add it to .env.local.', variant: 'danger' });
                else if (r.ok) toast.push({ message: 'Kids content generated — reload to see changes', variant: 'success' });
                else toast.push({ message: 'AI generation failed', variant: 'danger' });
              } catch { toast.push({ message: 'AI API key not configured', variant: 'danger' }); }
            }}
          >
            AI generate (kids)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const r = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, type: 'timeline' }) });
                if (r.status === 503) toast.push({ message: 'AI API key not configured', variant: 'danger' });
                else if (r.ok) toast.push({ message: 'Timeline enriched', variant: 'success' });
                else toast.push({ message: 'Timeline enrichment failed', variant: 'danger' });
              } catch { toast.push({ message: 'AI API key not configured', variant: 'danger' }); }
            }}
          >
            Enrich timeline
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const r = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storyId, type: 'simplify' }) });
                if (r.status === 503) toast.push({ message: 'AI API key not configured', variant: 'danger' });
                else if (r.ok) toast.push({ message: 'Content simplified', variant: 'success' });
                else toast.push({ message: 'Simplify failed', variant: 'danger' });
              } catch { toast.push({ message: 'AI API key not configured', variant: 'danger' }); }
            }}
          >
            Simplify language
          </Button>
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="sm" onClick={publishStory}>
            {story.status === 'published' ? 'Update & publish' : 'Publish'}
          </Button>
          {storyId && <Button variant="ghost" size="sm" onClick={deleteStory} style={{ color: C.danger }}>Delete article</Button>}
        </div>
      </Section>

      <Section title="Metadata">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
          <div>
            <label style={labelStyle}>Category</label>
            <Select
              value={story.category}
              onChange={(e) => updateStory('category', e.target.value)}
              options={[
                { value: '', label: 'Select...' },
                ...categories.map((c) => ({ value: c.name, label: c.name })),
              ]}
            />
          </div>
          <div>
            <label style={labelStyle}>Subcategory</label>
            <Select
              value={story.subcategory}
              onChange={(e) => updateStory('subcategory', e.target.value)}
              options={[
                { value: '', label: 'Select...' },
                ...((subcategories[story.category] || []).map((s) => ({ value: s.name, label: s.name }))),
              ]}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>URL</label>
            <TextInput
              value={story.slug}
              onChange={(e) => updateStory('slug', e.target.value)}
              leftAddon={<span style={{ fontSize: F.sm, color: C.muted, fontFamily: 'ui-monospace, monospace' }}>veritypost.com/</span>}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginTop: S[3] }}>
          <Button
            variant={story.is_breaking ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => updateStory('is_breaking', !story.is_breaking)}
          >
            Breaking{story.is_breaking ? ' (on)' : ''}
          </Button>
          <Button
            variant={story.is_developing ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => updateStory('is_developing', !story.is_developing)}
          >
            Developing{story.is_developing ? ' (on)' : ''}
          </Button>
        </div>
      </Section>

      <Section
        title={`Timeline entries (${entries.length})`}
        description={`${storiesCount} articles · ${eventsCount} events`}
        aside={
          <>
            <Button variant="secondary" size="sm" onClick={addEvent}>+ Event</Button>
            <Button variant="primary" size="sm" onClick={addStoryEntry}>+ Article</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {sortedEntries.map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const hasContent = !!entry.content?.trim();
            const entryQuizzes = quizzes.filter((q) => q.entry_id === entry.id);
            const dots = [!!entry.title?.trim(), !!entry.content?.trim(), !!entry.summary?.trim(), !!entry.event_date];
            const doneCount = dots.filter(Boolean).length;

            return (
              <div key={entry.id} style={{ border: `1px solid ${entry.is_current ? C.now : C.divider}`, borderRadius: 10, overflow: 'hidden', background: C.bg }}>
                <div
                  onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: S[2],
                    padding: `${S[2]}px ${S[3]}px`,
                    cursor: 'pointer',
                    borderBottom: isExpanded ? `1px solid ${C.divider}` : 'none',
                    flexWrap: 'wrap',
                  }}
                >
                  <Badge variant={hasContent ? 'info' : 'neutral'} size="xs">{hasContent ? 'Story' : 'Event'}</Badge>
                  {entry.is_current && <Badge variant="warn" size="xs">Now</Badge>}
                  <span style={{ fontSize: F.base, fontWeight: 600, color: C.white, flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {entry.title || 'Untitled'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {dots.map((d, i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: d ? C.success : C.divider }} />
                    ))}
                    <span style={{ fontSize: F.xs, color: C.muted, marginLeft: 4 }}>{doneCount}/4</span>
                  </div>
                  {hasContent && <span style={{ fontSize: F.xs, color: C.dim }}>{entryQuizzes.length}Q</span>}
                  <span style={{ fontSize: F.sm, color: C.muted }}>{isExpanded ? 'Hide' : 'Show'}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: S[3], display: 'flex', flexDirection: 'column', gap: S[3] }}>
                    {entry.type === 'event' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
                        <div>
                          <label style={labelStyle}>Timeline date</label>
                          <DatePicker value={entry.event_date || ''} onChange={(e) => updateEntry(entry.id, 'event_date', e.target.value)} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelStyle}>Timeline headline</label>
                          <TextInput
                            value={entry.title || ''}
                            onChange={(e) => updateEntry(entry.id, 'title', e.target.value)}
                            placeholder="What happened on the timeline?"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={labelStyle}>Headline (kid-friendly)</label>
                            <TextInput
                              value={entry.title || ''}
                              onChange={(e) => updateEntry(entry.id, 'title', e.target.value)}
                              placeholder="What happened?"
                            />
                          </div>
                          <div>
                            <label style={labelStyle}>Article date</label>
                            <DatePicker value={entry.event_date || ''} onChange={(e) => updateEntry(entry.id, 'event_date', e.target.value)} />
                          </div>
                        </div>
                        <div>
                          <label style={labelStyle}>Summary</label>
                          <Textarea rows={2} value={entry.summary || ''} onChange={(e) => updateEntry(entry.id, 'summary', e.target.value)} placeholder="Brief summary in simple language." />
                        </div>
                        <div>
                          <label style={labelStyle}>Article body</label>
                          <Textarea rows={8} value={entry.content || ''} onChange={(e) => updateEntry(entry.id, 'content', e.target.value)} placeholder="Write in simple, kid-friendly language." />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
                          <div>
                            <label style={labelStyle}>Timeline date</label>
                            <DatePicker value={entry.timeline_date || entry.event_date || ''} onChange={(e) => updateEntry(entry.id, 'timeline_date', e.target.value)} />
                          </div>
                          <div>
                            <label style={labelStyle}>Timeline headline</label>
                            <TextInput value={entry.timeline_headline || ''} onChange={(e) => updateEntry(entry.id, 'timeline_headline', e.target.value)} placeholder="Short headline" />
                          </div>
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', gap: S[1], alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button variant={entry.is_current ? 'primary' : 'secondary'} size="sm" onClick={() => markCurrent(entry.id)}>
                        Mark as now
                      </Button>
                      {entry.type === 'event' && (
                        <span style={{ fontSize: F.xs, color: C.muted, fontStyle: 'italic' }}>
                          Events appear on timeline only.
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <Button variant="ghost" size="sm" onClick={() => deleteEntry(entry.id)} style={{ color: C.danger }}>
                        Delete entry
                      </Button>
                    </div>

                    {entry.type === 'story' && (
                      <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: S[3], display: 'flex', flexDirection: 'column', gap: S[2] }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: F.base, fontWeight: 700, color: C.soft }}>Sources ({(story.sources || []).length})</span>
                          <Button variant="secondary" size="sm" onClick={addSource}>+ Add source</Button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                          {(story.sources || []).map((s) => (
                            <div
                              key={s.id}
                              style={{
                                display: 'flex',
                                gap: S[2],
                                alignItems: 'center',
                                padding: S[2],
                                border: `1px solid ${C.divider}`,
                                borderRadius: 8,
                                background: C.card,
                                flexWrap: 'wrap',
                              }}
                            >
                              <TextInput block={false} value={s.outlet} onChange={(e) => updateSource(s.id, 'outlet', e.target.value)} placeholder="Outlet" style={{ minWidth: 120, flex: '1 1 120px' }} />
                              <TextInput block={false} value={s.url} onChange={(e) => updateSource(s.id, 'url', e.target.value)} placeholder="https://..." style={{ minWidth: 160, flex: '2 1 160px', fontFamily: 'ui-monospace, monospace', fontSize: F.sm }} />
                              <TextInput block={false} value={s.headline} onChange={(e) => updateSource(s.id, 'headline', e.target.value)} placeholder="Original headline" style={{ minWidth: 160, flex: '3 1 200px' }} />
                              <Button variant="ghost" size="sm" onClick={() => deleteSource(s.id)} style={{ color: C.muted }}>Remove</Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.type === 'story' && (
                      <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: S[3] }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[2], flexWrap: 'wrap' }}>
                          <span style={{ fontSize: F.base, fontWeight: 700, color: C.soft }}>Quiz ({entryQuizzes.length})</span>
                          <Button variant="secondary" size="sm" onClick={() => addQuiz(entry.id)}>+ Add question</Button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                          {entryQuizzes.map((q, qi) => {
                            const isTF = q.options.length === 2 && q.options.every((o) => ['true', 'false'].includes((o || '').trim().toLowerCase()));
                            return (
                              <div key={q.id} style={{ padding: S[3], background: C.card, borderRadius: 8, border: `1px solid ${C.divider}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[2], flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 6,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      background: C.accent,
                                      color: '#fff',
                                      fontSize: F.xs,
                                      fontWeight: 700,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {qi + 1}
                                  </span>
                                  <div style={{ flex: 1 }} />
                                  <div style={{ display: 'flex', gap: S[1] }}>
                                    <Button
                                      variant={!isTF ? 'primary' : 'secondary'}
                                      size="sm"
                                      onClick={() => {
                                        updateQuiz(q.id, 'options', q.options.length > 2 ? q.options : ['', '', '', '']);
                                        updateQuiz(q.id, 'correct', 0);
                                      }}
                                    >
                                      MC
                                    </Button>
                                    <Button
                                      variant={isTF ? 'primary' : 'secondary'}
                                      size="sm"
                                      onClick={() => {
                                        updateQuiz(q.id, 'options', ['True', 'False']);
                                        updateQuiz(q.id, 'correct', 0);
                                      }}
                                    >
                                      T/F
                                    </Button>
                                  </div>
                                  <Button variant="ghost" size="sm" onClick={() => deleteQuiz(q.id)} style={{ color: C.muted }}>Remove</Button>
                                </div>
                                <TextInput value={q.question} onChange={(e) => updateQuiz(q.id, 'question', e.target.value)} placeholder="Ask a simple question about the story." style={{ marginBottom: S[2] }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                                  {q.options.map((ch, ci) => (
                                    <div key={ci} style={{ display: 'flex', gap: S[1], alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => updateQuiz(q.id, 'correct', ci)}
                                        style={{
                                          width: 26,
                                          height: 26,
                                          borderRadius: '50%',
                                          flexShrink: 0,
                                          border: `2px solid ${ci === q.correct ? C.success : C.divider}`,
                                          background: ci === q.correct ? C.success : 'transparent',
                                          color: ci === q.correct ? '#fff' : C.muted,
                                          fontSize: F.xs,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        {['A', 'B', 'C', 'D'][ci]}
                                      </button>
                                      {isTF ? (
                                        <span style={{ fontSize: F.base, color: C.white }}>{ch}</span>
                                      ) : (
                                        <TextInput value={ch} onChange={(e) => updateQuizOption(q.id, ci, e.target.value)} placeholder={`Choice ${['A', 'B', 'C', 'D'][ci]}`} />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {entryQuizzes.length === 0 && (
                            <div style={{ padding: S[3], border: `1px dashed ${C.divider}`, borderRadius: 8, fontSize: F.sm, color: C.dim, textAlign: 'center' }}>
                              No questions yet. Add one to start the quiz pool.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {entries.length === 0 && (
            <div style={{ padding: S[6], border: `1px dashed ${C.divider}`, borderRadius: 10, textAlign: 'center', color: C.dim }}>
              No entries yet. Add an article or event to begin.
            </div>
          )}
        </div>
      </Section>
    </>
  );

  if (embedded) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: S[2],
            padding: `${S[3]}px ${S[4]}px`,
            borderBottom: `1px solid ${C.divider}`,
            flexWrap: 'wrap',
          }}
        >
          {headerActions}
        </div>
        {editorBody}
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
          onConfirm={async ({ reason }: { reason: string }) => {
            try {
              await destructive?.run?.({ reason });
              setDestructive(null);
            } catch (err) {
              toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
              setDestructive(null);
            }
          }}
        />
        <ConfirmDialogHost />
      </div>
    );
  }

  return (
    <Page>
      <PageHeader
        title={story.title || 'New kids article'}
        subtitle="Kids-safe article, simpler language, kid-friendly quiz."
        actions={headerActions}
      />
      {editorBody}

      <Drawer
        open={showPicker}
        onClose={() => setShowPicker(false)}
        title="Open kids article"
        description="Switch to an existing kids article or start a new one."
        width="md"
        footer={<Button variant="primary" onClick={newStory}>+ New kids article</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          {storyList.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setShowPicker(false);
                onArticleChange?.(s.id);
                if (s.id !== storyId) loadStory(s.id);
              }}
              style={{
                textAlign: 'left',
                padding: `${S[2]}px ${S[3]}px`,
                borderRadius: 8,
                border: `1px solid ${s.id === storyId ? C.accent : C.divider}`,
                background: s.id === storyId ? C.hover : C.bg,
                cursor: 'pointer',
                color: C.white,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.title || 'Untitled'}</div>
              <div style={{ fontSize: F.xs, color: C.dim }}>
                {s.categories?.name || '—'} · {s.status || 'draft'} · {s.created_at ? new Date(s.created_at).toISOString().split('T')[0] : '—'}
              </div>
            </button>
          ))}
          {storyList.length === 0 && <div style={{ color: C.dim, fontSize: F.sm, padding: S[3] }}>No kids articles yet.</div>}
        </div>
      </Drawer>

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
        onConfirm={async ({ reason }: { reason: string }) => {
          try {
            await destructive?.run?.({ reason });
            setDestructive(null);
          } catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructive(null);
          }
        }}
      />
      <ConfirmDialogHost />
    </Page>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: F.xs,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: C.dim,
  marginBottom: S[1],
};
