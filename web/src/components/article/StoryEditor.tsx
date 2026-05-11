'use client';

/**
 * Reusable adult story editor. Mounts under /<slug> (embedded) and the
 * legacy /admin/story-manager wrapper. Article picking is owned by
 * /admin/newsroom (Articles tab); this editor never lists or switches
 * articles itself. In embedded mode the host suppresses chrome and owns
 * URL changes via `onArticleChange(id, slug?)`.
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';
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
import Spinner from '@/components/admin/Spinner';
import TTSButton from '@/components/TTSButton';
import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { formatTimelineDate } from '@/lib/dates';
import { SENSITIVITY_TAGS } from '@/lib/sensitivityTags';

// Editorial day = America/New_York. Same constant the home page uses
// to filter today's hero. Returns "YYYY-MM-DD".
function todayInEditorialTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type StorySource = {
  id: string;
  outlet: string;
  url: string;
  headline: string;
  author_name?: string | null;
  published_date?: string | null;
  source_type?: string | null;
  quote?: string | null;
};

type StoryForm = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  body_html: string;
  published_at: string;
  status: string;
  category: string;
  category_id: string | null;
  subcategory: string;
  is_breaking: boolean;
  is_developing: boolean;
  hero_pick_for_date: string | null;
  // Wave 2 — ad eligibility surface. `ad_eligible` is the editorial
  // toggle (default ON). `sensitivity_tags` is a small content-tag set;
  // the serve_ad path treats any tag in SENSITIVITY_TAGS marked blocking
  // as a hard block regardless of the toggle. Columns are added by a
  // parallel migration; database.ts will pick them up on regen — until
  // then we widen the article row type at the load boundary.
  ad_eligible: boolean;
  sensitivity_tags: string[];
  created_at?: string;
  author?: string;
  sources: StorySource[];
};

const EMPTY_STORY: StoryForm = {
  title: '',
  slug: '',
  summary: '',
  body: '',
  body_html: '',
  published_at: '',
  status: 'draft',
  category: 'Politics',
  category_id: null,
  subcategory: '',
  is_breaking: false,
  is_developing: false,
  hero_pick_for_date: null,
  ad_eligible: true,
  sensitivity_tags: [],
  sources: [],
};

type TimelineEntry = {
  id: string;
  event_date: string;
  date_display?: string;
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

type QuizOption = { text: string; is_correct: boolean };

type QuizLocal = {
  id: string;
  entry_id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false';
  options: QuizOption[];
  explanation: string;
  _isNew?: boolean;
  _deleted?: boolean;
};

const MAX_QUIZ_QUESTIONS = 10;

const defaultMcOptions = (): QuizOption[] => [
  { text: '', is_correct: true },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
  { text: '', is_correct: false },
];

const defaultTfOptions = (): QuizOption[] => [
  { text: 'True', is_correct: true },
  { text: 'False', is_correct: false },
];

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

type ArticleRow = Tables<'articles'> & {
  categories: { name: string | null; slug?: string | null } | null;
  stories: { slug: string } | null;
};

const genId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Defined at module level — NOT inside the component body. Inline
// component declarations get a fresh function reference on every parent
// render, which makes React treat the subtree as a different component
// type and remount it. The remount blew focus out of every input on
// every keystroke (URL, headline, source fields, timeline forms — all
// of them).
type SectionProps = {
  title?: string;
  description?: string;
  aside?: React.ReactNode;
  divider?: boolean;
  embedded: boolean;
  children: React.ReactNode;
};
function Section({ title, description, aside, divider, embedded, children }: SectionProps) {
  if (!embedded) {
    return (
      <PageSection title={title} description={description} aside={aside} divider={divider}>
        {children}
      </PageSection>
    );
  }
  return (
    <section
      style={{
        padding: `${S[4]}px ${S[4]}px`,
        borderTop: divider === false ? 'none' : `1px solid ${C.divider}`,
      }}
    >
      {(title || aside) && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: S[3], marginBottom: S[3], flexWrap: 'wrap' }}>
          <div>
            {title && (
              <div style={{ fontSize: F.base, fontWeight: 700, color: C.ink }}>{title}</div>
            )}
            {description && (
              <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>{description}</div>
            )}
          </div>
          {aside && (
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>{aside}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export type StoryEditorProps = {
  articleId: string | null;
  onArticleChange?: (id: string | null, slug?: string | null) => void;
  embedded?: boolean;
};

export default function StoryEditor({ articleId, onArticleChange, embedded = false }: StoryEditorProps) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState<StoryForm>(EMPTY_STORY);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [quizzes, setQuizzes] = useState<QuizLocal[]>([]);
  const [storyId, setStoryId] = useState<string | null>(null);
  // Tracks the slug as it was last loaded/saved so saveAll can detect a true
  // rename (loaded slug !== about-to-save slug). Comparing against
  // `story.slug` directly is dead code: the new slug is derived from
  // `story.slug || fallback`, so the comparison would always be false.
  const lastPersistedSlugRef = useRef<string>('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'timeline'>('edit');
  const [isDirty, setIsDirty] = useState(false);

  const [destructive, setDestructive] = useState<DestructiveState>(null);
  const [saving, setSaving] = useState(false);
  const [regenQuizLoading, setRegenQuizLoading] = useState(false);
  const [regenSourcesLoading, setRegenSourcesLoading] = useState(false);
  const [factCheckData, setFactCheckData] = useState<{
    conflicts: Array<{ claim: string; note: string; sources: string[] }>;
    single_source: Array<{ claim: string; note: string; sources: string[] }>;
    implausibilities: Array<{ claim: string; note: string }>;
  } | null>(null);
  const [regenTimelineLoading, setRegenTimelineLoading] = useState(false);
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupSourceUrls, setFollowupSourceUrls] = useState('');
  const [followupOpen, setFollowupOpen] = useState(false);
  const [articleAgeBand, setArticleAgeBand] = useState<string | null>(null);

  // T-018: DB-loaded category + subcategory dropdowns.
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [subcategoriesByParent, setSubcategoriesByParent] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Embedded mode (mounted from /<slug>): the server has already
      // gated on `articles.edit` / `admin.articles.edit.any` before
      // rendering this component. Re-checking the client role here is
      // both redundant and wrong — `articles.edit` can be granted to
      // role names outside ADMIN_ROLES, in which case the server allows
      // edit but the client would bounce the user home. Skip the
      // duplicate client gate when embedded.
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
        if (!profile || !roleNames.some((r) => ADMIN_ROLES.has(r))) {
          router.push('/');
          return;
        }
      }

      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name, parent_id, is_kids_safe, sort_order')
        .eq('is_kids_safe', false)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name');

      if (cancelled) return;

      // T-018: load parents + subs, group subs by parent name for the
      // dependent-Select. Matches the shape the old SUBCATEGORIES const
      // had so downstream lookup keys are unchanged.
      const catRows = (categoriesData || []) as Array<{
        id: string; name: string; parent_id: string | null;
      }>;
      const idToName: Record<string, string> = {};
      catRows.forEach((c) => { idToName[c.id] = c.name; });
      const parents = catRows.filter((c) => !c.parent_id);
      const subs = catRows.filter((c) => !!c.parent_id);
      const subMap: Record<string, Array<{ id: string; name: string }>> = {};
      subs.forEach((s) => {
        const parentName = s.parent_id ? idToName[s.parent_id] : null;
        if (!parentName) return;
        (subMap[parentName] ||= []).push({ id: s.id, name: s.name });
      });
      setCategories(parents.map((c) => ({ id: c.id, name: c.name })));
      setSubcategoriesByParent(subMap);

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

  // Re-load when the host swaps articleId without remounting (legacy
  // admin wrapper does this when picking a different article). The init
  // effect above already handles the first mount; this effect must skip
  // its first run to avoid a parallel double-fetch race that can clobber
  // state with a late response.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (articleId && articleId !== storyId) {
      loadStory(articleId);
    } else if (!articleId && storyId) {
      resetToEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // One-shot timeline backfill. If loadStory landed before the
  // generation pipeline finished writing timeline rows, retry once
  // after 4s. Bails when the user starts editing or any rows arrive;
  // remembers the storyId we tried so genuinely empty articles don't
  // re-poll.
  const timelineRetryTriedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!storyId) return;
    if (entries.length > 0) return;
    if (isDirty || saving || loading) return;
    if (timelineRetryTriedRef.current === storyId) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      timelineRetryTriedRef.current = storyId;
      loadStory(storyId);
    }, 4000);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, entries.length, isDirty, saving, loading]);

  const resetToEmpty = () => {
    setStory(EMPTY_STORY);
    setStoryId(null);
    lastPersistedSlugRef.current = '';
    setEntries([]);
    setQuizzes([]);
    setExpandedEntry(null);
    setIsDirty(false);
    setArticleAgeBand(null);
    setFollowupOpen(false);
    setFollowupSourceUrls('');
  };

  const loadStory = async (id: string) => {
    setLoading(true);
    const { data: storyData } = await supabase
      .from('articles')
      .select('*, categories!fk_articles_category_id(name, slug), stories(slug)')
      .eq('id', id)
      .single();

    if (storyData) {
      const { data: sourceData } = await supabase
        .from('sources')
        .select('*')
        .eq('article_id', id)
        .order('sort_order', { ascending: true });

      const cast = storyData as unknown as ArticleRow;
      lastPersistedSlugRef.current = cast.stories?.slug || '';
      // Wave 2 — `ad_eligible` and `sensitivity_tags` aren't in the
      // generated database.ts yet (migration in flight). Widen the row
      // here rather than touching the generated file. `ad_eligible`
      // defaults to true (matches DB default) so existing rows that
      // haven't been touched since the migration still render the
      // toggle in the ON state.
      const adRow = cast as unknown as {
        ad_eligible?: boolean | null;
        sensitivity_tags?: string[] | null;
      };
      const loadedAdEligible = adRow.ad_eligible == null ? true : !!adRow.ad_eligible;
      const loadedSensitivityTags = Array.isArray(adRow.sensitivity_tags)
        ? adRow.sensitivity_tags.filter((t): t is string => typeof t === 'string')
        : [];

      setStory({
        title: cast.title || '',
        slug: cast.stories?.slug || '',
        summary: cast.excerpt || '',
        body: cast.body || '',
        body_html: cast.body_html || '',
        published_at: cast.published_at ? cast.published_at.split('T')[0] : '',
        status: cast.status || 'draft',
        category: cast.categories?.name || 'Politics',
        category_id: cast.category_id || null,
        subcategory: (cast as unknown as { subcategory_id?: string | null }).subcategory_id || '',
        is_breaking: cast.is_breaking || false,
        is_developing: cast.is_developing || false,
        hero_pick_for_date: cast.hero_pick_for_date || null,
        ad_eligible: loadedAdEligible,
        sensitivity_tags: loadedSensitivityTags,
        created_at: cast.created_at || '',
        sources: (sourceData || []).map((s) => ({
          id: s.id,
          outlet: s.publisher || '',
          url: s.url || '',
          headline: s.title || '',
          author_name: (s as unknown as { author_name?: string | null }).author_name ?? null,
          published_date: (s as unknown as { published_date?: string | null }).published_date ?? null,
          source_type: (s as unknown as { source_type?: string | null }).source_type ?? null,
          quote: (s as unknown as { quote?: string | null }).quote ?? null,
        })),
      });
      setStoryId(id);
      setArticleAgeBand(cast.age_band ?? null);

      const castMeta = cast.metadata as Record<string, unknown> | null;
      const fc = castMeta?.fact_check as Record<string, unknown> | null | undefined;
      if (fc && typeof fc === 'object') {
        setFactCheckData({
          conflicts: (fc.conflicts as Array<{ claim: string; note: string; sources: string[] }>) ?? [],
          single_source: (fc.single_source as Array<{ claim: string; note: string; sources: string[] }>) ?? [],
          implausibilities: (fc.implausibilities as Array<{ claim: string; note: string }>) ?? [],
        });
      }

      // Wave 7 fix: include type='article' anchor rows so quiz sections
      // (which key off type='story' locally) find their parent entry.
      // DB type='article' → local type='story'. DB type='event' stays 'event'.
      const { data: eventData } = await supabase
        .from('timelines')
        .select('*')
        .eq('story_id', cast.story_id as string)
        .in('type', ['event', 'article'])
        .order('event_date', { ascending: true });

      const loadedEntries: TimelineEntry[] = (eventData || []).map((e) => {
        const ev = e as unknown as Record<string, unknown>;
        const dbType = ev.type as string | null;
        const isAnchor = dbType === 'article';
        const localType: 'story' | 'event' = isAnchor ? 'story' : 'event';
        const eventBody = (ev.event_body as string | null) ?? '';
        const eventLabel = (ev.event_label as string | null) ?? (ev.title as string | null) ?? '';
        const rawEventDate = (ev.event_date as string | null) ?? '';
        const eventDate = rawEventDate ? rawEventDate.split('T')[0] : '';
        // Anchor row's event_body is NULL by design — persist_generated_article
        // only writes event_label + event_date for type='article'. Body and
        // excerpt live on articles.body / articles.excerpt. Always read from
        // cast for the anchor (unconditional, not `event_body || cast.body`
        // — saveAll writes excerpt into event_body for the anchor, so a
        // conditional fallback would silently flip on reload).
        const content = isAnchor ? (cast.body || '') : eventBody;
        const summary = isAnchor ? (cast.excerpt || '') : eventBody;
        const metadata = ev.metadata as Record<string, unknown> | null | undefined;
        const dateDisplay = (metadata?.date_display as string | undefined) ?? undefined;
        return {
          id: e.id,
          event_date: eventDate,
          date_display: dateDisplay,
          is_current: Boolean(ev.is_current),
          type: localType,
          title: eventLabel,
          summary,
          content,
          timeline_date: eventDate,
          timeline_headline: eventLabel,
          comment_count: 0,
        };
      });
      setEntries(loadedEntries);

      const current = loadedEntries.find((e) => e.is_current);
      const primaryEntryId =
        current?.id
        || [...loadedEntries].reverse().find((e) => e.type === 'story')?.id
        || loadedEntries[loadedEntries.length - 1]?.id
        || '';
      if (current) setExpandedEntry(current.id);
      else if (loadedEntries.length > 0) setExpandedEntry(loadedEntries[loadedEntries.length - 1].id);

      const { data: quizData } = await supabase
        .from('quizzes')
        .select('*')
        .eq('article_id', id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      const loadedQuizzes: QuizLocal[] = (quizData || []).map((q) => {
        const qr = q as unknown as Record<string, unknown>;
        const rawOptions = qr.options;
        let options: QuizOption[] = [];
        if (Array.isArray(rawOptions)) {
          options = (rawOptions as unknown[]).map((o) => {
            const obj = (o && typeof o === 'object') ? (o as Record<string, unknown>) : {};
            return {
              text: typeof obj.text === 'string' ? obj.text : '',
              is_correct: Boolean(obj.is_correct),
            };
          });
        }
        const type: QuizLocal['question_type'] =
          (qr.question_type as string) === 'true_false' ? 'true_false' : 'multiple_choice';
        if (type === 'multiple_choice' && options.length < 4) {
          while (options.length < 4) options.push({ text: '', is_correct: false });
        }
        if (type === 'true_false' && options.length < 2) {
          options = defaultTfOptions();
        }
        return {
          id: (qr.id as string) || genId('q'),
          entry_id: primaryEntryId,
          question_text: (qr.question_text as string) || '',
          question_type: type,
          options,
          explanation: (qr.explanation as string) || '',
        };
      });
      setQuizzes(loadedQuizzes);
    } else {
      setQuizzes([]);
    }

    setIsDirty(false);
    setLoading(false);
  };

  const updateStory = <K extends keyof StoryForm>(key: K, val: StoryForm[K]) => {
    setStory((prev) => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };
  const updateEntry = <K extends keyof TimelineEntry>(id: string, key: K, val: TimelineEntry[K]) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [key]: val } : e)));
    setIsDirty(true);
  };
  const markCurrent = (id: string) => {
    setEntries((prev) => prev.map((e) => ({ ...e, is_current: e.id === id })));
    setIsDirty(true);
  };

  const addEvent = () => {
    const id = 'new_' + Date.now();
    setEntries((prev) => [...prev, { id, event_date: new Date().toISOString().split('T')[0], is_current: false, type: 'event', title: '', summary: '', content: '', comment_count: 0, _isNew: true }]);
    setExpandedEntry(id);
    setIsDirty(true);
  };

  const addStoryEntry = () => {
    const id = 'new_' + Date.now();
    setEntries((prev) => [...prev, { id, event_date: new Date().toISOString().split('T')[0], is_current: false, type: 'story', title: '', summary: '', content: '', comment_count: 0, timeline_date: new Date().toISOString().split('T')[0], timeline_headline: '', _isNew: true }]);
    setExpandedEntry(id);
    setIsDirty(true);
  };

  const deleteEntry = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: 'The timeline entry will be removed once you save.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setIsDirty(true);
  };

  const addSource = () => {
    const id = genId('s');
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

  const addQuiz = (entryId: string) => {
    setQuizzes((prev) => {
      const visible = prev.filter((q) => q.entry_id === entryId && !q._deleted).length;
      if (visible >= MAX_QUIZ_QUESTIONS) return prev;
      return [
        ...prev,
        {
          id: genId('q'),
          entry_id: entryId,
          question_text: '',
          question_type: 'multiple_choice',
          options: defaultMcOptions(),
          explanation: '',
          _isNew: true,
        },
      ];
    });
    setIsDirty(true);
  };

  const updateQuizField = <K extends keyof QuizLocal>(id: string, key: K, val: QuizLocal[K]) => {
    setQuizzes((prev) => prev.map((q) => (q.id === id ? { ...q, [key]: val } : q)));
    setIsDirty(true);
  };

  const updateQuizType = (id: string, type: QuizLocal['question_type']) => {
    setQuizzes((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        if (q.question_type === type) return q;
        return {
          ...q,
          question_type: type,
          options: type === 'true_false' ? defaultTfOptions() : defaultMcOptions(),
        };
      }),
    );
    setIsDirty(true);
  };

  const updateQuizOptionText = (id: string, idx: number, text: string) => {
    setQuizzes((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const options = q.options.map((o, i) => (i === idx ? { ...o, text } : o));
        return { ...q, options };
      }),
    );
    setIsDirty(true);
  };

  const setQuizCorrect = (id: string, idx: number) => {
    setQuizzes((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const options = q.options.map((o, i) => ({ ...o, is_correct: i === idx }));
        return { ...q, options };
      }),
    );
    setIsDirty(true);
  };

  const removeQuiz = (id: string) => {
    setQuizzes((prev) =>
      prev
        .map((q) => (q.id === id ? { ...q, _deleted: true } : q))
        .filter((q) => !(q._isNew && q._deleted)),
    );
    setIsDirty(true);
  };

  const regenSources = async (articleId: string) => {
    if (regenSourcesLoading) return;
    setRegenSourcesLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/sources-regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: json.error || 'Source regeneration failed', variant: 'danger' });
        return;
      }
      const { data: sourceData } = await supabase
        .from('sources')
        .select('*')
        .eq('article_id', articleId)
        .order('sort_order', { ascending: true });
      const reloadedSources: StorySource[] = (sourceData || []).map((s) => ({
        id: s.id,
        outlet: s.publisher || '',
        url: s.url || '',
        headline: s.title || '',
        author_name: (s as unknown as { author_name?: string | null }).author_name ?? null,
        published_date: (s as unknown as { published_date?: string | null }).published_date ?? null,
        source_type: (s as unknown as { source_type?: string | null }).source_type ?? null,
        quote: (s as unknown as { quote?: string | null }).quote ?? null,
      }));
      setStory((prev) => ({ ...prev, sources: reloadedSources }));
      toast.push({ message: `Sources regenerated — ${json.count as number} source${json.count === 1 ? '' : 's'}`, variant: 'success' });
    } catch (err) {
      console.error('[regenSources]', err);
      toast.push({ message: 'Source regeneration failed', variant: 'danger' });
    } finally {
      setRegenSourcesLoading(false);
    }
  };

  const regenTimeline = async (articleId: string) => {
    if (regenTimelineLoading) return;
    setRegenTimelineLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/timeline-regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: json.error || 'Timeline regeneration failed', variant: 'danger' });
        return;
      }
      // Re-fetch timelines for the article's story_id and rebuild local entries.
      const { data: articleRow } = await supabase
        .from('articles')
        .select('story_id')
        .eq('id', articleId)
        .single();
      const newStoryId = (articleRow as unknown as { story_id?: string | null } | null)?.story_id;
      if (!newStoryId) {
        toast.push({ message: 'Timeline reload skipped — no story_id', variant: 'warn' });
        return;
      }
      const { data: eventData } = await supabase
        .from('timelines')
        .select('*')
        .eq('story_id', newStoryId)
        .in('type', ['event', 'article'])
        .order('event_date', { ascending: true });
      const reloadedEntries: TimelineEntry[] = (eventData || []).map((e) => {
        const ev = e as unknown as Record<string, unknown>;
        const dbType = ev.type as string | null;
        const isAnchor = dbType === 'article';
        const localType: 'story' | 'event' = isAnchor ? 'story' : 'event';
        const eventBody = (ev.event_body as string | null) ?? '';
        const eventLabel = (ev.event_label as string | null) ?? (ev.title as string | null) ?? '';
        const rawEventDate = (ev.event_date as string | null) ?? '';
        const eventDate = rawEventDate ? rawEventDate.split('T')[0] : '';
        const content = isAnchor ? (story.body || '') : eventBody;
        const summary = isAnchor ? (story.summary || '') : eventBody;
        const reloadMeta = ev.metadata as Record<string, unknown> | null | undefined;
        const reloadDateDisplay = (reloadMeta?.date_display as string | undefined) ?? undefined;
        return {
          id: e.id,
          event_date: eventDate,
          date_display: reloadDateDisplay,
          is_current: Boolean(ev.is_current),
          type: localType,
          title: eventLabel,
          summary,
          content,
          timeline_date: eventDate,
          timeline_headline: eventLabel,
          comment_count: 0,
        };
      });
      setEntries(reloadedEntries);
      toast.push({ message: `Timeline regenerated — ${json.count as number} event${json.count === 1 ? '' : 's'}`, variant: 'success' });
    } catch (err) {
      console.error('[regenTimeline]', err);
      toast.push({ message: 'Timeline regeneration failed', variant: 'danger' });
    } finally {
      setRegenTimelineLoading(false);
    }
  };

  const regenQuiz = async (articleId: string) => {
    setRegenQuizLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/quiz-regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({ message: json.error || 'Quiz regeneration failed', variant: 'danger' });
        return;
      }
      // Reload fresh quizzes from DB
      const primaryEntryId =
        entries.find((e) => e.is_current && e.type === 'story')?.id
        || [...entries].reverse().find((e) => e.type === 'story')?.id
        || entries[entries.length - 1]?.id
        || '';
      const { data: quizData } = await supabase
        .from('quizzes')
        .select('*')
        .eq('article_id', articleId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      const reloaded: QuizLocal[] = (quizData || []).map((q) => {
        const qr = q as unknown as Record<string, unknown>;
        const rawOpts = qr.options;
        let options: QuizOption[] = [];
        if (Array.isArray(rawOpts)) {
          options = (rawOpts as unknown[]).map((o) => {
            const obj = o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
            return { text: typeof obj.text === 'string' ? obj.text : '', is_correct: Boolean(obj.is_correct) };
          });
        }
        if (options.length < 4) while (options.length < 4) options.push({ text: '', is_correct: false });
        return {
          id: (qr.id as string) || genId('q'),
          entry_id: primaryEntryId,
          question_text: (qr.question_text as string) || '',
          question_type: 'multiple_choice' as const,
          options,
          explanation: (qr.explanation as string) || '',
        };
      });
      setQuizzes(reloaded);
      toast.push({ message: `Quiz regenerated — ${json.count as number} new questions`, variant: 'success' });
    } catch (err) {
      console.error('[regenQuiz]', err);
      toast.push({ message: 'Quiz regeneration failed', variant: 'danger' });
    } finally {
      setRegenQuizLoading(false);
    }
  };

  const generateFollowup = async () => {
    if (!storyId || followupLoading) return;
    const urls = followupSourceUrls
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('http'));
    if (urls.length === 0) {
      toast.push({ message: 'Add at least one source URL', variant: 'warn' });
      return;
    }
    setFollowupLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: articleAgeBand === 'kids' || articleAgeBand === 'tweens' ? 'kid' : 'adult',
          age_band: articleAgeBand ?? undefined,
          mode: 'standalone',
          source_urls: urls,
          existing_story_id: storyId,
          category_id: story.category_id ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.push({ message: (json as { error?: string }).error || 'Generation failed', variant: 'danger' });
        return;
      }
      setFollowupOpen(false);
      setFollowupSourceUrls('');
      toast.push({ message: 'Follow-up article generated — select it from the article list to review.', variant: 'success' });
    } catch {
      toast.push({ message: 'Generation failed', variant: 'danger' });
    } finally {
      setFollowupLoading(false);
    }
  };

  // Optional override lets publishStory force status='published' on the
  // very same save dispatch instead of relying on a setState that won't
  // have flushed by the time saveAll reads `story.status` from closure.
  const saveAll = async (override?: Partial<StoryForm>) => {
    setSaving(true);
    try {
      const effective: StoryForm = { ...story, ...(override || {}) };
      let categoryId = effective.category_id;
      if (!categoryId && effective.category) {
        const { data: catData } = await supabase.from('categories').select('id').eq('name', effective.category).single();
        if (catData) categoryId = catData.id;
      }

      // Source-of-truth for article headline/body/summary is the current
      // (or latest) story-type timeline entry — each entry edits itself.
      const drivingEntry =
        entries.find((e) => e.is_current && e.type === 'story')
        || [...entries].reverse().find((e) => e.type === 'story')
        || null;
      const drivingTitle = drivingEntry?.title || effective.title || '';
      const drivingSummary = drivingEntry?.summary || effective.summary || '';
      const drivingBody = drivingEntry?.content || effective.body || '';
      const drivingDate = drivingEntry?.event_date || effective.published_at || '';

      const slug = effective.slug || (drivingTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now());
      const publishedAtIso = drivingDate
        ? new Date(drivingDate + 'T00:00:00Z').toISOString()
        : null;

      const res = await fetch('/api/admin/articles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: storyId || null,
          article: {
            title: drivingTitle,
            slug,
            excerpt: drivingSummary,
            body: drivingBody,
            status: effective.status,
            category_id: categoryId,
            subcategory_id: story.subcategory || null,
            is_breaking: effective.is_breaking || false,
            is_developing: effective.is_developing || false,
            hero_pick_for_date: effective.hero_pick_for_date,
            published_at: publishedAtIso,
            // Wave 2 — ad eligibility surface. The save endpoint
            // validates sensitivity_tags against the known set and
            // drops unknowns silently.
            ad_eligible: effective.ad_eligible,
            sensitivity_tags: effective.sensitivity_tags,
          },
          timeline_entries: entries.map((entry) => ({
            id: entry.id,
            _isNew: entry._isNew,
            type: entry.type,
            event_date: entry.type === 'story' ? (entry.timeline_date || entry.event_date) : entry.event_date,
            event_label: entry.type === 'story' ? (entry.timeline_headline || entry.title) : entry.title,
            event_body: entry.summary || null,
            sort_order: entry.sort_order || 0,
          })),
          sources: (effective.sources || []).filter((s) => s.outlet || s.url || s.headline).map((s, i) => ({
            publisher: s.outlet || '',
            url: s.url || '',
            title: s.headline || '',
            sort_order: i,
            author_name: s.author_name ?? null,
            published_date: s.published_date ?? null,
            source_type: s.source_type ?? null,
            quote: s.quote ?? null,
          })),
          quizzes: quizzes.filter((q) => !q._deleted && q.question_text.trim().length > 0).map((q, i) => ({
            title: q.question_text.slice(0, 200),
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options.map((o) => ({ text: o.text, is_correct: o.is_correct })),
            explanation: q.explanation || '',
            sort_order: i,
            points: 10,
          })),
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

      // Keep the local `story` state in sync with what we just persisted.
      // `status` is included because publishStory passes it via override —
      // without this, UI would still show the pre-publish status until
      // the next reload.
      setStory((prev) => ({
        ...prev,
        title: drivingTitle,
        summary: drivingSummary,
        body: drivingBody,
        slug,
        status: effective.status,
        published_at: drivingDate,
      }));

      if (Object.keys(remap).length > 0) {
        setEntries((prev) => prev.map((e) => (remap[e.id] ? { ...e, id: remap[e.id], _isNew: false } : { ...e, _isNew: false })));
        setQuizzes((prev) => prev.map((q) => (remap[q.entry_id] ? { ...q, entry_id: remap[q.entry_id] } : q)));
      } else {
        setEntries((prev) => prev.map((e) => ({ ...e, _isNew: false })));
      }
      setQuizzes((prev) => prev.filter((q) => !q._deleted).map((q) => ({ ...q, _isNew: false })));

      if (wasNew) {
        setStoryId(savedStoryId);
        if (embedded) {
          onArticleChange?.(savedStoryId, slug);
        } else {
          onArticleChange?.(savedStoryId, slug);
          try {
            router.replace(`/admin/story-manager?article=${savedStoryId}`);
          } catch { /* noop */ }
        }
      } else if (slugChanged && embedded) {
        // Slug edit on an existing article — host needs to repaint URL.
        onArticleChange?.(savedStoryId, slug);
      }

      setIsDirty(false);
      toast.push({ message: 'Article saved.', variant: 'success' });
    } catch (err) {
      toast.push({ message: (err as Error)?.message || 'Save failed', variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const publishStory = async () => {
    // Pass status='published' via the saveAll override — relying on
    // updateStory + setState here would race the immediate saveAll() and
    // the request would go out with the stale 'draft' status.
    await saveAll({ status: 'published' });
  };

  const deleteStory = () => {
    if (!storyId) return;
    const titleRaw = story.title || 'Untitled';
    const titleShort = titleRaw.length > 40 ? titleRaw.slice(0, 40) : titleRaw;
    setDestructive({
      title: `Delete article "${titleShort}"?`,
      message: 'Removes the article and every row keyed to it (timelines, sources, quizzes). Irreversible.',
      confirmText: titleShort,
      confirmLabel: 'Delete article',
      reasonRequired: false,
      action: 'article.delete',
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
        toast.push({ message: 'Article deleted', variant: 'success' });
        resetToEmpty();
        onArticleChange?.(null);
        if (!embedded) router.push('/admin/newsroom?tab=articles');
      },
    });
  };

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime(),
  );
  const storiesCount = entries.filter((e) => e.type === 'story').length;
  const eventsCount = entries.filter((e) => e.type === 'event').length;

  // Wrap the legacy admin chrome in <Page>; in embedded mode the host
  // already supplies layout, so render directly.
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
    const previewBody = (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0, marginBottom: S[3] }}>
          {story.title || 'Untitled'}
        </h1>
        {story.published_at && (
          <div style={{ fontSize: F.sm, color: C.dim, marginBottom: S[3] }}>{story.published_at}</div>
        )}
        {story.summary && (
          <p style={{ fontSize: F.lg, color: C.soft, lineHeight: 1.6, borderLeft: `3px solid ${C.divider}`, paddingLeft: S[3], marginBottom: S[6], fontStyle: 'italic' }}>
            {story.summary}
          </p>
        )}
        {/* Preview renders body_html (server-sanitized via renderBodyHtml). */}
        {/* Web admin only; iOS / Kids iOS not applicable (no admin tooling on iOS). */}
        {story.body_html ? (
          <div
            data-article-body
            className="admin-preview"
            style={{ fontSize: F.lg, color: C.ink, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: story.body_html }}
          />
        ) : story.body ? (
          <div style={{ fontSize: F.lg, color: C.dim, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
            {story.body}
            <div style={{ marginTop: 16, fontSize: F.sm }}>
              (Save the article to see the rendered preview with headings, pull quotes, and proper formatting.)
            </div>
          </div>
        ) : null}
        {(story.sources || []).length > 0 && (
          <div style={{ marginTop: S[8], paddingTop: S[4], borderTop: `1px solid ${C.divider}` }}>
            <div style={labelStyle}>Sources</div>
            {story.sources.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: S[2], padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.divider}`, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: C.accent, minWidth: 80 }}>{s.outlet}</span>
                <span style={{ color: C.soft, flex: 1 }}>{s.headline}</span>
              </div>
            ))}
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
          title="Preview"
          subtitle="How the article will render for readers."
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
          const isAnchor = e.type === 'story';
          const enlarged = e.is_current || isAnchor;
          return (
            <div key={e.id} style={{ position: 'relative', marginBottom: S[6] }}>
              <div
                style={{
                  position: 'absolute',
                  left: -24,
                  top: 5,
                  width: enlarged ? 14 : 10,
                  height: enlarged ? 14 : 10,
                  borderRadius: '50%',
                  background: e.is_current ? C.now : isAnchor ? C.accent : hasContent ? C.success : C.muted,
                  border: `3px solid ${C.bg}`,
                }}
              />
              {e.is_current ? (
                <span style={{ position: 'absolute', left: -80, top: 2, fontSize: F.xs, fontWeight: 700, color: C.now, background: C.nowBg, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                  Now
                </span>
              ) : isAnchor ? (
                <span style={{ position: 'absolute', left: -80, top: 2, fontSize: F.xs, fontWeight: 700, color: C.ink, background: C.card, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                  Article
                </span>
              ) : null}
              <div style={{ fontSize: F.sm, fontWeight: enlarged ? 700 : 500, color: e.is_current ? C.now : C.dim, marginBottom: 2 }}>{formatTimelineDate(e.event_date)}</div>
              <div style={{ fontSize: F.base, fontWeight: 600, color: enlarged ? C.ink : C.soft }}>
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
          subtitle="Chronological view of all entries with the current article marked."
          actions={<Button variant="secondary" onClick={() => setViewMode('edit')}>Close</Button>}
        />
        <PageSection>{timelineBody}</PageSection>
      </Page>
    );
  }


  const headerActions = (
    <>
      {isDirty && <Badge variant="warn">Unsaved</Badge>}
      <Badge variant={story.status === 'published' ? 'success' : 'neutral'} dot>{story.status}</Badge>
      {lastPersistedSlugRef.current && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/${lastPersistedSlugRef.current}`)}
        >
          Open article
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => setViewMode('timeline')}>Timeline</Button>
      <Button variant="secondary" size="sm" onClick={() => setViewMode('preview')}>Preview</Button>
      <Button variant="primary" size="sm" loading={saving} onClick={() => saveAll()}>Save</Button>
      <Button variant="secondary" size="sm" onClick={publishStory}>
        {story.status === 'published' ? 'Update & publish' : 'Publish'}
      </Button>
      {storyId && (
        <Button variant="ghost" size="sm" onClick={deleteStory} style={{ color: C.danger }}>
          Delete
        </Button>
      )}
    </>
  );

  const editorBody = (
    <>
      <Section embedded={embedded} divider={false}>
        {storyId && (
          <div>
            {!followupOpen ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={followupLoading}
                onClick={() => setFollowupOpen(true)}
              >
                Generate follow-up article
              </Button>
            ) : (
              <div
                style={{
                  padding: S[3],
                  border: `1px solid ${C.divider}`,
                  borderRadius: 8,
                  background: C.card,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: S[2],
                }}
              >
                <label style={labelStyle}>Source URLs (one per line)</label>
                <textarea
                  value={followupSourceUrls}
                  onChange={(e) => setFollowupSourceUrls(e.target.value)}
                  placeholder={'https://example.com/article-1\nhttps://example.com/article-2'}
                  rows={4}
                  style={{
                    width: '100%',
                    background: C.bg,
                    color: C.ink,
                    border: `1px solid ${C.divider}`,
                    borderRadius: 6,
                    padding: `${S[2]}px ${S[2]}px`,
                    fontSize: F.sm,
                    fontFamily: 'ui-monospace, monospace',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={followupLoading}
                    onClick={generateFollowup}
                  >
                    Generate
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setFollowupOpen(false); setFollowupSourceUrls(''); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: C.dim,
                      fontSize: F.sm,
                      padding: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {followupLoading && (
                  <span style={{ fontSize: F.sm, color: C.dim }}>
                    Generating… this takes about a minute
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section embedded={embedded} title="Metadata">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
          <div>
            <label style={labelStyle}>Category</label>
            <Select
              value={story.category}
              onChange={(e) => {
                // Wave E follow-up — clearing the now-stale subcategory
                // selection prevents saving an inconsistent (cat A, sub-of-
                // cat-B) pair. Only fires on user interaction, never on
                // initial load (which uses setStory directly above).
                const next = e.target.value;
                setStory((prev) => ({ ...prev, category: next, subcategory: '' }));
                setIsDirty(true);
              }}
              options={categories.map((c) => ({ value: c.name, label: c.name }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Subcategory</label>
            <Select
              value={story.subcategory}
              onChange={(e) => updateStory('subcategory', e.target.value)}
              options={[
                { value: '', label: 'Select...' },
                ...(subcategoriesByParent[story.category] || []).map((s) => ({ value: s.id, label: s.name })),
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
          {(() => {
            const today = todayInEditorialTz();
            const isHeroToday = story.hero_pick_for_date === today;
            return (
              <Button
                variant={isHeroToday ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  updateStory('hero_pick_for_date', isHeroToday ? null : today);
                }}
                title="When set, this article surfaces as the hero on today's home page front page (per spec/144). Auto-clears via date semantics tomorrow."
              >
                Today&rsquo;s hero{isHeroToday ? ' (on)' : ''}
              </Button>
            );
          })()}
        </div>
      </Section>

      <Section
        embedded={embedded}
        title="Ad eligibility"
        description="Editorial gate. Sensitive-content tags block all ads regardless of toggle."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[3], flexWrap: 'wrap' }}>
            <Button
              variant={story.ad_eligible ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => updateStory('ad_eligible', !story.ad_eligible)}
            >
              Allow ads on this article{story.ad_eligible ? ' (on)' : ' (off)'}
            </Button>
            {!story.ad_eligible && (
              <span style={{ fontSize: F.sm, color: C.dim, alignSelf: 'center' }}>
                Ads will not serve on this article regardless of campaign targeting.
              </span>
            )}
          </div>

          <div>
            <label style={labelStyle}>Sensitivity tags</label>
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
              {SENSITIVITY_TAGS.map((tag) => {
                const selected = story.sensitivity_tags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? story.sensitivity_tags.filter((t) => t !== tag.id)
                        : [...story.sensitivity_tags, tag.id];
                      updateStory('sensitivity_tags', next);
                    }}
                    style={{
                      fontSize: F.sm,
                      padding: `${S[1]}px ${S[2]}px`,
                      borderRadius: 999,
                      border: `1px solid ${selected ? C.ink : C.divider}`,
                      background: selected ? C.ink : 'transparent',
                      color: selected ? C.bg : C.ink,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      lineHeight: 1.2,
                    }}
                    aria-pressed={selected}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: F.sm, color: C.dim, marginTop: S[2] }}>
              Tags marked blocking will suppress all ads on this article (system-enforced).
            </div>
          </div>
        </div>
      </Section>

      <Section
        embedded={embedded}
        title={`Timeline entries (${entries.length})`}
        description={`${storiesCount} articles · ${eventsCount} events`}
        aside={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={!storyId || regenTimelineLoading}
              onClick={() => storyId && regenTimeline(storyId)}
            >
              {regenTimelineLoading ? 'Redoing…' : 'Redo timeline'}
            </Button>
            <Button variant="secondary" size="sm" onClick={addEvent}>+ Event</Button>
            <Button variant="primary" size="sm" onClick={addStoryEntry}>+ Article</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {sortedEntries.map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const hasContent = !!entry.content?.trim();
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
                  <Badge variant={entry.type === 'story' ? 'info' : 'neutral'} size="xs">{entry.type === 'story' ? 'Article' : 'Event'}</Badge>
                  {entry.is_current && <Badge variant="warn" size="xs">Now</Badge>}
                  {entry.event_date && (
                    <span style={{ fontSize: F.xs, color: C.muted, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
                      {entry.date_display || formatTimelineDate(entry.event_date)}
                    </span>
                  )}
                  <span style={{ fontSize: F.base, fontWeight: 600, color: C.ink, flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {entry.title || 'Untitled'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {dots.map((d, i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: d ? C.success : C.divider }} />
                    ))}
                    <span style={{ fontSize: F.xs, color: C.muted, marginLeft: 4 }}>{doneCount}/4</span>
                  </div>
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
                            <label style={labelStyle}>Headline</label>
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
                          <Textarea rows={2} value={entry.summary || ''} onChange={(e) => updateEntry(entry.id, 'summary', e.target.value)} placeholder="Brief summary." />
                        </div>
                        <div>
                          <label style={labelStyle}>Article body</label>
                          <Textarea rows={8} value={entry.content || ''} onChange={(e) => updateEntry(entry.id, 'content', e.target.value)} placeholder="Write the full article." />
                          <div style={{ marginTop: 8 }}>
                            <TTSButton text={entry.content || ''} title="Read aloud (ear-check)" />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
                          <div>
                            <label style={labelStyle}>Timeline date</label>
                            <DatePicker value={entry.timeline_date || entry.event_date || ''} onChange={(e) => updateEntry(entry.id, 'timeline_date', e.target.value)} />
                          </div>
                          <div>
                            <label style={labelStyle}>Timeline headline</label>
                            <TextInput value={entry.timeline_headline || ''} onChange={(e) => updateEntry(entry.id, 'timeline_headline', e.target.value)} placeholder="Short headline for the timeline" />
                          </div>
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', gap: S[1], alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        variant={entry.is_current ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => markCurrent(entry.id)}
                      >
                        Mark as now
                      </Button>
                      {entry.type === 'event' && (
                        <span style={{ fontSize: F.xs, color: C.muted, fontStyle: 'italic' }}>
                          Events appear on timeline only — no link, no quiz, no comments.
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <Button variant="ghost" size="sm" onClick={() => deleteEntry(entry.id)} style={{ color: C.danger }}>
                        Delete entry
                      </Button>
                    </div>

                    {entry.type === 'story' && factCheckData && (
                      (factCheckData.conflicts.length > 0 || factCheckData.single_source.length > 0 || factCheckData.implausibilities.length > 0) && (
                        <div style={{ marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.divider}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], marginBottom: S[2] }}>
                            <span style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#b45309' }}>
                              Fact-check flags
                            </span>
                            <span style={{ fontSize: F.xs, color: C.muted }}>
                              ({factCheckData.conflicts.length} conflict{factCheckData.conflicts.length !== 1 ? 's' : ''}, {factCheckData.single_source.length} single-source, {factCheckData.implausibilities.length} plausibility)
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                            {factCheckData.conflicts.map((f, i) => (
                              <div key={i} style={{ padding: S[2], background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, fontSize: F.sm }}>
                                <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 2 }}>Conflict</div>
                                <div style={{ color: '#78350f', marginBottom: 2 }}>&ldquo;{f.claim}&rdquo;</div>
                                <div style={{ color: '#92400e' }}>{f.note}</div>
                              </div>
                            ))}
                            {factCheckData.single_source.map((f, i) => (
                              <div key={i} style={{ padding: S[2], background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: F.sm }}>
                                <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: 2 }}>Single source</div>
                                <div style={{ color: '#1e3a8a', marginBottom: 2 }}>&ldquo;{f.claim}&rdquo;</div>
                                <div style={{ color: '#1e40af' }}>{f.note}</div>
                              </div>
                            ))}
                            {factCheckData.implausibilities.map((f, i) => (
                              <div key={i} style={{ padding: S[2], background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, fontSize: F.sm }}>
                                <div style={{ fontWeight: 600, color: '#9f1239', marginBottom: 2 }}>Plausibility</div>
                                <div style={{ color: '#881337', marginBottom: 2 }}>&ldquo;{f.claim}&rdquo;</div>
                                <div style={{ color: '#9f1239' }}>{f.note}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}

                    {entry.type === 'story' && (
                      <div style={{ marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.divider}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[2], flexWrap: 'wrap', gap: S[2] }}>
                          <span style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.soft }}>
                            Sources ({(story.sources || []).length})
                          </span>
                          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!storyId || regenSourcesLoading}
                              onClick={() => storyId && regenSources(storyId)}
                            >
                              {regenSourcesLoading ? 'Redoing…' : 'Redo sources'}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={addSource}>+ Add source</Button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                          {(story.sources || []).map((s) => (
                            <div
                              key={s.id}
                              style={{
                                display: 'flex',
                                gap: S[2],
                                alignItems: 'flex-start',
                                padding: S[2],
                                border: `1px solid ${C.divider}`,
                                borderRadius: 8,
                                background: C.card,
                                flexWrap: 'wrap',
                              }}
                            >
                              <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', flex: '1 1 100%', alignItems: 'center' }}>
                                <TextInput block={false} value={s.outlet} onChange={(e) => updateSource(s.id, 'outlet', e.target.value)} placeholder="Outlet" style={{ minWidth: 120, flex: '1 1 120px' }} />
                                <TextInput block={false} value={s.url} onChange={(e) => updateSource(s.id, 'url', e.target.value)} placeholder="https://..." style={{ minWidth: 160, flex: '2 1 160px', fontFamily: 'ui-monospace, monospace', fontSize: F.sm }} />
                                <TextInput block={false} value={s.headline} onChange={(e) => updateSource(s.id, 'headline', e.target.value)} placeholder="Original headline" style={{ minWidth: 160, flex: '3 1 200px' }} />
                                <Button variant="ghost" size="sm" onClick={() => deleteSource(s.id)} style={{ color: C.muted }}>Remove</Button>
                              </div>
                              <Textarea
                                rows={2}
                                value={s.quote ?? ''}
                                onChange={(e) => updateSource(s.id, 'quote', e.target.value)}
                                placeholder="Pull-quote (optional)"
                                style={{ flex: '1 1 100%', fontSize: F.sm }}
                              />
                            </div>
                          ))}
                          {(story.sources || []).length === 0 && (
                            <div style={{ padding: S[3], border: `1px dashed ${C.divider}`, borderRadius: 8, textAlign: 'center', color: C.dim, fontSize: F.sm }}>
                              No sources yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {entry.type === 'story' && (() => {
                      const entryQuizzes = quizzes.filter((q) => q.entry_id === entry.id && !q._deleted);
                      const atLimit = entryQuizzes.length >= MAX_QUIZ_QUESTIONS;
                      return (
                        <div style={{ marginTop: S[3], paddingTop: S[3], borderTop: `1px solid ${C.divider}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[2], flexWrap: 'wrap', gap: S[2] }}>
                            <span style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.soft }}>
                              Quiz questions ({entryQuizzes.length} of {MAX_QUIZ_QUESTIONS})
                            </span>
                            <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!storyId || regenQuizLoading}
                                onClick={() => storyId && regenQuiz(storyId)}
                              >
                                {regenQuizLoading ? 'Regenerating...' : 'Regenerate quiz'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={atLimit}
                                onClick={() => addQuiz(entry.id)}
                              >
                                + Add question
                              </Button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                            {entryQuizzes.map((q, qIdx) => (
                              <div
                                key={q.id}
                                style={{
                                  padding: S[3],
                                  border: `1px solid ${C.divider}`,
                                  borderRadius: 8,
                                  background: C.card,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: S[2],
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                                  <Badge variant="neutral" size="xs">Q{qIdx + 1}</Badge>
                                  <div style={{ minWidth: 160 }}>
                                    <Select
                                      value={q.question_type}
                                      onChange={(e) => updateQuizType(q.id, e.target.value as QuizLocal['question_type'])}
                                      options={[
                                        { value: 'multiple_choice', label: 'Multiple choice' },
                                        { value: 'true_false', label: 'True / false' },
                                      ]}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }} />
                                  <Button variant="ghost" size="sm" onClick={() => removeQuiz(q.id)} style={{ color: C.muted }}>
                                    Remove
                                  </Button>
                                </div>
                                <div>
                                  <label style={labelStyle}>Question</label>
                                  <TextInput
                                    value={q.question_text}
                                    onChange={(e) => updateQuizField(q.id, 'question_text', e.target.value)}
                                    placeholder="Ask a question about the article."
                                  />
                                </div>
                                <div>
                                  <label style={labelStyle}>
                                    {q.question_type === 'true_false' ? 'Answer' : 'Options (pick the correct one)'}
                                  </label>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                                    {q.options.map((opt, i) => (
                                      <div
                                        key={i}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: S[2],
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        <label style={{ display: 'flex', alignItems: 'center', gap: S[1], cursor: 'pointer', minWidth: 28 }}>
                                          <input
                                            type="radio"
                                            name={`correct_${q.id}`}
                                            checked={!!opt.is_correct}
                                            onChange={() => setQuizCorrect(q.id, i)}
                                            style={{ cursor: 'pointer' }}
                                          />
                                        </label>
                                        {q.question_type === 'true_false' ? (
                                          <span style={{ fontSize: F.sm, color: C.ink, fontWeight: 500, flex: '1 1 auto' }}>
                                            {opt.text}
                                          </span>
                                        ) : (
                                          <TextInput
                                            block={false}
                                            value={opt.text}
                                            onChange={(e) => updateQuizOptionText(q.id, i, e.target.value)}
                                            placeholder={`Option ${i + 1}`}
                                            style={{ flex: '1 1 200px', minWidth: 160 }}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <label style={labelStyle}>Explanation (shown after answering)</label>
                                  <Textarea
                                    rows={2}
                                    value={q.explanation}
                                    onChange={(e) => updateQuizField(q.id, 'explanation', e.target.value)}
                                    placeholder="Why is this the correct answer?"
                                  />
                                </div>
                              </div>
                            ))}
                            {entryQuizzes.length === 0 && (
                              <div style={{ padding: S[3], border: `1px dashed ${C.divider}`, borderRadius: 8, textAlign: 'center', color: C.dim, fontSize: F.sm }}>
                                No questions yet. Add up to {MAX_QUIZ_QUESTIONS}.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          {entries.length === 0 && (
            <div style={{ padding: S[6], border: `1px dashed ${C.divider}`, borderRadius: 10, textAlign: 'center', color: C.dim }}>
              No timeline entries yet. Add an event if this article is part of a larger timeline.
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
        title={story.title || 'New article'}
        subtitle="Each timeline entry holds its own article fields, sources, and quiz pool."
        actions={headerActions}
      />
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
