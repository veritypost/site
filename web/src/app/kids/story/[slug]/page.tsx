// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import ArticleQuiz from '@/components/ArticleQuiz';
import { KID } from '@/lib/kidTheme';
import AskAGrownUp from '@/components/kids/AskAGrownUp';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

const ACTIVE_KID_KEY = 'vp_active_kid_id';

type Kid = Pick<Tables<'kid_profiles'>, 'id' | 'display_name' | 'avatar_color'>;
type StoryRow = Pick<
  Tables<'articles'>,
  | 'id'
  | 'title'
  | 'slug'
  | 'body'
  | 'kids_summary'
  | 'excerpt'
  | 'cover_image_url'
  | 'cover_image_alt'
  | 'reading_time_minutes'
  | 'is_kids_safe'
  | 'status'
> & { categories?: { name: string | null } | null };

export default function KidsStoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [story, setStory] = useState<StoryRow | null>(null);
  const [kid, setKid] = useState<Kid | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [denied, setDenied] = useState<boolean>(false);
  const completedSentRef = useRef<boolean>(false);

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

      await refreshAllPermissions();
      await refreshIfStale();
      if (!hasPermission('kids.article.view')) {
        setDenied(true);
        setLoading(false);
        return;
      }

      // M-07: filter out paused kid profiles server-side so we don't
      // briefly render kid UI with a stale `vp_active_kid_id` before
      // the client notices the paused state. Mirrors `/kids/page.tsx`
      // which already does `.is('paused_at', null)`. Also proactively
      // clears the localStorage key so re-entry doesn't flicker.
      const { data: kidRow } = await supabase
        .from('kid_profiles')
        .select('id, display_name, avatar_color, paused_at')
        .eq('id', activeKidId)
        .eq('parent_user_id', user.id)
        .is('paused_at', null)
        .maybeSingle();
      if (!kidRow) {
        try { window.localStorage.removeItem(ACTIVE_KID_KEY); } catch {}
        try { window.dispatchEvent(new Event('vp:kid-mode-changed')); } catch {}
        router.replace('/kids');
        return;
      }
      setKid(kidRow as Kid);

      const { data: article, error: articleErr } = await supabase
        .from('articles')
        .select('id, title, slug, body, kids_summary, excerpt, cover_image_url, cover_image_alt, reading_time_minutes, is_kids_safe, status, categories!fk_articles_category_id(name)')
        .eq('slug', slug)
        .maybeSingle();
      if (articleErr) console.error('[kids/story] load failed', articleErr);

      const a = article as unknown as StoryRow | null;
      if (!a || a.status !== 'published' || !a.is_kids_safe) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setStory(a);
      setLoading(false);

      fetch('/api/stories/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: a.id,
          kidProfileId: kidRow.id,
          completed: false,
        }),
      }).catch(err => { console.error('[kids/story] read start log', err); });
    })();
  }, [slug, router]);

  useEffect(() => {
    if (!story || !kid || completedSentRef.current) return;

    const markComplete = (readPercentage: number | null) => {
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
      }).catch(err => { console.error('[kids/story] read complete log', err); });
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

  if (denied) {
    return (
      <div style={{ padding: '48px 16px' }}>
        <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto' }}>
          <AskAGrownUp
            reason="locked"
            body="Kid stories aren\u2019t available on this account yet. Ask a grown-up."
            action={{ href: '/kids', label: 'Back to stories' }}
          />
        </div>
      </div>
    );
  }

  if (notFound || !story || !kid) {
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
    ? story.body.split('\n').map((p) => p.trim()).filter(Boolean)
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

        {/* M-08: ArticleQuiz already owns the passed-state celebration
            (kid-themed "Quiz passed!" / "Great reading! You got it."),
            so the separate QuizPassCelebration that used to sit here
            stacked a second card for the same event. Dropped. */}
        <div style={{ marginTop: KID.space.sectionGap + 8 }}>
          <ArticleQuiz
            articleId={story.id}
            kidProfileId={kid.id}
          />
        </div>
      </div>
    </div>
  );
}
