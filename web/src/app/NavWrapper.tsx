// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
'use client';

import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  Suspense,
  CSSProperties,
  ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '../lib/supabase/client';
import AccountStateBanner from '../components/AccountStateBanner';
import PageViewTrackListener from '../components/PageViewTrackListener';
import WelcomeModalMount from '../components/welcome/WelcomeModalMount';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '../lib/permissions';
import type { Tables } from '@/types/database-helpers';
import { Z } from '@/lib/zIndex';
import { BRAND_NAME, BRAND_LEGAL_ENTITY } from '../lib/brand';
import ThemeToggle from '../components/ThemeToggle';
import Avatar from '../components/Avatar';
import HomeSectionsMenu from './_HomeSectionsMenu';

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
  | 'onboarding_completed_at'
> & {
  // Ext-B3 — joined `plans.tier` so deriveTier reads the canonical tier
  // string instead of substring-matching the plan_id UUID. Inner-join
  // semantics aren't needed (free users have null plan_id), so this is
  // an optional left join.
  plans?: { tier: string | null } | null;
};

interface AuthContextValue {
  loggedIn: boolean;
  user: ProfileRow | null;
  authLoaded: boolean;
  /**
   * Normalized tier string for analytics / telemetry. One of:
   * 'anon' | 'unverified' | 'free_verified' | 'verity' |
   * 'verity_pro' | 'verity_family' | 'ownermode'. Derived from plan_id +
   * email_verified + isOwnerMode. Never raw plan row — callers shouldn't
   * need to know the DB-side plan taxonomy to fire a track() call.
   * 'ownermode' covers owner / granted-owner accounts so analytics
   * doesn't lump owner-QA reads in with any plan tier.
   */
  userTier: string;
  /** Days since signup, or null for anon. */
  tenureDays: number | null;
  /**
   * True when the current user holds `admin.owner_mode`. Drives
   * paywall/plan-card/featured-article bypass at the component layer; the
   * server-side equivalent is hasPermissionServer('admin.owner_mode').
   * Deliberately NOT named `isAdmin` — that name is already taken by the
   * module-scope path predicate `isAdmin(p: string)` below for "is this
   * an /admin route?", and overloading it would create a semantic
   * collision. Reuse `canSeeAdmin` (set from
   * hasPermission('admin.dashboard.view')) for "user has admin reach".
   */
  isOwnerMode: boolean;
}

export const AuthContext = createContext<AuthContextValue>({
  loggedIn: false,
  user: null,
  authLoaded: false,
  userTier: 'anon',
  tenureDays: null,
  isOwnerMode: false,
});
export const useAuth = () => useContext(AuthContext);

