// @migrated-to-permissions 2026-04-18
// @feature-verified tts 2026-04-18
// @feature-verified article_reading 2026-04-18
'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../../../lib/supabase/client';
import { getSettings, isEnabled, getNumber } from '../../../lib/settings';
import ArticleQuiz from '../../../components/ArticleQuiz';
import CommentThread from '../../../components/CommentThread';
import TTSButton from '../../../components/TTSButton';
import Ad from '../../../components/Ad';
import Interstitial from '../../../components/Interstitial';
import { bumpArticleViewCount } from '../../../lib/session';
import { useFocusTrap } from '../../../lib/useFocusTrap';
import { useTrack } from '@/lib/useTrack';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { getPlanLimitValue } from '@/lib/plans';
import type { Tables } from '@/types/database-helpers';

// ------- Local shape helpers -------
// `articles` is joined with a slim `categories` projection; Row plus the nested
// relation gives us a single shape consumers can index off without unions.
type ArticleRow = Tables<'articles'> & {
  categories: { name: string | null; slug: string | null } | null;
  // Legacy UI flag: the badge reads `is_developing`, but the column was never
  // added to the table. Keep optional so the render path still compiles and
  // behaves exactly as before (branch stays false at runtime).
  is_developing?: boolean | null;
};

type SourceRow = Tables<'sources'> & {
  // Legacy fields the UI pills were written against before the sources schema
  // was normalized. The `saveAll` in /admin/story-manager writes `title`, not
  // `headline`, and never writes `excerpt`. Declared optional to preserve the
  // existing (no-op) render behavior rather than silently changing what shows.
  headline?: string | null;
  excerpt?: string | null;
};

type TimelineRow = Tables<'timelines'> & {
  // Stored inside `metadata` in practice; surfaced as optional direct props so
  // the Timeline component's current/future styling paths stay compilable.
  is_current?: boolean | null;
  is_future?: boolean | null;
};

// Supabase's auth `User` exposes `email_confirmed_at` (timestamp) — we read it
// directly below the quiz. No extension needed.
type AuthUser = User;

interface TimelineEvent {
  id?: string;
  event_date?: string | null;
  event_label?: string | null;
  event_body?: string | null;
  is_current?: boolean | null;
  is_future?: boolean | null;
}

interface SourcePill {
  id?: string;
  publisher?: string | null;
  title?: string | null;
  quote?: string | null;
  url?: string | null;
}

interface ReportCategory {
  value: string;
  label: string;
}

