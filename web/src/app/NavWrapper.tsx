// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
'use client';

import { useState, useEffect, createContext, useContext, CSSProperties, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '../lib/supabase/client';
import AccountStateBanner from '../components/AccountStateBanner';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '../lib/permissions';
import type { Tables } from '@/types/database-helpers';

type ProfileRow = Pick<
  Tables<'users'>,
  | 'id'
  | 'username'
  | 'avatar_url'
  | 'avatar_color'
  | 'verity_score'
  | 'plan_id'
  | 'plan_status'
  | 'email_verified'
  | 'streak_current'
  | 'is_banned'
  | 'is_muted'
  | 'muted_until'
  | 'locked_until'
  | 'frozen_at'
  | 'plan_grace_period_ends_at'
  | 'deletion_scheduled_for'
  | 'created_at'
>;

interface AuthContextValue {
  loggedIn: boolean;
  user: ProfileRow | null;
  authLoaded: boolean;
  /**
   * Normalized tier string for analytics / telemetry. One of:
   * 'anon' | 'free_verified' | 'verity' | 'verity_pro' |
   * 'verity_family' | 'verity_family_xl'. Derived from plan_id +
   * email_verified. Never raw plan row — callers shouldn't need to
   * know the DB-side plan taxonomy to fire a track() call.
   */
  userTier: string;
  /** Days since signup, or null for anon. */
  tenureDays: number | null;
}

export const AuthContext = createContext<AuthContextValue>({
  loggedIn: false, user: null, authLoaded: false,
  userTier: 'anon', tenureDays: null,
});
export const useAuth = () => useContext(AuthContext);

function deriveTier(user: ProfileRow | null): string {
  if (!user) return 'anon';
  if (!user.email_verified) return 'anon';
  // plan_id is a FK to plans.id. Tier string lives on plans.tier in the
  // DB, but we don't need a join here — the paid plans have predictable
  // id values that include the tier. Anything else maps to free_verified.
  const raw = String(user.plan_id || '').toLowerCase();
  if (raw.includes('family_xl')) return 'verity_family_xl';
  if (raw.includes('family')) return 'verity_family';
  if (raw.includes('pro')) return 'verity_pro';
  if (raw.includes('verity')) return 'verity';
  return 'free_verified';
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

// ============================================================
// LAUNCH GATES — one-line kill switches for the global chrome.
// Flip any of these to hide that surface site-wide while the site
// is pre-launch / under review (e.g. Apple Developer Program
// verification). Per-route hiding still applies on top; these just
// add a global veto.
//
// Quick presets:
//   Fully cloaked (brand-only landing):  TOP=true, NAV=false, FOOT=true
//   Fully public:                        TOP=true, NAV=true,  FOOT=true
//   Dark mode (hide everything):         TOP=false, NAV=false, FOOT=false
// ============================================================
const SHOW_TOP_BAR = true;      // "verity post" wordmark + search icon
const SHOW_BOTTOM_NAV = false;  // Home / Notifications / Leaderboard / Profile
const SHOW_FOOTER = true;       // Help / Contact / Privacy / Terms / etc.

// Auth / onboarding routes that run fullscreen without any global chrome.
// Separate from '/' — home now shows the top bar + footer (no bottom nav),
// so it's handled with its own gate below instead of living in this list.
const AUTH_HIDE = ['/login', '/signup', '/signup/pick-username', '/signup/expert', '/forgot-password', '/reset-password', '/verify-email', '/api/auth/callback', '/logout', '/welcome'];
const isAdmin = (p: string) => p.startsWith('/admin');
const isIdeasPreview = (p: string) => p.startsWith('/ideas');
// Article reader owns the viewport — no global nav, no footer. Reading
// experience is kept clean on both /story/<slug> and any deeper /story
// route (e.g. /story/<slug>/something future).
const isStory = (p: string) => p.startsWith('/story');

interface NavItem { label: string; href: string }

export default function NavWrapper({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [user, setUser] = useState<ProfileRow | null>(null);
  const [authLoaded, setAuthLoaded] = useState<boolean>(false);
  // DA-038 — use Next's usePathname() instead of monkey-patching
  // history.pushState. The old approach stacked wrappers on remount
  // and broke Next's internal navigation hooks.
  const path = usePathname() || '/';
  const [mounted, setMounted] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [canSeeAdmin, setCanSeeAdmin] = useState<boolean>(false);
  // R13-T4 (Crew 7): `search.basic` gates the search icon in the top
  // bar. Hydrated alongside `admin.dashboard.view` in the same profile
  // load path so the top bar branches correctly on first paint after
  // auth resolves.
  const [canSearch, setCanSearch] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadProfile(authUser: { id: string } | null) {
      if (!authUser) {
        if (!cancelled) {
          setUser(null);
          setLoggedIn(false);
          setAuthLoaded(true);
          setCanSeeAdmin(false);
          setCanSearch(false);
        }
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('id, username, avatar_url, avatar_color, verity_score, plan_id, plan_status, email_verified, streak_current, is_banned, is_muted, muted_until, locked_until, frozen_at, plan_grace_period_ends_at, deletion_scheduled_for, created_at')
        .eq('id', authUser.id)
        .maybeSingle<ProfileRow>();

      await refreshAllPermissions();
      await refreshIfStale();

      if (!cancelled) {
        setUser(profile || null);
        setLoggedIn(true);
        setAuthLoaded(true);
        setCanSeeAdmin(hasPermission('admin.dashboard.view'));
        setCanSearch(hasPermission('search.basic'));
      }
    }

    supabase.auth.getUser().then(({ data: { user: authUser } }) => loadProfile(authUser));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user || null);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) { setUnreadCount(0); return; }
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/notifications?unread=1&limit=1');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUnreadCount(data.unread_count || 0);
      } catch (e) { console.error('[nav] notifications poll', e); }
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [loggedIn]);

  // Chrome visibility gates. Three surfaces, three rules:
  //   showTopBar  — "verity post" wordmark + search icon. Shown on home
  //                 AND on all standard content pages. Hidden on auth,
  //                 admin, ideas preview, and story reader.
  //   showNav     — bottom 4-item nav bar. Hidden on home (no sign-up
  //                 push pre-launch), plus all the same surfaces the
  //                 top bar is hidden on.
  //   showFooter  — Help/Contact/Privacy strip. Follows showTopBar so
  //                 the legal + support links are reachable wherever
  //                 the brand is visible, including home.
  const isAuthRoute = AUTH_HIDE.includes(path);
  // Fully chrome-free surfaces — admin owns its own shell, auth pages run
  // fullscreen, ideas preview is intentionally bare.
  const fullyBare = isAuthRoute || isAdmin(path) || isIdeasPreview(path);
  // Per-surface rules. Top bar shows on story pages so a reader can tap
  // the wordmark to return home; bottom nav and footer stay off there to
  // keep the reading viewport clean.
  const showTopBar = mounted && SHOW_TOP_BAR && !fullyBare;
  const showNav = mounted && SHOW_BOTTOM_NAV && !fullyBare && !isStory(path) && path !== '/';
  const showFooter = mounted && SHOW_FOOTER && !fullyBare && !isStory(path);
  const onAdminPage = mounted && isAdmin(path);
  // UJ-200 (Pass 17): banner is strictly admin+ territory. Editor and
  // moderator roles can reach the admin routes they're authorised for
  // without the dark "Back to site" chrome — keeps the UI honest about
  // who has full platform reach.
  // LB-005 revised: banner renders everywhere for admins so the entry
  // into /admin is always reachable. Copy flips based on context:
  //   - On /admin/*  → "Back to site" → /
  //   - Elsewhere    → "Admin"        → /admin
  // This matters on routes where the global nav is suppressed (home,
  // auth pages) — without this, admins had no visible path into /admin.
  const showAdminBanner = authLoaded && canSeeAdmin;

  const C = {
    bg: 'var(--bg)',
    card: 'var(--card)',
    border: 'var(--border)',
    text: 'var(--text)',
    dim: 'var(--muted)',
    accent: 'var(--accent)',
  } as const;

  const navItems: NavItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Notifications', href: '/notifications' },
    { label: 'Leaderboard', href: '/leaderboard' },
    loggedIn
      ? { label: 'Profile', href: '/profile' }
      : { label: 'Sign in', href: '/login' },
  ];

  const navStyle: CSSProperties = {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
    background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
    borderTop: `1px solid ${C.border}`,
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    height: 64, paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
  };

  // R13-T3 — top-bar logo. Minimal v1: just "Verity Post" on the left
  // routing to `/`. Same lifecycle rules as the bottom nav, plus hidden
  // on admin routes (the admin chrome already owns the top/bottom of
  // the viewport there). Right side varies by user state: search icon
  // for signed-in users with `search.basic`, subtle "Sign in" link for
  // anon, nothing otherwise.
  const TOP_BAR_HEIGHT = 44;
  const topBarHomeHref = '/';
  const topBarActive = path === topBarHomeHref;
  // Bug 1 fix: `boxSizing: content-box` means the rendered height is
  // `TOP_BAR_HEIGHT + env(safe-area-inset-top)`. The wrapper must reserve
  // the same total, not just `TOP_BAR_HEIGHT`, or notched devices push
  // page content under the bar by the safe-area amount.
  const topBarReservedHeight = `calc(${TOP_BAR_HEIGHT}px + env(safe-area-inset-top))`;
  const topBarStyle: CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
    background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: TOP_BAR_HEIGHT,
    padding: '0 16px',
    paddingTop: 'env(safe-area-inset-top)',
    boxSizing: 'content-box',
  };
  // Expose the total reserved height to children via a CSS custom
  // property so per-page sticky chrome (story tab bar, etc.) can offset
  // below the global top bar with a single source of truth.
  const showTopBarVar: CSSProperties = showTopBar
    ? ({ ['--vp-top-bar-h' as string]: topBarReservedHeight } as CSSProperties)
    : ({ ['--vp-top-bar-h' as string]: '0px' } as CSSProperties);

  return (
    <AuthContext.Provider value={{
      loggedIn, user, authLoaded,
      userTier: deriveTier(user),
      tenureDays: daysSince(user?.created_at ?? null),
    }}>
      {loggedIn && user && <AccountStateBanner user={user} />}
      <div style={{
        // Bug 1 fix: reserve the FULL rendered top-bar height
        // (44 + safe-area-inset-top) so iPhone-notched devices don't
        // push content under the bar.
        paddingTop: showTopBar ? topBarReservedHeight : 0,
        paddingBottom: showNav ? (showAdminBanner ? 104 : 68) : (showAdminBanner ? 44 : 0),
        ...showTopBarVar,
      }}>
        {children}

        {showFooter && (
          <footer style={{
            maxWidth: 680, margin: '0 auto', padding: '32px 16px 24px',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
              {[
                // LAUNCH: 'Help' link hidden from users pre-launch. The
                // /help page itself stays reachable because Apple App
                // Store submission requires a public Support URL — the
                // page is registered as that URL. Put this back when
                // ready for public launch:
                // { label: 'Help', href: '/help' },
                { label: 'Contact', href: '/contact' },
                { label: 'Privacy', href: '/privacy' },
                { label: 'Terms', href: '/terms' },
                { label: 'Cookies', href: '/cookies' },
                { label: 'Accessibility', href: '/accessibility' },
                { label: 'DMCA', href: '/dmca' },
              ].map((link) => (
                <a key={link.label} href={link.href} style={{
                  fontSize: 11, color: 'var(--muted)', textDecoration: 'none',
                }}>{link.label}</a>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>
              verity post
            </div>
          </footer>
        )}
      </div>

      {showTopBar && (
        // R13-T3 — fixed top bar with "Verity Post" logo on the left.
        // Safe-area-inset-top padding keeps the brand below iPhone notches.
        //
        // R13-T4 (Crew 7): right side branches by user state.
        //   Signed-in + has search.basic → magnifying-glass icon → /search
        //   Anon                         → subtle "Sign in" text → /login
        //   Otherwise                    → nothing
        <header style={topBarStyle}>
          <a
            href={topBarHomeHref}
            aria-label="Go to home"
            aria-current={topBarActive ? 'page' : undefined}
            style={{
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              color: C.text,
              textDecoration: 'none',
            }}
          >
            verity post
          </a>
          {/* Round D H-14 — search icon ungated from home-only. The former
              `path === '/'` clause was a layout leftover from when `/` had
              its own sticky search row; once the entry point moved into
              this global top bar, restricting it to `/` left verified
              users on `/story/<slug>`, `/browse`, `/category/*` without
              a quick path back into search. Permission-level gating
              (`search.basic`) already decides who can search; path-level
              gating added nothing beyond friction. */}
          {loggedIn && canSearch && (
            <a
              href="/search"
              aria-label="Search"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 44, minHeight: 44,
                // Pull into the 16px edge gutter so the visual centre of
                // the icon aligns with the page's right margin.
                marginRight: -8,
                color: C.dim,
                textDecoration: 'none',
              }}
            >
              <svg
                width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </a>
          )}
        </header>
      )}

      {showNav && (
        // DA-185 — safe-area inset so the iPhone home-bar does not
        // overlap bottom-nav tappable targets. `viewport-fit=cover`
        // (layout.js) exposes the env() var; the padding grows only
        // on devices that have a home bar.
        <nav style={navStyle}>
          {/* DA-062 — aria-current on the active nav link so screen
              readers announce which route is current. */}
          {navItems.map((item) => {
            const active = path === item.href || (item.href !== '/' && path.startsWith(item.href));
            const showDot = item.href === '/notifications' && unreadCount > 0;
            return (
              <a key={item.href} href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  position: 'relative',
                  textDecoration: 'none', padding: '12px 16px',
                  minHeight: 44, minWidth: 44,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? C.accent : C.dim,
                }}>
                {item.label}
                {showDot && (
                  <span aria-label={`${unreadCount} unread`} style={{
                    position: 'absolute', top: 4, right: 8,
                    width: 8, height: 8, borderRadius: 4, background: '#dc2626',
                  }} />
                )}
              </a>
            );
          })}
        </nav>
      )}

      {showAdminBanner && (
        <div style={{
          position: 'fixed', bottom: showNav ? 56 : 0, left: 0, right: 0, zIndex: 10000,
          background: '#111', padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <a
            href={onAdminPage ? '/' : '/admin'}
            style={{ color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
          >
            {onAdminPage ? 'Back to site' : 'Admin'}
          </a>
        </div>
      )}
    </AuthContext.Provider>
  );
}
