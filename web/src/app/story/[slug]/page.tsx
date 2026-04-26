// @migrated-to-permissions 2026-04-18
// @feature-verified tts 2026-04-18
// @feature-verified article_reading 2026-04-18
'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../../../lib/supabase/client';
import { getSettings, isEnabled, getNumber } from '../../../lib/settings';
import ArticleQuiz from '../../../components/ArticleQuiz';
import CommentThread from '../../../components/CommentThread';
import TTSButton from '../../../components/TTSButton';
import Ad from '../../../components/Ad';
import Interstitial from '../../../components/Interstitial';
import { JsonLd, newsArticle } from '../../../components/JsonLd';
import { bumpArticleViewCount } from '../../../lib/session';
import { useFocusTrap } from '../../../lib/useFocusTrap';
import { useTrack } from '@/lib/useTrack';
import { useToast } from '../../../components/Toast';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { getPlanLimitValue } from '@/lib/plans';
import type { Tables } from '@/types/database-helpers';
import { Z } from '@/lib/zIndex';

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

// LAUNCH: anonymous "Keep reading, free" signup interstitial hidden
// pre-launch. Flip to false when sign-ups open. Trigger logic and
// component stay alive — see companion revert guide in
// Sessions/04-21-2026.
const LAUNCH_HIDE_ANON_INTERSTITIAL = true;