const REPORT_CATEGORIES: ReportCategory[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'spam', label: 'Spam' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'off_topic', label: 'Off Topic' },
  { value: 'impersonation', label: 'Impersonation' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

function SourcePills({ sources }: { sources: SourcePill[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sources.map((src, i) => (
          <button
            key={src.id || i}
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              padding: '4px 10px', borderRadius: 16,
              border: expanded === i ? '1px solid var(--soft)' : '1px solid var(--border)',
              background: 'transparent',
              color: expanded === i ? 'var(--white)' : 'var(--dim)',
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {src.publisher || 'Source'}
          </button>
        ))}
      </div>
      {expanded !== null && sources[expanded] && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 8,
          background: 'var(--srcCard)', border: '1px solid var(--border)',
          animation: 'vpFadeIn 0.15s ease',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--white)' }}>
            {sources[expanded].publisher || 'Source'}
          </div>
          {sources[expanded].title && (
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--white)', marginBottom: 4 }}>
              {sources[expanded].title}
            </div>
          )}
          {sources[expanded].quote && (
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 6 }}>
              {sources[expanded].quote}
            </div>
          )}
          {sources[expanded].url && (
            <a href={sources[expanded].url || '#'} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
              Read on {sources[expanded].publisher} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events || events.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--dim)' }}>No timeline yet.</div>;
  }
  // Flag the most recent non-future event as "current" if none is explicitly marked.
  const hasExplicitCurrent = events.some(e => e.is_current);
  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      <div style={{
        position: 'absolute', left: 4, top: 4, bottom: 4, width: 1,
        background: 'var(--tlLine)',
      }} />
      {events.map((ev, i) => {
        const isCurrent = ev.is_current || (!hasExplicitCurrent && i === events.length - 1);
        return (
          <div key={ev.id || i} style={{ paddingBottom: 22, position: 'relative' }}>
            {isCurrent ? (
              <>
                <div style={{
                  position: 'absolute', left: -24, top: 2,
                  fontSize: 9, textTransform: 'uppercase', color: 'var(--accent)',
                  fontWeight: 600, letterSpacing: '0.05em',
                  transform: 'translateX(-100%) translateX(-8px)', whiteSpace: 'nowrap',
                }}>NOW</div>
                <div style={{
                  position: 'absolute', left: -26, top: 0,
                  width: 12, height: 12, borderRadius: '50%',
                  background: 'var(--white)', border: '2px solid var(--accent)',
                  boxShadow: '0 0 0 4px var(--bg)',
                }} />
              </>
            ) : (
              <div style={{
                position: 'absolute', left: -24, top: 4,
                width: 8, height: 8, borderRadius: '50%',
                background: ev.is_future ? 'var(--tlDot)' : 'var(--dim)',
                opacity: ev.is_future ? 0.45 : 1,
              }} />
            )}
            <div style={{ opacity: ev.is_future ? 0.45 : 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)', marginBottom: 2 }}>
                {ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}
                {ev.is_future && <span style={{ fontStyle: 'italic', marginLeft: 6 }}>Upcoming</span>}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--soft)' }}>
                {ev.event_label || ev.event_body}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function StoryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const supabase = createClient();
  const trackEvent = useTrack();

  const [story, setStory] = useState<ArticleRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [userTier, setUserTier] = useState<string>('free');
  const [canBookmarkAdd, setCanBookmarkAdd] = useState<boolean>(false);
  const [canListenTts, setCanListenTts] = useState<boolean>(false);
  // Default to false so paid-content flashes don't leak while permissions
  // resolve. Anonymous path sets them true explicitly below (public
  // gating is via regwall/quiz, not these per-article permission keys).
  const [canViewBody, setCanViewBody] = useState<boolean>(false);
  const [canViewSources, setCanViewSources] = useState<boolean>(false);
  const [canViewTimeline, setCanViewTimeline] = useState<boolean>(false);
  const [canViewAdFree, setCanViewAdFree] = useState<boolean>(false);

  const [bookmarked, setBookmarked] = useState<boolean>(false);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [bookmarkTotal, setBookmarkTotal] = useState<number | null>(null);
  // T-016: free-plan bookmark cap is DB-driven via plan_features.bookmarks.
  // Fallback to 10 preserves prior behaviour when the row is unreachable.
  const [bookmarkCap, setBookmarkCap] = useState<number>(10);
  const [shareMsg, setShareMsg] = useState<string>('');

  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportCategory, setReportCategory] = useState<string>('');
  const [reportDetail, setReportDetail] = useState<string>('');
  const [reportSuccess, setReportSuccess] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string>('');

  const [showRegWall, setShowRegWall] = useState<boolean>(false);
  // R13-C5 Fix 5 — per-session dismissal of the regwall. The underlying
  // views >= limit gate is unchanged; this only lets the user soft-dismiss
  // the current showing. Next session the wall returns as normal.
  const [regWallDismissed, setRegWallDismissed] = useState<boolean>(false);
  const [showAnonInterstitial, setShowAnonInterstitial] = useState<boolean>(false);
  const [userPassedQuiz, setUserPassedQuiz] = useState<boolean>(false);
  const [quizPoolSize, setQuizPoolSize] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'Article' | 'Timeline' | 'Discussion'>('Article');
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const [bookmarkError, setBookmarkError] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1025px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // M-12: the `vp:regwall-dismissed` sessionStorage flag persists for
  // the lifetime of the tab, which means a user who signs up in
  // another tab and switches back here stays in the dismissed-but-
  // stale state. Drop the flag the moment we notice auth has flipped,
  // either via the page's own currentUser state (same-tab) or via a
  // `storage` event from Supabase's auth token key (cross-tab).
  useEffect(() => {
    if (!currentUser) return;
    try { window.sessionStorage.removeItem('vp:regwall-dismissed'); } catch {}
    setRegWallDismissed(false);
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        try { window.sessionStorage.removeItem('vp:regwall-dismissed'); } catch {}
        setRegWallDismissed(false);
      }
    });
    const onStorage = (e: StorageEvent) => {
      // Supabase writes its session under an `sb-*-auth-token` key in
      // localStorage. Any change there on another tab means auth state
      // just moved; drop the regwall dismissal so this tab re-evaluates.
      if (e.key && e.key.startsWith('sb-') && e.key.includes('auth-token')) {
        try { window.sessionStorage.removeItem('vp:regwall-dismissed'); } catch {}
        setRegWallDismissed(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      sub?.subscription?.unsubscribe?.();
      window.removeEventListener('storage', onStorage);
    };
    // supabase client is stable across renders from createClient(); effect
    // only needs to subscribe once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // R13-C5 Fix 5: regwall now has a soft Close action. Focus trap keeps
  // Tab inside the dialog; Escape remains a no-op (close is an explicit
  // click on the Close button + sessionStorage persistence).
  const regWallRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showRegWall, regWallRef);

  const reportModalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showReportModal, reportModalRef, {
    onEscape: () => setShowReportModal(false),
  });

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      try {
        const { data: storyData, error: storyErr } = await supabase
          .from('articles')
          .select('*, categories!fk_articles_category_id(name, slug)')
          .eq('slug', slug)
          .single();
        if (storyErr) console.error('[story] load failed', storyErr);
        if (!storyData) { setLoading(false); return; }
        setStory(storyData as unknown as ArticleRow);

        const allSettings = await getSettings(supabase).catch(err => {
          console.error('[story] settings load failed', err);
          return {};
        });

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) setCurrentUser(authUser as AuthUser);

        if (!authUser) {
          // Anonymous readers: view gating runs through the regwall/quiz
          // path, not per-article permission keys. Grant the view flags
          // so the default-false init above doesn't hide public content.
          setCanViewBody(true);
          setCanViewSources(true);
          setCanViewTimeline(true);
          // D23: anonymous gets a sign-up interstitial on the 2nd article open.
          // The registration wall (harder block) kicks in at the configured
          // free_article_limit.
          const views = bumpArticleViewCount();
          if (views >= 2) setShowAnonInterstitial(true);
          if (isEnabled(allSettings, 'registration_wall', false)) {
            const limit = getNumber(allSettings, 'free_article_limit', 5);
            // R13-C5 Fix 5 — honor per-session dismissal so a user who
            // clicked Close once isn't re-blocked on every subsequent
            // article load in the same browser tab.
            let dismissed = false;
            try { dismissed = typeof window !== 'undefined' && window.sessionStorage.getItem('vp:regwall-dismissed') === '1'; }
            catch (e) { console.error('[story] regwall dismiss read', e); }
            if (dismissed) setRegWallDismissed(true);
            if (views >= limit && !dismissed) setShowRegWall(true);
          }
        }

        if (authUser) {
          const { data: userData } = await supabase
            .from('users')
            .select('email_verified, plans(tier)')
            .eq('id', authUser.id)
            .single();
          const userRow = userData as { email_verified?: boolean | null; plans?: { tier?: string | null } | null } | null;
          setUserTier(userRow?.plans?.tier || 'free');

          await refreshAllPermissions();
          await refreshIfStale();
          setCanBookmarkAdd(hasPermission('article.bookmark.add'));
          setCanListenTts(hasPermission('article.listen_tts'));
          setCanViewBody(hasPermission('article.view.body'));
          setCanViewSources(hasPermission('article.view.sources'));
          setCanViewTimeline(hasPermission('article.view.timeline'));
          setCanViewAdFree(hasPermission('article.view.ad_free'));

          // Record the open now (completed: false) — server won't score or
          // bump view_count until a real engagement signal flips it to true.
          fetch('/api/stories/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId: storyData.id, completed: false }),
          }).catch(err => console.error('[story] read-open signal failed', err));
        }

        const storyId = storyData.id;

        // D6: check pass status BEFORE fetching comments. If not passed,
        // skip the comments fetch entirely — discussion is invisible.
        let passedQuiz = false;
        if (authUser) {
          const { data: passData } = await supabase.rpc('user_passed_article_quiz', {
            p_user_id: authUser.id,
            p_article_id: storyId,
          });
          passedQuiz = !!passData;
          setUserPassedQuiz(passedQuiz);
        }

        const [timelineRes, sourcesRes, quizPoolRes] = await Promise.all([
          supabase.from('timelines').select('*').eq('article_id', storyId).order('event_date', { ascending: true }),
          supabase.from('sources').select('*').eq('article_id', storyId),
          supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('article_id', storyId),
        ]);
        setTimeline((timelineRes.data as TimelineRow[] | null) || []);
        setSources((sourcesRes.data as SourceRow[] | null) || []);
        setQuizPoolSize(quizPoolRes.count || 0);

        // Comments live inside <CommentThread/>, which does its own
        // fetch + realtime once the user has passed the quiz (D6).

        if (authUser) {
          const { data: bookmarkRes } = await supabase
            .from('bookmarks').select('id').eq('user_id', authUser.id).eq('article_id', storyId).maybeSingle();
          if (bookmarkRes) { setBookmarked(true); setBookmarkId(bookmarkRes.id); }
          // Pass 17 / UJ-608 + UJ-613: pre-fetch the user's total bookmark
          // count so the button can pre-disable at the free-tier cap
          // (DB-driven via plan_features.bookmarks — see T-016). Cheap
          // query — `count: 'exact', head: true` returns just the row count.
          const { count: bookmarkCount } = await supabase
            .from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', authUser.id);
          if (typeof bookmarkCount === 'number') setBookmarkTotal(bookmarkCount);
          // T-016: resolve the DB-side bookmark cap for the user's plan.
          const { data: planProfile } = await supabase
            .from('users').select('plan_id').eq('id', authUser.id).maybeSingle();
          const cap = await getPlanLimitValue(supabase, planProfile?.plan_id ?? null, 'bookmarks', 10);
          if (typeof cap === 'number') setBookmarkCap(cap);
        }
      } catch (err) {
        console.error('Story load error:', err);
        // On a transient perms/users fetch failure, fail-open so a
        // logged-in reader with a valid article doesn't see the locked
        // "Upgrade" panel from the default-false canView* flags above.
        // RLS still gates the real body row server-side.
        setCanViewBody(true);
        setCanViewSources(true);
        setCanViewTimeline(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // Fire page_view once the article resolves. Keyed on story.id so
  // slug aliases or editor renames re-fire if the loaded article
  // changes identity under the same URL.
  useEffect(() => {
    if (!story?.id) return;
    trackEvent('page_view', 'product', {
      content_type: 'story',
      article_id: story.id,
      article_slug: story.slug ?? null,
      category_slug: story.categories?.slug ?? null,
      author_id: story.author_id ?? null,
      page: `/story/${story.slug}`,
      payload: {
        is_breaking: !!story.is_breaking,
        quiz_pool_size: quizPoolSize,
      },
    });
  }, [story?.id, quizPoolSize, trackEvent]);

  // Mark reading complete only after a genuine engagement signal:
  // 30s dwell OR scroll >=80% of the viewport height past the start.
  // Ensures D22 scoring + view_count reflect real reading, not tab-open noise.
  const completedSentRef = useRef<boolean>(false);
  useEffect(() => {
    if (!story || !currentUser || completedSentRef.current) return;

    const markComplete = (readPercentage: number | null) => {
      if (completedSentRef.current) return;
      completedSentRef.current = true;
      fetch('/api/stories/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: story.id,
          completed: true,
          readPercentage: readPercentage ?? null,
        }),
      }).catch(err => console.error('[story] read-complete signal failed', err));
    };

    // M-09: gate the dwell-timer behind visibility so a tab that has
    // been backgrounded for the whole 30s window does not inflate
    // verity_score / view_count. The scroll branch already implies
    // engagement, so leave it alone.
    const dwellTimer = setTimeout(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      markComplete(null);
    }, 30_000);

    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = (window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1);
      if (scrolled >= 0.8) markComplete(Math.min(100, Math.round(scrolled * 100)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      clearTimeout(dwellTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [story, currentUser]);

  const handleShare = async () => {
    const url = window.location.href;
    // Pass 17 / UJ-606: prefer navigator.clipboard, fall back to the
    // legacy execCommand copy for browsers that don't ship the async
    // clipboard API, then fall back to a visible URL the user can copy
    // manually as a last resort.
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg('Link copied!');
        setTimeout(() => setShareMsg(''), 2000);
        return;
      } catch {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        setShareMsg('Link copied!');
        setTimeout(() => setShareMsg(''), 2000);
        return;
      }
    } catch {}
    // Last resort: surface the URL for manual copy.
    setShareMsg(`Copy: ${url}`);
    setTimeout(() => setShareMsg(''), 6000);
  };

  const toggleBookmark = async () => {
    if (!currentUser || !story) return;
    setBookmarkError('');
    if (bookmarked && bookmarkId) {
      const res = await fetch(`/api/bookmarks/${bookmarkId}`, { method: 'DELETE' });
      if (res.ok) { setBookmarked(false); setBookmarkId(null); }
      else { setBookmarkError('Could not remove bookmark. Please try again.'); }
    } else {
      // Route enforces D13 cap via the bookmark_cap trigger.
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: story.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) { setBookmarked(true); setBookmarkId(data.id); }
      else {
        // M-11: dedupe cap messaging — the inline banner is the single
        // source of truth for the at-cap state (the button is disabled
        // at cap anyway, so this branch is unreachable under normal
        // use). Fall through to the generic failure copy for edge
        // cases. Also resolves L-04 (curly-apostrophe copy removed).
        setBookmarkError('Could not save bookmark. Please try again.');
      }
    }
  };

  const handleReport = async () => {
    if (!reportCategory || !story) return;
    setReportError('');
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'article',
          targetId: story.id,
          reason: reportCategory,
          description: reportDetail.trim() || null,
        }),
      });
      if (res.ok) {
        setReportSuccess(true);
        setReportCategory(''); setReportDetail('');
        setTimeout(() => { setShowReportModal(false); setReportSuccess(false); setReportError(''); }, 2000);
      } else {
        const data = await res.json().catch(() => ({} as { error?: string }));
        setReportError(data?.error || 'Could not submit report. Please try again.');
      }
    } catch (e) {
      console.error('[story] report submit', e);
      setReportError('Network error — please try again.');
    }
  };

  if (loading) {
    return (
      <div className="vp-dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--dim)' }}>Loading...</div>
      </div>
    );
  }
  if (!story) {
    return (
      <div className="vp-dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--dim)' }}>Article not found.</div>
      </div>
    );
  }

  const categoryName = story.categories?.name || '';
  const bodyParagraphs = story.body ? story.body.split('\n').filter(p => p.trim().length > 0) : [];

  // D1 quiz gate:
  //   - quizPoolSize < 10 → entire block hidden (not enough questions to
  //     support 2 non-overlapping sets for free users).
  //   - currentUser + pool >= 10 → render the quiz.
  //   - anon + pool >= 10 → render a sign-up CTA so anon users know the
  //     discussion is earned by passing a quiz after sign-up.
  let quizNode: React.ReactNode = null;
  if (quizPoolSize >= 10) {
    if (currentUser) {
      quizNode = (
        <ArticleQuiz
          articleId={story.id}
          initialPassed={userPassedQuiz}
          userTier={userTier}
          onPass={() => setUserPassedQuiz(true)}
        />
      );
    } else {
      const signupHref = `/signup?next=${encodeURIComponent('/story/' + story.slug)}`;
      quizNode = (
        <div style={{
          padding: 18, borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--card)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
            Take the quiz to join the discussion
          </div>
          <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 14 }}>
            Comments on every article are gated by a short comprehension quiz. Sign up to take this one and unlock the conversation.
          </div>
          <a href={signupHref} style={{
            display: 'inline-block', padding: '10px 18px', borderRadius: 10,
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>Sign up</a>
          <div style={{ marginTop: 10 }}>
            <a href={`/login?next=${encodeURIComponent('/story/' + story.slug)}`} style={{
              fontSize: 12, color: 'var(--dim)', textDecoration: 'none',
            }}>Already have an account? Sign in</a>
          </div>
        </div>
      );
    }
  }

  const lockPanelStyle: React.CSSProperties = {
    padding: '18px 20px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--card)',
    textAlign: 'center',
  };
  const lockCtaStyle: React.CSSProperties = {
    display: 'inline-block', padding: '10px 18px', borderRadius: 10,
    background: 'var(--accent)', color: '#fff',
    fontSize: 13, fontWeight: 600, textDecoration: 'none',
  };

  const discussionSection = userPassedQuiz ? (
    <CommentThread
      articleId={story.id}
      articleCategoryId={story.category_id}
      currentUserId={currentUser?.id}
      currentUserTier={userTier}
    />
  ) : currentUser && currentUser.email_confirmed_at ? (
    // Pass 17 / UJ-1102: verified users who haven't passed the quiz see
    // an informational panel instead of silence. D6 still holds — actual
    // comment content stays hidden; only the gating copy is shown.
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
        Discussion is locked until you pass the quiz above.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>
        You need 3 out of 5 correct to join the comment thread for this article.
      </div>
    </div>
  ) : (
    // H-16: anon (or verified-no-email) readers previously got `null`
    // here, which rendered an empty Discussion tab on mobile. Mirror
    // the locked-panel shape so every tab state has visible content,
    // and surface the Create-free-account CTA inline.
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
        Discussion is for signed-in readers.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 12 }}>
        Create a free account, then pass a short quiz to join the comments on any article.
      </div>
      <a href={`/signup?next=${encodeURIComponent('/story/' + story.slug)}`} style={lockCtaStyle}>
        Create free account
      </a>
    </div>
  );

  const showMobileDiscussion = !isDesktop && activeTab === 'Discussion';
  const showMobileTimeline = !isDesktop && activeTab === 'Timeline';
  const showArticleBody = isDesktop || activeTab === 'Article';

  return (
    <div className="vp-dark">
      {/* D23: anonymous 2nd-article interstitial (sign-up CTA variant) */}
      <Interstitial open={showAnonInterstitial} onClose={() => setShowAnonInterstitial(false)} variant="signup" />

      {/* Registration wall */}
      {showRegWall && !regWallDismissed && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.92)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div
            ref={regWallRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="regwall-title"
            style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
              padding: '40px 32px', maxWidth: 420, textAlign: 'center', position: 'relative',
            }}
          >
            {/* R13-C5 Fix 5 — soft close. The views >= limit gate is
                unchanged; this only dismisses the current showing and
                persists per-session via sessionStorage. */}
            <button
              onClick={() => {
                setRegWallDismissed(true);
                setShowRegWall(false);
                try { window.sessionStorage.setItem('vp:regwall-dismissed', '1'); }
                catch (e) { console.error('[story] regwall dismiss write', e); }
              }}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, right: 12,
                background: 'transparent', border: 'none', color: 'var(--soft)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
              }}
            >Close</button>
            <div id="regwall-title" style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: 'var(--white)' }}>Sign up to keep reading</div>
            <div style={{ fontSize: 14, color: 'var(--soft)', marginBottom: 24, lineHeight: 1.5 }}>
              You&apos;ve reached the free article limit. Create an account to continue.
            </div>
            <a href="/signup" style={{
              display: 'inline-block', padding: '12px 32px', borderRadius: 10,
              background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 15,
              textDecoration: 'none',
            }}>Create free account</a>
          </div>
        </div>
      )}

      {/* Mobile tab bar — launch-phase hide. Timeline + Discussion
          tabs are currently gated off below, so the bar would only
          have "Article" on it. Hide the whole bar until the other
          tabs come back online. Flip `false` → original condition
          to unhide. */}
      {false && !isDesktop && (
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        position: 'sticky', top: 'var(--vp-top-bar-h, 0px)', zIndex: 50,
      }}>
        {(['Article', 'Timeline', 'Discussion'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: '10px 0', background: 'transparent', border: 'none',
            borderBottom: activeTab === tab ? '2px solid var(--white)' : '2px solid transparent',
            color: activeTab === tab ? 'var(--white)' : 'var(--dim)',
            fontWeight: activeTab === tab ? 600 : 400, fontSize: 13, cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>{tab}</button>
        ))}
      </div>
      )}

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 80px' }}>
        <div className="story-layout" style={{ display: 'flex', gap: 40 }}>
          {/* Article column */}
          <div className="story-content" style={{ flex: 1, maxWidth: '65ch', minWidth: 0 }}>
            {/* Article body — on desktop always; on mobile only when Article tab is active */}
            {showArticleBody && (
            <div className="tab-article">
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {categoryName && (
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>
                    {categoryName}
                  </span>
                )}
                {story.is_breaking && (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--wrong)' }}>Breaking</span>
                )}
                {story.is_developing && (
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}>Developing</span>
                )}
              </div>

              <h1 style={{
                fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 700,
                lineHeight: 1.25, letterSpacing: -0.4, marginBottom: 12, color: 'var(--white)',
              }}>{story.title}</h1>

              {story.excerpt && (
                <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--soft)', marginBottom: 16 }}>
                  {story.excerpt}
                </p>
              )}

              <div style={{ fontSize: 13, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 12, flexWrap: 'wrap' }}>
                <span>
                  {formatDate(story.published_at || story.created_at)}
                  {sources.length > 0 && ` · ${sources.length} source${sources.length === 1 ? '' : 's'}`}
                </span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {canListenTts && (
                    <TTSButton text={`${story.title}. ${story.body || ''}`} />
                  )}
                  {/* T-016: free-plan bookmark cap is DB-driven. Previously
                    * hardcoded `>= 10` and "10 of 10"; bookmarkCap now
                    * comes from plan_features.bookmarks for the user's plan. */}
                  {(() => {
                    const atCap = !bookmarked && !canBookmarkAdd && typeof bookmarkTotal === 'number' && bookmarkTotal >= bookmarkCap;
                    return (
                      <button onClick={toggleBookmark} disabled={atCap} title={atCap ? 'Upgrade for unlimited bookmarks' : undefined} style={{
                        padding: '10px 14px', borderRadius: 8, minHeight: 44,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: bookmarked ? 'var(--accent)' : atCap ? '#ccc' : 'var(--dim)',
                        fontSize: 13, cursor: atCap ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
                        opacity: atCap ? 0.6 : 1,
                      }}>
                        {bookmarked ? 'Saved' : atCap ? `At cap (${bookmarkCap})` : 'Save'}
                      </button>
                    );
                  })()}
                  {!canBookmarkAdd && typeof bookmarkTotal === 'number' && bookmarkTotal >= bookmarkCap && !bookmarked && (
                    <div style={{ fontSize: 13, color: '#b45309', marginLeft: 8 }}>
                      You&apos;ve used {bookmarkCap} of {bookmarkCap} free bookmarks. <a href="/profile/settings/billing" style={{ color: '#b45309', fontWeight: 700 }}>Upgrade for unlimited</a>
                    </div>
                  )}
                  <button onClick={handleShare} style={{
                    padding: '10px 14px', borderRadius: 8, minHeight: 44,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}>{shareMsg || 'Share'}</button>
                </div>
              </div>

              {canViewBody ? (
                <article>
                  {bodyParagraphs.map((p, i) => (
                    <p key={i} style={{
                      fontSize: 18, lineHeight: 1.55, color: 'var(--white)',
                      marginBottom: 16, fontFamily: 'var(--font-sans)',
                    }}>{p}</p>
                  ))}
                </article>
              ) : currentUser ? (
                <div style={{
                  padding: '20px 22px', borderRadius: 12,
                  border: '1px solid var(--border)', background: 'var(--card)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
                    Upgrade to read this article
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 14 }}>
                    Your current plan does not include full article access.
                  </div>
                  <a href="/profile/settings/billing" style={{
                    display: 'inline-block', padding: '10px 18px', borderRadius: 10,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  }}>Upgrade</a>
                </div>
              ) : null}

              {canViewSources && <SourcePills sources={sources} />}

              {!canViewAdFree && (
                <Ad placement="article_bottom" page="article" position="bottom" articleId={story.id} />
              )}

              {bookmarkError && (
                <div style={{ marginTop: 12, padding: '8px 10px', fontSize: 12, color: 'var(--wrong)', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(239,68,68,0.08)' }}>
                  {bookmarkError}
                </div>
              )}

              {/* Report */}
              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <button onClick={() => setShowReportModal(true)} style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                }}>Report this article</button>
              </div>
            </div>
            )}

            {/* Timeline (mobile) — launch-phase hide. */}
            {false && showMobileTimeline && canViewTimeline && (
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--dim)', marginBottom: 16, letterSpacing: '0.04em' }}>Timeline</div>
                <Timeline events={timeline} />
              </div>
            )}
          </div>

          {/* Timeline (desktop aside) — launch-phase hide. */}
          {false && isDesktop && canViewTimeline && (
          <aside style={{
            width: 260, flexShrink: 0, position: 'sticky', top: 60, alignSelf: 'flex-start',
          }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--dim)', marginBottom: 16, letterSpacing: '0.04em' }}>Timeline</div>
            <Timeline events={timeline} />
          </aside>
          )}
        </div>

        {/* Quiz + Discussion — launch-phase hide. Flip `false` → original
            `(isDesktop || showMobileDiscussion)` to unhide. All state,
            data fetches, and child components stay mounted upstream. */}
        {false && (isDesktop || showMobileDiscussion) && (
          <div style={{ marginTop: isDesktop ? 48 : 0 }}>
            {quizNode}
            {discussionSection}
            {/* R13-C5 Fix 4 — simple exit path after article + comments.
                No related-article selection (new product work); just a
                clear "where to next" so readers aren't stranded. */}
            <div style={{
              marginTop: 32, padding: '20px 20px 24px', borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--card)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--dim)', letterSpacing: '0.04em', marginBottom: 10 }}>
                You might also like
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="/" style={{
                  display: 'inline-block', padding: '10px 20px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700,
                  textDecoration: 'none',
                }}>Back to home</a>
                <a href="/browse" style={{
                  display: 'inline-block', padding: '10px 20px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--white)', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none',
                }}>Browse articles</a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Report modal */}
      {showReportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.85)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReportModal(false)}>
          <div
            ref={reportModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
              padding: 20, maxWidth: 420, width: '90%',
            }}
          >
            <div id="report-modal-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>Report this article</div>
            {reportSuccess ? (
              <div style={{ fontSize: 13, color: 'var(--right)' }}>Thanks — we&apos;ll review it.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {REPORT_CATEGORIES.map(c => (
                    <label key={c.value} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      border: `1px solid ${reportCategory === c.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: reportCategory === c.value ? 'rgba(129,140,248,0.08)' : 'transparent',
                      borderRadius: 8, cursor: 'pointer',
                    }}>
                      <input type="radio" name="report" checked={reportCategory === c.value}
                        onChange={() => setReportCategory(c.value)} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: 13, color: 'var(--white)' }}>{c.label}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={reportDetail} onChange={e => setReportDetail(e.target.value)}
                  placeholder="Anything else we should know? (optional)"
                  rows={3}
                  style={{
                    width: '100%', padding: 8, borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--white)', fontSize: 13, fontFamily: 'var(--font-sans)',
                    outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                  }}
                />
                {reportError && (
                  <div role="alert" style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>
                    {reportError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowReportModal(false); setReportError(''); }} style={{
                    padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--dim)', fontSize: 12, cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={handleReport} disabled={!reportCategory} style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none',
                    background: reportCategory ? 'var(--accent)' : 'var(--tlDot)',
                    color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: reportCategory ? 'pointer' : 'default',
                  }}>Submit</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
