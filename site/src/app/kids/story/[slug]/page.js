'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import ArticleQuiz from '@/components/ArticleQuiz';
import { KID } from '@/lib/kidTheme';
import AskAGrownUp from '@/components/kids/AskAGrownUp';

// Kid-safe article reader. D9 / D12 / D23: no comments, no ads, no
// share, no follow, no source link-outs, no report UI, no adult
// chrome. The only interactive surface besides reading is the quiz.
//
// Entry contract:
//   - `vp_active_kid_id` in localStorage (set by /kids on profile select).
//   - article.is_kids_safe = true.
// Anything else bounces back to /kids.

const ACTIVE_KID_KEY = 'vp_active_kid_id';

export default function KidsStoryPage() {
  const { slug } = useParams();
  const router = useRouter();
  const [story, setStory] = useState(null);
  const [kid, setKid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quizPassed, setQuizPassed] = useState(false);
  const completedSentRef = useRef(false);

  useEffect(() => {
    if (!slug) return;
    const supabase = createClient();

    (async () => {
      const activeKidId = typeof window !== 'undefined'
        ? window.localStorage.getItem(ACTIVE_KID_KEY)
        : null;
      if (!activeKidId) { router.replace('/kids'); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/kids'); return; }

      const { data: kidRow } = await supabase
        .from('kid_profiles')
        .select('id, display_name, avatar_color')
        .eq('id', activeKidId)
        .eq('parent_user_id', user.id)
        .maybeSingle();
      if (!kidRow) {
        try { window.localStorage.removeItem(ACTIVE_KID_KEY); } catch {}
        try { window.dispatchEvent(new Event('vp:kid-mode-changed')); } catch {}
        router.replace('/kids');
        return;
      }
      setKid(kidRow);

      const { data: article } = await supabase
        .from('articles')
        .select('id, title, slug, body, kids_summary, excerpt, cover_image_url, cover_image_alt, reading_time_minutes, is_kids_safe, status, categories(name)')
        .eq('slug', slug)
        .maybeSingle();

      if (!article || article.status !== 'published' || !article.is_kids_safe) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setStory(article);
      setLoading(false);

      fetch('/api/stories/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: article.id,
          kidProfileId: kidRow.id,
          completed: false,
        }),
      }).catch(() => {});
    })();
  }, [slug, router]);

  useEffect(() => {
    if (!story || !kid || completedSentRef.current) return;

    const markComplete = (readPercentage) => {
      if (completedSentRef.current) return;
      completedSentRef.current = true;
      fetch('/api/stories/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: story.id,
          kidProfileId: kid.id,
          completed: true,
          readPercentage: readPercentage ?? null,
        }),
      }).catch(() => {});
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
  }, [story, kid]);

  if (loading) {
    return (
      <div style={{ minHeight: 'calc(100dvh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: KID.font.sub, color: KID.dim }}>One sec…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: '48px 16px' }}>
        <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto' }}>
          <AskAGrownUp
            reason="locked"
            body="This story isn\u2019t set up for kids yet. Pick another one from your home page."
            action={{ href: '/kids', label: 'Back to stories' }}
          />
        </div>
      </div>
    );
  }

  const paragraphs = story.body
    ? story.body.split('\n').map(p => p.trim()).filter(Boolean)
    : [];

  return (
    <div>
      <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto', padding: '16px 16px 40px' }}>
        <a
          href="/kids"
          style={{
            display: 'inline-block', fontSize: KID.font.sub,
            fontWeight: KID.weight.bold,
            color: KID.dim, textDecoration: 'none',
            padding: '8px 0',
          }}
        >&larr; Back to stories</a>

        {story.cover_image_url && (
          <img
            src={story.cover_image_url}
            alt={story.cover_image_alt || ''}
            style={{
              width: '100%', borderRadius: KID.radius.card,
              margin: '12px 0 16px', display: 'block',
            }}
          />
        )}

        <h1 style={{
          fontSize: KID.font.h1, fontWeight: KID.weight.extra,
          color: KID.text, letterSpacing: KID.tracking.tight,
          lineHeight: KID.leading.heading,
          margin: '8px 0 12px',
        }}>
          {story.title}
        </h1>

        <div style={{
          fontSize: KID.font.sub, color: KID.dim,
          marginBottom: KID.space.sectionGap,
        }}>
          {story.categories?.name && <span>{story.categories.name}</span>}
          {story.categories?.name && story.reading_time_minutes ? ' · ' : ''}
          {story.reading_time_minutes ? `${story.reading_time_minutes} min read` : ''}
        </div>

        {story.kids_summary && (
          <div style={{
            background: KID.cardAlt, border: `1px solid ${KID.border}`,
            borderRadius: KID.radius.card,
            padding: KID.space.cardPad,
            marginBottom: KID.space.sectionGap,
            fontSize: KID.font.body, lineHeight: KID.leading.body,
            color: KID.text,
          }}>
            {story.kids_summary}
          </div>
        )}

        <div style={{
          fontSize: KID.font.body, lineHeight: KID.leading.body,
          color: KID.text,
        }}>
          {paragraphs.map((p, i) => (
            <p key={i} style={{ margin: '0 0 16px' }}>{p}</p>
          ))}
        </div>

        {quizPassed && <QuizPassCelebration kidName={kid.display_name} />}

        <div style={{ marginTop: KID.space.sectionGap + 8 }}>
          <ArticleQuiz
            articleId={story.id}
            userTier="verity_family"
            kidProfileId={kid.id}
            onPass={() => setQuizPassed(true)}
          />
        </div>
      </div>
    </div>
  );
}

function QuizPassCelebration({ kidName }) {
  return (
    <div
      className="kid-celebrate-rise"
      role="status"
      aria-live="polite"
      style={{
        background: KID.successSoft, border: `2px solid ${KID.success}`,
        borderRadius: KID.radius.card,
        padding: `${KID.space.cardPad}px`,
        marginTop: KID.space.sectionGap,
        display: 'flex', gap: 14, alignItems: 'center',
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        background: KID.card, border: `3px solid ${KID.success}`,
        color: KID.success,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flex: '0 0 auto',
      }}>
        <svg width="28" height="28" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          <polygon points="16,3 19,12 28,13 21,19 23,29 16,23 9,29 11,19 4,13 13,12" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: KID.font.label, fontWeight: KID.weight.bold,
          color: KID.success, textTransform: 'uppercase',
          letterSpacing: KID.tracking.loose, lineHeight: 1,
        }}>Quiz passed</div>
        <div style={{
          fontSize: KID.font.h3, fontWeight: KID.weight.extra,
          color: KID.text, marginTop: 4, lineHeight: KID.leading.heading,
        }}>
          {kidName ? `Great reading, ${kidName}!` : 'Great reading!'}
        </div>
      </div>
    </div>
  );
}
