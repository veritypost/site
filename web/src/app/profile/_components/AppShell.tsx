// Profile app shell. The whole profile experience is now a single
// master/detail surface — left rail = persistent identity + section list
// + search; right panel = one section at a time. Replaces the prior
// dashboard/settings split and the long-scroll IA.
//
// URL contract: ?section=<id>. Default is "you". Deep-links work.
// Mobile (<860px): rail becomes a slide-in drawer triggered from a top
// app bar; right panel becomes the only thing on screen.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import Avatar from '@/components/Avatar';
import type { Tables } from '@/types/database-helpers';
import type { ScoreTier } from '@/lib/scoreTiers';

import { C, F, FONT, R, S, SH } from '../_lib/palette';
import { useFocusTrap } from '../_lib/useFocusTrap';

type UserRow = Tables<'users'>;

export interface SectionDef {
  id: string;
  // Glyph as a small leading icon (kept as text emoji to avoid a webfont fetch)
  glyph: string;
  title: string;
  // Short reason copy — shown under the section header in the right panel.
  reason: string;
  // Optional group label — sections with the same `group` cluster under a
  // small uppercase heading in the rail. Sections without a group render
  // ungrouped at the top.
  group?: string;
  // Hidden = section exists but isn't on the rail (e.g. legal pages,
  // back-doors). Locked = visible but dimmed and the panel renders an
  // upgrade message.
  hidden?: boolean;
  locked?: boolean;
  // Optional inline badge text (e.g. unread count) shown right-aligned in
  // the rail row.
  badge?: string;
  // Search keywords used by the rail's search bar — type "password" → match
  // Security; type "card" → match Plan. Don't include the title itself.
  keywords?: string[];
  render: () => React.ReactNode;
}

interface Props {
  user: UserRow;
  tier: ScoreTier | null;
  preview: boolean;
  defaultSection?: string;
  sections: SectionDef[];
}