function deriveTier(user: ProfileRow | null, isOwnerMode: boolean): string {
  // T302 — three states for the auth/verify dimension:
  //   'anon'        no signed-in user (logged out / cold visit)
  //   'unverified'  signed in but email_verified=false (was previously
  //                 collapsed into 'anon', polluting Pro-unverified
  //                 retention vs actually-anonymous retention).
  //   <plan-tier>   verified, bucketed by paid tier or 'free_verified'.
  if (!user) return 'anon';
  // Owner Mode bucket beats every other label, including 'unverified'.
  // Without this, owner mid-email-change would flip to 'unverified' and
  // any tier-string equality check (e.g. signup _FeaturedArticle.tsx:28)
  // would mis-route them.
  if (isOwnerMode) return 'ownermode';
  if (!user.email_verified) return 'unverified';
  // Ext-B3 — read tier from the joined plans row instead of substring
  // matching the plan_id UUID. The previous heuristic could misfire if
  // a plan_id literal ever contained an unrelated substring, and added
  // a refactor barrier whenever a tier changed name.
  const tier = user.plans?.tier || null;
  if (tier === 'verity_family') return 'verity_family';
  if (tier === 'verity_pro') return 'verity_pro';
  if (tier === 'verity') return 'verity';
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
const SHOW_TOP_BAR = true; // "verity post" wordmark
// Y5-#3 — bottom nav re-enabled. Without it, signed-in users had no
// persistent path between Home / Notifications / Most Informed / Profile —
// every navigation required a manual URL or a footer round-trip. The
// per-route gate below still suppresses it on home, story, auth, admin,
// and ideas pages so reading + auth + chrome-owning surfaces stay clean.
const SHOW_BOTTOM_NAV = true; // Home / Notifications / Most Informed / Profile
const SHOW_FOOTER = true; // Legal/compliance strip only — Privacy / Terms / DMCA / etc.

// Auth / onboarding routes that run fullscreen without any global chrome.
// Separate from '/' — home now shows the top bar + footer (no bottom nav),
// so it's handled with its own gate below instead of living in this list.
const AUTH_HIDE = [
  '/login',
  '/signup',
  '/verify-email',
  '/api/auth/callback',
  '/logout',
  '/welcome',
  // Closed-beta surfaces — no nav chrome on the invite-only entry path
  '/beta-locked',
  '/request-access',
];
const isAdmin = (p: string) => p.startsWith('/admin');
const isIdeasPreview = (p: string) => p.startsWith('/ideas');
// Article reader owns the viewport — no global nav, no footer. Reading
// experience is kept clean on both /story/<slug> and any deeper /story
// route (e.g. /story/<slug>/something future).
const isStory = (p: string) => p.startsWith('/story');
// Mockup/prototype pages carry their own full-screen chrome; suppress
// the global top bar, nav, and footer so they don't double-stack.
const isMockup = (p: string) => p.startsWith('/mockup');

interface NavItem {
  label: string;
  href: string;
}

export default function NavWrapper({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState<boolean>(false);
  const [user, setUser] = useState<ProfileRow | null>(null);
  const [authLoaded, setAuthLoaded] = useState<boolean>(false);
  // Desktop ≥768px hides the bottom nav: top bar already surfaces
  // home, sections, and (for signed-in users) the profile avatar,
  // so a bottom strip would duplicate surface and eat vertical
  // space. Detected on mount + via matchMedia change listener so
  // a window resize across the breakpoint flips immediately.
  // Initial value is false (mobile) to keep SSR + first paint
  // stable on phones — desktop sees a one-frame flicker which is
  // acceptable for a layout-only signal.
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  // DA-038 — use Next's usePathname() instead of monkey-patching
  // history.pushState. The old approach stacked wrappers on remount
  // and broke Next's internal navigation hooks.
  const path = usePathname() || '/';
  const [mounted, setMounted] = useState<boolean>(false);
  const [canSeeAdmin, setCanSeeAdmin] = useState<boolean>(false);
  // `search.basic` gates the magnifying-glass icon in the top bar. The
  // icon sits next to the wordmark — single discoverable entry point to
  // /search across every surface where the global chrome shows.
  const [canSearch, setCanSearch] = useState<boolean>(false);
  // `admin.owner_mode` membership. Refreshed in lockstep with the
  // permissions cache so paywall components / plan card / signup featured
  // article never see a stale value.
  const [isOwnerMode, setIsOwnerMode] = useState<boolean>(false);
  // T220 — skip-ref for the permission hydrate. Supabase's
  // onAuthStateChange fires on token refresh (not just real sign-in /
  // sign-out transitions), and re-running refreshAllPermissions() on
  // every refresh hammers the RPC. This ref tracks the last hydrate
  // time per user-id; identical user inside a 60s window short-circuits
  // straight to the cached `hasPermission()` reads. Real sign-in /
  // sign-out (user-id change) always falls through and re-hydrates.
  const lastHydrateRef = useRef<{ userId: string | null; at: number }>({
    userId: null,
    at: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
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
          setIsOwnerMode(false);
          lastHydrateRef.current = { userId: null, at: 0 };
        }
        return;
      }
      // Flip the nav-bar boolean immediately on auth presence so the bottom
      // nav swaps "Sign up" → "Profile" in the same tick as login. Avatar /
      // tier / permission slots fill in over the next round-trips below.
      if (!cancelled) {
        setLoggedIn(true);
        setAuthLoaded(true);
      }
      // T220 — skip the full hydrate when the same user just refreshed
      // their auth token (onAuthStateChange fires on token refresh too).
      // 60s is the same staleness window refreshIfStale() uses, so we
      // never serve perms that are more than a minute behind reality.
      const now = Date.now();
      const last = lastHydrateRef.current;
      const sameUser = last.userId === authUser.id;
      const fresh = now - last.at < 60_000;
      if (sameUser && fresh) return;

      const { data: profile } = await supabase
        .from('users')
        .select(
          'id, username, avatar_url, avatar_color, verity_score, plan_id, plan_status, email_verified, streak_current, is_banned, is_muted, muted_until, locked_until, frozen_at, plan_grace_period_ends_at, deletion_scheduled_for, created_at, onboarding_completed_at, plans!fk_users_plan_id(tier)'
        )
        .eq('id', authUser.id)
        .maybeSingle<ProfileRow>();

      // T220 — refreshAllPermissions() repopulates the full cache; the
      // follow-up refreshIfStale() was a guaranteed no-op (version was
      // just bumped), so dropping it cuts one round-trip per hydrate.
      await refreshAllPermissions();

      if (!cancelled) {
        setUser(profile || null);
        setCanSeeAdmin(hasPermission('admin.dashboard.view'));
        setCanSearch(hasPermission('search.basic'));
        // Read after refreshAllPermissions so the cache is hot. The RPC
        // patches return the full catalog when the caller has
        // admin.owner_mode, so a holder's hasPermission('admin.owner_mode')
        // resolves true here.
        setIsOwnerMode(hasPermission('admin.owner_mode'));
        lastHydrateRef.current = { userId: authUser.id, at: now };
      }
    }

    supabase.auth.getUser().then(({ data: { user: authUser } }) => loadProfile(authUser));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadProfile(session?.user || null);
    });

    // T312 — 60s perms-version poll. refreshIfStale() short-circuits when
    // the global + user perms_version values match the cached pair, so the
    // typical tick is a single RPC round-trip. On a real bump (admin edit /
    // plan upgrade / lockout flip) it hard-clears + repopulates the
    // capability cache so the UI picks up the change without waiting for
    // the next route navigation.
    const permsPollInterval = setInterval(() => {
      void refreshIfStale();
    }, 60_000);

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
      clearInterval(permsPollInterval);
    };
  }, []);

  // Chrome visibility gates. Three surfaces, three rules:
  //   showTopBar  — "verity post" wordmark only. Shown on home AND on all
  //                 standard content pages. Hidden on auth, admin, ideas
  //                 preview, and story reader.
  //   showNav     — bottom nav bar. Same 4 slots for anon and signed-in;
  //                 anon's Profile slot flips to "Sign up". Hidden on
  //                 fully-bare surfaces and on the story reader.
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
  const showTopBar = mounted && SHOW_TOP_BAR && !fullyBare && !isMockup(path);
  const showNav =
    mounted && SHOW_BOTTOM_NAV && !isDesktop && !fullyBare && !isStory(path) && !isMockup(path);
  const showFooter = mounted && SHOW_FOOTER && !fullyBare && !isStory(path) && !isMockup(path);
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

  // Bottom nav shows the same 4 slots for anon and signed-in users. The
  // Profile slot flips to "Sign up" → /signup for anon (better engagement
  // than /login as a CTA — anon traffic skews new-user). Notifications +
  // Most Informed render their own anon empty state with inline Sign-up
  // CTAs; middleware no longer bounces those routes for anon.
  //
  // Note: `/pricing` deliberately surfaces in the desktop
  // footer instead of the bottom nav. Bottom nav is the 4 high-frequency
  // tasks; conversion CTAs route through the footer.
  // Owner cleanup item 12 (2026-05-08, refined) — Following lives in
  // the Sections menu (top-bar HomeSectionsMenu), not as a tab. Bottom
  // nav drops to Home + Profile for signed-in users.
  const navItems: NavItem[] = loggedIn
    ? [
        { label: 'Home', href: '/' },
        { label: 'Profile', href: '/profile' },
      ]
    : [
        { label: 'Home', href: '/' },
        { label: 'Sign up', href: '/signup' },
      ];

  const navStyle: CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: Z.CRITICAL,
    // Theme-aware glass — mirrors topBarStyle. --bg-rgb flips
    // 255,255,255 (light) → 18,18,18 (dark) so the bar reads dark in
    // dark mode instead of staying hardcoded white. Letter colors
    // (C.accent / C.dim) are already var-driven and flip with theme.
    background: 'rgba(var(--bg-rgb), 0.97)',
    backdropFilter: 'blur(12px)',
    borderTop: `1px solid ${C.border}`,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 64,
    paddingBottom: 'max(4px, env(safe-area-inset-bottom))',
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
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: Z.CRITICAL,
    // Theme-aware glass: --bg-rgb flips light → dark with the theme so
    // the wordmark stays legible in both modes (text is C.text =
    // var(--text), which already inverts).
    background: 'rgba(var(--bg-rgb), 0.97)',
    backdropFilter: 'blur(12px)',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    <AuthContext.Provider
      value={{
        loggedIn,
        user,
        authLoaded,
        userTier: deriveTier(user, isOwnerMode),
        tenureDays: daysSince(user?.created_at ?? null),
        isOwnerMode,
      }}
    >
      {/* PageViewTrackListener calls useSearchParams() which triggers
          client-side bailout during prerendering. Wrap in Suspense
          (mirrors GAListener's pattern in layout.js) so the whole
          route tree doesn't bail out of SSG. */}
      <Suspense fallback={null}>
        <PageViewTrackListener />
      </Suspense>
      {loggedIn && user && <AccountStateBanner user={user} />}
      {loggedIn && user && (
        <Suspense fallback={null}>
          <WelcomeModalMount
            authLoaded={authLoaded}
            username={user.username ?? null}
            onboardingCompletedAt={user.onboarding_completed_at ?? null}
          />
        </Suspense>
      )}
      <div
        style={{
          // Bug 1 fix: reserve the FULL rendered top-bar height
          // (44 + safe-area-inset-top) so iPhone-notched devices don't
          // push content under the bar.
          paddingTop: showTopBar ? topBarReservedHeight : 0,
          paddingBottom: showNav ? (showAdminBanner ? 104 : 68) : showAdminBanner ? 44 : 0,
          ...showTopBarVar,
        }}
      >
        {children}

        {showFooter && (
          <footer
            style={{
              maxWidth: 1280,
              margin: '0 auto',
              padding: '32px 16px 24px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              {[
                // Legal + compliance strip only. Each item is required by
                // law (GDPR / CCPA / COPPA / ePrivacy / DMCA safe harbor)
                // or by an industry-standard accessibility commitment.
                // Non-legal surfaces (About, How it works, Pricing, Help,
                // Editorial standards, Corrections, Contact) are reachable
                // through the About page and direct URLs.
                { label: 'Privacy', href: '/privacy' },
                { label: 'Kids Privacy', href: '/privacy/kids' },
                { label: 'California Privacy', href: '/privacy#california' },
                {
                  label: 'Do Not Sell or Share My Personal Information',
                  href: '/privacy#do-not-sell',
                },
                { label: 'Terms', href: '/terms' },
                { label: 'Cookies', href: '/cookies' },
                { label: 'DMCA', href: '/dmca' },
                { label: 'Accessibility', href: '/accessibility' },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    textDecoration: 'none',
                  }}
                >
                  {link.label}
                </a>
              ))}
              {/* S7-I6 — re-open the cookie banner so visitors can change
                  their consent at any time. Required by ePrivacy. The
                  CookieBanner subscribes to the custom event. */}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('vp-open-cookie-banner'));
                  }
                }}
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cookie preferences
              </button>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)' }}>
              © {new Date().getFullYear()} {BRAND_LEGAL_ENTITY}. All rights reserved.
            </div>
          </footer>
        )}
      </div>

      {showTopBar && (
        <header style={topBarStyle}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {!topBarActive && (
              <a
                href={topBarHomeHref}
                aria-label={`Back to ${BRAND_NAME} home`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  color: C.text,
                  textDecoration: 'none',
                  marginLeft: -8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </a>
            )}
            <a
              href={topBarHomeHref}
              aria-label={topBarActive ? `${BRAND_NAME} home` : undefined}
              aria-current={topBarActive ? 'page' : undefined}
              style={{
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: '-0.01em',
                color: C.text,
                textDecoration: 'none',
              }}
            >
              {BRAND_NAME.toLowerCase()}
            </a>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {topBarActive && <HomeSectionsMenu />}
            {/* Anon-only top-bar entrance. Quiet, type-link only — same scale
                as the wordmark, no closed-beta scarcity language. The /login
                page itself surfaces both the OTP form and the invite/access
                request paths, so anon viewers reach every door from one link. */}
            {authLoaded && !loggedIn && (
              <a
                href="/login"
                style={{
                  fontFamily: 'Source Serif 4, var(--font-source-serif), Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 14,
                  color: C.text,
                  textDecoration: 'none',
                  padding: '4px 8px',
                }}
              >
                sign in
              </a>
            )}
            {/* Signed-in profile avatar — desktop only. On mobile the
                bottom nav already carries the Profile slot, so showing
                this avatar would duplicate the entry point. On desktop
                ≥768px the bottom nav is hidden, and this avatar is the
                profile path. */}
            {authLoaded && loggedIn && isDesktop && (
              <a
                href="/profile"
                aria-label="Profile"
                aria-current={path.startsWith('/profile') ? 'page' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  borderRadius: '50%',
                }}
              >
                <Avatar user={user} size={28} />
              </a>
            )}
            <ThemeToggle />
          </div>
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
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  position: 'relative',
                  textDecoration: 'none',
                  padding: '12px 16px',
                  minHeight: 44,
                  minWidth: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: active ? C.accent : C.dim,
                }}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
      )}

      {showAdminBanner && (
        <div
          style={{
            position: 'fixed',
            bottom: showNav ? 56 : 0,
            left: 0,
            right: 0,
            zIndex: Z.CRITICAL,
            background: '#111',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
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
