'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { KID } from '@/lib/kidTheme';
import EmptyState from '@/components/kids/EmptyState';
import AskAGrownUp from '@/components/kids/AskAGrownUp';
import StreakRibbon from '@/components/kids/StreakRibbon';

// Task 8: exit-PIN + switch/leave affordances moved to /kids/profile.
// This page renders the profile picker (no kid selected) and the Home
// tab content (kid selected): category grid + article list.
// localStorage key `vp_active_kid_id` is how NavWrapper detects kid mode
// and swaps the bottom nav for the 3-tab kid bar.
const ACTIVE_KID_KEY = 'vp_active_kid_id';

// Migration 048 normalised kid-safe category names in the DB so there's
// no longer a mix of "Science (kids)" / "Kids Science" / "Science kids"
// etc. Kid mode reads the raw name.

export default function KidsPage() {
  const router = useRouter();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCatId, setSelectedCatId] = useState(null);
  const [selectedSubcatId, setSelectedSubcatId] = useState(null);
  const [kidsStories, setKidsStories] = useState([]);

  const [denied, setDenied] = useState(false);
  const [deniedButLoggedIn, setDeniedButLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setDenied(true); setDeniedButLoggedIn(false); setLoading(false); return; }

      const { data: allowed } = await supabase.rpc('has_permission', { p_key: 'profile.kids' });
      if (!allowed) { setDenied(true); setDeniedButLoggedIn(true); setLoading(false); return; }

      const { data: kidRows } = await supabase
        .from('kid_profiles')
        .select('id, display_name, avatar_color, pin_hash, streak_current, created_at')
        .eq('parent_user_id', user.id)
        .is('paused_at', null)
        .order('created_at', { ascending: true });
      const mapped = (kidRows || []).map(k => ({ ...k, name: k.display_name }));
      setProfiles(mapped);

      // Rehydrate the active kid from localStorage so nav + sub-pages
      // stay in sync when the parent navigates back to /kids via the
      // bottom Home tab.
      try {
        const savedId = window.localStorage.getItem(ACTIVE_KID_KEY);
        const savedProfile = savedId ? mapped.find(p => p.id === savedId && p.pin_hash) : null;
        if (savedProfile) setSelectedProfile(savedProfile);
      } catch {}

      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug, is_kids_safe, is_active, parent_id')
        .eq('is_kids_safe', true)
        .eq('is_active', true)
        .is('parent_id', null)
        .order('sort_order', { ascending: true });
      setCategories((cats || []).map(c => ({ ...c, kids_only: true, visible: true })));
      setSubcategories([]);

      setLoading(false);
    }

    fetchData();
  }, [router]);

  // Pass 17 / UJ-1116: non-family tier landing renders a plan-gated panel
  // instead of 404ing. Anonymous-denied now gets a gentle "your grown-up
  // needs to sign in" surface (Chunk 4) rather than a silent 404.
  // F-100 / F-101 — `denied` is only ever true after the data-loading
  // effect finishes on the client, so it's safe as the single branch
  // signal.
  if (denied) {
    if (deniedButLoggedIn) {
      // F7-aligned: kid profiles live on Family plan. This is an upgrade
      // gate, not a lock — pass a Show-my-grown-up action.
      return (
        <KidShell centered>
          <AskAGrownUp
            reason="upgrade"
            body="Kid profiles live on Verity Family. Your grown-up can add them from their account."
            action={{ href: '/billing', label: 'View family plans' }}
          />
        </KidShell>
      );
    }
    // Anonymous hit /kids directly. Previously silent 404; now a gentle
    // "your grown-up needs to sign in" surface that routes to /login.
    return (
      <KidShell centered>
        <AskAGrownUp
          reason="sign-in"
          action={{ href: '/login', label: 'Sign in' }}
        />
      </KidShell>
    );
  }

  // Write-through to localStorage so NavWrapper can swap the bottom bar
  // the moment a profile is selected.
  const activateProfile = (p) => {
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

  // Profile picker
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

  // Kid mode — Home tab content.
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
                setKidsStories(data || []);
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
          const subs = subcategories.filter(sc => sc.parent_id === selectedCatId);
          if (subs.length === 0) return null;
          return (
            <div style={{ display: 'flex', gap: 8, marginTop: KID.space.rowGap, flexWrap: 'wrap' }}>
              <SubPill active={!selectedSubcatId} onClick={() => setSelectedSubcatId(null)} label="All" />
              {subs.map(sc => (
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
            ? kidsStories.filter(s => s.subcategory_id === selectedSubcatId)
            : kidsStories;
          if (filtered.length > 0) {
            return (
              <div style={{ marginTop: KID.space.sectionGap, display: 'flex', flexDirection: 'column', gap: KID.space.rowGap }}>
                {filtered.map(s => (
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

function SubPill({ active, onClick, label }) {
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

function KidShell({ children, centered = false }) {
  // Layout provides the cream background + minHeight (Chunk 7). Shell
  // here handles the centered-empty-state case without duplicating.
  return (
    <div style={centered ? {
      minHeight: 'calc(100dvh - 64px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    } : undefined}>
      {children}
    </div>
  );
}
