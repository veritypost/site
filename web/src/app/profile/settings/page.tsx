// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
'use client';

// Unified /profile/settings page. Replaces 12 legacy subpages with a
// single long-scroll surface. Desktop gets a fixed left nav; mobile
// collapses to a top accordion. Search filters visible subsections.
//
// Permission-driven: visibility of each section reads `hasPermission`
// on mount; action-level keys disable individual controls when denied.
// Data reads/writes hit the canonical tables directly except:
//   - alert prefs go through /api/notifications/preferences (mirrors
//     the legacy /alerts page — server checks is_enabled + channel_*)
//   - billing mutations (checkout, cancel, portal, promo) go through
//     /api/stripe/* + /api/billing/* + /api/promo/redeem as before
//   - account deletion goes through /api/account/delete so the grace
//     scheduling + session invalidation path stays consistent

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  hasPermission,
  refreshAllPermissions,
  refreshIfStale,
  invalidate,
} from '@/lib/permissions';
import {
  TIERS,
  TIER_ORDER,
  PRICING,
  formatCents,
  pricedPlanName,
  annualSavingsPercent,
  resolveUserTier,
} from '@/lib/plans';

import Page, { PageHeader } from '@/components/admin/Page';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import Select from '@/components/admin/Select';
import Checkbox from '@/components/admin/Checkbox';
import Switch from '@/components/admin/Switch';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import SkeletonRow, { SkeletonBar } from '@/components/admin/SkeletonRow';
import { ADMIN_C_LIGHT, F, S } from '@/lib/adminPalette';

import type { Tables, TableInsert, DbClient } from '@/types/database-helpers';

// ---------------------------------------------------------------------------
// Permission keys
// ---------------------------------------------------------------------------
// A handful of the keys referenced in the spec do not exist in the
// current `permissions` table — we map to the nearest real key below
// and surface the mismatch in the report. Each PERM_* constant is the
// key actually read from `hasPermission(...)`.

const PERM = {
  SECTION_EXPERT_VIEW: 'settings.expert.view',
  SECTION_SUPERVISOR_VIEW: 'settings.supervisor.view',
  SECTION_BILLING_VIEW: 'billing.view.plan',
  ACTION_EMAILS_ADD: 'settings.emails.add_secondary',
  ACTION_EMAILS_SET_PRIMARY: 'settings.emails.set_primary',
  ACTION_EMAILS_DELETE: 'settings.emails.delete_secondary',
  ACTION_PASSWORD_CHANGE: 'settings.account.change_password',
  ACTION_SESSIONS_REVOKE: 'settings.account.sessions.revoke',
  ACTION_SESSIONS_REVOKE_ALL: 'settings.account.sessions.revoke_all_other',
  ACTION_FEED_CAT_TOGGLE: 'settings.feed.category_toggle',
  ACTION_FEED_HIDE_LOWCRED: 'settings.feed.hide_low_cred',
  ACTION_ALERTS_VIEW: 'settings.alerts.view',
  ACTION_A11Y_TTS: 'settings.a11y.tts_per_article',
  ACTION_A11Y_TEXT_SIZE: 'settings.a11y.text_size',
  ACTION_A11Y_REDUCE_MOTION: 'settings.a11y.reduce_motion',
  ACTION_A11Y_HIGH_CONTRAST: 'settings.a11y.high_contrast',
  ACTION_BLOCKED_LIST: 'settings.blocked.list',
  ACTION_BLOCKED_UNBLOCK: 'settings.blocked.unblock',
  ACTION_DATA_EXPORT: 'settings.data.request_export',
  ACTION_DATA_DELETE: 'settings.data.request_deletion',
  ACTION_DATA_DELETE_CANCEL: 'settings.data.deletion.cancel',
  ACTION_SUPERVISOR_OPT_IN: 'settings.supervisor.opt_in',
  ACTION_BILLING_CHANGE_PLAN: 'billing.change_plan',
  ACTION_BILLING_CANCEL: 'billing.cancel.own',
  ACTION_BILLING_RESUB: 'billing.resubscribe',
  ACTION_BILLING_PORTAL: 'billing.portal.open',
  ACTION_BILLING_PROMO: 'billing.promo.redeem',
  ACTION_BILLING_INVOICE_DL: 'settings.billing.view', // no dedicated "invoice download"
  ACTION_EXPERT_VACATION: 'settings.expert.vacation_mode',
  ACTION_EXPERT_WATCHLIST: 'settings.expert.category_watchlist',
  // Spec-only keys we could NOT find in DB (flagged in report):
  //   settings.profile.edit.own
  //   settings.expert.edit
  // We gate those features on simple auth instead.
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingsMeta {
  feed?: {
    cats?: string[];
    kidSafe?: boolean;
    hideLowCred?: boolean;
    minScore?: number;
    showBreaking?: boolean;
    showTrending?: boolean;
    showRecommended?: boolean;
    display?: 'compact' | 'comfortable';
  };
  a11y?: {
    ttsDefault?: boolean;
    textSize?: 'sm' | 'md' | 'lg' | 'xl';
    reduceMotion?: boolean;
    highContrast?: boolean;
  };
  expertVacation?: boolean;
  expertWatchlist?: string[];
  // The `users` table has no dedicated `avatar` jsonb column in the
  // current schema — we persist the 2-tone + initials payload here.
  // TODO(owner): consider adding a first-class `avatar` jsonb column.
  avatar?: {
    outer?: string;
    inner?: string | null;
    initials?: string;
  };
  // No dedicated `notification_prefs` column either — stored here.
  // TODO(owner): promote to column when a proper ledger lands.
  notification_prefs?: {
    newsletter?: boolean;
    commentReplies?: boolean;
    securityAlerts?: boolean;
  };
}

// Narrowed — the client surface only reads these columns. Full-row
// access (stripe_customer_id, last_login_ip, mute_level, etc.) stays
// server-side, so this type intentionally excludes the privileged
// columns that `users.*` would otherwise expose.
type UserRow = Pick<
  Tables<'users'>,
  | 'id'
  | 'email'
  | 'email_verified'
  | 'username'
  | 'display_name'
  | 'bio'
  | 'avatar_url'
  | 'avatar_color'
  | 'banner_url'
  | 'metadata'
  | 'deletion_scheduled_for'
  | 'is_expert'
  | 'expert_title'
  | 'expert_organization'
  | 'is_verified_public_figure'
  | 'allow_messages'
  | 'dm_read_receipts_enabled'
  | 'profile_visibility'
  | 'show_activity'
  | 'show_on_leaderboard'
  | 'created_at'
  | 'onboarding_completed_at'
>;
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'is_kids_safe'>;
type AlertPrefRow = Tables<'alert_preferences'>;
type BlockedRow = {
  id: string;
  created_at: string;
  reason: string | null;
  blocked: { id: string; username: string | null; avatar_color: string | null } | null;
};
type SessionRow = Pick<
  Tables<'user_sessions'>,
  | 'id'
  | 'started_at'
  | 'ended_at'
  | 'is_active'
  | 'ip_address'
  | 'browser_name'
  | 'browser_version'
  | 'os_name'
  | 'device_model'
  | 'device_type'
  | 'country_code'
  | 'city'
>;
type DataRequestRow = Pick<
  Tables<'data_requests'>,
  'id' | 'type' | 'status' | 'created_at' | 'completed_at' | 'download_url' | 'deadline_at'
>;
type InvoiceRow = Pick<
  Tables<'invoices'>,
  | 'id'
  | 'stripe_invoice_id'
  | 'created_at'
  | 'amount_cents'
  | 'currency'
  | 'status'
  | 'invoice_url'
  | 'invoice_pdf_url'
>;
type PlanRow = Pick<Tables<'plans'>, 'id' | 'tier' | 'billing_period' | 'price_cents' | 'name'>;
type PlanFeatureRow = Pick<Tables<'plan_features'>, 'plan_id' | 'feature_name' | 'is_enabled'>;
type SubscriptionRow = Pick<
  Tables<'subscriptions'>,
  | 'id'
  | 'status'
  | 'current_period_end'
  | 'created_at'
  | 'stripe_payment_method_id'
  | 'source'
  | 'apple_original_transaction_id'
  | 'google_purchase_token'
>;
type ExpertApplicationRow = Tables<'expert_applications'>;
type CategorySupervisorRow = Pick<
  Tables<'category_supervisors'>,
  'category_id' | 'is_active' | 'opted_in_at' | 'opted_out_at'
>;
type AlertType =
  | 'breaking_news'
  | 'reply_to_me'
  | 'mention'
  | 'expert_answered_me'
  | 'weekly_reading_report'
  | 'kid_trial_ending'
  | 'appeal_outcome';

type AlertChannel = 'channel_push' | 'channel_email' | 'channel_in_app';

const ALERT_ROWS: { key: AlertType; label: string; desc: string }[] = [
  { key: 'breaking_news', label: 'Breaking news', desc: 'Fast-moving stories.' },
  { key: 'reply_to_me', label: 'Replies to me', desc: 'Someone replied to your comment.' },
  { key: 'mention', label: '@mentions', desc: 'You were tagged in a comment.' },
  {
    key: 'expert_answered_me',
    label: 'Expert answered me',
    desc: 'An expert replied to your Ask.',
  },
  { key: 'weekly_reading_report', label: 'Weekly reading report', desc: 'Your week in review.' },
  { key: 'kid_trial_ending', label: 'Kid trial ending', desc: 'Day-6 + expiry notices.' },
  { key: 'appeal_outcome', label: 'Appeal outcome', desc: 'Moderator decisions on your appeals.' },
];

// NOTE: web has no service worker / VAPID / PushSubscription wiring yet,
// so the `channel_push` toggle here only affects iOS (APNs) delivery.
// Keep the toggle rendered so preferences round-trip to the iOS app
// identically, but surface an "iOS only" hint in the column label and
// an explanatory note at the top of the Alerts card (see AlertsCard).
// TODO(web-push): drop the hint once a web Push pipeline ships.
const ALERT_CHANNELS: { key: AlertChannel; label: string }[] = [
  { key: 'channel_in_app', label: 'In-app' },
  { key: 'channel_push', label: 'Push (iOS only)' },
  { key: 'channel_email', label: 'Email' },
];

const TEXT_SIZES: { value: 'sm' | 'md' | 'lg' | 'xl'; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'X-Large' },
];

// ---------------------------------------------------------------------------
// Section tree — the single source of truth for the sidebar, the search
// filter, and the per-subsection anchor IDs.
// ---------------------------------------------------------------------------

interface SubsectionDef {
  id: string;
  label: string;
  keywords: string; // search corpus
  gateKey?: string; // permission key that hides this subsection entirely
}

