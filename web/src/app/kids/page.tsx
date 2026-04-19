// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { KID } from '@/lib/kidTheme';
import EmptyState from '@/components/kids/EmptyState';
import AskAGrownUp from '@/components/kids/AskAGrownUp';
import StreakRibbon from '@/components/kids/StreakRibbon';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

const ACTIVE_KID_KEY = 'vp_active_kid_id';

type KidRow = Pick<
  Tables<'kid_profiles'>,
  'id' | 'display_name' | 'avatar_color' | 'pin_hash' | 'streak_current' | 'created_at'
>;
type KidProfile = KidRow & { name: string };
type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'is_kids_safe' | 'is_active' | 'parent_id'
> & { kids_only?: boolean; visible?: boolean };
type Subcategory = CategoryRow & { parent_id: string | null };
type KidStory = Pick<Tables<'articles'>, 'id' | 'title' | 'slug' | 'kids_summary'> & {
  subcategory_id?: string | null;
};

export default function KidsPage() {
  const router = useRouter();
  const [selectedProfile, setSelectedProfile] = useState<KidProfile | null>(null);
  const [profiles, setProfiles] = useState<KidProfile[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [selectedSubcatId, setSelectedSubcatId] = useState<string | null>(null);
  const [kidsStories, setKidsStories] = useState<KidStory[]>([]);

  const [denied, setDenied] = useState<boolean>(false);
  const [deniedButLoggedIn, setDeniedButLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDenied(true); setDeniedButLoggedIn(false); setLoading(false); return; }

      await refreshAllPermissions();
      await refreshIfStale();
      if (!hasPermission('kids.home.view')) {
        setDenied(true); setDeniedButLoggedIn(true); setLoading(false); return;
      }

      const { data: kidRows } = await supabase
        .from('kid_profiles')
        .select('id, display_name, avatar_color, pin_hash, streak_current, created_at')
        .eq('parent_user_id', user.id)
        .is('paused_at', null)
        .order('created_at', { ascending: true });
      const mapped: KidProfile[] = ((kidRows || []) as KidRow[]).map((k) => ({ ...k, name: k.display_name }));
      setProfiles(mapped);

      try {
        const savedId = window.localStorage.getItem(ACTIVE_KID_KEY);
        const savedProfile = savedId ? mapped.find((p) => p.id === savedId && p.pin_hash) : null;
        if (savedProfile) setSelectedProfile(savedProfile);
      } catch {}

      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug, is_kids_safe, is_active, parent_id')
        .eq('is_kids_safe', true)
        .eq('is_active', true)
        .is('parent_id', null)
        .order('sort_order', { ascending: true });
      setCategories(((cats || []) as CategoryRow[]).map((c) => ({ ...c, kids_only: true, visible: true })));
      setSubcategories([]);

      setLoading(false);
    }

    fetchData();
  }, [router]);

  if (denied) {
    if (deniedButLoggedIn) {
      return (
        <KidShell centered>
          <AskAGrownUp
            reason="upgrade"
            body="Kid profiles live on Verity Family. Your grown-up can add them from their account."
            action={{ href: '/profile/kids', label: 'View family plans' }}
          />
        </KidShell>
      );
    }
    return (
      <KidShell centered>
        <AskAGrownUp
          reason="sign-in"
          action={{ href: '/login', label: 'Sign in' }}
        />
      </KidShell>
    );
  }

  const activateProfile = (p: KidProfile) => {
    setSelectedProfile(p);
    try {
      window.localStorage.setItem(ACTIVE_KID_KEY, p.id);
      window.dispatchEvent(new Event('vp:kid-mode-changed'));
    } catch {}
  };

  if (loading) {
    return (
      <KidShell centered>
        <div style={{ fontSize: KID.font.sub, color: KID.dim }}>One sec…</div>
      </KidShell>
    );
  }

  if (!selectedProfile) {
    return (
      <KidShell centered>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{
            fontSize: KID.font.h1, fontWeight: KID.weight.extra,
            color: KID.text, marginBottom: 8,
            letterSpacing: KID.tracking.tight, lineHeight: KID.leading.heading,
          }}>
            Verity Post Kids
          </div>
          <p style={{ fontSize: KID.font.body, color: KID.dim, marginBottom: 32, lineHeight: KID.leading.relaxed }}>
            Who is reading today?
          </p>

          {profiles.length === 0 ? (
            <EmptyState
              icon="book"
              title="No profiles yet"
              body="Create a kid profile in your account settings to get started."
              action={{ href: '/profile/kids', label: 'Add profile' }}
            />
          ) : (
            <div style={{ display: 'flex', gap: KID.space.gridGap, justifyContent: 'center', flexWrap: 'wrap' }}>
              {profiles.map((p) => {
                const needsSetup = !p.pin_hash;
                return (
                  <button
                    key={p.id}
                    onClick={() => { if (!needsSetup) activateProfile(p); }}
                    disabled={needsSetup}
                    aria-label={needsSetup ? `${p.name} profile needs parent setup` : `Enter ${p.name}\u2019s profile`}
                    style={{
                      background: needsSetup ? KID.cardAlt : KID.card,
                      border: `2px ${needsSetup ? 'dashed' : 'solid'} ${KID.border}`,
                      borderRadius: 16,
                      padding: `${KID.space.cardPad}px 28px`,
                      cursor: needsSetup ? 'not-allowed' : 'pointer',
                      opacity: needsSetup ? 0.7 : 1,
                      minWidth: 160, minHeight: KID.space.hitMin * 2,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 72, height: 72, borderRadius: 36,
                      background: p.avatar_color || KID.accent,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 32, fontWeight: KID.weight.extra, color: KID.onAccent,
                    }}>
                      {(p.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <span style={{
                      fontSize: KID.font.body, fontWeight: KID.weight.bold,
                      color: KID.text,
                    }}>{p.name}</span>
                    {needsSetup && (
                      <span style={{
                        fontSize: KID.font.label, color: KID.danger,
                        fontWeight: KID.weight.bold, textTransform: 'uppercase',
                        letterSpacing: KID.tracking.loose,
                      }}>
                        Needs parent setup
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {profiles.some((p) => !p.pin_hash) && (
            <p style={{ fontSize: KID.font.sub, color: KID.dim, marginTop: 16, lineHeight: KID.leading.relaxed }}>
              Some profiles need a parent PIN before kids can use them.{' '}
              <a href="/profile/kids" style={{ color: KID.accent, fontWeight: KID.weight.bold }}>Set it up</a>.
            </p>
          )}
        </div>
      </KidShell>
    );
  }

  return (
    <KidShell>
      <div style={{ maxWidth: KID.space.maxWidth, margin: '0 auto', padding: `${KID.space.cardPad}px 16px 40px` }}>
        <h1 style={{
          fontSize: KID.font.h1, fontWeight: KID.weight.extra,
          color: KID.text, letterSpacing: KID.tracking.tight,
          lineHeight: KID.leading.heading,
          margin: '0 0 16px',
        }}>
          Hi, {selectedProfile.name}! What do you want to explore today?
        </h1>

        <StreakRibbon days={selectedProfile.streak_current || 0} name={selectedProfile.name} />

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: KID.space.gridGap, marginTop: KID.space.sectionGap,
        }}>
          {categories.map((c) => (
            <button
              key={c.id || c.name}
              onClick={async () => {
                setSelectedCatId(c.id);
                setSelectedSubcatId(null);
                const supabase = createClient();
                const { data } = await supabase
                  .from('articles')
                  .select('id, title, slug, kids_summary')
                  .eq('category_id', c.id)
                  .eq('status', 'published')
                  .eq('is_kids_safe', true)
                  .order('published_at', { ascending: false })
                  .limit(20);
                setKidsStories((data || []) as KidStory[]);
              }}
              style={{
                background: selectedCatId === c.id ? KID.accent : KID.card,
                border: `2px solid ${selectedCatId === c.id ? KID.accent : KID.border}`,
                borderRadius: KID.radius.card,
                padding: `${KID.space.cardPad}px 16px`,
                minHeight: KID.space.hitMin * 1.5,
                cursor: 'pointer', textAlign: 'center',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              <div style={{
                fontSize: KID.font.h3, fontWeight: KID.weight.bold,
                color: selectedCatId === c.id ? KID.onAccent : KID.text,
                lineHeight: KID.leading.heading,
              }}>{c.name}</div>
            </button>
          ))}
        </div>

        {selectedCatId && (() => {
          const subs = subcategories.filter((sc) => sc.parent_id === selectedCatId);
          if (subs.length === 0) return null;
          return (
            <div style={{ display: 'flex', gap: 8, marginTop: KID.space.rowGap, flexWrap: 'wrap' }}>
              <SubPill active={!selectedSubcatId} onClick={() => setSelectedSubcatId(null)} label="All" />
              {subs.map((sc) => (
                <SubPill
                  key={sc.id}
                  active={selectedSubcatId === sc.id}
                  onClick={() => setSelectedSubcatId(selectedSubcatId === sc.id ? null : sc.id)}
                  label={sc.name}
                />
              ))}
            </div>
          );
        })()}

        {selectedCatId && (() => {
          const filtered = selectedSubcatId
            ? kidsStories.filter((s) => s.subcategory_id === selectedSubcatId)
            : kidsStories;
          if (filtered.length > 0) {
            return (
              <div style={{ marginTop: KID.space.sectionGap, display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
                {filtered.map((s) => (
                  <a
                    key={s.id}
                    href={`/kids/story/${s.slug}`}
                    style={{
                      background: KID.card, border: `1px solid ${KID.border}`,
                      borderRadius: KID.radius.card,
                      padding: `${KID.space.cardPad}px ${KID.space.cardPad}px`,
                      minHeight: KID.space.hitMin,
                      textDecoration: 'none', color: KID.text,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    }}
                  >
                    <div style={{
                      fontWeight: KID.weight.bold, fontSize: KID.font.h3,
                      lineHeight: KID.leading.heading,
                    }}>{s.title}</div>
                    {s.kids_summary && (
                      <div style={{
                        fontSize: KID.font.sub, color: KID.dim,
                        lineHeight: KID.leading.relaxed, marginTop: 6,
                      }}>{s.kids_summary}</div>
                    )}
                  </a>
                ))}
              </div>
            );
          }
          return (
            <div style={{ marginTop: KID.space.sectionGap }}>
              <EmptyState
                icon="book"
                title="No stories here yet"
                body="Try another category — new stories show up here as we add them."
              />
            </div>
          );
        })()}
      </div>
    </KidShell>
  );
}

function SubPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 40,
        padding: '8px 16px', borderRadius: KID.radius.chip,
        fontSize: KID.font.sub, fontWeight: KID.weight.bold,
        border: `1.5px solid ${active ? KID.accent : KID.border}`,
        background: active ? KID.accent : KID.card,
        color: active ? KID.onAccent : KID.text,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{label}</button>
  );
}

function KidShell({ children, centered = false }: { children: React.ReactNode; centered?: boolean }) {
  const style: CSSProperties | undefined = centered ? {
    minHeight: 'calc(100dvh - 64px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  } : undefined;
  return <div style={style}>{children}</div>;
}