export function AppShell({ user, tier, preview, defaultSection = 'you', sections }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams?.get('section') ?? defaultSection;
  const visible = sections.filter((s) => !s.hidden);
  const activeId = visible.some((s) => s.id === requested) ? requested : visible[0]?.id;
  const active = visible.find((s) => s.id === activeId) ?? visible[0];

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const railRef = useRef<HTMLElement | null>(null);

  // T336 — trap focus inside the mobile drawer while it's open. Above
  // 860px the rail is sticky and always-visible, so the trap never
  // engages there (the hook no-ops when active=false).
  useFocusTrap(railRef, { active: drawerOpen });

  const setSection = useCallback(
    (id: string) => {
      const qs = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      qs.set('section', id);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
      setDrawerOpen(false);
      // Scroll the right panel back to top so users don't land mid-page
      // after a section change.
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [pathname, router, searchParams]
  );

  // Keyboard: ⌘K / Ctrl+K focuses the rail search; Escape closes the
  // mobile drawer (T336). Two listeners share one keydown handler so
  // we only register/unregister once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const el = document.getElementById('redesign-rail-search');
        el?.focus();
        return;
      }
      if (e.key === 'Escape') {
        setDrawerOpen((open) => {
          if (open) return false;
          return open;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((s) => {
      const hay = [s.title, s.reason, ...(s.keywords ?? [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [search, visible]);

  return (
    <div
      style={{
        background: C.surface,
        minHeight: '100vh',
        fontFamily: FONT.sans,
        color: C.ink,
      }}
    >
      <style>{shellCss}</style>

      {/* Mobile app bar — only shown < 860px */}
      <header className="redesign-shell-mobilebar">
        <button
          type="button"
          aria-label="Open profile menu"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
            background: 'transparent',
            border: 'none',
            color: C.ink,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Avatar user={user} size={32} />
          <span style={{ fontSize: F.sm, fontWeight: 600 }}>
            {(user as UserRow & { display_name?: string | null }).display_name ??
              user.username ??
              'You'}
          </span>
          <span aria-hidden style={{ fontSize: 12, color: C.inkMuted, marginLeft: S[1] }}>
            ▾
          </span>
        </button>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: F.xs,
            color: C.inkFaint,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {active?.title}
        </span>
      </header>

      <div className="redesign-shell-grid">
        {/* Mobile drawer overlay */}
        {drawerOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="redesign-shell-overlay"
          />
        ) : null}

        <aside
          ref={railRef}
          className={`redesign-shell-rail ${drawerOpen ? 'redesign-shell-rail-open' : ''}`}
          aria-label="Profile sections"
        >
          <IdentityRailCard user={user} tier={tier} preview={preview} />

          <div style={{ position: 'relative', padding: `${S[3]}px ${S[4]}px ${S[2]}px` }}>
            <input
              id="redesign-rail-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search profile"
              aria-label="Search profile"
              style={{
                width: '100%',
                padding: `${S[2]}px ${S[3]}px ${S[2]}px ${S[7]}px`,
                fontSize: F.sm,
                color: C.ink,
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
                // T335 — drop `outline: 'none'` so the global
                // *:focus-visible rule applies. Was clobbering keyboard
                // focus feedback on this search input.
                fontFamily: FONT.sans,
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: S[6],
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.inkFaint,
                fontSize: 14,
              }}
            >
              ⌕
            </span>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                right: S[6],
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: F.xs,
                color: C.inkFaint,
                fontFamily: FONT.mono,
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                padding: '0 4px',
                lineHeight: '16px',
              }}
            >
              ⌘K
            </span>
          </div>

          <nav
            style={{
              padding: `${S[1]}px ${S[3]}px ${S[5]}px`,
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {matched.length === 0 ? (
              <div
                style={{
                  padding: `${S[3]}px ${S[3]}px`,
                  fontSize: F.sm,
                  color: C.inkMuted,
                }}
              >
                No matches for &ldquo;{search}&rdquo;.
              </div>
            ) : (
              groupedNav(matched).map((g) => (
                <div key={g.label ?? '__'} style={{ marginBottom: S[3] }}>
                  {g.label ? (
                    <div
                      style={{
                        padding: `${S[2]}px ${S[3]}px ${S[1]}px`,
                        fontSize: F.xs,
                        fontWeight: 600,
                        color: C.inkFaint,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {g.label}
                    </div>
                  ) : null}
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    {g.items.map((s) => {
                      const isActive = s.id === activeId;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => setSection(s.id)}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              display: 'flex',
                              alignItems: 'center',
                              gap: S[3],
                              padding: `${S[2]}px ${S[3]}px`,
                              background: isActive ? C.surfaceRaised : 'transparent',
                              border: 'none',
                              borderRadius: R.md,
                              fontSize: F.sm,
                              fontWeight: isActive ? 600 : 500,
                              color: s.locked ? C.inkFaint : isActive ? C.ink : C.inkSoft,
                              cursor: 'pointer',
                              transition: 'background 120ms ease, color 120ms ease',
                              boxShadow: isActive ? SH.ambient : 'none',
                            }}
                          >
                            <span style={{ flex: 1 }}>{s.title}</span>
                            {s.badge ? (
                              <span
                                style={{
                                  fontSize: F.xs,
                                  fontWeight: 700,
                                  padding: '0 6px',
                                  background: isActive ? C.ink : C.surfaceSunken,
                                  color: isActive ? C.bg : C.inkMuted,
                                  borderRadius: 999,
                                  minWidth: 18,
                                  textAlign: 'center',
                                  lineHeight: '16px',
                                }}
                              >
                                {s.badge}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </nav>

          <footer
            style={{
              marginTop: 'auto',
              padding: `${S[4]}px ${S[5]}px ${S[5]}px`,
              borderTop: `1px solid ${C.divider}`,
              fontSize: F.xs,
              color: C.inkFaint,
            }}
          >
            <Link href="/" style={{ color: C.inkMuted, textDecoration: 'none', fontWeight: 600 }}>
              ← Back to Verity Post
            </Link>
          </footer>
        </aside>

        <main
          className="redesign-shell-panel"
          aria-live="polite"
          aria-labelledby="redesign-section-title"
        >
          {active ? (
            <article key={active.id} className="redesign-section-fade" style={{ maxWidth: 720 }}>
              <header style={{ marginBottom: S[6] }}>
                <h1
                  id="redesign-section-title"
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: F.display,
                    fontWeight: 600,
                    color: C.ink,
                    margin: 0,
                    marginBottom: S[2],
                    letterSpacing: '-0.02em',
                  }}
                >
                  {active.title}
                </h1>
                <p
                  style={{
                    fontSize: F.lg,
                    color: C.inkMuted,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {active.reason}
                </p>
              </header>
              {active.locked ? <LockedSection title={active.title} /> : active.render()}
            </article>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function groupedNav(items: SectionDef[]): { label: string | null; items: SectionDef[] }[] {
  const groups: { label: string | null; items: SectionDef[] }[] = [];
  for (const item of items) {
    const key = item.group ?? null;
    let bucket = groups.find((g) => g.label === key);
    if (!bucket) {
      bucket = { label: key, items: [] };
      groups.push(bucket);
    }
    bucket.items.push(item);
  }
  return groups;
}

function IdentityRailCard({
  user,
  tier,
  preview,
}: {
  user: UserRow;
  tier: ScoreTier | null;
  preview: boolean;
}) {
  const u = user as UserRow & {
    display_name?: string | null;
    username?: string | null;
    is_expert?: boolean | null;
    is_verified_public_figure?: boolean | null;
    verity_score?: number | null;
  };
  return (
    <div
      style={{
        position: 'relative',
        padding: `${S[5]}px ${S[5]}px ${S[4]}px`,
        background: C.surfaceRaised,
        borderBottom: `1px solid ${C.divider}`,
      }}
    >
      <div style={{ display: 'flex', gap: S[3], alignItems: 'center' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar user={u} size={48} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: F.lg,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'flex',
              alignItems: 'center',
              gap: S[1],
            }}
          >
            {u.display_name ?? u.username ?? 'You'}
            {u.is_expert ? (
              <span
                title="Verified expert"
                style={{
                  fontSize: 11,
                  background: C.expertSoft,
                  color: C.expert,
                  padding: '0 6px',
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                ✦
              </span>
            ) : u.is_verified_public_figure ? (
              <span
                title="Verified public figure"
                style={{
                  fontSize: 11,
                  background: C.verifiedSoft,
                  color: C.verified,
                  padding: '0 6px',
                  borderRadius: 999,
                  fontWeight: 700,
                }}
              >
                ✓
              </span>
            ) : null}
          </div>
          {u.username ? (
            <div
              style={{
                fontSize: F.xs,
                color: C.inkMuted,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              @{u.username}
            </div>
          ) : null}
        </div>
      </div>
      {tier ? (
        <div
          style={{
            marginTop: S[3],
            fontSize: F.xs,
            color: C.inkMuted,
            fontWeight: 500,
          }}
        >
          {tier.display_name ?? tier.name}
          {typeof u.verity_score === 'number' ? ` · ${u.verity_score.toLocaleString()}` : ''}
        </div>
      ) : null}
      {preview ? (
        <div
          style={{
            marginTop: S[3],
            fontSize: F.xs,
            color: C.info,
            background: C.infoSoft,
            border: `1px solid ${C.info}`,
            borderRadius: R.sm,
            padding: '4px 8px',
            fontWeight: 500,
          }}
        >
          Preview mode — sample data
        </div>
      ) : null}
    </div>
  );
}

function LockedSection({ title }: { title: string }) {
  return (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: S[7],
        textAlign: 'center',
        boxShadow: SH.ambient,
      }}
    >
      <h2
        style={{
          fontFamily: FONT.serif,
          fontSize: F.xl,
          fontWeight: 600,
          color: C.ink,
          margin: 0,
          marginBottom: S[2],
        }}
      >
        Upgrade to unlock {title}
      </h2>
      <p style={{ fontSize: F.base, color: C.inkMuted, margin: 0, marginBottom: S[5] }}>
        This section is part of paid plans.
      </p>
      <Link
        href="/profile?section=plan"
        style={{
          display: 'inline-block',
          padding: `${S[3]}px ${S[5]}px`,
          background: C.ink,
          color: C.bg,
          borderRadius: R.md,
          fontSize: F.base,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        See plans
      </Link>
    </div>
  );
}

const shellCss = `
@keyframes redesign-section-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.redesign-section-fade {
  animation: redesign-section-in 180ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .redesign-section-fade { animation: none; }
}
.redesign-shell-grid {
  display: flex;
  min-height: 100vh;
}
.redesign-shell-rail {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  background: ${C.bg};
  border-right: 1px solid ${C.border};
  display: flex;
  flex-direction: column;
  z-index: 30;
  transform: translateX(-100%);
  transition: transform 220ms ease;
}
.redesign-shell-rail-open {
  transform: translateX(0);
}
.redesign-shell-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 25;
  border: none;
  cursor: pointer;
  padding: 0;
}
.redesign-shell-mobilebar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: ${S[3]}px;
  padding: ${S[3]}px ${S[4]}px;
  background: ${C.bg};
  border-bottom: 1px solid ${C.border};
  backdrop-filter: saturate(180%) blur(6px);
}
.redesign-shell-panel {
  flex: 1;
  min-width: 0;
  padding: ${S[6]}px ${S[5]}px ${S[9]}px;
  background: ${C.bg};
}
@media (min-width: 860px) {
  .redesign-shell-mobilebar { display: none; }
  .redesign-shell-overlay { display: none; }
  .redesign-shell-rail {
    position: sticky;
    top: 0;
    height: 100vh;
    transform: none;
    flex-shrink: 0;
    width: 280px;
  }
  .redesign-shell-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
  }
  .redesign-shell-panel {
    padding: ${S[8]}px ${S[8]}px ${S[9]}px;
  }
}
`;