const REPORT_CATEGORIES: ReportCategory[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'spam', label: 'Spam' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'off_topic', label: 'Off topic' },
  { value: 'impersonation', label: 'Impersonation' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Compact source list — one card per cited outlet. Each card opens the
// canonical URL in a new tab (rel=noopener,noreferrer); the card itself is
// the full click target so the favicon-stand-in initial doesn't need to be
// a separate hit area. Replaces the old single-row pill scroller; pairs
// with the iOS sourceCard layout shipped in the same engagement-polish
// pass so both surfaces present sources the same way.
function SourcePills({ sources }: { sources: SourcePill[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sources.map((src, i) => {
        const publisher = src.publisher || 'Source';
        const glyph = (publisher.trim().charAt(0) || 'S').toUpperCase();
        const url = src.url || '';
        const Tag: 'a' | 'div' = url ? 'a' : 'div';
        const tagProps = url
          ? {
              href: url,
              target: '_blank',
              rel: 'noopener noreferrer',
            }
          : {};
        return (
          <Tag
            key={src.id || i}
            {...tagProps}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              textDecoration: 'none',
              color: 'inherit',
              cursor: url ? 'pointer' : 'default',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(17,17,17,0.08)',
                color: 'var(--accent)',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {glyph}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {publisher}
              </span>
              {src.title && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {src.title}
                </span>
              )}
            </span>
            {url && (
              <span
                aria-hidden="true"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  flexShrink: 0,
                }}
              >
                Read →
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events || events.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--dim)' }}>No timeline yet.</div>;
  }
  // Flag the most recent non-future event as "current" if none is explicitly marked.
  const hasExplicitCurrent = events.some((e) => e.is_current);
  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: 4,
          bottom: 4,
          width: 1,
          background: 'var(--tlLine)',
        }}
      />
      {events.map((ev, i) => {
        const isCurrent = ev.is_current || (!hasExplicitCurrent && i === events.length - 1);
        return (
          <div key={ev.id || i} style={{ paddingBottom: 22, position: 'relative' }}>
            {isCurrent ? (
              <>
                <div
                  style={{
                    position: 'absolute',
                    left: -24,
                    top: 2,
                    fontSize: 9,
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    transform: 'translateX(-100%) translateX(-8px)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  NOW
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: -26,
                    top: 0,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: 'var(--text-primary)',
                    border: '2px solid var(--accent)',
                    boxShadow: '0 0 0 4px var(--bg)',
                  }}
                />
              </>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  left: -24,
                  top: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ev.is_future ? 'var(--tlDot)' : 'var(--dim)',
                  opacity: ev.is_future ? 0.45 : 1,
                }}
              />
            )}
            <div style={{ opacity: ev.is_future ? 0.45 : 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)', marginBottom: 2 }}>
                {ev.event_date
                  ? new Date(ev.event_date).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}
                {ev.is_future && (
                  <span style={{ fontStyle: 'italic', marginLeft: 6 }}>Upcoming</span>
                )}
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
  // C5 — stabilize the supabase client across renders. The story-page
  // useEffect chain (comments loader, quiz-pass check, timeline, sources,
  // bookmarks, event tracking) all capture `supabase` in closures. With
  // a fresh client per render, those closures go stale once the session
  // rotates — silent comment load failures, silent bookmark writes,
  // corrupted telemetry on page re-renders. `useMemo([])` pins it to
  // one instance for the component's lifetime.
  const supabase = useMemo(() => createClient(), []);
  const trackEvent = useTrack();
  const { show } = useToast();

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
  const [quizPassError, setQuizPassError] = useState<boolean>(false);
  // Signature moment per Future Projects/13_QUIZ_UNLOCK_MOMENT.md.
  // Flips true on the false→true transition of `userPassedQuiz` within
  // this session — the just-passed reveal triggers comment composer
  // auto-focus + first-five-comments stagger fade-in. A returning reader
  // who already passed previously enters with userPassedQuiz=true from
  // the start, so this stays false and the thread renders instantly.
  const [justRevealedThisSession, setJustRevealedThisSession] = useState<boolean>(false);
  const [justPassedCeremony, setJustPassedCeremony] = useState<boolean>(false);
  const [quizPoolSize, setQuizPoolSize] = useState<number>(0);
  // T-066: anon free-read pill. Count bumped on each article open (localStorage);
  // limit from settings.free_article_limit (DB-driven, fallback 5). Both stay 0/5
  // for authed users — the pill only renders for anon.
  const [anonViewCount, setAnonViewCount] = useState<number>(0);
  const [freeReadLimit, setFreeReadLimit] = useState<number>(5);

  const [activeTab, setActiveTab] = useState<'Story' | 'Timeline' | 'Discussion'>('Story');
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const [bookmarkError, setBookmarkError] = useState<string>('');

  // Reading-progress ribbon. Drives a `transform: scaleX(value)` bar fixed at
  // the top of the document. Updated on scroll via a passive listener; clamped
  // 0..1 so the bar never overshoots when the page is shorter than the
  // viewport. Companion to the iOS reading-progress polish in the same ship.
  const [readingProgress, setReadingProgress] = useState<number>(0);

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
    try {
      window.sessionStorage.removeItem('vp:regwall-dismissed');
    } catch {}
    setRegWallDismissed(false);
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        try {
          window.sessionStorage.removeItem('vp:regwall-dismissed');
        } catch {}
        setRegWallDismissed(false);
      }
    });
    const onStorage = (e: StorageEvent) => {
      // Supabase writes its session under an `sb-*-auth-token` key in
      // localStorage. Any change there on another tab means auth state
      // just moved; drop the regwall dismissal so this tab re-evaluates.
      if (e.key && e.key.startsWith('sb-') && e.key.includes('auth-token')) {
        try {
          window.sessionStorage.removeItem('vp:regwall-dismissed');
        } catch {}
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

  // Regwall soft-close handler. Shared by the Close button AND the Escape
  // key so keyboard dismissal persists via sessionStorage the same way a
  // click does (prevents re-showing on next route change in the same session).
  const dismissRegWall = () => {
    setRegWallDismissed(true);
    setShowRegWall(false);
    try {
      window.sessionStorage.setItem('vp:regwall-dismissed', '1');
    } catch (e) {
      console.error('[story] regwall dismiss write', e);
    }
  };
  const regWallRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showRegWall, regWallRef, { onEscape: dismissRegWall });

  // Body scroll lock while the regwall is open (matches Interstitial pattern
  // in web/src/components/Interstitial.tsx).
  useEffect(() => {
    if (!showRegWall || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showRegWall]);

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
        if (!storyData) {
          setLoading(false);
          return;
        }
        setStory(storyData as unknown as ArticleRow);

        const allSettings = await getSettings(supabase).catch((err) => {
          console.error('[story] settings load failed', err);
          return {};
        });

        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
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
          // T-066: read the limit once here; reuse for both the pill and the
          // regwall check so they reflect the same DB-driven threshold.
          const freeLimit = getNumber(allSettings, 'free_article_limit', 5);
          setAnonViewCount(views);
          setFreeReadLimit(freeLimit);
          if (views >= 2 && !LAUNCH_HIDE_ANON_INTERSTITIAL) setShowAnonInterstitial(true);
          if (isEnabled(allSettings, 'registration_wall', false)) {
            const limit = freeLimit;
            // R13-C5 Fix 5 — honor per-session dismissal so a user who
            // clicked Close once isn't re-blocked on every subsequent
            // article load in the same browser tab.
            let dismissed = false;
            try {
              dismissed =
                typeof window !== 'undefined' &&
                window.sessionStorage.getItem('vp:regwall-dismissed') === '1';
            } catch (e) {
              console.error('[story] regwall dismiss read', e);
            }
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
          const userRow = userData as {
            email_verified?: boolean | null;
            plans?: { tier?: string | null } | null;
          } | null;
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
          }).catch((err) => console.error('[story] read-open signal failed', err));
        }

        const storyId = storyData.id;

        // D6: check pass status BEFORE fetching comments. If not passed,
        // skip the comments fetch entirely — discussion is invisible.
        // RPC failure used to be silent (FIX_SESSION_1 #11) — now we
        // surface a retry banner so a passed reader doesn't see a stale
        // lock panel forever. Server-side `post_comment` enforces the
        // gate independently, so a UI miscount here is a UX bug, not a
        // security hole.
        let passedQuiz = false;
        if (authUser) {
          const { data: passData, error: passErr } = await supabase.rpc(
            'user_passed_article_quiz',
            { p_user_id: authUser.id, p_article_id: storyId }
          );
          if (passErr) {
            console.error('[story.user_passed_article_quiz]', passErr.message);
            setQuizPassError(true);
          } else {
            setQuizPassError(false);
            passedQuiz = !!passData;
            setUserPassedQuiz(passedQuiz);
          }
        }

        const [timelineRes, sourcesRes, quizPoolRes] = await Promise.all([
          supabase
            .from('timelines')
            .select('*')
            .eq('article_id', storyId)
            .order('event_date', { ascending: true }),
          supabase
            .from('sources')
            .select('*')
            .eq('article_id', storyId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('quizzes')
            .select('id', { count: 'exact', head: true })
            .eq('article_id', storyId),
        ]);
        setTimeline((timelineRes.data as TimelineRow[] | null) || []);
        setSources((sourcesRes.data as SourceRow[] | null) || []);
        setQuizPoolSize(quizPoolRes.count || 0);

        // Comments live inside <CommentThread/>, which does its own
        // fetch + realtime once the user has passed the quiz (D6).

        if (authUser) {
          const { data: bookmarkRes } = await supabase
            .from('bookmarks')
            .select('id')
            .eq('user_id', authUser.id)
            .eq('article_id', storyId)
            .maybeSingle();
          if (bookmarkRes) {
            setBookmarked(true);
            setBookmarkId(bookmarkRes.id);
          }
          // Pass 17 / UJ-608 + UJ-613: pre-fetch the user's total bookmark
          // count so the button can pre-disable at the free-tier cap
          // (DB-driven via plan_features.bookmarks — see T-016). Cheap
          // query — `count: 'exact', head: true` returns just the row count.
          const { count: bookmarkCount } = await supabase
            .from('bookmarks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', authUser.id);
          if (typeof bookmarkCount === 'number') setBookmarkTotal(bookmarkCount);
          // T-016: resolve the DB-side bookmark cap for the user's plan.
          const { data: planProfile } = await supabase
            .from('users')
            .select('plan_id')
            .eq('id', authUser.id)
            .maybeSingle();
          const cap = await getPlanLimitValue(
            supabase,
            planProfile?.plan_id ?? null,
            'bookmarks',
            10
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, quizPoolSize, trackEvent]);

  // T-064: ref for the quiz + discussion wrapper so we can scroll to it on
  // desktop after a quiz pass. On mobile we switch activeTab to Discussion
  // instead — the tab bar is now active and revealing the pane is the
  // equivalent affordance.
  const discussionRef = useRef<HTMLDivElement | null>(null);

  // T-064: react to quiz pass. justRevealedThisSession only goes false→true once
  // per session, so this effect fires at most once per page load.
  useEffect(() => {
    if (!justRevealedThisSession) return;
    if (isDesktop) {
      discussionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      setActiveTab('Discussion');
    }
  }, [justRevealedThisSession, isDesktop]);

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
      }).catch((err) => console.error('[story] read-complete signal failed', err));
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

  // Reading-progress ribbon scroll listener. Independent of the read-complete
  // signal above so the ribbon updates regardless of auth state and continues
  // to fill after the 80% mark. Idle when the article hasn't loaded.
  useEffect(() => {
    if (!story) return;
    const update = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const doc = document.documentElement;
      const scrollable = Math.max(doc.scrollHeight - window.innerHeight, 1);
      const ratio = window.scrollY / scrollable;
      setReadingProgress(Math.min(Math.max(ratio, 0), 1));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [story]);

  // Word-count-based read time. 200 wpm matches the iOS estimatedReadMinutes
  // helper so both surfaces agree on the displayed minute count for the same
  // article body. Clamps to 1 so empty/sparse stubs still show a value.
  const readMinutes = (() => {
    const body = story?.body ?? '';
    if (!body) return 1;
    const words = body.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.floor(words / 200));
  })();

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
    if (!story) return;
    // Anon: route to signup with a `next=` so they bounce back here
    // after creating an account. Previously this was a silent no-op
    // ("looks like the button works, does nothing") — flagged HIGH by
    // the user-journey audit (CLAUDE.md: no silent failures).
    if (!currentUser) {
      window.location.href = `/signup?next=${encodeURIComponent('/story/' + story.slug)}`;
      return;
    }
    setBookmarkError('');
    if (bookmarked && bookmarkId) {
      const res = await fetch(`/api/bookmarks/${bookmarkId}`, { method: 'DELETE' });
      if (res.ok) {
        setBookmarked(false);
        setBookmarkId(null);
        show('Removed from bookmarks');
      } else {
        setBookmarkError('Bookmark not removed — try again.');
      }
    } else {
      // Route enforces D13 cap via the bookmark_cap trigger.
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: story.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        setBookmarked(true);
        setBookmarkId(data.id);
        show('Saved to bookmarks');
      } else if (res.status === 422 && data?.error) {
        // 422 = trigger-raised cap message (`enforce_bookmark_cap` →
        // P0001 → safeErrorResponse passthrough). Carries actual copy
        // like "Bookmark limit reached (max N on your plan). Upgrade
        // for unlimited." Surface it directly so readers know to
        // upgrade, not just that "something failed".
        setBookmarkError(data.error);
      } else {
        setBookmarkError('Bookmark not saved — try again.');
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
        setReportCategory('');
        setReportDetail('');
        setTimeout(() => {
          setShowReportModal(false);
          setReportSuccess(false);
          setReportError('');
        }, 2000);
      } else {
        const data = await res.json().catch(() => ({}) as { error?: string });
        setReportError(data?.error || 'Could not submit report. Please try again.');
      }
    } catch (e) {
      console.error('[story] report submit', e);
      setReportError('Network error — please try again.');
    }
  };

  if (loading) {
    return (
      <div className="vp-dark" style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px' }}>
        <style>{`
          @keyframes vp-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
        <div
          role="status"
          aria-live="polite"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div
            style={{
              height: 32,
              borderRadius: 6,
              background: 'var(--rule)',
              width: '80%',
              animation: 'vp-pulse 1.4s ease-in-out infinite',
            }}
          />
          <div
            style={{
              height: 18,
              borderRadius: 4,
              background: 'var(--rule)',
              width: '55%',
              animation: 'vp-pulse 1.4s ease-in-out infinite',
              animationDelay: '0.1s',
            }}
          />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                style={{
                  height: 14,
                  borderRadius: 4,
                  background: 'var(--rule)',
                  width: n === 5 ? '65%' : '100%',
                  animation: 'vp-pulse 1.4s ease-in-out infinite',
                  animationDelay: `${n * 0.07}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!story) {
    return (
      <div
        className="vp-dark"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '40px 16px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div
            style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}
          >
            Article not found
          </div>
          <div style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 24 }}>
            This story may have been removed or the link may be broken.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="/"
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Go to home
            </a>
            <a
              href="/browse"
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Browse stories
            </a>
          </div>
        </div>
      </div>
    );
  }

  const categoryName = story.categories?.name || '';
  const bodyParagraphs = story.body
    ? story.body.split('\n').filter((p) => p.trim().length > 0)
    : [];

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
          onPass={() => {
            setUserPassedQuiz(true);
            setJustPassedCeremony(true);
            setTimeout(() => {
              setJustPassedCeremony(false);
              setJustRevealedThisSession(true);
            }, 1500);
          }}
        />
      );
    } else {
      const signupHref = `/signup?next=${encodeURIComponent('/story/' + story.slug)}`;
      quizNode = (
        <div
          style={{
            padding: 18,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            textAlign: 'center',
          }}
        >
          <div
            style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}
          >
            Every article has a comprehension quiz.
          </div>
          <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 14 }}>
            Pass it and the discussion opens — your comment shows you actually read the story.
          </div>
          <a
            href={signupHref}
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              borderRadius: 10,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Create free account
          </a>
          <div style={{ marginTop: 10 }}>
            <a
              href={`/login?next=${encodeURIComponent('/story/' + story.slug)}`}
              style={{
                fontSize: 12,
                color: 'var(--dim)',
                textDecoration: 'none',
              }}
            >
              Already have an account? Sign in
            </a>
          </div>
        </div>
      );
    }
  }

  const lockPanelStyle: React.CSSProperties = {
    padding: '18px 20px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--card)',
    textAlign: 'center',
  };
  const lockCtaStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '10px 18px',
    borderRadius: 10,
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  };

  const discussionSection = quizPassError ? (
    // RPC failed (network blip / schema drift). Don't pretend the user
    // hasn't passed — surface a retry. Server-side post_comment will
    // still enforce the gate independently if they try to post.
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        Couldn&rsquo;t check your quiz status.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 12 }}>
        We&rsquo;ll know once we can reach the server again.
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ ...lockCtaStyle, border: 'none', cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  ) : userPassedQuiz ? (
    <CommentThread
      articleId={story.id}
      articleCategoryId={story.category_id}
      currentUserId={currentUser?.id}
      currentUserTier={userTier}
      justRevealed={justRevealedThisSession}
    />
  ) : quizPoolSize < 10 ? null : currentUser && currentUser.email_confirmed_at ? (
    // Pass 17 / UJ-1102: verified users who haven't passed the quiz see
    // an informational panel instead of silence. D6 still holds — actual
    // comment content stays hidden; only the gating copy is shown.
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        Pass the quiz to join the discussion.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>
        5 questions about what you just read. Get 3 right and the conversation opens.
      </div>
    </div>
  ) : (
    // H-16: anon (or verified-no-email) readers previously got `null`
    // here, which rendered an empty Discussion tab on mobile. Mirror
    // the locked-panel shape so every tab state has visible content,
    // and surface the Create-free-account CTA inline.
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
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
  const showArticleBody = isDesktop || activeTab === 'Story';

  // Ext-SS.2 — NewsArticle JSON-LD. Site URL pulled from window.location
  // origin so preview/staging emits matching schema URLs. Only emit when
  // the story has loaded; the SEO crawler reads the rendered HTML, so a
  // null branch during load is fine (no crawler will hit a loading state).
  const siteOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const storyJsonLd = story
    ? newsArticle({
        headline: story.title || '',
        url: `${siteOrigin}/story/${story.slug || ''}`,
        datePublished: story.published_at,
        dateModified: story.updated_at || story.published_at,
        description: story.excerpt || null,
        siteUrl: siteOrigin,
      })
    : null;

  return (
    <div className="vp-dark">
      {storyJsonLd && <JsonLd data={storyJsonLd} />}
      {/* Reading-progress ribbon. Fixed at the very top of the viewport, 2px
          tall, fills with scroll. `transform: scaleX` keeps the paint cheap
          (compositor-only update). The motion-media query collapses the
          transition for users with reduced-motion enabled. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 100,
          background: 'transparent',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '100%',
            background: 'var(--accent)',
            transformOrigin: 'left center',
            transform: `scaleX(${readingProgress})`,
            transition: 'transform 80ms linear',
            willChange: 'transform',
          }}
          className="vp-reading-progress-bar"
        />
      </div>
      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          .vp-reading-progress-bar {
            transition: none !important;
          }
        }
      `}</style>

      {/* D23: anonymous 2nd-article interstitial (sign-up CTA variant) */}
      <Interstitial
        open={showAnonInterstitial && !LAUNCH_HIDE_ANON_INTERSTITIAL}
        onClose={() => setShowAnonInterstitial(false)}
        variant="signup"
      />

      {/* Registration wall */}
      {showRegWall && !regWallDismissed && (
        <div
          onClick={dismissRegWall}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,17,17,0.92)',
            zIndex: Z.CRITICAL,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            ref={regWallRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="regwall-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '40px 32px',
              maxWidth: 420,
              textAlign: 'center',
              position: 'relative',
            }}
          >
            {/* R13-C5 Fix 5 — soft close. The views >= limit gate is
                unchanged; this only dismisses the current showing and
                persists per-session via sessionStorage. */}
            <button
              onClick={dismissRegWall}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 10,
                right: 12,
                background: 'transparent',
                border: 'none',
                color: 'var(--soft)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              Close
            </button>
            <div
              id="regwall-title"
              style={{
                fontSize: 22,
                fontWeight: 800,
                marginBottom: 10,
                color: 'var(--text-primary)',
              }}
            >
              Sign up to keep reading
            </div>
            <div style={{ fontSize: 14, color: 'var(--soft)', marginBottom: 24, lineHeight: 1.5 }}>
              Free, and takes 30 seconds.
            </div>
            <a
              href={`/signup?next=${encodeURIComponent('/story/' + story.slug)}`}
              style={{
                display: 'inline-block',
                padding: '12px 32px',
                borderRadius: 10,
                background: 'var(--accent)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
              }}
            >
              Create free account
            </a>
          </div>
        </div>
      )}

      {/* Mobile tab bar — Story | Timeline | Discussion. Three columns
          shown on every article on mobile. Permission-gated content
          shows lock states inside each pane (see Timeline + Discussion
          branches further down). Desktop renders all three inline so
          the tab bar is mobile-only. */}
      {!isDesktop && (
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
            position: 'sticky',
            top: 'var(--vp-top-bar-h, 0px)',
            zIndex: 50,
          }}
        >
          {(['Story', 'Timeline', 'Discussion'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 0',
                background: 'transparent',
                border: 'none',
                borderBottom:
                  activeTab === tab ? '2px solid var(--text-primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--dim)',
                fontWeight: activeTab === tab ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {tab}
            </button>
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
                {/* T-066: anon free-read pill. Proactive signal so the paywall
                    does not arrive cold. Renders once the anon path has run
                    (anonViewCount > 0). Count is capped at freeReadLimit so
                    it never reads "6 of 5". NOT gated by LAUNCH_HIDE_ANON_INTERSTITIAL
                    — the interstitial and the pill are independent features. */}
                {!currentUser && anonViewCount > 0 && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      marginBottom: 12,
                      padding: '4px 10px',
                      borderRadius: 20,
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--dim)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {Math.min(anonViewCount, freeReadLimit)} of {freeReadLimit} free reads
                  </div>
                )}
                {/* Sources-above-headline trust signal: visible only when the
                  article cites 2+ outlets. Ordering relies on the sources
                  query ORDER BY sort_order so truncation is deterministic.
                  SourcePills further down still renders the expandable
                  detail per source; this line is a quick-glance complement. */}
                {sources.length >= 2 && (
                  <div
                    aria-label={`Reported from: ${sources
                      .map((s) => s.publisher)
                      .filter(Boolean)
                      .join(', ')}`}
                    style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--dim)',
                      marginBottom: 10,
                      lineHeight: 1.4,
                    }}
                  >
                    Reported from
                    {sources
                      .slice(0, 3)
                      .map((s) => s.publisher)
                      .filter(Boolean)
                      .map((p, i) => (
                        <span key={i}> · {p}</span>
                      ))}
                    {sources.length > 3 && <span> · +{sources.length - 3} more</span>}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginBottom: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {categoryName && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--accent)',
                      }}
                    >
                      {categoryName}
                    </span>
                  )}
                  {story.is_breaking && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#ffffff',
                        background: 'var(--breaking)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      BREAKING
                    </span>
                  )}
                  {story.is_developing && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#ffffff',
                        background: '#f59e0b',
                        padding: '2px 6px',
                        borderRadius: 4,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Developing
                    </span>
                  )}
                </div>

                <h1
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: 26,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    letterSpacing: -0.4,
                    marginBottom: 12,
                    color: 'var(--text-primary)',
                  }}
                >
                  {story.title}
                </h1>

                {story.excerpt && (
                  <p
                    style={{
                      fontSize: 15,
                      lineHeight: 1.5,
                      color: 'var(--soft)',
                      marginBottom: 16,
                    }}
                  >
                    {story.excerpt}
                  </p>
                )}

                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--dim)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 28,
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    {formatDate(story.published_at || story.created_at)}
                    {sources.length > 0 &&
                      ` · ${sources.length} source${sources.length === 1 ? '' : 's'}`}
                    {` · ${readMinutes} min read`}
                  </span>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {canListenTts && <TTSButton text={`${story.title}. ${story.body || ''}`} />}
                    {/* T-016: free-plan bookmark cap is DB-driven. Previously
                     * hardcoded `>= 10` and "10 of 10"; bookmarkCap now
                     * comes from plan_features.bookmarks for the user's plan. */}
                    {(() => {
                      const atCap =
                        !bookmarked &&
                        !canBookmarkAdd &&
                        typeof bookmarkTotal === 'number' &&
                        bookmarkTotal >= bookmarkCap;
                      return (
                        <button
                          onClick={toggleBookmark}
                          disabled={atCap}
                          title={atCap ? 'Upgrade for unlimited bookmarks' : undefined}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            minHeight: 44,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: bookmarked ? 'var(--accent)' : atCap ? '#ccc' : 'var(--dim)',
                            fontSize: 13,
                            cursor: atCap ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--font-sans)',
                            opacity: atCap ? 0.6 : 1,
                          }}
                        >
                          {bookmarked ? 'Saved' : atCap ? `At cap (${bookmarkCap})` : 'Save'}
                        </button>
                      );
                    })()}
                    <button
                      onClick={handleShare}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        minHeight: 44,
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--dim)',
                        fontSize: 13,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {shareMsg || 'Share'}
                    </button>
                  </div>
                </div>

                {/* Bookmark-cap notice: standalone row below the action row so the
                  message never overflows the inner button group at narrow
                  viewports (320/375/390). Rendered only when the user has no
                  add permission AND is at cap AND hasn't bookmarked this article. */}
                {!canBookmarkAdd &&
                  typeof bookmarkTotal === 'number' &&
                  bookmarkTotal >= bookmarkCap &&
                  !bookmarked && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{ fontSize: 13, color: '#b45309', marginBottom: 28 }}
                    >
                      You&apos;ve used {bookmarkCap} of {bookmarkCap} free bookmarks.{' '}
                      <a
                        href="/profile/settings#billing"
                        style={{ color: '#b45309', fontWeight: 700 }}
                      >
                        Upgrade for unlimited
                      </a>
                    </div>
                  )}

                {quizPoolSize >= 10 && !userPassedQuiz && (
                  <div
                    style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16, lineHeight: 1.4 }}
                  >
                    Pass the quiz at the end to unlock comments.
                  </div>
                )}

                {canViewBody ? (
                  <article>
                    {bodyParagraphs.map((p, i) => (
                      <p
                        key={i}
                        style={{
                          fontSize: 18,
                          lineHeight: 1.55,
                          color: 'var(--text-primary)',
                          marginBottom: 16,
                          fontFamily: 'var(--font-sans)',
                        }}
                      >
                        {p}
                      </p>
                    ))}
                  </article>
                ) : currentUser ? (
                  <div
                    style={{
                      padding: '20px 22px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                      }}
                    >
                      Upgrade to read this article
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--dim)',
                        lineHeight: 1.5,
                        marginBottom: 14,
                      }}
                    >
                      Your current plan does not include full article access.
                    </div>
                    <a
                      href="/profile/settings#billing"
                      style={{
                        display: 'inline-block',
                        padding: '10px 18px',
                        borderRadius: 10,
                        background: 'var(--accent)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Upgrade
                    </a>
                  </div>
                ) : null}

                {canViewSources && <SourcePills sources={sources} />}

                {!canViewAdFree && (
                  <Ad
                    placement="article_bottom"
                    page="article"
                    position="bottom"
                    articleId={story.id}
                  />
                )}

                {bookmarkError && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '8px 10px',
                      fontSize: 12,
                      color: 'var(--wrong)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'rgba(239,68,68,0.08)',
                    }}
                  >
                    {bookmarkError}
                  </div>
                )}

                {/* Report — anon: route to signup with `next=` so the
                    submit doesn't 401 inside an opened modal (silent
                    dead-end flagged HIGH by the user-journey audit).
                    Authed: open modal as before. */}
                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <button
                    onClick={() => {
                      if (!currentUser) {
                        window.location.href = `/signup?next=${encodeURIComponent('/story/' + story.slug)}`;
                        return;
                      }
                      setShowReportModal(true);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--dim)',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      minHeight: 36,
                      paddingTop: 6,
                      paddingBottom: 6,
                    }}
                  >
                    Report this article
                  </button>
                </div>
              </div>
            )}

            {/* Timeline (mobile) — visible whenever the Timeline tab is
                active. When the viewer lacks the timeline permission a
                short upgrade prompt renders in place of the events list
                so the tab is never an empty pane. */}
            {showMobileTimeline && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: 'var(--dim)',
                    marginBottom: 16,
                    letterSpacing: '0.04em',
                  }}
                >
                  Timeline
                </div>
                {canViewTimeline ? (
                  <Timeline events={timeline} />
                ) : (
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '20px 16px',
                      background: 'var(--card)',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: 6,
                      }}
                    >
                      Timeline is part of paid plans.
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--soft)',
                        marginBottom: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      See how this story developed across the day with sourced events.
                    </div>
                    <a
                      href="/profile/settings#billing"
                      style={{
                        display: 'inline-block',
                        padding: '8px 16px',
                        minHeight: 36,
                        lineHeight: '20px',
                        background: 'var(--accent)',
                        color: '#fff',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      View plans
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeline (desktop aside) — launch-phase hide. */}
          {false && isDesktop && canViewTimeline && (
            <aside
              style={{
                width: 260,
                flexShrink: 0,
                position: 'sticky',
                top: 60,
                alignSelf: 'flex-start',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: 'var(--dim)',
                  marginBottom: 16,
                  letterSpacing: '0.04em',
                }}
              >
                Timeline
              </div>
              <Timeline events={timeline} />
            </aside>
          )}
        </div>

        {/* Quiz + Discussion. The "Pass to comment" gate is the product
            spine — see Future Projects/12_QUIZ_GATE_BRAND.md. Always
            visible at the end of every article (mobile gates via the
            Discussion tab). The dated "You might also like" exit-card
            from the launch-hide era was removed in the 2026-04-23 quiz
            gate ship — top nav + the home page already cover navigation. */}
        {(isDesktop || showMobileDiscussion) && (
          <div ref={discussionRef} style={{ marginTop: isDesktop ? 48 : 0 }}>
            {justPassedCeremony && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '12px 0 8px',
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--accent)',
                }}
              >
                You&rsquo;re in.
              </div>
            )}
            {quizNode}
            {discussionSection}
          </div>
        )}
      </div>

      {/* Report modal */}
      {showReportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,17,17,0.85)',
            zIndex: Z.CRITICAL,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowReportModal(false)}
        >
          <div
            ref={reportModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 20,
              maxWidth: 420,
              width: '90%',
            }}
          >
            <div
              id="report-modal-title"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 12,
              }}
            >
              Report this article
            </div>
            {reportSuccess ? (
              <div style={{ fontSize: 13, color: 'var(--right)' }}>
                Thanks — we&apos;ll review it.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {REPORT_CATEGORIES.map((c) => (
                    <label
                      key={c.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        border: `1px solid ${reportCategory === c.value ? 'var(--accent)' : 'var(--border)'}`,
                        background:
                          reportCategory === c.value ? 'rgba(129,140,248,0.08)' : 'transparent',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="report"
                        checked={reportCategory === c.value}
                        onChange={() => setReportCategory(c.value)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c.label}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="Anything else we should know? (optional)"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
                {reportError && (
                  <div role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                    {reportError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowReportModal(false);
                      setReportError('');
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--dim)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReport}
                    disabled={!reportCategory}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: reportCategory ? 'var(--accent)' : 'var(--tlDot)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: reportCategory ? 'pointer' : 'default',
                    }}
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
