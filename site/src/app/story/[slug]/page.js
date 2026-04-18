'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { getSettings, isEnabled, getNumber } from '../../../lib/settings';
import ArticleQuiz from '../../../components/ArticleQuiz';
import CommentThread from '../../../components/CommentThread';
import TTSButton from '../../../components/TTSButton';
import Ad from '../../../components/Ad';
import Interstitial from '../../../components/Interstitial';
import { bumpArticleViewCount } from '../../../lib/session';
import { useFocusTrap } from '../../../lib/useFocusTrap';
import { isPaidTier } from '@/lib/tiers';
import { assertNotKidMode } from '@/lib/guards';

const REPORT_CATEGORIES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'spam', label: 'Spam' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'off_topic', label: 'Off Topic' },
  { value: 'impersonation', label: 'Impersonation' },
];

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

function SourcePills({ sources }) {
  const [expanded, setExpanded] = useState(null);
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
          {sources[expanded].headline && (
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--white)', marginBottom: 4 }}>
              {sources[expanded].headline}
            </div>
          )}
          {sources[expanded].excerpt && (
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 6 }}>
              {sources[expanded].excerpt}
            </div>
          )}
          {sources[expanded].url && (
            <a href={sources[expanded].url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
              Read on {sources[expanded].publisher} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Timeline({ events }) {
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
  const { slug } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [story, setStory] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [userPlan, setUserPlan] = useState('free');
  const [userTier, setUserTier] = useState('free');

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkId, setBookmarkId] = useState(null);
  const [bookmarkTotal, setBookmarkTotal] = useState(null);
  const [shareMsg, setShareMsg] = useState('');

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  const [showRegWall, setShowRegWall] = useState(false);
  const [showAnonInterstitial, setShowAnonInterstitial] = useState(false);
  const [userPassedQuiz, setUserPassedQuiz] = useState(false);
  const [quizPoolSize, setQuizPoolSize] = useState(0);

  const [activeTab, setActiveTab] = useState('Article');
  const [isDesktop, setIsDesktop] = useState(true);
  const [bookmarkError, setBookmarkError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1025px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // Regwall has no close-to-dismiss: it only routes to /signup or /login,
  // so focus trapping keeps Tab inside the two links; Escape is intentionally
  // a no-op (Undoing the gate via keyboard shouldn't be possible).
  const regWallRef = useRef(null);
  useFocusTrap(showRegWall, regWallRef);

  const reportModalRef = useRef(null);
  useFocusTrap(showReportModal, reportModalRef, {
    onEscape: () => setShowReportModal(false),
  });

  useEffect(() => {
    if (!slug) return;
    // D9/D12: adult article renderer must never run under an active kid
    // session. /kids/story/[slug] is the kid-safe read path; everything
    // else (comments, ads, share, follow, source link-outs) is adult
    // chrome the kid should not see.
    if (assertNotKidMode(router)) return;
    (async () => {
      setLoading(true);
      try {
        const { data: storyData } = await supabase
          .from('articles')
          .select('*, categories(name, slug)')
          .eq('slug', slug)
          .single();
        if (!storyData) { setLoading(false); return; }
        setStory(storyData);

        const allSettings = await getSettings(supabase).catch(err => {
          console.error('[story] settings load failed', err);
          return {};
        });

        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) setCurrentUser(authUser);

        if (!authUser) {
          // D23: anonymous gets a sign-up interstitial on the 2nd article open.
          // The registration wall (harder block) kicks in at the configured
          // free_article_limit.
          const views = bumpArticleViewCount();
          if (views >= 2) setShowAnonInterstitial(true);
          if (isEnabled(allSettings, 'registration_wall', false)) {
            const limit = getNumber(allSettings, 'free_article_limit', 5);
            if (views >= limit) setShowRegWall(true);
          }
        }

        if (authUser) {
          const { data: userData } = await supabase
            .from('users')
            .select('plan_status, email_verified, plans(tier)')
            .eq('id', authUser.id)
            .single();
          setUserPlan(userData?.plan_status || 'free');
          setUserTier(userData?.plans?.tier || 'free');

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
        setTimeline(timelineRes.data || []);
        setSources(sourcesRes.data || []);
        setQuizPoolSize(quizPoolRes.count || 0);

        // Comments live inside <CommentThread/>, which does its own
        // fetch + realtime once the user has passed the quiz (D6).

        if (authUser) {
          const { data: bookmarkRes } = await supabase
            .from('bookmarks').select('id').eq('user_id', authUser.id).eq('article_id', storyId).maybeSingle();
          if (bookmarkRes) { setBookmarked(true); setBookmarkId(bookmarkRes.id); }
          // Pass 17 / UJ-608 + UJ-613: pre-fetch the user's total bookmark
          // count so the button can pre-disable at the D13 free-tier cap
          // (10 bookmarks). Cheap query — `count: 'exact', head: true`
          // returns just the row count.
          const { count: bookmarkCount } = await supabase
            .from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', authUser.id);
          if (typeof bookmarkCount === 'number') setBookmarkTotal(bookmarkCount);
        }
      } catch (err) {
        console.error('Story load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // Mark reading complete only after a genuine engagement signal:
  // 30s dwell OR scroll >=80% of the viewport height past the start.
  // Ensures D22 scoring + view_count reflect real reading, not tab-open noise.
  const completedSentRef = useRef(false);
  useEffect(() => {
    if (!story || !currentUser || completedSentRef.current) return;

    const markComplete = (readPercentage) => {
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

    const dwellTimer = setTimeout(() => markComplete(null), 30_000);

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
        const msg = typeof data?.error === 'string' && /cap|limit|10/i.test(data.error)
          ? 'You\u2019ve hit the 10-bookmark limit. Unlimited bookmarks are available on paid plans.'
          : 'Could not save bookmark. Please try again.';
        setBookmarkError(msg);
      }
    }
  };

  const handleReport = async () => {
    if (!reportCategory || !story) return;
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
        setTimeout(() => { setShowReportModal(false); setReportSuccess(false); }, 2000);
      }
    } catch {}
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
  let quizNode = null;
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
            Comments on every article are gated by a short comprehension quiz. Sign up free to take this one and unlock the conversation.
          </div>
          <a href={signupHref} style={{
            display: 'inline-block', padding: '10px 18px', borderRadius: 10,
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>Sign up free</a>
          <div style={{ marginTop: 10 }}>
            <a href={`/login?next=${encodeURIComponent('/story/' + story.slug)}`} style={{
              fontSize: 12, color: 'var(--dim)', textDecoration: 'none',
            }}>Already have an account? Log in</a>
          </div>
        </div>
      );
    }
  }

  const discussionSection = userPassedQuiz ? (
    <CommentThread
      articleId={story.id}
      articleCategoryId={story.category_id}
      currentUserId={currentUser?.id}
      currentUserTier={userTier}
    />
  ) : currentUser && currentUser.email_verified ? (
    // Pass 17 / UJ-1102: verified users who haven't passed the quiz see
    // an informational panel instead of silence. D6 still holds — actual
    // comment content stays hidden; only the gating copy is shown.
    <div style={{
      padding: '18px 20px', borderRadius: 12,
      border: '1px solid var(--border)', background: 'var(--card)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
        Discussion is locked until you pass the quiz above.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>
        You need 3 out of 5 correct to join the comment thread for this article.
      </div>
    </div>
  ) : null;

  const showMobileDiscussion = !isDesktop && activeTab === 'Discussion';
  const showMobileTimeline = !isDesktop && activeTab === 'Timeline';
  const showArticleBody = isDesktop || activeTab === 'Article';

  return (
    <div className="vp-dark">
      {/* D23: anonymous 2nd-article interstitial (sign-up CTA variant) */}
      <Interstitial open={showAnonInterstitial} onClose={() => setShowAnonInterstitial(false)} variant="signup" />

      {/* Registration wall */}
      {showRegWall && (
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
              padding: '40px 32px', maxWidth: 420, textAlign: 'center',
            }}
          >
            <div id="regwall-title" style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: 'var(--white)' }}>Sign up to keep reading</div>
            <div style={{ fontSize: 14, color: 'var(--soft)', marginBottom: 24, lineHeight: 1.5 }}>
              You&apos;ve reached the free article limit. Create an account to continue.
            </div>
            <a href="/signup" style={{
              display: 'inline-block', padding: '12px 32px', borderRadius: 10,
              background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 15,
              textDecoration: 'none',
            }}>Sign Up Free</a>
          </div>
        </div>
      )}

      {/* Mobile tab bar */}
      {!isDesktop && (
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        {['Article', 'Timeline', 'Discussion'].map(tab => (
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

              <div style={{ fontSize: 11, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                <span>
                  {formatDate(story.published_at || story.created_at)}
                  {sources.length > 0 && ` · ${sources.length} source${sources.length === 1 ? '' : 's'}`}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* D17: TTS at Verity+ */}
                  {isPaidTier(userTier) && (
                    <TTSButton text={`${story.title}. ${story.body || ''}`} />
                  )}
                  {/* Pass 17 / UJ-608 + UJ-613 + UJ-1103: free users cap
                    * at 10 bookmarks. Pre-disable the button and surface
                    * an inline at-cap banner above the article body. */}
                  {(() => {
                    const atCap = !bookmarked && !isPaidTier(userTier) && typeof bookmarkTotal === 'number' && bookmarkTotal >= 10;
                    return (
                      <button onClick={toggleBookmark} disabled={atCap} title={atCap ? 'Upgrade for unlimited bookmarks' : undefined} style={{
                        padding: '4px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: bookmarked ? 'var(--accent)' : atCap ? '#ccc' : 'var(--dim)',
                        fontSize: 11, cursor: atCap ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)',
                        opacity: atCap ? 0.6 : 1,
                      }}>
                        {bookmarked ? 'Saved' : atCap ? 'At cap (10)' : 'Save'}
                      </button>
                    );
                  })()}
                  {!isPaidTier(userTier) && typeof bookmarkTotal === 'number' && bookmarkTotal >= 10 && !bookmarked && (
                    <div style={{ fontSize: 11, color: '#b45309', marginLeft: 8 }}>
                      You&apos;ve used 10 of 10 free bookmarks. <a href="/profile/settings/billing" style={{ color: '#b45309', fontWeight: 700 }}>Upgrade for unlimited</a>
                    </div>
                  )}
                  <button onClick={handleShare} style={{
                    padding: '4px 10px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}>{shareMsg || 'Share'}</button>
                </div>
              </div>

              <article>
                {bodyParagraphs.map((p, i) => (
                  <p key={i} style={{
                    fontSize: 18, lineHeight: 1.55, color: 'var(--white)',
                    marginBottom: 16, fontFamily: 'var(--font-sans)',
                  }}>{p}</p>
                ))}
              </article>

              <SourcePills sources={sources} />

              {/* D23 bottom banner — hidden for Pro/Family/XL by the
                  placement's hidden_for_tiers; halved for Verity. */}
              <Ad placement="article_bottom" page="article" position="bottom" articleId={story.id} />

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

            {showMobileTimeline && (
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--dim)', marginBottom: 16, letterSpacing: '0.04em' }}>Timeline</div>
                <Timeline events={timeline} />
              </div>
            )}
          </div>

          {/* Timeline sidebar — desktop only */}
          {isDesktop && (
          <aside style={{
            width: 260, flexShrink: 0, position: 'sticky', top: 60, alignSelf: 'flex-start',
          }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, color: 'var(--dim)', marginBottom: 16, letterSpacing: '0.04em' }}>Timeline</div>
            <Timeline events={timeline} />
          </aside>
          )}
        </div>

        {/* Quiz + Discussion — single mount. D6 keeps it hidden until the
            quiz has been passed. Rendered here on desktop (below the
            two-column) and on mobile when the Discussion tab is active. */}
        {(isDesktop || showMobileDiscussion) && (
          <div style={{ marginTop: isDesktop ? 48 : 0 }}>
            {quizNode}
            {discussionSection}
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
                <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowReportModal(false)} style={{
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