interface SectionDef {
  id: string;
  label: string;
  subsections: SubsectionDef[];
  gateKey?: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'account',
    label: 'Account',
    subsections: [
      {
        id: 'profile',
        label: 'Profile',
        keywords: 'profile display name username bio avatar banner visibility',
      },
      { id: 'emails', label: 'Emails', keywords: 'email primary verified secondary add remove' },
      {
        id: 'password',
        label: 'Password',
        keywords: 'password change security',
        gateKey: PERM.ACTION_PASSWORD_CHANGE,
      },
      {
        id: 'login-activity',
        label: 'Sign-in activity',
        keywords: 'sessions devices ip sign out everywhere',
      },
    ],
  },
  {
    id: 'preferences',
    label: 'Preferences',
    subsections: [
      { id: 'feed', label: 'Feed', keywords: 'feed categories kid safe low credibility' },
      {
        id: 'alerts',
        label: 'Alerts',
        keywords: 'alerts notifications push email in-app breaking mentions',
        gateKey: PERM.ACTION_ALERTS_VIEW,
      },
      {
        id: 'accessibility',
        label: 'Accessibility',
        keywords: 'a11y tts text size motion contrast screen reader',
      },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy & Safety',
    subsections: [
      {
        id: 'blocked',
        label: 'Blocked users',
        keywords: 'blocked users unblock',
        gateKey: PERM.ACTION_BLOCKED_LIST,
      },
      {
        id: 'data',
        label: 'Data & export',
        keywords: 'data export download gdpr ccpa delete account',
      },
      {
        id: 'supervisor',
        label: 'Supervisor',
        keywords: 'supervisor category moderation opt in',
        gateKey: PERM.SECTION_SUPERVISOR_VIEW,
      },
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    gateKey: PERM.SECTION_BILLING_VIEW,
    subsections: [
      { id: 'plan', label: 'Plan', keywords: 'plan subscription renewal cancel resume' },
      {
        id: 'payment-method',
        label: 'Payment method',
        keywords: 'card stripe portal payment method',
      },
      { id: 'invoices', label: 'Invoices', keywords: 'invoice billing history download pdf' },
      {
        id: 'promo',
        label: 'Promo codes',
        keywords: 'promo coupon code redeem',
        gateKey: PERM.ACTION_BILLING_PROMO,
      },
    ],
  },
  {
    id: 'expert',
    label: 'Expert',
    gateKey: PERM.SECTION_EXPERT_VIEW,
    subsections: [
      {
        id: 'expert-profile',
        label: 'Expertise & credentials',
        keywords: 'expert title organization credentials bio',
      },
      {
        id: 'expert-vacation',
        label: 'Vacation mode',
        keywords: 'expert vacation pause answers',
        gateKey: PERM.ACTION_EXPERT_VACATION,
      },
      {
        id: 'expert-watchlist',
        label: 'Category watchlist',
        keywords: 'expert categories watchlist notify',
        gateKey: PERM.ACTION_EXPERT_WATCHLIST,
      },
    ],
  },
  {
    id: 'danger',
    label: 'Danger zone',
    subsections: [
      { id: 'delete-account', label: 'Delete account', keywords: 'delete account remove erase' },
      { id: 'signout', label: 'Sign out', keywords: 'sign out logout log out this device' },
      {
        id: 'signout-everywhere',
        label: 'Sign out everywhere',
        keywords: 'sign out everywhere sessions revoke all',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function readMeta(u: UserRow | null): SettingsMeta {
  const m = (u?.metadata || null) as unknown;
  if (!m || typeof m !== 'object') return {};
  return m as SettingsMeta;
}

// Simple debounce for search + dirty-tracking of in-flight saves.
function useDebouncedValue<T>(value: T, delay = 120): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// Viewport helper — desktop at >=768px switches to the sidebar rail. Below that
// everything stacks and the sidebar becomes a tap-to-expand accordion. SSR-safe
// default is `false` so the desktop markup renders on the server.
function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = () => setIsMobile(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

const C = ADMIN_C_LIGHT;

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function SettingsPage(): ReactElement {
  return (
    <ToastProvider>
      <SettingsInner />
    </ToastProvider>
  );
}

function SettingsInner(): ReactElement {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push: pushToast } = useToast();

  // ---------- auth + permissions ----------
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authLoading, setAuthLoading] = useState(true);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive) return;
      if (!user) {
        router.replace('/login?next=/profile/settings');
        return;
      }
      setUserId(user.id);
      setAuthEmail(user.email || '');
      setAuthLoading(false);

      await refreshAllPermissions();
      if (!alive) return;
      setPermsReady(true);
      // Fire a stale check so bumps land without a hard reload.
      void refreshIfStale();
    })();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  // Post-Stripe-checkout landing. /profile/settings/billing preserves
  // ?success=1 / ?canceled=1 through its server redirect. Fire a toast,
  // invalidate the permission cache so the newly-unlocked tier takes
  // effect without a reload, and strip the query so refresh doesn't
  // re-fire the toast.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const success = sp.get('success');
    const canceled = sp.get('canceled');
    if (!success && !canceled) return;
    if (success === '1') {
      pushToast({ message: 'Subscription updated. Welcome aboard.', variant: 'success' });
      invalidate();
      void refreshAllPermissions();
    } else if (canceled === '1') {
      pushToast({ message: 'Checkout canceled.', variant: 'neutral' });
    }
    sp.delete('success');
    sp.delete('canceled');
    const next = sp.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ''}${window.location.hash}`;
    router.replace(url);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- user row (used by almost every section) ----------
  const [userRow, setUserRow] = useState<UserRow | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const reloadUser = useCallback(async () => {
    if (!userId) return;
    // Explicit column list — never `select('*')` on `users` from a client
    // surface. The wildcard exposes stripe_customer_id, last_login_ip,
    // mute_level, failed_login_count, apple_original_transaction_id,
    // password_hash, frozen_at, etc., which should never ship to a
    // browser context. Billing IDs live in separate joined queries
    // (userBilling, subscription); moderation + PII stay server-side.
    const { data, error } = await supabase
      .from('users')
      .select(
        'id, email, email_verified, username, display_name, bio, avatar_url, avatar_color, banner_url, metadata, deletion_scheduled_for, is_expert, expert_title, expert_organization, is_verified_public_figure, allow_messages, dm_read_receipts_enabled, profile_visibility, show_activity, show_on_leaderboard, created_at, onboarding_completed_at'
      )
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      setLoadingUser(false);
      return;
    }
    setUserRow(data);
    setLoadingUser(false);
  }, [supabase, userId, pushToast]);

  useEffect(() => {
    if (userId) void reloadUser();
  }, [userId, reloadUser]);

  // ---------- search ----------
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 100);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Resolve which subsections should render given (a) permission gates
  // and (b) the current search filter. `visibleSet` is the authoritative
  // set; sections reference it when deciding whether to render.
  const visibleSet = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const out = new Set<string>();
    for (const section of SECTIONS) {
      if (section.gateKey && !hasPermission(section.gateKey)) continue;
      for (const sub of section.subsections) {
        if (sub.gateKey && !hasPermission(sub.gateKey)) continue;
        if (!q) {
          out.add(`${section.id}:${sub.id}`);
          continue;
        }
        const corpus = `${section.label} ${sub.label} ${sub.keywords}`.toLowerCase();
        if (corpus.includes(q)) out.add(`${section.id}:${sub.id}`);
      }
    }
    return out;
  }, [debouncedSearch, permsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSubVisible = useCallback(
    (sectionId: string, subId: string) => visibleSet.has(`${sectionId}:${subId}`),
    [visibleSet]
  );

  // ---------- dirty tracking + beforeunload ----------
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const markDirty = useCallback((k: string, dirty: boolean) => {
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(k);
      else next.delete(k);
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyKeys.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyKeys]);

  // ---------- anchor scrolling + highlight ----------
  const [highlight, setHighlight] = useState<string | null>(null);
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlight(id);
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1500);
    if (window.history.replaceState) window.history.replaceState(null, '', `#${id}`);
  }, []);

  // On first mount if URL has a hash, scroll to it. H-17 stop-gap: the
  // 300ms delay covers the initial gated-section render, but if the
  // target element mounts late (permission-gated subsection), the scroll
  // silently no-ops. Retry up to 5 times over 1500ms, then fall back to a
  // direct getElementById().scrollIntoView. Full fix is to split /billing
  // into its own route — deferred.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    let attempts = 0;
    const tick = () => {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        scrollTo(hash);
        return;
      }
      if (attempts++ < 5) window.setTimeout(tick, 300);
    };
    const t = window.setTimeout(tick, 150);
    return () => window.clearTimeout(t);
  }, [scrollTo]);

  // ---------- mobile nav open state ----------
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useIsMobile();

  // ---------- loading guard ----------
  if (authLoading || !userId) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner size={18} /> Loading settings…
        </div>
      </Page>
    );
  }

  return (
    <Page maxWidth={1200} style={{ background: C.bg, color: C.text }}>
      <PageHeader
        title="Settings"
        subtitle="Account, preferences, privacy, billing, and expert controls — all in one place."
        backHref="/profile"
        backLabel="Profile"
        searchSlot={
          <div
            className="vp-settings-search-slot"
            style={isMobile ? { width: '100%' } : { width: 'auto' }}
          >
            <TextInput
              ref={searchRef}
              type="search"
              placeholder={isMobile ? 'Search settings' : 'Search settings   /'}
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              style={isMobile ? { width: '100%', maxWidth: '100%' } : { maxWidth: 280 }}
            />
          </div>
        }
      />

      {/* Layout: sidebar (desktop) + stacked sections */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '240px minmax(0, 1fr)',
          gap: isMobile ? S[3] : S[8],
        }}
        className="vp-settings-grid"
      >
        {/* Sidebar */}
        <aside
          className="vp-settings-sidebar"
          style={{
            position: isMobile ? 'static' : 'sticky',
            top: S[4],
            alignSelf: 'start',
            height: 'fit-content',
          }}
        >
          <DesktopSidebar scrollTo={scrollTo} visibleSet={visibleSet} />
          <MobileSidebar
            open={mobileNavOpen}
            onToggle={() => setMobileNavOpen((v) => !v)}
            onPick={(id) => {
              setMobileNavOpen(false);
              scrollTo(id);
            }}
            visibleSet={visibleSet}
          />
        </aside>

        {/* Content */}
        <main style={{ minWidth: 0 }}>
          {/* 1. Account */}
          {(() => {
            const hasAny =
              isSubVisible('account', 'profile') ||
              isSubVisible('account', 'emails') ||
              isSubVisible('account', 'password') ||
              isSubVisible('account', 'login-activity');
            if (!hasAny) return null;
            return <SectionWrapper id="account" title="Account" />;
          })()}
          {isSubVisible('account', 'profile') && (
            <ProfileCard
              user={userRow}
              loading={loadingUser}
              highlight={highlight === 'profile'}
              markDirty={(d) => markDirty('profile', d)}
              onSaved={reloadUser}
              pushToast={pushToast}
              supabase={supabase}
              userId={userId}
            />
          )}
          {isSubVisible('account', 'emails') && (
            <EmailsCard
              authEmail={authEmail}
              highlight={highlight === 'emails'}
              supabase={supabase}
              userId={userId}
              user={userRow}
              onSaved={reloadUser}
              pushToast={pushToast}
            />
          )}
          {isSubVisible('account', 'password') && (
            <PasswordCard
              authEmail={authEmail}
              highlight={highlight === 'password'}
              supabase={supabase}
              pushToast={pushToast}
              markDirty={(d) => markDirty('password', d)}
            />
          )}
          {isSubVisible('account', 'login-activity') && (
            <LoginActivityCard
              userId={userId}
              highlight={highlight === 'login-activity'}
              supabase={supabase}
              pushToast={pushToast}
            />
          )}

          {/* 2. Preferences */}
          {(() => {
            const hasAny =
              isSubVisible('preferences', 'feed') ||
              isSubVisible('preferences', 'alerts') ||
              isSubVisible('preferences', 'accessibility');
            if (!hasAny) return null;
            return <SectionWrapper id="preferences" title="Preferences" />;
          })()}
          {isSubVisible('preferences', 'feed') && (
            <FeedCard
              user={userRow}
              highlight={highlight === 'feed'}
              supabase={supabase}
              pushToast={pushToast}
              userId={userId}
              onSaved={reloadUser}
              markDirty={(d) => markDirty('feed', d)}
            />
          )}
          {isSubVisible('preferences', 'alerts') && (
            <AlertsCard highlight={highlight === 'alerts'} pushToast={pushToast} />
          )}
          {isSubVisible('preferences', 'accessibility') && (
            <AccessibilityCard
              user={userRow}
              highlight={highlight === 'accessibility'}
              supabase={supabase}
              pushToast={pushToast}
              userId={userId}
              onSaved={reloadUser}
              markDirty={(d) => markDirty('a11y', d)}
            />
          )}

          {/* 3. Privacy & Safety */}
          {(() => {
            const hasAny =
              isSubVisible('privacy', 'blocked') ||
              isSubVisible('privacy', 'data') ||
              isSubVisible('privacy', 'supervisor');
            if (!hasAny) return null;
            return <SectionWrapper id="privacy" title="Privacy & Safety" />;
          })()}
          {isSubVisible('privacy', 'blocked') && (
            <BlockedCard
              userId={userId}
              highlight={highlight === 'blocked'}
              supabase={supabase}
              pushToast={pushToast}
            />
          )}
          {isSubVisible('privacy', 'data') && (
            <DataExportCard
              userId={userId}
              highlight={highlight === 'data'}
              supabase={supabase}
              pushToast={pushToast}
              userRow={userRow}
              onChanged={reloadUser}
            />
          )}
          {isSubVisible('privacy', 'supervisor') && (
            <SupervisorCard
              userId={userId}
              highlight={highlight === 'supervisor'}
              supabase={supabase}
              pushToast={pushToast}
            />
          )}

          {/* 4. Billing */}
          {(() => {
            const hasAny =
              isSubVisible('billing', 'plan') ||
              isSubVisible('billing', 'payment-method') ||
              isSubVisible('billing', 'invoices') ||
              isSubVisible('billing', 'promo');
            if (!hasAny) return null;
            return <SectionWrapper id="billing" title="Billing" />;
          })()}
          {(isSubVisible('billing', 'plan') ||
            isSubVisible('billing', 'payment-method') ||
            isSubVisible('billing', 'invoices') ||
            isSubVisible('billing', 'promo')) && (
            <BillingBundle
              userId={userId}
              highlightPlan={highlight === 'plan'}
              highlightPayment={highlight === 'payment-method'}
              highlightInvoices={highlight === 'invoices'}
              highlightPromo={highlight === 'promo'}
              showPlan={isSubVisible('billing', 'plan')}
              showPayment={isSubVisible('billing', 'payment-method')}
              showInvoices={isSubVisible('billing', 'invoices')}
              showPromo={isSubVisible('billing', 'promo')}
              supabase={supabase}
              pushToast={pushToast}
            />
          )}

          {/* 5. Expert */}
          {(() => {
            const hasAny =
              isSubVisible('expert', 'expert-profile') ||
              isSubVisible('expert', 'expert-vacation') ||
              isSubVisible('expert', 'expert-watchlist');
            if (!hasAny) return null;
            return <SectionWrapper id="expert" title="Expert" />;
          })()}
          {isSubVisible('expert', 'expert-profile') && (
            <ExpertProfileCard
              user={userRow}
              userId={userId}
              highlight={highlight === 'expert-profile'}
              supabase={supabase}
              pushToast={pushToast}
              onSaved={reloadUser}
              markDirty={(d) => markDirty('expert-profile', d)}
            />
          )}
          {isSubVisible('expert', 'expert-vacation') && (
            <ExpertVacationCard
              user={userRow}
              userId={userId}
              highlight={highlight === 'expert-vacation'}
              supabase={supabase}
              pushToast={pushToast}
              onSaved={reloadUser}
            />
          )}
          {isSubVisible('expert', 'expert-watchlist') && (
            <ExpertWatchlistCard
              userId={userId}
              highlight={highlight === 'expert-watchlist'}
              supabase={supabase}
              pushToast={pushToast}
            />
          )}

          {/* 6. Danger zone — always renders (unaffected by search unless filtered) */}
          {(isSubVisible('danger', 'delete-account') ||
            isSubVisible('danger', 'signout') ||
            isSubVisible('danger', 'signout-everywhere')) && (
            <SectionWrapper id="danger" title="Danger zone" tone="danger" />
          )}
          {isSubVisible('danger', 'delete-account') && (
            <DeleteAccountCard
              userId={userId}
              highlight={highlight === 'delete-account'}
              supabase={supabase}
              pushToast={pushToast}
              userRow={userRow}
              onChanged={reloadUser}
            />
          )}
          {isSubVisible('danger', 'signout') && <SignOutCard highlight={highlight === 'signout'} />}
          {isSubVisible('danger', 'signout-everywhere') && (
            <SignOutEverywhereCard
              highlight={highlight === 'signout-everywhere'}
              supabase={supabase}
              pushToast={pushToast}
            />
          )}

          {/* Empty-state if search filtered everything out */}
          {visibleSet.size === 0 && (
            <EmptyState
              title="No matching settings"
              description="Try a different search term, or press Esc to clear."
              cta={<Button onClick={() => setSearch('')}>Clear search</Button>}
            />
          )}
        </main>
      </div>

      {/* Dirty-indicator — shows a tiny reminder when any editor is dirty */}
      {dirtyKeys.size > 0 && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: S[6],
            right: S[6],
            padding: `${S[2]}px ${S[3]}px`,
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: F.sm,
            color: C.text,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            zIndex: 50,
          }}
        >
          Unsaved changes
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .vp-settings-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
          .vp-settings-sidebar { position: static !important; top: auto !important; }
          .vp-settings-desktop-nav { display: none !important; }
          .vp-settings-mobile-nav { display: block !important; }
          .vp-settings-search-slot { width: 100% !important; flex: 1 1 100% !important; }
          .vp-settings-search-slot input { width: 100% !important; max-width: 100% !important; }
          .vp-settings-card { padding: 18px 12px !important; }
          .vp-settings-actions { width: 100%; }
          .vp-settings-actions > * { flex: 1 1 140px; }
        }
        @media (min-width: 768px) {
          .vp-settings-mobile-nav { display: none !important; }
        }
      `}</style>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (desktop + mobile)
// ---------------------------------------------------------------------------

function DesktopSidebar({
  scrollTo,
  visibleSet,
}: {
  scrollTo: (id: string) => void;
  visibleSet: Set<string>;
}): ReactElement {
  return (
    <nav
      aria-label="Settings sections"
      className="vp-settings-desktop-nav"
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.card,
        padding: S[2],
      }}
    >
      {SECTIONS.map((section) => {
        const visibleSubs = section.subsections.filter((s) =>
          visibleSet.has(`${section.id}:${s.id}`)
        );
        if (visibleSubs.length === 0) return null;
        return (
          <div key={section.id} style={{ marginBottom: S[2] }}>
            <button
              type="button"
              onClick={() => scrollTo(section.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: `${S[1]}px ${S[2]}px`,
                fontSize: F.xs,
                fontWeight: 600,
                color: C.dim,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              {section.label}
            </button>
            {visibleSubs.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => scrollTo(sub.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: `${S[1]}px ${S[2]}px`,
                  fontSize: F.sm,
                  color: C.text,
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.bg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function MobileSidebar({
  open,
  onToggle,
  onPick,
  visibleSet,
}: {
  open: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
  visibleSet: Set<string>;
}): ReactElement {
  return (
    <div className="vp-settings-mobile-nav" style={{ display: 'none', marginBottom: S[4] }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: `${S[2]}px ${S[3]}px`,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          fontSize: F.base,
          fontWeight: 600,
          color: C.text,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Jump to section</span>
        <span aria-hidden style={{ color: C.dim, fontSize: F.xs, fontWeight: 700 }}>
          {open ? 'Close' : 'Open'}
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: S[1],
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: C.bg,
            padding: S[2],
          }}
        >
          {SECTIONS.map((section) => {
            const visibleSubs = section.subsections.filter((s) =>
              visibleSet.has(`${section.id}:${s.id}`)
            );
            if (visibleSubs.length === 0) return null;
            return (
              <div key={section.id} style={{ marginBottom: S[2] }}>
                <div
                  style={{
                    fontSize: F.xs,
                    fontWeight: 700,
                    color: C.dim,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: `${S[1]}px ${S[2]}px`,
                  }}
                >
                  {section.label}
                </div>
                {visibleSubs.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onPick(sub.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: `${S[2]}px ${S[2]}px`,
                      fontSize: F.base,
                      color: C.text,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: 4,
                    }}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header (plain anchor) + Card shell
// ---------------------------------------------------------------------------

function SectionWrapper({
  id,
  title,
  tone,
}: {
  id: string;
  title: string;
  tone?: 'danger';
}): ReactElement {
  return (
    <h2
      id={id}
      style={{
        margin: `${S[8]}px 0 ${S[3]}px`,
        fontSize: F.xl,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color: tone === 'danger' ? C.danger : C.text,
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: S[2],
        scrollMarginTop: S[6],
      }}
    >
      {title}
    </h2>
  );
}

interface CardProps {
  id: string;
  title: string;
  description?: ReactNode;
  highlight?: boolean;
  aside?: ReactNode;
  children: ReactNode;
  tone?: 'danger';
}

function Card({
  id,
  title,
  description,
  highlight,
  aside,
  children,
  tone,
}: CardProps): ReactElement {
  const isDanger = tone === 'danger';
  return (
    <section
      id={id}
      className="vp-settings-card"
      style={{
        marginBottom: S[6],
        border: `1px solid ${isDanger ? C.danger : C.border}`,
        borderRadius: 10,
        background: C.bg,
        padding: S[4],
        boxShadow: highlight ? `0 0 0 3px rgba(17,17,17,0.10)` : 'none',
        transition: 'box-shadow 240ms ease',
        scrollMarginTop: S[6],
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: S[3],
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <h3
            style={{
              margin: 0,
              fontSize: F.lg,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: isDanger ? C.danger : C.text,
            }}
          >
            {title}
          </h3>
          {description && (
            <p style={{ margin: `${S[1]}px 0 0`, fontSize: F.sm, color: C.dim, lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
        {aside && <div style={{ maxWidth: '100%' }}>{aside}</div>}
      </div>
      <div style={{ marginTop: S[3] }}>{children}</div>
    </section>
  );
}

function Row({ children, last }: { children: ReactNode; last?: boolean }): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S[3],
        padding: `${S[3]}px 0`,
        borderBottom: last ? 'none' : `1px solid ${C.divider || C.border}`,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        fontSize: F.xs,
        fontWeight: 600,
        color: C.dim,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1A. Profile
// ---------------------------------------------------------------------------

type Pusher = (input: {
  message: ReactNode;
  variant?: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
}) => void;

interface ProfileCardProps {
  user: UserRow | null;
  loading: boolean;
  highlight: boolean;
  markDirty: (d: boolean) => void;
  onSaved: () => Promise<void> | void;
  pushToast: Pusher;
  supabase: DbClient;
  userId: string;
}

const AVATAR_COLORS = [
  '#111111',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#ec4899',
  '#444444',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#10b981',
  '#a855f7',
  '#64748b',
];

type AvatarMode = 'initials' | 'upload';

function ProfileCard({
  user,
  loading,
  highlight,
  markDirty,
  onSaved,
  pushToast,
  supabase,
  userId,
}: ProfileCardProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('initials');
  const [avatarOuter, setAvatarOuter] = useState<string>('#111111');
  const [avatarInner, setAvatarInner] = useState<string | null>(null);
  const [avatarInitials, setAvatarInitials] = useState<string>('');
  const [initialsError, setInitialsError] = useState('');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [profileVisibility, setProfileVisibility] = useState<string>('public');
  const [showActivity, setShowActivity] = useState(true);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [allowMessages, setAllowMessages] = useState(true);
  const [dmReadReceipts, setDmReadReceipts] = useState(true);
  const [saving, setSaving] = useState(false);

  const snapshot = useRef('');
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name || '');
    setBio(user.bio || '');
    setUsername(user.username || '');
    setAvatarUrl(user.avatar_url || '');
    // Avatar payload lives in metadata.avatar; avatar_color is kept in sync
    // for back-compat with reader surfaces that still read the varchar.
    const meta = readMeta(user);
    const av = meta.avatar || {};
    setAvatarOuter(av.outer || user.avatar_color || '#111111');
    setAvatarInner(av.inner ?? null);
    const seed = av.initials || (user.username ? user.username.slice(0, 1).toUpperCase() : '');
    setAvatarInitials(seed);
    // Prefer "upload" mode only when there's no initials payload AND a url exists.
    setAvatarMode(user.avatar_url && !av.initials ? 'upload' : 'initials');
    setBannerUrl(user.banner_url || '');
    setProfileVisibility(user.profile_visibility || 'public');
    setShowActivity(user.show_activity !== false);
    setShowOnLeaderboard(user.show_on_leaderboard !== false);
    setAllowMessages(user.allow_messages !== false);
    setDmReadReceipts(user.dm_read_receipts_enabled !== false);
    snapshot.current = JSON.stringify({
      displayName: user.display_name || '',
      bio: user.bio || '',
      username: user.username || '',
      avatarUrl: user.avatar_url || '',
      avatarMode: user.avatar_url && !av.initials ? 'upload' : 'initials',
      avatarOuter: av.outer || user.avatar_color || '#111111',
      avatarInner: av.inner ?? null,
      avatarInitials: seed,
      bannerUrl: user.banner_url || '',
      profileVisibility: user.profile_visibility || 'public',
      showActivity: user.show_activity !== false,
      showOnLeaderboard: user.show_on_leaderboard !== false,
      allowMessages: user.allow_messages !== false,
      dmReadReceipts: user.dm_read_receipts_enabled !== false,
    });
  }, [user]);

  const current = JSON.stringify({
    displayName,
    bio,
    username,
    avatarUrl,
    avatarMode,
    avatarOuter,
    avatarInner,
    avatarInitials,
    bannerUrl,
    profileVisibility,
    showActivity,
    showOnLeaderboard,
    allowMessages,
    dmReadReceipts,
  });
  const dirty = editing && current !== snapshot.current;
  useEffect(() => {
    markDirty(dirty);
  }, [dirty, markDirty]);

  const setInitialsSafe = (raw: string) => {
    const clean = raw
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase();
    setAvatarInitials(clean);
    setInitialsError(raw.length > 0 && clean.length === 0 ? 'Letters and numbers only.' : '');
  };

  const handleSave = async () => {
    setSaving(true);
    // Persist the 2-tone + initials payload in metadata.avatar because the
    // current schema has no `users.avatar` jsonb column. We still write
    // avatar_color (varchar) so non-JSON consumers keep rendering a ring.
    const prevMeta = readMeta(user);
    const avatarPayload = {
      outer: avatarOuter,
      inner: avatarInner,
      initials: avatarInitials,
    };
    const mergedMeta = { ...(prevMeta || {}), avatar: avatarPayload };
    // Round 5 Item 2: all self-profile writes go through the SECDEF
    // update_own_profile RPC (20-column allowlist, server-side metadata
    // merge). Direct `from('users').update(...)` is blocked on privileged
    // columns by the Round 4 trigger and silently drops phantom columns,
    // which is exactly how the avatar/location/website typos hid.
    const patch = {
      display_name: displayName || null,
      bio: bio || null,
      // When in "initials" mode, clear avatar_url so renderers fall back
      // to the initials+color block; in "upload" mode we keep the url.
      avatar_url: avatarMode === 'upload' ? avatarUrl || null : null,
      avatar_color: avatarOuter,
      banner_url: bannerUrl || null,
      profile_visibility: profileVisibility,
      show_activity: showActivity,
      show_on_leaderboard: showOnLeaderboard,
      allow_messages: allowMessages,
      dm_read_receipts_enabled: dmReadReceipts,
      metadata: mergedMeta,
    };
    const { error } = await supabase.rpc('update_own_profile', { p_fields: patch });
    setSaving(false);
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({ message: 'Profile saved', variant: 'success' });
    setEditing(false);
    markDirty(false);
    await onSaved();
  };

  const handleCancel = () => {
    setEditing(false);
    if (!user) return;
    setDisplayName(user.display_name || '');
    setBio(user.bio || '');
    setAvatarUrl(user.avatar_url || '');
    const meta = readMeta(user);
    const av = meta.avatar || {};
    setAvatarOuter(av.outer || user.avatar_color || '#111111');
    setAvatarInner(av.inner ?? null);
    setAvatarInitials(
      av.initials || (user.username ? user.username.slice(0, 1).toUpperCase() : '')
    );
    setAvatarMode(user.avatar_url && !av.initials ? 'upload' : 'initials');
    setBannerUrl(user.banner_url || '');
    setProfileVisibility(user.profile_visibility || 'public');
    setShowActivity(user.show_activity !== false);
    setShowOnLeaderboard(user.show_on_leaderboard !== false);
    setAllowMessages(user.allow_messages !== false);
    setDmReadReceipts(user.dm_read_receipts_enabled !== false);
    markDirty(false);
  };

  const handleAvatarUpload = async (file: File) => {
    // NOTE(owner): the `avatars` storage bucket is not created via code —
    // it must exist in the Supabase dashboard. If it's missing the
    // upload fails with "Bucket not found"; match the banners handler
    // and surface a clean message instead of leaking the raw error.
    try {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) {
        const msg = /bucket.*not.*found/i.test(error.message)
          ? 'Avatar upload is not configured yet — contact admin.'
          : error.message;
        pushToast({ message: msg, variant: 'danger' });
        return;
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      if (data?.publicUrl) setAvatarUrl(data.publicUrl);
    } catch {
      pushToast({
        message: 'Avatar upload is not configured yet — contact admin.',
        variant: 'danger',
      });
    }
  };

  const handleBannerUpload = async (file: File) => {
    // NOTE(owner): the `banners` storage bucket is not created via code —
    // it must exist in the Supabase dashboard. If it's missing this fails
    // with "Bucket not found"; we surface a clean message and flag it.
    try {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('banners').upload(path, file, { upsert: true });
      if (error) {
        const msg = /bucket.*not.*found/i.test(error.message)
          ? 'Banner upload is not configured yet — contact admin.'
          : error.message;
        pushToast({ message: msg, variant: 'danger' });
        return;
      }
      const { data } = supabase.storage.from('banners').getPublicUrl(path);
      if (data?.publicUrl) setBannerUrl(data.publicUrl);
    } catch {
      pushToast({
        message: 'Banner upload is not configured yet — contact admin.',
        variant: 'danger',
      });
    }
  };

  const previewInitials = avatarInitials || (username || '?').slice(0, 1).toUpperCase();
  const previewInnerBg = avatarInner || 'transparent';
  const previewTextColor = avatarInner ? '#111111' : avatarOuter;

  // Safe CSS url() interpolation for avatar/banner previews. Both columns
  // are TEXT with no DB-side CHECK constraint; OAuth + Supabase storage
  // upload paths sanitize on write, but a direct DB poke or a future write
  // path that skips sanitisation could land a value containing `")` or `'`,
  // breaking out of the url() context to inject CSS (cookie exfiltration
  // via background-image network request). CSP currently allows
  // 'unsafe-inline' on style-src, so React inline styles are not a backstop.
  // Validate scheme is https://, then escape `\` and `"` and wrap in
  // url("..."). TODO: add CHECK constraints on users.avatar_url / banner_url
  // in a follow-up migration so the DB itself rejects bad values.
  function safeCssBackgroundImage(url: string | null | undefined): string | undefined {
    if (!url || typeof url !== 'string') return undefined;
    const trimmed = url.trim();
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'https:') return undefined;
    const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `url("${escaped}")`;
  }

  const avatarBgImage = safeCssBackgroundImage(avatarUrl);
  const bannerBgImage = safeCssBackgroundImage(bannerUrl);

  return (
    <Card
      id="profile"
      title="Profile"
      description="Visible to other readers on Verity Post."
      highlight={highlight}
      aside={
        !editing && (
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      {loading ? (
        <SkeletonBar width={240} />
      ) : !editing ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: S[3],
          }}
        >
          <SummaryRow label="Display name" value={displayName || '—'} />
          <SummaryRow label="Username" value={username ? `@${username}` : '—'} />
          <SummaryRow label="Visibility" value={profileVisibility} />
          <SummaryRow label="Bio" value={bio || '—'} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: S[3],
            }}
          >
            <div>
              <FieldLabel>Display name</FieldLabel>
              <TextInput
                value={displayName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <FieldLabel>Username</FieldLabel>
              <TextInput value={username} disabled />
              <div style={{ fontSize: F.xs, color: C.dim, marginTop: 2 }}>
                Usernames cannot be changed.
              </div>
            </div>
          </div>
          <div>
            <FieldLabel>Bio</FieldLabel>
            <Textarea
              rows={3}
              value={bio}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                if (e.target.value.length <= 280) setBio(e.target.value);
              }}
            />
            <div
              style={{
                textAlign: 'right',
                fontSize: F.xs,
                color: bio.length > 250 ? C.danger : C.dim,
              }}
            >
              {bio.length}/280
            </div>
          </div>
          <div>
            <FieldLabel>Avatar</FieldLabel>
            {/* Mode toggle: initials + color vs uploaded photo. */}
            <div
              role="radiogroup"
              aria-label="Avatar style"
              style={{ display: 'flex', gap: S[2], marginBottom: S[2] }}
            >
              {(['initials', 'upload'] as const).map((m) => (
                <label
                  key={m}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: S[1],
                    fontSize: F.sm,
                    color: C.text,
                    cursor: 'pointer',
                    padding: `${S[1]}px ${S[3]}px`,
                    border: `1px solid ${avatarMode === m ? C.accent : C.border}`,
                    borderRadius: 999,
                    background: avatarMode === m ? '#f6f4ff' : C.bg,
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="radio"
                    name="avatar-mode"
                    checked={avatarMode === m}
                    onChange={() => setAvatarMode(m)}
                    style={{ margin: 0 }}
                  />
                  {m === 'initials' ? 'Use initials + color' : 'Upload photo'}
                </label>
              ))}
            </div>

            {avatarMode === 'initials' ? (
              <div
                style={{ display: 'flex', alignItems: 'flex-start', gap: S[4], flexWrap: 'wrap' }}
              >
                {/* Live preview: ring color + inner fill + initials */}
                <div
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: '50%',
                    background: previewInnerBg,
                    border: `3px solid ${avatarOuter}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    fontWeight: 700,
                    color: previewTextColor,
                    letterSpacing: previewInitials.length > 1 ? '-0.03em' : 0,
                    flexShrink: 0,
                  }}
                >
                  {previewInitials}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <FieldLabel>Initials (up to 3 characters)</FieldLabel>
                  <TextInput
                    value={avatarInitials}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInitialsSafe(e.target.value)}
                    placeholder="ABC"
                    maxLength={3}
                    style={{ textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}
                  />
                  <div
                    style={{
                      fontSize: F.xs,
                      color: initialsError ? C.danger : C.dim,
                      marginTop: 4,
                    }}
                  >
                    {initialsError || 'Letters and numbers only.'}
                  </div>

                  <div style={{ marginTop: S[3] }}>
                    <FieldLabel>Ring color</FieldLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={`outer-${c}`}
                          type="button"
                          className="vp-nomintouch"
                          onClick={() => setAvatarOuter(c)}
                          aria-label={`Ring color ${c}`}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: c,
                            border:
                              avatarOuter === c ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: S[3] }}>
                    <FieldLabel>Inner fill</FieldLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className="vp-nomintouch"
                        onClick={() => setAvatarInner(null)}
                        aria-label="Transparent inner fill"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: `repeating-linear-gradient(45deg, #fff, #fff 3px, ${C.border} 3px, ${C.border} 6px)`,
                          border:
                            avatarInner === null ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                      {AVATAR_COLORS.map((c) => (
                        <button
                          key={`inner-${c}`}
                          type="button"
                          className="vp-nomintouch"
                          onClick={() => setAvatarInner(c)}
                          aria-label={`Inner color ${c}`}
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: c,
                            border:
                              avatarInner === c ? `3px solid ${C.text}` : `1px solid ${C.border}`,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: `1px solid ${C.border}`,
                    backgroundImage: avatarBgImage,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.dim,
                    fontSize: F.xs,
                    background: avatarBgImage ? undefined : C.card,
                  }}
                >
                  {!avatarBgImage && 'None'}
                </div>
                <label style={{ cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleAvatarUpload(f);
                    }}
                    style={{ display: 'none' }}
                  />
                  <span
                    style={{
                      display: 'inline-block',
                      padding: `${S[1]}px ${S[3]}px`,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      fontSize: F.sm,
                      color: C.text,
                      background: C.bg,
                    }}
                  >
                    Upload image
                  </span>
                </label>
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Banner</FieldLabel>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[3],
                flexWrap: 'wrap',
                maxWidth: '100%',
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 36,
                  borderRadius: 6,
                  maxWidth: '100%',
                  border: `1px solid ${C.border}`,
                  backgroundImage: bannerBgImage,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  background: bannerBgImage ? undefined : C.card,
                  flexShrink: 0,
                }}
              />
              <label style={{ cursor: 'pointer' }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleBannerUpload(f);
                  }}
                  style={{ display: 'none' }}
                />
                <span
                  style={{
                    display: 'inline-block',
                    padding: `${S[1]}px ${S[3]}px`,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontSize: F.sm,
                    color: C.text,
                    background: C.bg,
                  }}
                >
                  Upload image
                </span>
              </label>
            </div>
          </div>

          <div>
            <FieldLabel>Profile visibility</FieldLabel>
            <Select
              value={profileVisibility}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setProfileVisibility(e.target.value)}
              options={[
                { value: 'public', label: 'Public — anyone can view' },
                { value: 'followers', label: 'Followers — only people who follow you' },
                { value: 'private', label: 'Private — only you' },
              ]}
            />
          </div>

          {/* Privacy sub-section — columns verified on `users` via MCP. */}
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              paddingTop: S[3],
              display: 'flex',
              flexDirection: 'column',
              gap: S[3],
            }}
          >
            <div
              style={{
                fontSize: F.sm,
                fontWeight: 700,
                color: C.text,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Privacy
            </div>
            <Switch
              checked={showActivity}
              onChange={setShowActivity}
              label="Show my activity"
              hint="Reading history, comments, and reactions visible on your profile."
            />
            <Switch
              checked={showOnLeaderboard}
              onChange={setShowOnLeaderboard}
              label="Show me on leaderboards"
              hint="Category ranks and top-scorer lists."
            />
            <Switch
              checked={allowMessages}
              onChange={setAllowMessages}
              label="Allow direct messages"
              hint="Let other users start a DM thread with you."
            />
            <Switch
              checked={dmReadReceipts}
              onChange={setDmReadReceipts}
              label="DM read receipts"
              hint="Let people know when you've read their message."
            />
          </div>

          <div
            className="vp-settings-actions"
            style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}
          >
            <Button variant="primary" onClick={handleSave} loading={saving}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div>
      <div
        style={{
          fontSize: F.xs,
          fontWeight: 600,
          color: C.dim,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: F.base, color: C.text, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1B. Emails
// ---------------------------------------------------------------------------

function EmailsCard({
  authEmail,
  highlight,
  supabase,
  userId,
  user,
  onSaved,
  pushToast,
}: {
  authEmail: string;
  highlight: boolean;
  supabase: DbClient;
  userId: string;
  user: UserRow | null;
  onSaved: () => Promise<void> | void;
  pushToast: Pusher;
}): ReactElement {
  // C6: `/api/account/emails` is not built in this repo — disable the
  // add-secondary button with a tooltip until the endpoint exists.
  // Verified via `find site/src/app/api/account/emails -type f` (empty).

  // Email notifications block (C5). No dedicated `notification_prefs`
  // column on `users`, so we persist the three flags under
  // metadata.notification_prefs — flagged for owner.
  const [newsletter, setNewsletter] = useState(true);
  const [commentReplies, setCommentReplies] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [savingNotif, setSavingNotif] = useState(false);
  const notifSnap = useRef('');

  useEffect(() => {
    if (!user) return;
    const np = readMeta(user).notification_prefs || {};
    const n = np.newsletter !== false;
    const r = np.commentReplies !== false;
    const s = np.securityAlerts !== false;
    setNewsletter(n);
    setCommentReplies(r);
    setSecurityAlerts(s);
    notifSnap.current = JSON.stringify({ n, r, s });
  }, [user]);

  const notifCurrent = JSON.stringify({
    n: newsletter,
    r: commentReplies,
    s: securityAlerts,
  });
  const notifDirty = notifCurrent !== notifSnap.current;

  const saveNotifs = async () => {
    if (!user) return;
    setSavingNotif(true);
    const prevMeta = readMeta(user);
    const merged = {
      ...(prevMeta || {}),
      notification_prefs: {
        ...(prevMeta.notification_prefs || {}),
        newsletter,
        commentReplies,
        securityAlerts,
      },
    };
    const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
    setSavingNotif(false);
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({ message: 'Email notifications saved.', variant: 'success' });
    notifSnap.current = notifCurrent;
    await onSaved();
  };

  return (
    <Card
      id="emails"
      title="Emails"
      highlight={highlight}
      description="Your primary email is where login links and receipts go."
    >
      <Row>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: F.base, wordBreak: 'break-all' }}>
            {authEmail}
          </div>
          <div style={{ display: 'flex', gap: S[2], marginTop: 4, alignItems: 'center' }}>
            <Badge variant="success" dot size="xs">
              Verified
            </Badge>
            <span style={{ fontSize: F.xs, color: C.dim }}>Primary</span>
          </div>
        </div>
        <Button size="sm" disabled>
          Change
        </Button>
      </Row>
      {/* Secondary email support: deferred. Re-enable when /api/account/emails exists. */}
      {false && (
        <Row>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: F.base }}>Add secondary email</div>
            <div style={{ fontSize: F.sm, color: C.dim }}>
              Backup or category-specific notifications.
            </div>
          </div>
          <span title="Secondary-email endpoint not yet built.">
            <Button size="sm" disabled>
              Add email
            </Button>
          </span>
        </Row>
      )}

      {/* C5: Email notification preferences. */}
      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          paddingTop: S[3],
          marginTop: S[2],
          display: 'flex',
          flexDirection: 'column',
          gap: S[3],
        }}
      >
        <div
          style={{
            fontSize: F.sm,
            fontWeight: 700,
            color: C.text,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Email notifications
        </div>
        <Switch
          checked={newsletter}
          onChange={setNewsletter}
          label="Weekly newsletter"
          hint="Best reads and new features, once a week."
        />
        <Switch
          checked={commentReplies}
          onChange={setCommentReplies}
          label="Replies to my comments"
          hint="Email me when someone replies to a comment I wrote."
        />
        <Switch
          checked={securityAlerts}
          onChange={setSecurityAlerts}
          label="Security alerts"
          hint="New-device sign-ins, password changes, and deletion notices."
        />
        <div>
          <Button
            variant="primary"
            onClick={saveNotifs}
            loading={savingNotif}
            disabled={!notifDirty}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 1C. Password
// ---------------------------------------------------------------------------

function PasswordCard({
  authEmail,
  highlight,
  supabase,
  pushToast,
  markDirty,
}: {
  authEmail: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  markDirty: (d: boolean) => void;
}): ReactElement {
  const canChange = hasPermission(PERM.ACTION_PASSWORD_CHANGE);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const dirty = !!(current || next || confirm);
  useEffect(() => {
    markDirty(dirty);
  }, [dirty, markDirty]);

  const reqs = useMemo(
    () => [
      { ok: next.length >= 8, label: '8+ characters' },
      { ok: /[A-Z]/.test(next), label: 'An uppercase letter' },
      { ok: /[a-z]/.test(next), label: 'A lowercase letter' },
      { ok: /[0-9]/.test(next), label: 'A number' },
    ],
    [next]
  );
  const match = next && next === confirm;
  const canSubmit = !!current && reqs.every((r) => r.ok) && match && !busy && canChange;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    // Verify current password via server endpoint that uses an ephemeral
    // Supabase client. Replaces a direct supabase.auth.signInWithPassword
    // call here, which (a) bypassed the per-user/per-email rate-limit gate
    // login uses, (b) rotated the caller's session cookie on every probe,
    // (c) triggered onAuthStateChange('SIGNED_IN') on every other listener.
    // See /api/auth/verify-password for the new defense layers.
    const verifyRes = await fetch('/api/auth/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: current }),
    });
    if (!verifyRes.ok) {
      setBusy(false);
      if (verifyRes.status === 429) {
        pushToast({ message: 'Too many attempts. Try again later.', variant: 'danger' });
      } else {
        pushToast({ message: 'Current password is incorrect.', variant: 'danger' });
      }
      return;
    }
    const { error: upErr } = await supabase.auth.updateUser({ password: next });
    if (upErr) {
      setBusy(false);
      pushToast({ message: upErr.message, variant: 'danger' });
      return;
    }
    // Sign out every other session — a stolen cookie stops working
    // the moment the owner rotates their password.
    try {
      await supabase.auth.signOut({ scope: 'others' });
    } catch {
      /* best-effort */
    }
    setBusy(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    markDirty(false);
    pushToast({ message: 'Password updated. Other sessions signed out.', variant: 'success' });
  };

  return (
    <Card
      id="password"
      title="Password"
      highlight={highlight}
      description="Choose a strong password to keep your account secure."
    >
      {!canChange && (
        <div
          style={{
            padding: S[3],
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontSize: F.sm,
            color: C.dim,
            marginBottom: S[3],
          }}
        >
          Password changes are disabled for your account.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], maxWidth: 480 }}>
        <PwField
          label="Current password"
          value={current}
          onChange={setCurrent}
          show={showCurrent}
          toggleShow={() => setShowCurrent((s) => !s)}
        />
        <PwField
          label="New password"
          value={next}
          onChange={setNext}
          show={showNew}
          toggleShow={() => setShowNew((s) => !s)}
        />
        <PwField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          show={showConfirm}
          toggleShow={() => setShowConfirm((s) => !s)}
        />
        {!!confirm && !match && (
          <div style={{ fontSize: F.sm, color: C.danger }}>Passwords do not match.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          {reqs.map((r) => (
            <div key={r.label} style={{ fontSize: F.xs, color: r.ok ? C.success : C.dim }}>
              {r.ok ? '[ok]' : '  - '} {r.label}
            </div>
          ))}
        </div>
        <div>
          <Button variant="primary" onClick={handleSubmit} loading={busy} disabled={!canSubmit}>
            Update password
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PwField({
  label,
  value,
  onChange,
  show,
  toggleShow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggleShow: () => void;
}): ReactElement {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        rightAddon={
          <button
            type="button"
            onClick={toggleShow}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.dim,
              fontSize: F.xs,
              cursor: 'pointer',
            }}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1D. Login activity
// ---------------------------------------------------------------------------

function LoginActivityCard({
  userId,
  highlight,
  supabase,
  pushToast,
}: {
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
}): ReactElement {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAll, setBusyAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const canRevokeAll = hasPermission(PERM.ACTION_SESSIONS_REVOKE_ALL);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // M5: we continue to read from `user_sessions` (analytics) rather than
      // `audit_log`; the rows here are richer (browser/os/device/geo).
      const { data, error } = await supabase
        .from('user_sessions')
        .select(
          'id, started_at, ended_at, is_active, ip_address, browser_name, browser_version, os_name, device_model, device_type, country_code, city'
        )
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(20);
      if (!alive) return;
      if (error) pushToast({ message: error.message, variant: 'danger' });
      setRows((data as SessionRow[] | null) || []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, userId, pushToast]);

  const revokeAll = async () => {
    setBusyAll(true);
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setBusyAll(false);
    setConfirmAll(false);
    if (error) pushToast({ message: error.message, variant: 'danger' });
    else pushToast({ message: 'Signed out of every other session.', variant: 'success' });
  };

  // M4: removed per-row "Sign out" button (it was a no-op client-side — there's
  // no per-session server revoke). Users use "Sign out everywhere" instead.

  return (
    <Card
      id="login-activity"
      title="Sign-in activity"
      highlight={highlight}
      description="Showing recent sessions on your account."
      aside={
        <Button
          size="sm"
          variant="danger"
          disabled={!canRevokeAll}
          onClick={() => setConfirmAll(true)}
        >
          Sign out everywhere
        </Button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          <SkeletonBar width="60%" />
          <SkeletonBar width="80%" />
          <SkeletonBar width="40%" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          size="sm"
          title="No sessions yet"
          description="We'll list devices here after your next sign-in."
        />
      ) : (
        <div>
          {rows.map((r, i) => {
            // M6: show "City, CC · Browser on OS" (fall back to IP when geo missing).
            const geoParts = [r.city, r.country_code].filter(Boolean).join(', ');
            const browserOnOs = [
              r.browser_name
                ? `${r.browser_name}${r.browser_version ? ` ${r.browser_version}` : ''}`
                : null,
              r.os_name ? `on ${r.os_name}` : null,
            ]
              .filter(Boolean)
              .join(' ');
            const locPart = geoParts || r.ip_address || 'Unknown location';
            return (
              <Row key={r.id} last={i === rows.length - 1}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.base, fontWeight: 600 }}>
                    {r.device_model || r.os_name || r.browser_name || 'Unknown device'}
                  </div>
                  <div
                    style={{
                      fontSize: F.xs,
                      color: C.dim,
                      display: 'flex',
                      gap: S[2],
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      {locPart}
                      {browserOnOs ? ` · ${browserOnOs}` : ''}
                    </span>
                    {/* M3: "Last active" was mislabelled — this column is started_at. */}
                    <span>Started {formatRelative(r.started_at)}</span>
                  </div>
                </div>
                {r.is_active ? (
                  <Badge variant="success" size="xs" dot>
                    Active
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="xs">
                    Ended
                  </Badge>
                )}
              </Row>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirmAll}
        title="Sign out of every other session?"
        message="You'll stay signed in here. Other devices will be kicked out immediately."
        confirmLabel="Sign out others"
        variant="danger"
        busy={busyAll}
        onCancel={() => !busyAll && setConfirmAll(false)}
        onConfirm={revokeAll}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2A. Feed
// ---------------------------------------------------------------------------

function FeedCard({
  user,
  highlight,
  supabase,
  pushToast,
  userId,
  onSaved,
  markDirty,
}: {
  user: UserRow | null;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  userId: string;
  onSaved: () => Promise<void> | void;
  markDirty: (d: boolean) => void;
}): ReactElement {
  const canEditCats = hasPermission(PERM.ACTION_FEED_CAT_TOGGLE);
  const canHideLowCred = hasPermission(PERM.ACTION_FEED_HIDE_LOWCRED);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [kidSafe, setKidSafe] = useState(false);
  const [hideLowCred, setHideLowCred] = useState(true);
  const [showBreaking, setShowBreaking] = useState(true);
  const [showTrending, setShowTrending] = useState(true);
  const [showRecommended, setShowRecommended] = useState(false);
  const [minScore, setMinScore] = useState<number>(0);
  const [display, setDisplay] = useState<'compact' | 'comfortable'>('comfortable');
  const [saving, setSaving] = useState(false);
  const snapshot = useRef('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name, is_kids_safe')
        .eq('is_active', true)
        .order('name');
      if (!alive) return;
      setCategories((data as CategoryRow[] | null) || []);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    const meta = readMeta(user);
    const feed = meta.feed || {};
    const cats = new Set<string>(feed.cats || []);
    setSelectedCats(cats);
    setKidSafe(!!feed.kidSafe);
    setHideLowCred(feed.hideLowCred !== false);
    setShowBreaking(feed.showBreaking !== false);
    setShowTrending(feed.showTrending !== false);
    setShowRecommended(!!feed.showRecommended);
    setMinScore(typeof feed.minScore === 'number' ? feed.minScore : 0);
    setDisplay(feed.display || 'comfortable');
    snapshot.current = JSON.stringify({
      cats: [...cats].sort(),
      kidSafe: !!feed.kidSafe,
      hideLowCred: feed.hideLowCred !== false,
      showBreaking: feed.showBreaking !== false,
      showTrending: feed.showTrending !== false,
      showRecommended: !!feed.showRecommended,
      minScore: typeof feed.minScore === 'number' ? feed.minScore : 0,
      display: feed.display || 'comfortable',
    });
  }, [user]);

  const currentKey = JSON.stringify({
    cats: [...selectedCats].sort(),
    kidSafe,
    hideLowCred,
    showBreaking,
    showTrending,
    showRecommended,
    minScore,
    display,
  });
  const dirty = currentKey !== snapshot.current;
  useEffect(() => {
    markDirty(dirty);
  }, [dirty, markDirty]);

  const toggleCat = (id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    // M16: re-read metadata immediately before writing so concurrent edits
    // on a different sub-key (a11y, expertWatchlist) don't get clobbered.
    const { data: fresh } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle();
    const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)
      ?.metadata as SettingsMeta | null;
    const prevFeed = freshMeta?.feed || {};
    const merged = {
      ...(freshMeta || {}),
      feed: {
        ...prevFeed,
        cats: [...selectedCats],
        kidSafe,
        hideLowCred,
        showBreaking,
        showTrending,
        showRecommended,
        minScore,
        display,
      },
    };
    const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
    setSaving(false);
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({ message: 'Feed preferences saved.', variant: 'success' });
    markDirty(false);
    await onSaved();
  };

  return (
    <Card
      id="feed"
      title="Feed"
      highlight={highlight}
      description="Tune what shows up in your feed."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div>
          <FieldLabel>Preferred categories</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
            {categories.length === 0 ? (
              <SkeletonBar width={180} />
            ) : (
              categories.map((c) => {
                const active = selectedCats.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!canEditCats}
                    onClick={() => toggleCat(c.id)}
                    style={{
                      padding: `${S[1]}px ${S[3]}px`,
                      borderRadius: 999,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      background: active ? C.accent : C.bg,
                      color: active ? '#fff' : C.text,
                      fontSize: F.sm,
                      fontWeight: 500,
                      cursor: canEditCats ? 'pointer' : 'not-allowed',
                      opacity: canEditCats ? 1 : 0.6,
                    }}
                  >
                    {c.name}
                  </button>
                );
              })
            )}
          </div>
          <div style={{ fontSize: F.xs, color: C.dim, marginTop: 4 }}>
            {selectedCats.size} selected
          </div>
        </div>
        <Switch
          checked={kidSafe}
          onChange={setKidSafe}
          label="Kid-safe only"
          hint="Hide articles that aren't marked kid-safe."
        />
        <Switch
          checked={hideLowCred}
          onChange={setHideLowCred}
          disabled={!canHideLowCred}
          label="Hide low-credibility sources"
          hint="Exclude sources below the community credibility threshold."
        />
        <Switch
          checked={showBreaking}
          onChange={setShowBreaking}
          label="Show breaking news"
          hint="Pin breaking stories to the top of your feed."
        />
        <Switch
          checked={showTrending}
          onChange={setShowTrending}
          label="Show trending"
          hint="Surface articles gaining rapid engagement."
        />
        <Switch
          checked={showRecommended}
          onChange={setShowRecommended}
          label="Show recommended"
          hint="Mix in articles based on your reading history."
        />
        <div
          style={{
            display: 'grid',
            gap: S[3],
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <FieldLabel>Minimum credibility score (0–100)</FieldLabel>
            <NumberInput
              min={0}
              max={100}
              step={1}
              value={minScore}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const n = Number(e.target.value);
                if (Number.isNaN(n)) return;
                setMinScore(Math.max(0, Math.min(100, Math.round(n))));
              }}
            />
            <div style={{ fontSize: F.xs, color: C.dim, marginTop: 4 }}>
              Articles below this score will not appear. 0 shows everything.
            </div>
          </div>
          <div>
            <FieldLabel>Display density</FieldLabel>
            <Select
              value={display}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setDisplay(e.target.value as 'compact' | 'comfortable')
              }
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
              ]}
            />
          </div>
        </div>
        <div>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2B. Alerts matrix
// ---------------------------------------------------------------------------

function AlertsCard({
  highlight,
  pushToast,
}: {
  highlight: boolean;
  pushToast: Pusher;
}): ReactElement {
  const [prefs, setPrefs] = useState<Record<string, AlertPrefRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/notifications/preferences');
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        const byType: Record<string, AlertPrefRow> = {};
        for (const p of (data.preferences || []) as AlertPrefRow[]) byType[p.alert_type] = p;
        setPrefs(byType);
      } catch (err) {
        pushToast({ message: 'Could not load alerts.', variant: 'danger' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pushToast]);

  const update = async (type: AlertType, patch: Partial<AlertPrefRow>) => {
    const prev = prefs[type];
    // Optimistic: write locally, rollback on error.
    const merged: AlertPrefRow = {
      ...(prev ||
        ({
          id: '',
          user_id: '',
          alert_type: type,
          channel_email: true,
          channel_in_app: true,
          channel_push: true,
          channel_sms: false,
          frequency: null,
          is_enabled: true,
          quiet_hours_end: null,
          quiet_hours_start: null,
          created_at: '',
          updated_at: '',
        } satisfies AlertPrefRow)),
      ...patch,
      alert_type: type,
    };
    setPrefs((p) => ({ ...p, [type]: merged }));
    setSavingKey(type);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (!res.ok) {
        if (prev) setPrefs((p) => ({ ...p, [type]: prev }));
        pushToast({ message: 'Could not save alert preference.', variant: 'danger' });
      }
    } catch {
      if (prev) setPrefs((p) => ({ ...p, [type]: prev }));
      pushToast({ message: 'Network error', variant: 'danger' });
    } finally {
      setSavingKey('');
    }
  };

  const isMobile = useIsMobile();

  return (
    <Card
      id="alerts"
      title="Alerts"
      highlight={highlight}
      description="Choose where each alert type shows up. In-app is on by default."
    >
      {/* Web push is not yet wired (no SW/VAPID). Push preferences set
          here are respected by the iOS app but are a no-op on web. */}
      <div
        style={{
          fontSize: F.xs,
          color: C.dim,
          background: C.bg,
          border: `1px dashed ${C.border}`,
          borderRadius: 6,
          padding: S[2],
          marginBottom: S[3],
        }}
      >
        Note: Push delivery is iOS-only for now. Enabling Push on web saves your preference so the
        iOS app will honour it, but the web app itself does not send push notifications yet.
      </div>
      {loading ? (
        <SkeletonBar width={220} />
      ) : isMobile ? (
        // Mobile: one card per alert with the three channel checkboxes
        // stacked underneath. The `enabled` switch sits in the card header
        // so disabling an alert visibly greys the channel column.
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {ALERT_ROWS.map((r) => {
            const pref = prefs[r.key];
            const enabled = pref?.is_enabled !== false;
            return (
              <div
                key={r.key}
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: S[3],
                  background: C.bg,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: S[2],
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: S[2],
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: F.base, fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>{r.desc}</div>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={savingKey === r.key}
                    onChange={(next) => update(r.key, { is_enabled: next })}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[2],
                    paddingTop: S[2],
                    borderTop: `1px solid ${C.border}`,
                    opacity: enabled ? 1 : 0.55,
                  }}
                >
                  {ALERT_CHANNELS.map((ch) => {
                    const on = pref ? (pref[ch.key] as boolean | undefined) !== false : true;
                    return (
                      <label
                        key={ch.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: S[2],
                          fontSize: F.sm,
                          color: C.text,
                          minHeight: 32,
                        }}
                      >
                        <span>{ch.label}</span>
                        <Checkbox
                          checked={on}
                          disabled={!enabled || savingKey === r.key}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            update(r.key, { [ch.key]: e.target.checked } as Partial<AlertPrefRow>)
                          }
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
            <thead>
              <tr>
                <th style={thStyle}>Alert</th>
                <th style={thStyle}>Enabled</th>
                {ALERT_CHANNELS.map((c) => (
                  <th key={c.key} style={{ ...thStyle, width: 90 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALERT_ROWS.map((r) => {
                const pref = prefs[r.key];
                const enabled = pref?.is_enabled !== false;
                return (
                  <tr key={r.key}>
                    <td style={tdStyle}>
                      <div style={{ fontSize: F.base, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ fontSize: F.xs, color: C.dim }}>{r.desc}</div>
                    </td>
                    <td style={tdStyle}>
                      <Switch
                        checked={enabled}
                        disabled={savingKey === r.key}
                        onChange={(next) => update(r.key, { is_enabled: next })}
                      />
                    </td>
                    {ALERT_CHANNELS.map((ch) => {
                      const on = pref ? (pref[ch.key] as boolean | undefined) !== false : true;
                      return (
                        <td key={ch.key} style={{ ...tdStyle, textAlign: 'center' }}>
                          <Checkbox
                            checked={on}
                            disabled={!enabled || savingKey === r.key}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              update(r.key, { [ch.key]: e.target.checked } as Partial<AlertPrefRow>)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const thStyle: CSSProperties = {
  fontSize: F.xs,
  fontWeight: 700,
  color: C.dim,
  textAlign: 'left',
  padding: `${S[2]}px ${S[2]}px`,
  borderBottom: `1px solid ${C.border}`,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const tdStyle: CSSProperties = {
  padding: `${S[3]}px ${S[2]}px`,
  borderBottom: `1px solid ${C.border}`,
  fontSize: F.base,
  verticalAlign: 'middle',
};

// ---------------------------------------------------------------------------
// 2C. Accessibility
// ---------------------------------------------------------------------------

function AccessibilityCard({
  user,
  highlight,
  supabase,
  pushToast,
  userId,
  onSaved,
  markDirty,
}: {
  user: UserRow | null;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  userId: string;
  onSaved: () => Promise<void> | void;
  markDirty: (d: boolean) => void;
}): ReactElement {
  const canEditTts = hasPermission(PERM.ACTION_A11Y_TTS);
  const canEditTextSize = hasPermission(PERM.ACTION_A11Y_TEXT_SIZE);
  const canEditMotion = hasPermission(PERM.ACTION_A11Y_REDUCE_MOTION);
  const canEditContrast = hasPermission(PERM.ACTION_A11Y_HIGH_CONTRAST);

  const [ttsDefault, setTtsDefault] = useState(false);
  const [textSize, setTextSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [saving, setSaving] = useState(false);
  const snapshot = useRef('');

  useEffect(() => {
    if (!user) return;
    const meta = readMeta(user);
    setTtsDefault(!!meta.a11y?.ttsDefault);
    setTextSize(meta.a11y?.textSize || 'md');
    setReduceMotion(!!meta.a11y?.reduceMotion);
    setHighContrast(!!meta.a11y?.highContrast);
    snapshot.current = JSON.stringify({
      ttsDefault: !!meta.a11y?.ttsDefault,
      textSize: meta.a11y?.textSize || 'md',
      reduceMotion: !!meta.a11y?.reduceMotion,
      highContrast: !!meta.a11y?.highContrast,
    });
  }, [user]);

  const currentKey = JSON.stringify({ ttsDefault, textSize, reduceMotion, highContrast });
  const dirty = currentKey !== snapshot.current;
  useEffect(() => {
    markDirty(dirty);
  }, [dirty, markDirty]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    // M16: re-read metadata immediately before write so a concurrent
    // feed/expertWatchlist save doesn't clobber us.
    const { data: fresh } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle();
    const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)
      ?.metadata as SettingsMeta | null;
    const merged = {
      ...(freshMeta || {}),
      a11y: { ttsDefault, textSize, reduceMotion, highContrast },
    };
    const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
    setSaving(false);
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({ message: 'Accessibility saved.', variant: 'success' });
    markDirty(false);
    await onSaved();
  };

  return (
    <Card
      id="accessibility"
      title="Accessibility"
      highlight={highlight}
      description="Text-to-speech, motion, contrast, and text size."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <Switch
          label="Text-to-speech by default"
          hint="Auto-start TTS when you open an article."
          checked={ttsDefault}
          disabled={!canEditTts}
          onChange={setTtsDefault}
        />
        <div>
          <FieldLabel>Text size</FieldLabel>
          <Select
            value={textSize}
            disabled={!canEditTextSize}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setTextSize(e.target.value as typeof textSize)
            }
            options={TEXT_SIZES}
          />
        </div>
        <Switch
          label="Reduce motion"
          hint="Minimise animations and transitions."
          checked={reduceMotion}
          disabled={!canEditMotion}
          onChange={setReduceMotion}
        />
        <Switch
          label="High contrast"
          hint="Bolder borders, higher contrast typography."
          checked={highContrast}
          disabled={!canEditContrast}
          onChange={setHighContrast}
        />
        <div>
          <Button variant="primary" onClick={handleSave} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3A. Blocked users
// ---------------------------------------------------------------------------

function BlockedCard({
  userId,
  highlight,
  supabase,
  pushToast,
}: {
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
}): ReactElement {
  const canUnblock = hasPermission(PERM.ACTION_BLOCKED_UNBLOCK);
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blocked_users')
      .select(
        'id, created_at, reason, blocked:users!fk_blocked_users_blocked_id(id, username, avatar_color)'
      )
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });
    if (error) pushToast({ message: error.message, variant: 'danger' });
    setRows((data as unknown as BlockedRow[] | null) || []);
    setLoading(false);
  }, [supabase, userId, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from('blocked_users').delete().eq('id', id);
    setBusy('');
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    pushToast({ message: 'Unblocked.', variant: 'success' });
  };

  return (
    <Card
      id="blocked"
      title="Blocked users"
      highlight={highlight}
      description="People you've blocked cannot see your profile, message you, or reply to your comments."
    >
      {loading ? (
        <SkeletonBar width={200} />
      ) : rows.length === 0 ? (
        <EmptyState size="sm" title="No blocks" description="You haven't blocked anyone." />
      ) : (
        <div>
          {rows.map((r, i) => (
            <Row key={r.id} last={i === rows.length - 1}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: r.blocked?.avatar_color || C.accent,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: F.sm,
                  fontWeight: 700,
                }}
              >
                {(r.blocked?.username || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.base, fontWeight: 600 }}>
                  @{r.blocked?.username || 'unknown'}
                </div>
                <div style={{ fontSize: F.xs, color: C.dim }}>
                  Blocked {formatDate(r.created_at)}
                  {r.reason ? ` · ${r.reason}` : ''}
                </div>
              </div>
              <Button
                size="sm"
                disabled={!canUnblock || busy === r.id}
                loading={busy === r.id}
                onClick={() => unblock(r.id)}
              >
                Unblock
              </Button>
            </Row>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3B. Data & export
// ---------------------------------------------------------------------------

function DataExportCard({
  userId,
  highlight,
  supabase,
  pushToast,
}: {
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  userRow: UserRow | null;
  onChanged: () => Promise<void> | void;
}): ReactElement {
  const canExport = hasPermission(PERM.ACTION_DATA_EXPORT);

  const [requests, setRequests] = useState<DataRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'export' | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('data_requests')
      .select('id, type, status, created_at, completed_at, download_url, deadline_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) pushToast({ message: error.message, variant: 'danger' });
    setRequests((data as DataRequestRow[] | null) || []);
    setLoading(false);
  }, [supabase, userId, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestExport = async () => {
    setBusy('export');
    const payload: TableInsert<'data_requests'> = {
      user_id: userId,
      type: 'export',
      status: 'pending',
    };
    const { error } = await supabase.from('data_requests').insert(payload);
    setBusy('');
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({ message: 'Data export requested.', variant: 'success' });
    await load();
  };

  // M8: the second deletion entry point (inline here) conflicted with the
  // Danger Zone "Delete account" card that hits /api/account/delete (grace
  // scheduling, session invalidation, the works). We now keep ONE entry
  // point — the Danger Zone card — and point at it from here.

  const activeExport = requests.find(
    (r) => r.type === 'export' && r.status !== 'completed' && r.status !== 'cancelled'
  );

  return (
    <Card
      id="data"
      title="Data & export"
      highlight={highlight}
      description="Download a copy of your data. Account deletion lives in the Danger zone below."
    >
      {loading ? <SkeletonBar width={260} /> : null}
      <div
        style={{
          display: 'grid',
          gap: S[3],
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: S[3] }}>
          <div style={{ fontSize: F.base, fontWeight: 600 }}>Data export</div>
          <div style={{ fontSize: F.sm, color: C.dim, marginBottom: S[2] }}>
            We'll email a download link when the bundle is ready (up to 30 days per GDPR).
          </div>
          {activeExport ? (
            <Badge variant="info" size="xs">
              {activeExport.status}
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={requestExport}
              loading={busy === 'export'}
              disabled={!canExport}
            >
              Request data export
            </Button>
          )}
        </div>
      </div>
      {requests.length > 0 && (
        <div style={{ marginTop: S[4] }}>
          <FieldLabel>Recent requests</FieldLabel>
          <div>
            {requests.slice(0, 5).map((r, i) => (
              <Row key={r.id} last={i === Math.min(5, requests.length) - 1}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: F.base, fontWeight: 600 }}>
                    {r.type === 'export' ? 'Export' : 'Deletion'}
                  </div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>{formatDate(r.created_at)}</div>
                </div>
                <Badge
                  variant={
                    r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'info'
                  }
                  size="xs"
                >
                  {r.status}
                </Badge>
                {r.type === 'export' && r.download_url && (
                  <a
                    href={r.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: F.sm, color: C.accent, fontWeight: 600 }}
                  >
                    Download
                  </a>
                )}
              </Row>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3C. Supervisor
// ---------------------------------------------------------------------------

interface SupervisorRow {
  id: string;
  name: string;
  score: number;
  eligible: boolean;
  opted_in: boolean;
  opted_in_at: string | null;
  // M11: 7-day cooldown window after stepping down.
  cooldown_ends_at: string | null;
}

function SupervisorCard({
  userId,
  highlight,
  supabase,
  pushToast,
}: {
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
}): ReactElement {
  const canOptIn = hasPermission(PERM.ACTION_SUPERVISOR_OPT_IN);
  const [rows, setRows] = useState<SupervisorRow[]>([]);
  const [threshold, setThreshold] = useState(500);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>('');
  // M12: confirm dialog state for opt-out, carrying the row context.
  const [pendingOptOut, setPendingOptOut] = useState<SupervisorRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: settingRow }, { data: cats }, { data: scores }, { data: sups }] =
      await Promise.all([
        supabase
          .from('settings')
          .select('value')
          .eq('key', 'supervisor_eligibility_score')
          .maybeSingle(),
        supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
        supabase.from('category_scores').select('category_id, score').eq('user_id', userId),
        supabase
          .from('category_supervisors')
          .select('category_id, is_active, opted_in_at, opted_out_at')
          .eq('user_id', userId),
      ]);
    const th = Number((settingRow as { value?: string } | null)?.value || 500);
    setThreshold(th);

    const scoreMap = new Map<string, number>();
    for (const s of (scores as { category_id: string; score: number }[] | null) || [])
      scoreMap.set(s.category_id, s.score);
    const supMap = new Map<string, CategorySupervisorRow>();
    for (const s of (sups as CategorySupervisorRow[] | null) || []) supMap.set(s.category_id, s);

    const next: SupervisorRow[] = ((cats as { id: string; name: string }[] | null) || []).map(
      (c) => {
        const sup = supMap.get(c.id);
        const score = scoreMap.get(c.id) || 0;
        // M11: 7-day cooldown starts at opted_out_at.
        const optedOut = sup?.opted_out_at ? new Date(sup.opted_out_at) : null;
        const cooldownEnds = optedOut
          ? new Date(optedOut.getTime() + 7 * 24 * 60 * 60 * 1000)
          : null;
        const inCooldown = cooldownEnds ? cooldownEnds > new Date() : false;
        return {
          id: c.id,
          name: c.name,
          score,
          eligible: score >= th,
          opted_in: !!sup?.is_active && !sup.opted_out_at,
          opted_in_at: sup?.opted_in_at || null,
          cooldown_ends_at: inCooldown && cooldownEnds ? cooldownEnds.toISOString() : null,
        };
      }
    );
    setRows(next);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const optIn = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch('/api/supervisor/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        pushToast({ message: d?.error || 'Opt-in failed', variant: 'danger' });
      } else {
        pushToast({ message: 'You are now supervising this category.', variant: 'success' });
        await load();
      }
    } finally {
      setBusy('');
    }
  };

  const confirmOptOut = async () => {
    if (!pendingOptOut) return;
    setBusy(pendingOptOut.id);
    try {
      const res = await fetch('/api/supervisor/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: pendingOptOut.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        pushToast({ message: d?.error || 'Opt-out failed', variant: 'danger' });
      } else {
        pushToast({ message: 'Stepped down. A 7-day cooldown applies.', variant: 'success' });
        setPendingOptOut(null);
        await load();
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <Card
      id="supervisor"
      title="Category supervisor"
      highlight={highlight}
      description={`Eligibility threshold: ${threshold} per category. Supervisors flag comments to the moderator queue; they have no direct moderation power.`}
    >
      {loading ? (
        <SkeletonBar width={200} />
      ) : rows.length === 0 ? (
        <EmptyState
          size="sm"
          title="No categories available"
          description="Category list is empty."
        />
      ) : (
        <div>
          {rows.map((r, i) => (
            <Row key={r.id} last={i === rows.length - 1}>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: F.base,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.name}
                </div>
                <div style={{ fontSize: F.xs, color: r.eligible ? C.success : C.dim }}>
                  Score {r.score}
                  {r.eligible ? ' — eligible' : ` — need ${threshold - r.score} more`}
                </div>
              </div>
              {r.opted_in ? (
                <Button size="sm" loading={busy === r.id} onClick={() => setPendingOptOut(r)}>
                  Step down
                </Button>
              ) : r.cooldown_ends_at ? (
                <span style={{ fontSize: F.xs, color: C.warn, textAlign: 'right', maxWidth: 220 }}>
                  Recently stepped down — reapply after {formatDate(r.cooldown_ends_at)}
                </span>
              ) : r.eligible ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canOptIn}
                  loading={busy === r.id}
                  onClick={() => optIn(r.id)}
                >
                  Opt in
                </Button>
              ) : (
                <Badge variant="neutral" size="xs">
                  Not eligible
                </Badge>
              )}
            </Row>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!pendingOptOut}
        title="Step down from this category?"
        message={
          pendingOptOut
            ? `You will stop supervising "${pendingOptOut.name}". A 7-day cooldown applies before you can re-apply.`
            : ''
        }
        confirmLabel="Step down"
        variant="danger"
        busy={!!pendingOptOut && busy === pendingOptOut.id}
        onCancel={() => {
          if (!pendingOptOut || busy !== pendingOptOut.id) setPendingOptOut(null);
        }}
        onConfirm={confirmOptOut}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Billing bundle (Plan + Payment + Invoices + Promo)
// ---------------------------------------------------------------------------

function BillingBundle({
  userId,
  highlightPlan,
  highlightPayment,
  highlightInvoices,
  highlightPromo,
  showPlan,
  showPayment,
  showInvoices,
  showPromo,
  supabase,
  pushToast,
}: {
  userId: string;
  highlightPlan: boolean;
  highlightPayment: boolean;
  highlightInvoices: boolean;
  highlightPromo: boolean;
  showPlan: boolean;
  showPayment: boolean;
  showInvoices: boolean;
  showPromo: boolean;
  supabase: DbClient;
  pushToast: Pusher;
}): ReactElement {
  const canChange = hasPermission(PERM.ACTION_BILLING_CHANGE_PLAN);
  const canCancel = hasPermission(PERM.ACTION_BILLING_CANCEL);
  const canResub = hasPermission(PERM.ACTION_BILLING_RESUB);
  const canPortal = hasPermission(PERM.ACTION_BILLING_PORTAL);
  const canPromo = hasPermission(PERM.ACTION_BILLING_PROMO);
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [userBilling, setUserBilling] = useState<Pick<
    Tables<'users'>,
    | 'plan_id'
    | 'plan_status'
    | 'frozen_at'
    | 'frozen_verity_score'
    | 'plan_grace_period_ends_at'
    | 'stripe_customer_id'
  > | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatureRow[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState<string>('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [uq, sq, iq, pq, pfq] = await Promise.all([
          supabase
            .from('users')
            .select(
              'plan_id, plan_status, frozen_at, frozen_verity_score, plan_grace_period_ends_at, stripe_customer_id'
            )
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('subscriptions')
            .select(
              'id, status, current_period_end, created_at, stripe_payment_method_id, source, apple_original_transaction_id, google_purchase_token'
            )
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .maybeSingle(),
          supabase
            .from('invoices')
            .select(
              'id, stripe_invoice_id, created_at, amount_cents, currency, status, invoice_url, invoice_pdf_url'
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('plans')
            .select('id, tier, billing_period, price_cents, name')
            .eq('is_active', true)
            .order('sort_order'),
          // M10: plan feature bullets — restore the per-plan features list.
          supabase
            .from('plan_features')
            .select('plan_id, feature_name, is_enabled')
            .eq('is_enabled', true),
        ]);
        if (!alive) return;
        setUserBilling(uq.data as typeof userBilling);
        setSubscription((sq.data as SubscriptionRow | null) || null);
        setInvoices((iq.data as InvoiceRow[] | null) || []);
        setPlans((pq.data as PlanRow[] | null) || []);
        setPlanFeatures((pfq.data as PlanFeatureRow[] | null) || []);
      } catch (err) {
        if (alive) pushToast({ message: 'Could not load billing info.', variant: 'danger' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, userId, pushToast]);

  const resolved = resolveUserTier(userBilling, plans);
  const currentTier: string = resolved.tier;
  const planState: string = resolved.state;
  const isPaidActive = planState === 'active' && currentTier !== 'free';
  const isGrace = planState === 'grace';
  const isFrozen = planState === 'frozen';

  const handleChangePlan = async (tier: string) => {
    const planName = pricedPlanName(tier, cycle);
    if (!planName) return;
    setBusy(`change:${tier}`);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_name: planName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Checkout failed');
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      pushToast({ message: msg, variant: 'danger' });
    } finally {
      setBusy('');
    }
  };

  // M9: restore the labels from the legacy billing page. Returns the label
  // / button tone / busy flag for a given tier card button, or null when
  // no button is appropriate (e.g. the "current plan" slot).
  type PlanAction = {
    label: string;
    onClick: () => void;
    tone: 'primary' | 'secondary' | 'danger';
    busy: boolean;
  };
  const actionFor = (tier: string): PlanAction | null => {
    // Frozen: every paid tier becomes "Resubscribe".
    if (isFrozen) {
      if (tier === 'free') return null;
      return {
        label: 'Resubscribe',
        onClick: () => handleChangePlan(tier),
        tone: 'primary',
        busy: busy === `change:${tier}`,
      };
    }
    // Grace: current tier is "Keep my plan"; others are switches.
    if (isGrace) {
      if (tier === 'free') return null;
      const name = (TIERS as Record<string, { name: string }>)[tier]?.name || tier;
      if (tier === currentTier) {
        return {
          label: 'Keep my plan',
          onClick: () => handleChangePlan(tier),
          tone: 'primary',
          busy: busy === `change:${tier}`,
        };
      }
      return {
        label: `Switch to ${name}`,
        onClick: () => handleChangePlan(tier),
        tone: 'secondary',
        busy: busy === `change:${tier}`,
      };
    }
    if (tier === currentTier) return null;
    if (tier === 'free') {
      return isPaidActive
        ? {
            label: 'Cancel to free',
            onClick: () => setConfirmCancel(true),
            tone: 'danger',
            busy: false,
          }
        : null;
    }
    const tName = (TIERS as Record<string, { name: string }>)[tier]?.name || tier;
    if (currentTier === 'free') {
      return {
        label: `Start ${tName}`,
        onClick: () => handleChangePlan(tier),
        tone: 'primary',
        busy: busy === `change:${tier}`,
      };
    }
    const idxCur = TIER_ORDER.indexOf(currentTier);
    const idxTgt = TIER_ORDER.indexOf(tier);
    const isUpgrade = idxTgt > idxCur;
    return {
      label: isUpgrade ? `Upgrade to ${tName}` : `Switch to ${tName}`,
      onClick: () => handleChangePlan(tier),
      tone: isUpgrade ? 'primary' : 'secondary',
      busy: busy === `change:${tier}`,
    };
  };

  // Group plan_features by tier (via plans) for O(1) lookup in the render.
  const featuresByTier: Record<string, string[]> = {};
  for (const p of plans) {
    const list = planFeatures
      .filter((pf) => pf.plan_id === p.id && pf.feature_name)
      .map((pf) => pf.feature_name as string);
    if (list.length)
      featuresByTier[p.tier] = Array.from(new Set([...(featuresByTier[p.tier] || []), ...list]));
  }

  const handleCancel = async () => {
    setBusy('cancel');
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Cancel failed');
      pushToast({
        message: 'Subscription cancelled. 7-day grace period started.',
        variant: 'success',
      });
      setConfirmCancel(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cancel failed';
      pushToast({ message: msg, variant: 'danger' });
    } finally {
      setBusy('');
    }
  };

  const handlePortal = async () => {
    setBusy('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      // Q2: forward the server's specific error string instead of a generic
      // fallback, so Stripe users who fall through (e.g. missing customer id)
      // see the actionable message from /api/stripe/portal.
      pushToast({ message: data?.error || 'Could not open billing portal.', variant: 'danger' });
    } finally {
      setBusy('');
    }
  };

  // Q2: derive which store manages the current subscription so the "Manage
  // subscription" UI can branch. Stripe subscribers get the portal button;
  // Apple IAP subscribers get an App Store deep link; Google Play subscribers
  // get a Play Store link. Legacy rows with NULL `source` but a populated
  // `stripe_payment_method_id` fall through to the Stripe path (Stripe is the
  // older code path — safer default than hiding the button).
  const subSource: 'stripe' | 'apple' | 'google' | 'unknown' = (() => {
    const s = subscription?.source?.toLowerCase() || '';
    if (s.startsWith('apple') || subscription?.apple_original_transaction_id) return 'apple';
    if (s.startsWith('google') || subscription?.google_purchase_token) return 'google';
    if (s.startsWith('stripe') || userBilling?.stripe_customer_id) return 'stripe';
    return 'unknown';
  })();
  const hasStripeCustomer = !!userBilling?.stripe_customer_id;
  const showStripePortalUI = subSource === 'stripe' && hasStripeCustomer;
  const showAppleIapUI = subSource === 'apple';
  const showGoogleIapUI = subSource === 'google';

  const handlePromo = async () => {
    if (!promoCode.trim()) return;
    setBusy('promo');
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast({ message: data?.error || 'Invalid code', variant: 'danger' });
      } else {
        pushToast({ message: data?.message || 'Promo applied.', variant: 'success' });
        setPromoCode('');
      }
    } finally {
      setBusy('');
    }
  };

  const priceLabel = (tier: string, c: 'monthly' | 'annual'): string => {
    if (tier === 'free') return 'Free';
    const p = (PRICING as Record<string, Record<string, { cents: number }>>)[tier]?.[c];
    return p ? (c === 'annual' ? `${formatCents(p.cents)}/yr` : `${formatCents(p.cents)}/mo`) : '—';
  };

  if (loading)
    return (
      <Card id="plan" title="Billing" description="Loading your plan…">
        <SkeletonBar width={200} />
      </Card>
    );

  return (
    <>
      {showPlan && (
        <Card
          id="plan"
          title="Plan"
          highlight={highlightPlan}
          aside={
            canPortal && showStripePortalUI ? (
              <Button size="sm" loading={busy === 'portal'} onClick={handlePortal}>
                Open Stripe portal
              </Button>
            ) : canPortal && showAppleIapUI ? (
              <Button
                size="sm"
                onClick={() => {
                  window.location.href = 'itms-apps://apps.apple.com/account/subscriptions';
                }}
              >
                Manage on App Store
              </Button>
            ) : canPortal && showGoogleIapUI ? (
              <Button
                size="sm"
                onClick={() => {
                  window.open(
                    'https://play.google.com/store/account/subscriptions',
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
              >
                Manage on Google Play
              </Button>
            ) : null
          }
          description="Your current subscription and upgrade / cancel options."
        >
          {isFrozen && (
            <div
              style={{
                background: '#fef2f2',
                border: `1px solid ${C.danger}`,
                borderRadius: 8,
                padding: S[3],
                marginBottom: S[3],
              }}
            >
              <div style={{ fontWeight: 700, color: C.danger, fontSize: F.base }}>
                Profile frozen
              </div>
              <div style={{ fontSize: F.sm, marginTop: 4 }}>
                Your Verity Score is held at {userBilling?.frozen_verity_score ?? '—'}. Resubscribe
                to unfreeze.
              </div>
            </div>
          )}
          {isGrace && (
            <div
              style={{
                background: '#fffbeb',
                border: `1px solid ${C.warn}`,
                borderRadius: 8,
                padding: S[3],
                marginBottom: S[3],
              }}
            >
              <div style={{ fontWeight: 700, color: C.warn, fontSize: F.base }}>Grace period</div>
              <div style={{ fontSize: F.sm, marginTop: 4 }}>
                {daysUntil(userBilling?.plan_grace_period_ends_at) ?? '—'} days until freeze (
                {formatDate(userBilling?.plan_grace_period_ends_at)}).
              </div>
            </div>
          )}

          <div
            style={{
              background: 'linear-gradient(135deg,#111 0%,#222 100%)',
              color: '#fff',
              borderRadius: 10,
              padding: S[4],
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: S[3],
              marginBottom: S[4],
            }}
          >
            <div>
              <div
                style={{
                  fontSize: F.xs,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  opacity: 0.8,
                }}
              >
                Current plan
              </div>
              <div style={{ fontSize: F.xxl, fontWeight: 700 }}>
                {(TIERS as Record<string, { name: string }>)[currentTier]?.name || 'Free'}
              </div>
              <div style={{ opacity: 0.85, fontSize: F.sm, marginTop: 4 }}>
                {isPaidActive && resolved.planRow?.billing_period
                  ? `${formatCents(resolved.planRow.price_cents)} · Billed ${resolved.planRow.billing_period === 'year' ? 'annually' : 'monthly'}`
                  : currentTier === 'free'
                    ? 'No subscription'
                    : '—'}
                {subscription?.current_period_end && !isFrozen
                  ? ` · Next: ${formatDate(subscription.current_period_end)}`
                  : ''}
              </div>
            </div>
            {isPaidActive && !isGrace && (
              <Button
                variant="danger"
                size="md"
                onClick={() => setConfirmCancel(true)}
                disabled={!canCancel}
              >
                Cancel
              </Button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: S[3],
              flexWrap: 'wrap',
              gap: S[2],
            }}
          >
            <div style={{ fontSize: F.base, fontWeight: 600 }}>Change plan</div>
            <div
              style={{
                display: 'inline-flex',
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                padding: 2,
                background: C.card,
              }}
            >
              {(['monthly', 'annual'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  style={{
                    padding: `${S[1]}px ${S[3]}px`,
                    border: 'none',
                    borderRadius: 999,
                    background: cycle === c ? C.accent : 'transparent',
                    color: cycle === c ? '#fff' : C.text,
                    fontSize: F.sm,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {c === 'annual' ? `Annual · save ~${annualSavingsPercent('verity')}%` : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: S[2],
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            {TIER_ORDER.map((tier) => {
              const t = (TIERS as Record<string, { name: string; tagline: string }>)[tier];
              const isCurrent = tier === currentTier && !isFrozen;
              const action = actionFor(tier);
              // M9: gate the buttons by permission. Resubscribe (frozen flow)
              // needs canResub; everything else uses canChange / canCancel.
              const needsResubPerm = isFrozen && tier !== 'free';
              const isCancelAction = action?.tone === 'danger';
              const disabledByPerm =
                (needsResubPerm && !canResub) ||
                (!needsResubPerm && !isCancelAction && !canChange) ||
                (isCancelAction && !canCancel);
              const features = featuresByTier[tier] || [];
              return (
                <div
                  key={tier}
                  style={{
                    border: `1px solid ${isCurrent ? C.accent : C.border}`,
                    borderRadius: 8,
                    padding: S[3],
                    background: isCurrent ? '#f6f4ff' : C.bg,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[1],
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: F.base, fontWeight: 700 }}>{t.name}</div>
                    {isCurrent && (
                      <Badge size="xs" variant="info">
                        Current
                      </Badge>
                    )}
                  </div>
                  <div style={{ fontSize: F.xs, color: C.dim, minHeight: 28 }}>{t.tagline}</div>
                  <div style={{ fontSize: F.lg, fontWeight: 700 }}>{priceLabel(tier, cycle)}</div>
                  {/* M10: per-plan feature bullets from `plan_features`. */}
                  {features.length > 0 && (
                    <ul
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      {features.map((f) => (
                        <li
                          key={f}
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'flex-start',
                            fontSize: F.xs,
                            color: C.text,
                          }}
                        >
                          <span style={{ color: C.success, fontWeight: 700, marginTop: 1 }}>+</span>
                          <span style={{ lineHeight: 1.35 }}>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ flex: 1 }} />
                  {action && (
                    <Button
                      size="sm"
                      variant={action.tone}
                      disabled={disabledByPerm}
                      loading={action.busy}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <ConfirmDialog
            open={confirmCancel}
            title="Cancel subscription?"
            message="Cancellation takes effect at the end of the current billing period — you keep access until then. DMs turn off immediately. After the period ends there's a 7-day grace window, then your profile freezes."
            confirmLabel="Yes, cancel"
            variant="danger"
            busy={busy === 'cancel'}
            onCancel={() => busy !== 'cancel' && setConfirmCancel(false)}
            onConfirm={handleCancel}
          />
        </Card>
      )}

      {showPayment && (
        <Card
          id="payment-method"
          title="Payment method"
          highlight={highlightPayment}
          description={
            showAppleIapUI
              ? 'Managed by Apple. Changes open Settings > Subscriptions on your iPhone.'
              : showGoogleIapUI
                ? 'Managed by Google Play. Changes open the Play Store.'
                : 'Managed by Stripe. Changes open the Stripe portal.'
          }
        >
          <Row last>
            <div style={{ flex: 1, minWidth: 0 }}>
              {showAppleIapUI ? (
                <>
                  <div style={{ fontSize: F.base, fontWeight: 600 }}>Billed by Apple</div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>
                    Your subscription is managed in your App Store account. Open Settings &gt;
                    Subscriptions on your iPhone, or use the button to jump straight there.
                  </div>
                </>
              ) : showGoogleIapUI ? (
                <>
                  <div style={{ fontSize: F.base, fontWeight: 600 }}>Billed by Google Play</div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>
                    Your subscription is managed in your Google Play account.
                  </div>
                </>
              ) : subscription?.stripe_payment_method_id ? (
                <>
                  <div style={{ fontSize: F.base, fontWeight: 600 }}>Card on file</div>
                  <div
                    style={{
                      fontSize: F.xs,
                      color: C.dim,
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {subscription.stripe_payment_method_id}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: F.sm, color: C.dim }}>No card on file.</div>
              )}
            </div>
            {showAppleIapUI ? (
              <Button
                size="sm"
                disabled={!canPortal}
                onClick={() => {
                  window.location.href = 'itms-apps://apps.apple.com/account/subscriptions';
                }}
                style={isMobile ? { width: '100%' } : undefined}
              >
                Manage on App Store
              </Button>
            ) : showGoogleIapUI ? (
              <Button
                size="sm"
                disabled={!canPortal}
                onClick={() => {
                  window.open(
                    'https://play.google.com/store/account/subscriptions',
                    '_blank',
                    'noopener,noreferrer'
                  );
                }}
                style={isMobile ? { width: '100%' } : undefined}
              >
                Manage on Google Play
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!canPortal}
                loading={busy === 'portal'}
                onClick={handlePortal}
                style={isMobile ? { width: '100%' } : undefined}
              >
                Update payment method
              </Button>
            )}
          </Row>
        </Card>
      )}

      {showInvoices && (
        <Card
          id="invoices"
          title="Invoices"
          highlight={highlightInvoices}
          description="Download PDFs of past Stripe invoices."
        >
          {invoices.length === 0 ? (
            <EmptyState size="sm" title="No invoices yet" />
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: S[3],
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[1],
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: S[2],
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: F.base }}>
                      {formatCents(inv.amount_cents, { currency: inv.currency })}
                    </div>
                    <Badge size="xs" variant={inv.status === 'paid' ? 'success' : 'neutral'}>
                      {inv.status || 'unknown'}
                    </Badge>
                  </div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>{formatDate(inv.created_at)}</div>
                  <div
                    style={{
                      fontSize: F.xs,
                      color: C.dim,
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {inv.stripe_invoice_id || inv.id.slice(0, 12)}
                  </div>
                  {(inv.invoice_url || inv.invoice_pdf_url) && (
                    <a
                      href={inv.invoice_url || inv.invoice_pdf_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: F.sm,
                        color: C.accent,
                        fontWeight: 600,
                        marginTop: S[1],
                      }}
                    >
                      Download PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Invoice</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td
                        style={{
                          ...tdStyle,
                          fontFamily: 'monospace',
                          color: C.dim,
                          fontSize: F.xs,
                        }}
                      >
                        {inv.stripe_invoice_id || inv.id.slice(0, 12)}
                      </td>
                      <td style={tdStyle}>{formatDate(inv.created_at)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {formatCents(inv.amount_cents, { currency: inv.currency })}
                      </td>
                      <td style={tdStyle}>
                        <Badge size="xs" variant={inv.status === 'paid' ? 'success' : 'neutral'}>
                          {inv.status || 'unknown'}
                        </Badge>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {inv.invoice_url || inv.invoice_pdf_url ? (
                          <a
                            href={inv.invoice_url || inv.invoice_pdf_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: F.sm, color: C.accent, fontWeight: 600 }}
                          >
                            Download
                          </a>
                        ) : (
                          <span style={{ color: C.dim }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {showPromo && (
        <Card
          id="promo"
          title="Promo codes"
          highlight={highlightPromo}
          description="Have a code? Redeem it here."
        >
          <div
            style={{
              display: 'flex',
              gap: S[2],
              maxWidth: isMobile ? '100%' : 420,
              width: '100%',
              flexWrap: 'wrap',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
            }}
          >
            <TextInput
              placeholder="ENTER CODE"
              value={promoCode}
              disabled={!canPromo}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setPromoCode(e.target.value.toUpperCase())
              }
              style={{ fontFamily: 'monospace', letterSpacing: 1, width: '100%' }}
            />
            <Button
              variant="primary"
              disabled={!canPromo || !promoCode.trim()}
              loading={busy === 'promo'}
              onClick={handlePromo}
            >
              Apply
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 5A. Expert profile (title / org / bio / credentials display)
// ---------------------------------------------------------------------------

function ExpertProfileCard({
  user,
  userId,
  highlight,
  supabase,
  pushToast,
  onSaved,
  markDirty,
}: {
  user: UserRow | null;
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  onSaved: () => Promise<void> | void;
  markDirty: (d: boolean) => void;
}): ReactElement {
  const [title, setTitle] = useState('');
  const [org, setOrg] = useState('');
  const [bio, setBio] = useState('');
  const [application, setApplication] = useState<ExpertApplicationRow | null>(null);
  const [saving, setSaving] = useState(false);
  const snapshot = useRef('');

  useEffect(() => {
    if (!user) return;
    setTitle(user.expert_title || '');
    setOrg(user.expert_organization || '');
    setBio(user.bio || '');
    snapshot.current = JSON.stringify({
      title: user.expert_title || '',
      org: user.expert_organization || '',
      bio: user.bio || '',
    });
  }, [user]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('expert_applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive) setApplication((data as ExpertApplicationRow | null) || null);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, userId]);

  const currentKey = JSON.stringify({ title, org, bio });
  const dirty = currentKey !== snapshot.current;
  useEffect(() => {
    markDirty(dirty);
  }, [dirty, markDirty]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('update_own_profile', {
      p_fields: {
        expert_title: title || null,
        expert_organization: org || null,
        bio: bio || null,
      },
    });
    setSaving(false);
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({ message: 'Expert profile saved.', variant: 'success' });
    markDirty(false);
    await onSaved();
  };

  const credList = Array.isArray(application?.credentials)
    ? (application?.credentials as { text?: string }[])
        .map((c) => (typeof c === 'string' ? c : c?.text || ''))
        .filter(Boolean)
    : [];

  // C1: only users with an APPROVED expert_applications row get the edit
  // form. Everyone else sees the application CTA. Full multi-step apply
  // flow is too big to rebuild inline — ship the entry point now and
  // flag the target route as TODO for owner.
  const isApproved = application?.status === 'approved';

  if (!isApproved) {
    return (
      <Card
        id="expert-profile"
        title="Expertise & credentials"
        highlight={highlight}
        description="Experts answer reader questions in their approved categories."
      >
        <EmptyState
          size="md"
          title="Apply to become an expert"
          description="Share your credentials and subject matter expertise for editorial review."
          cta={
            // Q8: `/signup/expert` now detects authed sessions and skips
            // the create-account step, so signed-in free users land
            // straight on the credentials form with email pre-filled.
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = '/signup/expert';
              }}
            >
              Start application
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      id="expert-profile"
      title="Expertise & credentials"
      highlight={highlight}
      description="Shown on your expert byline and in category answers."
    >
      <div
        style={{
          display: 'grid',
          gap: S[3],
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <div>
          <FieldLabel>Expert title</FieldLabel>
          <TextInput
            value={title}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>Organization</FieldLabel>
          <TextInput
            value={org}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOrg(e.target.value)}
          />
        </div>
      </div>
      <div style={{ marginTop: S[3] }}>
        <FieldLabel>Bio</FieldLabel>
        <Textarea
          value={bio}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBio(e.target.value)}
          rows={3}
        />
      </div>
      {credList.length > 0 && (
        <div style={{ marginTop: S[3] }}>
          <FieldLabel>Credentials (from application)</FieldLabel>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {credList.map((c, i) => (
              <li key={i} style={{ fontSize: F.sm, color: C.text }}>
                - {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ marginTop: S[3] }}>
        <Button variant="primary" onClick={handleSave} loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5B. Expert vacation mode
// ---------------------------------------------------------------------------

function ExpertVacationCard({
  user,
  userId,
  highlight,
  supabase,
  pushToast,
  onSaved,
}: {
  user: UserRow | null;
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  onSaved: () => Promise<void> | void;
}): ReactElement {
  // No dedicated column — we store in users.metadata.expertVacation.
  // TODO: confirm with owner whether to add a first-class column.
  const on = !!readMeta(user).expertVacation;
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    if (!user) return;
    setBusy(true);
    // M16: re-read metadata right before write to avoid clobbering
    // sibling sub-keys (feed, a11y, expertWatchlist).
    const { data: fresh } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle();
    const freshMeta = (fresh as { metadata?: Record<string, unknown> } | null)
      ?.metadata as SettingsMeta | null;
    const merged = { ...(freshMeta || {}), expertVacation: next };
    const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
    setBusy(false);
    if (error) {
      pushToast({ message: error.message, variant: 'danger' });
      return;
    }
    pushToast({
      message: next ? 'Vacation mode on. Ask-an-expert requests are paused.' : 'Vacation mode off.',
      variant: 'success',
    });
    await onSaved();
  };

  return (
    <Card
      id="expert-vacation"
      title="Vacation mode"
      highlight={highlight}
      description="Pause incoming Ask-an-expert requests without losing your badge."
    >
      <Row last>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: F.base, fontWeight: 600 }}>
            {on ? 'On — questions paused' : 'Off — accepting questions'}
          </div>
          <div style={{ fontSize: F.xs, color: C.dim }}>
            Your profile still shows the expert badge.
          </div>
        </div>
        <Switch checked={on} disabled={busy} onChange={toggle} />
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5C. Expert watchlist
// ---------------------------------------------------------------------------

function ExpertWatchlistCard({
  userId,
  highlight,
  supabase,
  pushToast,
}: {
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
}): ReactElement {
  const [cats, setCats] = useState<{ id: string; name: string; watched: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // 1) find this user's latest approved application
    const { data: app } = await supabase
      .from('expert_applications')
      .select('id, status')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!app) {
      setCats([]);
      setLoading(false);
      return;
    }
    // 2) find its approved categories
    const { data: catRows } = await supabase
      .from('expert_application_categories')
      .select('category_id, categories:categories(id, name)')
      .eq('application_id', (app as { id: string }).id);
    // 3) find existing watchlist (stored in users.metadata.expertWatchlist)
    const { data: user } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle();
    const watched = new Set<string>(
      (user as { metadata?: { expertWatchlist?: string[] } } | null)?.metadata?.expertWatchlist ||
        []
    );
    const list = (
      (catRows as
        | { category_id: string; categories: { id: string; name: string } | null }[]
        | null) || []
    )
      .map((row) => row.categories)
      .filter((c): c is { id: string; name: string } => !!c)
      .map((c) => ({ id: c.id, name: c.name, watched: watched.has(c.id) }));
    setCats(list);
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (id: string) => {
    const prev = cats;
    const nextCats = cats.map((c) => (c.id === id ? { ...c, watched: !c.watched } : c));
    setCats(nextCats);
    const watched = nextCats.filter((c) => c.watched).map((c) => c.id);
    const { data: u } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle();
    const prevMeta = (u as { metadata?: Record<string, unknown> } | null)?.metadata || {};
    const merged = { ...prevMeta, expertWatchlist: watched };
    const { error } = await supabase.rpc('update_own_profile', { p_fields: { metadata: merged } });
    if (error) {
      setCats(prev);
      pushToast({ message: error.message, variant: 'danger' });
    } else {
      pushToast({ message: 'Watchlist updated.', variant: 'success' });
    }
  };

  return (
    <Card
      id="expert-watchlist"
      title="Category watchlist"
      highlight={highlight}
      description="Get notified when new questions land in your approved categories."
    >
      {loading ? (
        <SkeletonBar width={200} />
      ) : cats.length === 0 ? (
        <EmptyState
          size="sm"
          title="No approved categories"
          description="Your expert application hasn't been approved in any category yet."
        />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              style={{
                padding: `${S[1]}px ${S[3]}px`,
                borderRadius: 999,
                border: `1px solid ${c.watched ? C.accent : C.border}`,
                background: c.watched ? C.accent : C.bg,
                color: c.watched ? '#fff' : C.text,
                fontSize: F.sm,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6A. Delete account (danger zone)
// ---------------------------------------------------------------------------

function DeleteAccountCard({
  userId,
  highlight,
  supabase,
  pushToast,
  userRow,
  onChanged,
}: {
  userId: string;
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
  userRow: UserRow | null;
  onChanged: () => Promise<void> | void;
}): ReactElement {
  const canDelete = hasPermission(PERM.ACTION_DATA_DELETE);
  const canCancel = hasPermission(PERM.ACTION_DATA_DELETE_CANCEL);
  const isMobile = useIsMobile();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const pending = userRow?.deletion_scheduled_for
    ? daysUntil(userRow.deletion_scheduled_for)
    : null;

  const startDelete = async () => {
    if (typed !== 'DELETE') return;
    setBusy(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        pushToast({ message: d?.error || 'Could not schedule deletion', variant: 'danger' });
      } else {
        pushToast({
          message: 'Account scheduled for deletion. 30-day grace period started.',
          variant: 'success',
        });
        setOpen(false);
        setTyped('');
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        pushToast({ message: d?.error || 'Could not cancel deletion', variant: 'danger' });
      } else {
        pushToast({ message: 'Deletion cancelled.', variant: 'success' });
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      id="delete-account"
      title="Delete account"
      highlight={highlight}
      tone="danger"
      description="Permanently delete your account and all data. 30-day grace period — sign in to cancel."
    >
      {pending !== null ? (
        <Row last>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: F.base, fontWeight: 600, color: C.danger }}>
              Scheduled for deletion
            </div>
            <div style={{ fontSize: F.xs, color: C.dim }}>
              {pending} day{pending === 1 ? '' : 's'} remaining. After that your data will be
              erased.
            </div>
          </div>
          <Button
            variant="secondary"
            disabled={!canCancel}
            loading={busy}
            onClick={cancelDelete}
            style={isMobile ? { width: '100%' } : undefined}
          >
            Cancel deletion
          </Button>
        </Row>
      ) : (
        <Button
          variant="danger"
          disabled={!canDelete}
          onClick={() => setOpen(true)}
          style={isMobile ? { width: '100%' } : undefined}
        >
          Delete my account
        </Button>
      )}

      {/* M7: wrap the type-DELETE confirm in ConfirmDialog for consistency.
          ConfirmDialog doesn't have a native typed-confirm prop, so we keep
          the DELETE gate by rendering a TextInput in the `message` slot and
          guarding the confirm handler itself. */}
      <ConfirmDialog
        open={open}
        title="Delete your account?"
        message={
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            <div>This schedules a 30-day grace period. Sign in before the deadline to cancel.</div>
            <div>
              <FieldLabel>Type DELETE to confirm</FieldLabel>
              <TextInput
                value={typed}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
                placeholder="DELETE"
                disabled={busy}
              />
            </div>
          </div>
        }
        confirmLabel={typed === 'DELETE' ? 'Yes, delete my account' : 'Type DELETE to continue'}
        variant="danger"
        busy={busy}
        onCancel={() => {
          if (!busy) {
            setOpen(false);
            setTyped('');
          }
        }}
        onConfirm={() => {
          if (typed === 'DELETE') void startDelete();
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6A2. Sign out (this device)
// ---------------------------------------------------------------------------

function SignOutCard({ highlight }: { highlight: boolean }): ReactElement {
  const isMobile = useIsMobile();
  return (
    <Card
      id="signout"
      title="Sign out"
      highlight={highlight}
      tone="danger"
      description="Sign out of this device. You'll need to sign in again to access your account."
    >
      <Button
        variant="danger"
        onClick={() => {
          window.location.href = '/logout';
        }}
        style={isMobile ? { width: '100%' } : undefined}
      >
        Sign out
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6B. Sign out everywhere
// ---------------------------------------------------------------------------

function SignOutEverywhereCard({
  highlight,
  supabase,
  pushToast,
}: {
  highlight: boolean;
  supabase: DbClient;
  pushToast: Pusher;
}): ReactElement {
  const canRevokeAll = hasPermission(PERM.ACTION_SESSIONS_REVOKE_ALL);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setBusy(false);
    setOpen(false);
    if (error) pushToast({ message: error.message, variant: 'danger' });
    else pushToast({ message: 'Signed out of every other session.', variant: 'success' });
  };

  return (
    <Card
      id="signout-everywhere"
      title="Sign out everywhere"
      highlight={highlight}
      tone="danger"
      description="Invalidate every session except this one. Useful after a stolen device."
    >
      <Button
        variant="danger"
        disabled={!canRevokeAll}
        onClick={() => setOpen(true)}
        style={isMobile ? { width: '100%' } : undefined}
      >
        Sign out of every other session
      </Button>
      <ConfirmDialog
        open={open}
        title="Sign out of every other session?"
        message="You'll stay signed in here. Other devices will be kicked out immediately."
        confirmLabel="Sign out others"
        variant="danger"
        busy={busy}
        onCancel={() => !busy && setOpen(false)}
        onConfirm={signOut}
      />
    </Card>
  );
}
