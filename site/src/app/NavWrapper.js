'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '../lib/supabase/client';
import AccountStateBanner from '../components/AccountStateBanner';

export const AuthContext = createContext({ loggedIn: false, user: null });
export const useAuth = () => useContext(AuthContext);

const HIDE_NAV = ['/login', '/signup', '/signup/pick-username', '/signup/expert', '/forgot-password', '/reset-password', '/verify-email', '/api/auth/callback', '/logout', '/welcome'];
const isAdmin = (p) => p.startsWith('/admin');
const isKid = (p) => p === '/kids' || p.startsWith('/kids/');

// Key used across the site to mark kid-mode as active. Written by /kids
// when a profile is selected, cleared by /kids/profile on exit-PIN success.
// Readers listen for the `vp:kid-mode-changed` window event to re-sync.
const ACTIVE_KID_KEY = 'vp_active_kid_id';

export default function NavWrapper({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  // DA-038 — use Next's usePathname() instead of monkey-patching
  // history.pushState. The old approach stacked wrappers on remount
  // and broke Next's internal navigation hooks.
  const path = usePathname() || '/';
  const [mounted, setMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeKidId, setActiveKidId] = useState(null);

  useEffect(() => {
    setMounted(true);
    try { setActiveKidId(window.localStorage.getItem(ACTIVE_KID_KEY) || null); } catch {}

    const onKidModeChanged = () => {
      try { setActiveKidId(window.localStorage.getItem(ACTIVE_KID_KEY) || null); } catch {}
    };
    window.addEventListener('vp:kid-mode-changed', onKidModeChanged);
    // Cross-tab sync.
    const onStorage = (e) => {
      if (e.key === ACTIVE_KID_KEY) setActiveKidId(e.newValue || null);
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('vp:kid-mode-changed', onKidModeChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadProfile(authUser) {
      if (!authUser) {
        if (!cancelled) {
          setUser(null);
          setLoggedIn(false);
          setAuthLoaded(true);
        }
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('username, avatar_url, avatar_color, verity_score, plan_status, email_verified, streak_current, is_banned, is_muted, muted_until, locked_until, frozen_at, plan_grace_period_ends_at, deletion_scheduled_at')
        .eq('id', authUser.id)
        .maybeSingle();

      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', authUser.id);
      const roles = (roleRows || []).map((r) => r.roles?.name).filter(Boolean);

      if (!cancelled) {
        setUser({ ...(profile || {}), roles });
        setLoggedIn(true);
        setAuthLoaded(true);
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
      } catch {}
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [loggedIn]);

  const onKidRoute = mounted && isKid(path);
  const kidModeActive = onKidRoute && !!activeKidId;
  // In kid-mode routes without a selected profile (picker / PIN states),
  // hide nav entirely; Task 8 spec.
  const showNav = mounted && !HIDE_NAV.includes(path) && !isAdmin(path)
    && !(onKidRoute && !activeKidId);
  const onAdminPage = mounted && isAdmin(path);
  // UJ-200 (Pass 17): banner is strictly admin+ territory. Editor and
  // moderator roles can reach the admin routes they're authorised for
  // without the dark "Back to site" chrome — keeps the UI honest about
  // who has full platform reach.
  const isAdminUser = user?.roles?.some((r) => ['owner', 'admin', 'superadmin'].includes(r));
  // LB-005: admin banner renders only on /admin/* routes. Elsewhere admins
  // see the standard nav with no extra banner. Hiding on non-admin paths
  // closes the inconsistency where the banner would vanish on /story/<slug>
  // but show on /, /browse, /leaderboard, etc.
  const showAdminBanner = authLoaded && isAdminUser && onAdminPage;

  const C = {
    bg: 'var(--bg)',
    card: 'var(--card)',
    border: 'var(--border)',
    text: 'var(--text)',
    dim: 'var(--muted)',
    accent: 'var(--accent)',
  };

  const adultNavItems = [
    { label: 'Home', href: '/' },
    { label: 'Notifications', href: '/notifications' },
    { label: 'Leaderboard', href: '/leaderboard' },
    loggedIn
      ? { label: 'Profile', href: '/profile' }
      : { label: 'Log In', href: '/login' },
  ];

  // Kid 3-tab bar per Task 8 spec. Matches the iOS KidTabBar pattern
  // (Home / Leaderboard / Profile — no Notifications, no Messages).
  const kidNavItems = [
    { label: 'Home', href: '/kids' },
    { label: 'Leaderboard', href: '/kids/leaderboard' },
    { label: 'Profile', href: '/kids/profile' },
  ];

  const navItems = kidModeActive ? kidNavItems : adultNavItems;

  return (
    <AuthContext.Provider value={{ loggedIn, user, authLoaded }}>
      {loggedIn && user && <AccountStateBanner user={user} />}
      <div style={{ paddingBottom: showNav ? (showAdminBanner ? 104 : 68) : (showAdminBanner ? 44 : 0) }}>
        {children}

        {showNav && (
          <footer style={{
            maxWidth: 680, margin: '0 auto', padding: '32px 16px 24px',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
              {[
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
              Verity Post
            </div>
          </footer>
        )}
      </div>

      {showNav && (
        // DA-185 — safe-area inset so the iPhone home-bar does not
        // overlap bottom-nav tappable targets. `viewport-fit=cover`
        // (layout.js) exposes the env() var; the padding grows only
        // on devices that have a home bar.
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
          borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          height: 64, paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
        }}>
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
                  textDecoration: 'none', padding: '8px 16px',
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
          <a href="/" style={{ color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
            Back to site
          </a>
        </div>
      )}
    </AuthContext.Provider>
  );
}
