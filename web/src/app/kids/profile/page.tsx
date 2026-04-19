// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { KID } from '@/lib/kidTheme';
import EmptyState from '@/components/kids/EmptyState';
import AskAGrownUp from '@/components/kids/AskAGrownUp';
import Badge from '@/components/kids/Badge';
import { useKidChrome } from '@/components/kids/KidTopChrome';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

const ACTIVE_KID_KEY = 'vp_active_kid_id';

type KidRow = Pick<
  Tables<'kid_profiles'>,
  | 'id'
  | 'display_name'
  | 'avatar_color'
  | 'pin_hash'
  | 'verity_score'
  | 'articles_read_count'
  | 'quizzes_completed_count'
  | 'streak_current'
>;
type AchRow = Pick<Tables<'user_achievements'>, 'id' | 'achievement_id' | 'earned_at'> & {
  achievements?: Pick<Tables<'achievements'>, 'key' | 'name' | 'icon_name'> | null;
};
type BookmarkRow = Pick<Tables<'bookmarks'>, 'id' | 'article_id'> & {
  articles: Pick<Tables<'articles'>, 'id' | 'title' | 'slug' | 'kids_summary' | 'is_kids_safe'>;
};

export default function KidsProfilePage() {
  const router = useRouter();
  const { openExitPin } = useKidChrome();
  const [kid, setKid] = useState<KidRow | null>(null);
  const [badges, setBadges] = useState<AchRow[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [denied, setDenied] = useState<boolean>(false);

  useEffect(() => {
    const activeKidId = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_KID_KEY) : null;
    if (!activeKidId) {
      router.replace('/kids');
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      await refreshAllPermissions();
      await refreshIfStale();
      if (!hasPermission('kids.home.view')) {
        if (!cancelled) {
          setDenied(true);
          setLoading(false);
        }
        return;
      }

      const { data: kidRow } = await supabase
        .from('kid_profiles')
        .select('id, display_name, avatar_color, pin_hash, verity_score, articles_read_count, quizzes_completed_count, streak_current')
        .eq('id', activeKidId)
        .eq('parent_user_id', user.id)
        .maybeSingle();

      if (!kidRow) {
        try { window.localStorage.removeItem(ACTIVE_KID_KEY); } catch {}
        try { window.dispatchEvent(new Event('vp:kid-mode-changed')); } catch {}
        router.replace('/kids');
        return;
      }

      const { data: ach } = await supabase
        .from('user_achievements')
        .select('id, achievement_id, earned_at, achievements(key, name, icon_name)')
        .eq('kid_profile_id', activeKidId)
        .order('earned_at', { ascending: false });

      const { data: bm } = await supabase
        .from('bookmarks')
        .select('id, article_id, articles!inner(id, title, slug, kids_summary, is_kids_safe)')
        .eq('user_id', user.id)
        .eq('articles.is_kids_safe', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!cancelled) {
        setKid(kidRow as KidRow);
        setBadges((ach || []) as AchRow[]);
        setBookmarks((bm || []) as BookmarkRow[]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

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
            body="Kid mode isn\u2019t turned on for this account."
            action={{ href: '/', label: 'Back' }}
          />
        </div>
      </div>
    );
  }
  if (!kid) return null;

  const theme = kid.avatar_color || KID.accent;
  const initial = (kid.display_name || '?').slice(0, 1).toUpperCase();

  return (
    <div>
      <div style={{
        background: theme, color: KID.onAccent,
        padding: '40px 20px 64px', textAlign: 'center',
      }}>
        <div style={{
          width: 96, height: 96, borderRadius: 48,
          background: KID.card, color: theme,
          fontSize: 42, fontWeight: KID.weight.extra,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
          boxShadow: KID.shadow,
        }}>
          {initial}
        </div>
        <div style={{
          fontSize: KID.font.h1, fontWeight: KID.weight.extra,
          letterSpacing: KID.tracking.tight, lineHeight: KID.leading.heading,
        }}>
          {kid.display_name}
        </div>
      </div>

      <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto', padding: `0 16px ${KID.space.sectionGap}px` }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: KID.space.rowGap, marginTop: -36,
        }}>
          <StatCard value={kid.articles_read_count ?? 0} label="Articles" />
          <StatCard
            value={kid.streak_current ?? 0}
            label="Day streak"
            accent={KID.streak}
            flame={(kid.streak_current ?? 0) >= 3}
          />
          <StatCard value={badges.length} label="Badges" accent={KID.achievement} />
          <StatCard value={kid.verity_score ?? 0} label="Verity Score" />
        </div>

        <Section title="Your badges">
          {badges.length === 0 ? (
            <EmptyState
              icon="star"
              tone="gold"
              title="No badges yet"
              body="Read stories and take quizzes to earn your first one."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: KID.space.rowGap }}>
              {badges.map((b) => (
                <Badge
                  key={b.id}
                  name={b.achievements?.name || b.achievements?.key || 'Badge'}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Saved stories">
          {bookmarks.length === 0 ? (
            <EmptyState
              icon="book"
              title="Nothing saved yet"
              body="Bookmark kid-friendly stories to find them here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
              {bookmarks.map((b) => (
                <a
                  key={b.id}
                  href={`/kids/story/${b.articles.slug}`}
                  style={{
                    background: KID.card, border: `1px solid ${KID.border}`,
                    borderRadius: KID.radius.card,
                    padding: `${KID.space.cardPad}px ${KID.space.cardPad}px`,
                    minHeight: KID.space.hitMin,
                    textDecoration: 'none', color: KID.text,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  }}
                >
                  <div style={{ fontWeight: KID.weight.bold, fontSize: KID.font.h3, lineHeight: KID.leading.heading }}>
                    {b.articles.title}
                  </div>
                  {b.articles.kids_summary && (
                    <div style={{ fontSize: KID.font.sub, color: KID.dim, marginTop: 6, lineHeight: KID.leading.relaxed }}>
                      {b.articles.kids_summary}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </Section>

        <div style={{ marginTop: KID.space.sectionGap, display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
          <button
            onClick={() => openExitPin('switch')}
            style={{
              background: KID.card, color: KID.text,
              border: `1px solid ${KID.border}`,
              borderRadius: KID.radius.button,
              minHeight: KID.space.hitMin,
              padding: '0 20px',
              fontSize: KID.font.sub, fontWeight: KID.weight.bold,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >Switch profile</button>
          <button
            onClick={() => openExitPin('leave')}
            style={{
              background: KID.accent, color: KID.onAccent,
              border: 'none',
              borderRadius: KID.radius.button,
              minHeight: KID.space.hitMin,
              padding: '0 20px',
              fontSize: KID.font.sub, fontWeight: KID.weight.bold,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >Exit kid mode</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: KID.space.sectionGap }}>
      <div style={{
        fontSize: KID.font.label, fontWeight: KID.weight.bold,
        color: KID.dim, textTransform: 'uppercase',
        letterSpacing: KID.tracking.loose, marginBottom: 10,
        fontFamily: 'var(--font-sans)',
      }}>{title}</div>
      {children}
    </div>
  );
}

function StatCard({ value, label, accent, flame }: {
  value: number;
  label: string;
  accent?: string;
  flame?: boolean;
}) {
  return (
    <div style={{
      background: KID.card, border: `2px solid ${accent || KID.border}`,
      borderRadius: KID.radius.card,
      padding: '18px 14px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: KID.font.stat, fontWeight: KID.weight.extra,
        color: accent || KID.text,
        lineHeight: 1.1, letterSpacing: KID.tracking.tight,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        {flame && (
          <span className="kid-streak-pulse" style={{ color: accent || KID.streak, display: 'inline-flex' }}>
            <FlameGlyph />
          </span>
        )}
        <span>{value}</span>
      </div>
      <div style={{
        fontSize: KID.font.label, fontWeight: KID.weight.bold,
        color: KID.dim, textTransform: 'uppercase',
        letterSpacing: KID.tracking.loose, marginTop: 6,
        fontFamily: 'var(--font-sans)',
      }}>{label}</div>
    </div>
  );
}

function FlameGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M16 3c1.2 3.2 0.4 5.8-1.4 7.8-2 2-4 3.6-4 7 0 4.8 4 9.2 9.4 9.2 5.4 0 9-4.2 9-9 0-4.6-3-7-4.2-9.6-0.8 2-2 3.6-3.2 4.4 0.4-3.8-0.6-7.2-5.6-9.8Z" />
    </svg>
  );
}
