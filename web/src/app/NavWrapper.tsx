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
import { BRAND_NAME, BRAND_NAME_LOWER, BRAND_LEGAL_ENTITY } from '../lib/brand';
import Avatar from '../components/Avatar';
import GlobalHeaderControls from '../components/GlobalHeaderControls';

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
  // 2026-05-13 — header search magnifier removed per owner feedback.
  // /search remains accessible by direct URL + sitemap; nothing in the
  // global chrome links to it. `search.basic` is still enforced server-
  // side on the route itself.
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
    // 1180 matches the codebase's existing desktop boundary (globals.css
    // @media (min-width: 1180px) / (max-width: 1179px)). 768 was too
    // close to common viewport widths — scrollbar appearing or browser
    // resize at the edge would flip showNav and shift content by 68px.
    const mq = window.matchMedia('(min-width: 1180px)');
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

  // Publish the bottom "safe stacking offset" as a CSS variable so any
  // viewport-fixed element below the chrome (MobileStickyAd, future
  // toast trays, etc.) can sit cleanly above whatever else is at the
  // bottom of the viewport — instead of behind the nav or under the
  // iOS home indicator.
  //
  // - showNav=true: nav is 64px + env(safe-area-inset-bottom) tall and
  //   already absorbs the safe area itself, so other fixed elements
  //   anchor at 64 + safe-area.
  // - showNav=false (story reader, admin, fully-bare): no nav present,
  //   so other fixed elements just need to clear the home indicator.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    // Nav rendered height = 64 + max(4px, env(safe-area-inset-bottom))
    // exactly mirrors navStyle.paddingBottom below. Using plain env()
    // here would leave a 4px gap on devices with no safe area (Android,
    // older iPhones) where the nav is actually 68px tall, not 64.
    root.style.setProperty(
      '--vp-nav-stack-h',
      showNav
        ? 'calc(64px + max(4px, env(safe-area-inset-bottom, 0px)))'
        : 'env(safe-area-inset-bottom, 0px)',
    );
    return () => {
      root.style.setProperty('--vp-nav-stack-h', '0px');
    };
  }, [showNav]);
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
    bg: 'var(--vp-surface)',
    card: 'var(--vp-surface)',
    border: 'var(--vp-border)',
    text: 'var(--vp-ink)',
    dim: 'var(--vp-text-muted)',
    accent: 'var(--vp-accent)',
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
  // Owner cleanup item 12 (2026-05-08, refined) — Bottom nav drops to
  // Home + Profile for signed-in users; Following is reachable from
  // Profile rather than the bottom tab bar.
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
    zIndex: Z.CRITICAL_NAV,
    // v2 chrome — cream-translucent locked-light, matching topBarStyle.
    // Owner-locked decision: bottom nav mirrors the top bar's locked
    // burgundy palette instead of flipping with --bg-rgb. Letter colors
    // (C.accent / C.dim) now resolve to --vp-accent / --vp-text-muted,
    // which read correctly on cream.
    background: 'rgba(var(--vp-sticky-rgb), 0.92)',
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
    zIndex: Z.CRITICAL_NAV,
    // v2 chrome — cream-translucent + warm border. Bg spans the full
    // viewport so the blur reads across the whole top edge; the inner
    // wrapper centers the controls to the 1408px content rail so
    // wordmark + pill align with the page content below.
    background: 'rgba(var(--vp-sticky-rgb), 0.92)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--vp-border)',
    minHeight: TOP_BAR_HEIGHT,
    paddingTop: 'env(safe-area-inset-top)',
    boxSizing: 'content-box',
  };
  const topBarInnerStyle: CSSProperties = {
    // Centered content rail — matches the home/article max-width so
    // wordmark (left), pill (center), auth (right) all sit above the
    // content below. 3-zone grid (1fr auto 1fr) forces the
    // auto-sized pill into the geometric center; left + right zones
    // balance so the pill stays centered regardless of left/right
    // content widths.
    maxWidth: 1408,
    margin: '0 auto',
    padding: '4px 16px',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    columnGap: 12,
    minHeight: TOP_BAR_HEIGHT,
    boxSizing: 'border-box',
  };
  // Whether the current route should surface the filter pill + search
  // in the global header. Auth-route hides (login / signup / welcome
  // / beta-locked / etc.) already short-circuit `showTopBar`; admin
  // and mockup routes likewise. So if the top bar is visible at all,
  // these controls are too — except `/welcome` is already excluded
  // upstream. Ideas preview is fully bare so no top bar there either.
  const showHeaderControls = showTopBar;
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
        data-vp-chrome-wrapper
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
            className="vp-footer"
            style={{
              maxWidth: 1280,
              margin: '0 auto',
              padding: '56px 16px 32px',
              borderTop: '1px solid var(--vp-border)',
              background: 'var(--vp-bg)',
            }}
          >
            {/* v2 burgundy token migration — hover affordance for legal
                links + cookie-pref button. Inline styles can't express
                :hover, so a scoped style block targets descendants of
                `.vp-footer`. */}
            <style>{`
              .vp-footer a, .vp-footer button { transition: color 0.15s ease; }
              .vp-footer a:hover, .vp-footer button:hover { color: var(--vp-accent); }
            `}</style>
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
                    color: 'var(--vp-text-muted)',
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
                  color: 'var(--vp-text-muted)',
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
            {/* Plex Mono on the copyright line picks up the v2 editorial
                signature at a small size; legal links stay sans-serif for
                readability. */}
            <div
              style={{
                textAlign: 'center',
                fontSize: 10,
                color: 'var(--vp-text-soft)',
                fontFamily: 'var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              © {new Date().getFullYear()} {BRAND_LEGAL_ENTITY}. All rights reserved.
            </div>
          </footer>
        )}
      </div>

      {showTopBar && (
        <header style={topBarStyle} className="vp-global-header">
          <div style={topBarInnerStyle} className="vp-global-header__inner">
          <div className="vp-global-header__wordmark" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
                fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: '0.02em',
                color: 'var(--vp-ink)',
                textDecoration: 'none',
              }}
            >
              {BRAND_NAME_LOWER}
            </a>
          </div>
          {showHeaderControls && <GlobalHeaderControls />}
          <div className="vp-global-header__auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifySelf: 'end' }}>
            {/* Anon-only top-bar entrance. Burgundy pill so anon viewers
                see a real CTA, not a thin italic that disappears next to
                the wordmark. The /login page surfaces both the OTP form
                and invite/access-request paths, so this single button
                covers every door. */}
            {authLoaded && !loggedIn && (
              <a
                href="/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderRadius: 999,
                  background: 'var(--vp-accent)',
                  color: '#ffffff',
                  fontFamily: 'var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.01em',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Sign in
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
            {/* 2026-05-18 — owner-locked: top bar has NO sign-out link
                (desktop or mobile) and NO theme toggle. Sign-out lives in
                Profile → Sign out section (reachable via avatar on desktop
                or the bottom-nav Profile tab on mobile). Theme toggle
                lives in Profile → Appearance. */}
          </div>
          </div>
        </header>
      )}

      {showNav && (
        // DA-185 — safe-area inset so the iPhone home-bar does not
        // overlap bottom-nav tappable targets. `viewport-fit=cover`
        // (layout.js) exposes the env() var; the padding grows only
        // on devices that have a home bar.
        <nav data-vp-bottom-nav style={navStyle}>
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
            zIndex: Z.CRITICAL_BANNER,
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
