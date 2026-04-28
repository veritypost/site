// @migrated-to-permissions 2026-04-18
// @feature-verified family_admin 2026-04-18
'use client';
import { useState, useEffect, CSSProperties, ReactNode } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { COPPA_CONSENT_TEXT, COPPA_CONSENT_VERSION } from '../../../lib/coppaConsent';
import ConfirmDialog from '@/components/ConfirmDialog';
import AddKidUpsellModal, { type AddKidUpsellPayload } from '@/components/family/AddKidUpsellModal';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { isPinWeak } from '@/lib/kidPinValidation';
import type { Tables } from '@/types/database-helpers';

const COLOR_OPTIONS = ['#10b981', '#f59e0b', '#3b82f6', '#f43f5e', '#ec4899', '#14b8a6', '#a855f7'];

function isDobValid(v: string): boolean {
  if (!v) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  return d < new Date();
}
function isUnder13(v: string): boolean {
  const d = new Date(v);
  const maxMs = 13 * 365.25 * 24 * 60 * 60 * 1000;
  return Date.now() - d.getTime() <= maxMs;
}

function daysRemaining(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `success`/`warn`/`danger` keep inline hex (deeper variants than canonical).
const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: '#16a34a',
  warn: '#b45309',
  danger: '#dc2626',
} as const;

type KidRow = Tables<'kid_profiles'>;

type KpiPayload = {
  articles: number;
  minutes: number;
  quizzes_passed: number;
  longest_streak: { streak: number; name: string } | null;
} | null;

type TrialPayload = {
  kid_trial_used?: boolean;
  kid_trial_ends_at?: string | null;
};

type FormState = {
  display_name: string;
  avatar_color: string;
  pin: string;
  pinConfirm: string;
  date_of_birth: string;
  parent_name: string;
  consent_ack: boolean;
};

type FormMode = false | 'trial' | 'full';

export default function ParentKidsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState<boolean>(true);
  const [me, setMe] = useState<{ id: string; username: string | null } | null>(null);
  const [trial, setTrial] = useState<TrialPayload>({});
  const [kids, setKids] = useState<KidRow[]>([]);
  const [kpis, setKpis] = useState<KpiPayload>(null);
  const [error, setError] = useState<string>('');
  const [loadError, setLoadError] = useState<boolean>(false);
  const [flash, setFlash] = useState<string>('');
  const [denied, setDenied] = useState<boolean>(false);
  const [canAdd, setCanAdd] = useState<boolean>(false);
  const [canRemove, setCanRemove] = useState<boolean>(false);
  const [canStartTrial, setCanStartTrial] = useState<boolean>(false);
  const [canViewKpis, setCanViewKpis] = useState<boolean>(false);

  const [showForm, setShowForm] = useState<FormMode>(false);
  const [form, setForm] = useState<FormState>({
    display_name: '',
    avatar_color: COLOR_OPTIONS[0],
    pin: '',
    pinConfirm: '',
    date_of_birth: '',
    parent_name: '',
    consent_ack: false,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);
  const [removeBusy, setRemoveBusy] = useState<boolean>(false);
  const [pauseBusy, setPauseBusy] = useState<string | null>(null);

  // 402 upsell modal — opens when /api/kids POST returns kid_seat_required.
  // The form payload is parked on `upsellPayload` so the bundled
  // /api/family/add-kid-with-seat endpoint can re-run validation and
  // create the kid in one atomic call alongside the Stripe seat bump.
  const [upsellOpen, setUpsellOpen] = useState<boolean>(false);
  const [upsellPayload, setUpsellPayload] = useState<AddKidUpsellPayload | null>(null);
  const [upsellPriceCents, setUpsellPriceCents] = useState<number>(499);
  const [upsellKidName, setUpsellKidName] = useState<string>('');

  async function load() {
    setLoading(true);
    setError('');
    setLoadError(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    await refreshAllPermissions();
    await refreshIfStale();
    const parentView = hasPermission('kids.parent.view');
    setCanAdd(hasPermission('family.add_kid'));
    setCanRemove(hasPermission('family.remove_kid'));
    setCanStartTrial(hasPermission('kids.trial.start'));
    setCanViewKpis(hasPermission('kids.parent.household_kpis'));

    if (!parentView) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const { data: meRow } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', user.id)
      .maybeSingle();
    setMe(meRow);

    // Sentinel returned by the kids/trial catch handlers when the request
    // fails outright. Distinguishes a fetch failure from a successful
    // response that legitimately contains no kids / no trial state — without
    // it, the empty-state CTA fires on a network error and pushes the
    // parent to "Add a kid" when their data just failed to load.
    const FAILED = Symbol('fetch-failed');
    const [kidsRes, trialRes, kpiRes] = await Promise.all([
      fetch('/api/kids', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch((err) => {
          console.error('[profile/kids] kids list', err);
          return FAILED;
        }),
      fetch('/api/kids/trial', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch((err) => {
          console.error('[profile/kids] trial', err);
          return FAILED;
        }),
      hasPermission('kids.parent.household_kpis')
        ? fetch('/api/kids/household-kpis', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : null))
            .catch((err) => {
              console.error('[profile/kids] household-kpis', err);
              return null;
            })
        : Promise.resolve(null),
    ]);

    const kidsFailed = kidsRes === FAILED;
    const trialFailed = trialRes === FAILED;
    if (kidsFailed || trialFailed) {
      setLoadError(true);
      setKids([]);
      setTrial({});
      setKpis(null);
      setLoading(false);
      return;
    }

    setKids((kidsRes as { kids?: KidRow[] })?.kids || []);
    setTrial((trialRes as TrialPayload) || {});
    setKpis((kpiRes as KpiPayload) || null);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trialActive = !!(
    trial?.kid_trial_used &&
    trial?.kid_trial_ends_at &&
    new Date(trial.kid_trial_ends_at) > new Date()
  );
  const trialExpired = !!(
    trial?.kid_trial_used &&
    trial?.kid_trial_ends_at &&
    new Date(trial.kid_trial_ends_at) <= new Date()
  );
  const canCreateMore = canAdd || (canStartTrial && !trial?.kid_trial_used && kids.length === 0);

  async function createKid(asTrial: boolean) {
    setError('');
    setFlash('');
    if (!form.display_name.trim()) {
      setError('Name required');
      return;
    }
    if (!isDobValid(form.date_of_birth)) {
      setError('Date of birth required and must be in the past.');
      return;
    }
    if (!isUnder13(form.date_of_birth)) {
      setError('Kid profiles are for children under 13.');
      return;
    }
    if (form.pin && isPinWeak(form.pin)) {
      setError('PIN must be 4 non-trivial digits');
      return;
    }
    if (form.pin !== form.pinConfirm) {
      setError('PINs don\u2019t match');
      return;
    }
    if (form.parent_name.trim().length < 2) {
      setError('Parent or guardian full name required');
      return;
    }
    if (!form.consent_ack) {
      setError('Parental consent acknowledgment required');
      return;
    }

    setSaving(true);
    const payload = {
      display_name: form.display_name.trim(),
      avatar_color: form.avatar_color,
      pin: form.pin || null,
      date_of_birth: form.date_of_birth || null,
      consent: {
        parent_name: form.parent_name.trim(),
        ack: true,
        version: COPPA_CONSENT_VERSION,
      },
    };
    const url = asTrial ? '/api/kids/trial' : '/api/kids';
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      // 402 from /api/kids POST means the parent doesn't have a paid
      // seat for this kid yet. Park the form payload, open the upsell
      // modal — the bundled endpoint there atomically charges the seat
      // AND creates the kid. Trial flow is exempt; trials don't bill.
      if (
        res.status === 402 &&
        !asTrial &&
        data?.code === 'kid_seat_required' &&
        form.date_of_birth
      ) {
        if (typeof data.extra_kid_price_cents === 'number') {
          setUpsellPriceCents(data.extra_kid_price_cents);
        }
        setUpsellPayload({
          display_name: payload.display_name,
          avatar_color: payload.avatar_color || null,
          pin: payload.pin,
          date_of_birth: form.date_of_birth,
          consent: {
            parent_name: form.parent_name.trim(),
            ack: true,
            version: COPPA_CONSENT_VERSION,
          },
        });
        setUpsellKidName(payload.display_name);
        setUpsellOpen(true);
        return;
      }
      setError(data?.error || 'Create failed');
      return;
    }
    setShowForm(false);
    setForm({
      display_name: '',
      avatar_color: COLOR_OPTIONS[0],
      pin: '',
      pinConfirm: '',
      date_of_birth: '',
      parent_name: '',
      consent_ack: false,
    });
    setFlash(asTrial ? 'Trial started \u2014 7 days of kid reading, on us.' : 'Kid profile added.');
    load();
  }

  function requestRemoveKid(kid: KidRow) {
    setPendingRemove({ id: kid.id, name: kid.display_name });
  }

  async function confirmRemoveKid() {
    if (!pendingRemove) return;
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/kids/${pendingRemove.id}?confirm=1`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Delete failed');
        return;
      }
      setPendingRemove(null);
      load();
    } finally {
      setRemoveBusy(false);
    }
  }

  async function togglePause(kid: KidRow) {
    if (pauseBusy) return;
    setPauseBusy(kid.id);
    setError('');
    setFlash('');
    const nextPaused = !kid.paused_at;
    try {
      const res = await fetch(`/api/kids/${kid.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Could not change pause state');
        return;
      }
      setFlash(
        nextPaused
          ? `${kid.display_name}\u2019s profile is paused.`
          : `${kid.display_name}\u2019s profile is active again.`
      );
      load();
    } finally {
      setPauseBusy(null);
    }
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading{'\u2026'}</div>;
  if (!me) return <div style={{ padding: 40 }}>Please log in.</div>;
  if (denied) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Family reading</h1>
        <p style={{ fontSize: 14, color: C.dim, marginBottom: 18 }}>
          Kid profiles are part of the Verity Family plan. Upgrade to unlock private kid reading,
          quizzes, and expert sessions.
        </p>
        <a
          href="/profile/settings#billing"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 9,
            background: C.accent,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Upgrade to Family
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <a href="/profile/settings" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>
        &larr; Back to settings
      </a>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 4px' }}>Family reading</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>
        Kid profiles are completely private &mdash; not in search, not on leaderboards, not visible
        to anyone outside your family (D12).
      </div>

      {flash && (
        <div
          style={{
            background: '#ecfdf5',
            border: `1px solid ${C.success}`,
            color: C.success,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {flash}
        </div>
      )}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: `1px solid ${C.danger}`,
            color: C.danger,
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {loadError && (
        <div
          style={{
            background: '#fef2f2',
            border: `1px solid ${C.danger}`,
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: C.danger }}>
            Couldn&rsquo;t load your kids profiles. Check your connection and retry.
          </div>
          <button
            onClick={() => load()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: C.danger,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!loadError && trialActive && <TrialHero endsAt={trial.kid_trial_ends_at || null} />}
      {!loadError && trialExpired && (
        <TrialExpiredHero
          // Trial limit is 1 kid, so the trial-expired kid is kids[0]
          // when present. If the array is empty (kid was already
          // deleted), the delete CTA is hidden.
          trialKid={kids[0] || null}
          onDelete={(kid) => requestRemoveKid(kid)}
        />
      )}

      {!loadError && canViewKpis && (canAdd || trialActive) && <KpiRow kpis={kpis} />}

      {!loadError && <KidsAppBanner />}

      {!loadError && kids.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {kids.map((k) => (
            // Wrapper per grid cell so the birthday banner sits directly
            // above its kid's card (rather than spanning the row). Both
            // banner and card are rendered inside the same cell.
            <div key={k.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BirthdayPromptBanner kid={k} />
              <KidCard
                kid={k}
                pauseBusy={pauseBusy === k.id}
                canRemove={canRemove}
                onDashboard={() => {
                  window.location.href = `/profile/kids/${k.id}`;
                }}
                onPauseToggle={() => togglePause(k)}
                onDelete={() => requestRemoveKid(k)}
              />
            </div>
          ))}
        </div>
      )}

      {!loadError && kids.length === 0 && canAdd && (
        <div
          style={{
            background: C.card,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
            padding: 24,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No kid profiles yet</div>
          <p style={{ fontSize: 13, color: C.dim, margin: '0 0 12px' }}>
            Add a kid profile for private reading, quizzes, and expert sessions.
          </p>
        </div>
      )}

      {!loadError &&
        !canAdd &&
        canStartTrial &&
        !trialActive &&
        !trialExpired &&
        !trial?.kid_trial_used &&
        kids.length === 0 && (
          <div
            style={{
              background: '#fffbeb',
              border: `1px solid ${C.warn}`,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.warn }}>
              Try a kid profile free for 7 days
            </div>
            <div style={{ fontSize: 12, color: C.text, marginTop: 4 }}>
              One kid profile, 7 days, no card. Convert to Verity Family to keep going &mdash; the
              kid&apos;s progress carries over.
            </div>
            <button
              onClick={() => setShowForm('trial')}
              style={{
                marginTop: 10,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: C.accent,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Start the trial
            </button>
          </div>
        )}

      {!loadError && !showForm && canAdd && canCreateMore && (
        <button
          onClick={() => setShowForm('full')}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            border: `1px dashed ${C.border}`,
            background: 'transparent',
            color: C.text,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {/* Audit fix: bare `({kids.length})` was misread as "slots
              remaining" but actually showed existing-count. Removed —
              the kids list is rendered directly above this button so
              the count is already visible. */}
          + Add kid profile
        </button>
      )}

      {!loadError && showForm && (
        <CreateKidForm
          form={form}
          setForm={setForm}
          saving={saving}
          mode={showForm}
          onCancel={() => setShowForm(false)}
          onSubmit={() => createKid(showForm === 'trial')}
        />
      )}

      <div style={{ marginTop: 28, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <a
          href="/profile/family"
          style={{ color: C.accent, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
        >
          Family dashboard &rarr;
        </a>
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Delete kid profile?"
        message={
          pendingRemove
            ? `Reading history and score for "${pendingRemove.name}" will be lost. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete profile"
        busy={removeBusy}
        onConfirm={confirmRemoveKid}
        onClose={() => !removeBusy && setPendingRemove(null)}
      />

      <AddKidUpsellModal
        open={upsellOpen}
        kidName={upsellKidName}
        extraKidPriceCents={upsellPriceCents}
        payload={upsellPayload}
        onClose={() => {
          setUpsellOpen(false);
        }}
        onSuccess={() => {
          // Bundled endpoint succeeded: kid + seat both in place.
          // Close upsell, dismiss the inline form, refresh the list.
          setUpsellOpen(false);
          setUpsellPayload(null);
          setShowForm(false);
          setForm({
            display_name: '',
            avatar_color: COLOR_OPTIONS[0],
            pin: '',
            pinConfirm: '',
            date_of_birth: '',
            parent_name: '',
            consent_ack: false,
          });
          setFlash('Kid profile added — your subscription was updated.');
          load();
        }}
      />
    </div>
  );
}

// OwnersAudit Kids Mgmt Task 2 — App Store CTA so parents who set up on web
// know the next step is downloading the kids iOS app. Renders persistently
// (not just post-creation) so parents who return later can still find the
// download path. URL is a placeholder constant; flip `KIDS_APP_STORE_URL` to
// the live App Store link when Apple approves the listing — no UI rework.
const KIDS_APP_STORE_URL: string | null = null;

function KidsAppBanner() {
  const live = !!KIDS_APP_STORE_URL;
  return (
    <div
      style={{
        background: '#f0f9ff',
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: C.text,
            marginBottom: 4,
          }}
        >
          Next step: download Verity Kids on your child&rsquo;s device.
        </div>
        <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
          {live
            ? 'Then open the app and enter a pair code from this page to link the account.'
            : 'The Verity Kids iOS app is not yet available. Pair codes from this page link the account once the app is installed.'}
        </div>
      </div>
      {live ? (
        <a
          href={KIDS_APP_STORE_URL!}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 18px',
            minHeight: 44,
            background: '#111',
            color: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Get the app
        </a>
      ) : (
        <span
          aria-disabled="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 18px',
            minHeight: 44,
            background: C.card,
            color: C.dim,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          App not yet available
        </span>
      )}
    </div>
  );
}

function TrialHero({ endsAt }: { endsAt: string | null }) {
  const days = daysRemaining(endsAt);
  const pct = Math.max(0, Math.min(100, ((7 - days) / 7) * 100));
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
        border: `1px solid ${C.warn}`,
        borderRadius: 14,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: C.warn,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {days}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#78350f' }}>
          {days === 1 ? 'day left on your kid trial' : 'days left on your kid trial'}
        </div>
      </div>
      <p style={{ fontSize: 13, color: '#78350f', margin: '6px 0 12px' }}>
        Upgrade to Verity Family to keep every badge, streak, and quiz pass after the trial ends.
      </p>
      <div
        style={{
          height: 6,
          background: 'rgba(180,83,9,0.18)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: C.warn }} />
      </div>
      <a
        href="/profile/settings#billing"
        style={{
          display: 'inline-block',
          padding: '10px 18px',
          borderRadius: 9,
          background: C.warn,
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Upgrade to Family
      </a>
    </div>
  );
}

function TrialExpiredHero({
  trialKid,
  onDelete,
}: {
  trialKid: KidRow | null;
  onDelete: (kid: KidRow) => void;
}) {
  return (
    <div
      style={{
        background: '#fef2f2',
        border: `1px solid ${C.danger}`,
        borderRadius: 14,
        padding: 20,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800, color: C.danger, marginBottom: 4 }}>
        Trial ended &mdash; kid profile is frozen
      </div>
      <p style={{ fontSize: 13, color: '#7f1d1d', margin: '0 0 12px' }}>
        Progress is saved. Upgrade to Verity Family and the profile unfreezes where it left off.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <a
          href="/profile/settings#billing"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 9,
            background: C.danger,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Upgrade to Family
        </a>
        {trialKid && (
          <button
            type="button"
            onClick={() => onDelete(trialKid)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '10px 4px',
              fontSize: 12,
              fontWeight: 600,
              color: '#7f1d1d',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Delete the trial profile
          </button>
        )}
      </div>
    </div>
  );
}

function KpiRow({ kpis }: { kpis: KpiPayload }) {
  const has = !!kpis;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginBottom: 16,
      }}
    >
      {/* T54 \u2014 KPI order locked to: Quizzes Passed \u2192 Articles \u2192 Longest Streak \u2192
          Reading Time. Leads with comprehension quality + bookmarked-style
          signal so parents see understanding metrics before raw volume. */}
      <KpiCard value={has ? kpis!.quizzes_passed : '\u2014'} label="Quizzes passed" />
      <KpiCard value={has ? kpis!.articles : '\u2014'} label="Articles this week" />
      <KpiCard
        value={has && kpis!.longest_streak?.streak ? kpis!.longest_streak.streak : '\u2014'}
        label="Longest streak"
        sub={has && kpis!.longest_streak?.name ? kpis!.longest_streak.name : ''}
      />
      <KpiCard value={has ? kpis!.minutes : '\u2014'} label="Reading time (min)" />
    </div>
  );
}

function KpiCard({ value, label, sub }: { value: number | string; label: string; sub?: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '14px 14px',
      }}
    >
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: C.text,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.dim,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginTop: 6,
        }}
      >
        {label}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function KidCard({
  kid,
  pauseBusy,
  canRemove,
  onDashboard,
  onPauseToggle,
  onDelete,
}: {
  kid: KidRow;
  pauseBusy: boolean;
  canRemove: boolean;
  onDashboard: () => void;
  onPauseToggle: () => void;
  onDelete: () => void;
}) {
  const paused = !!kid.paused_at;
  const meta = (kid.metadata || {}) as { trial?: boolean };
  const isTrial = !!meta.trial;
  const frozen = !kid.is_active;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: paused ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: kid.avatar_color || C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 20,
            fontWeight: 800,
          }}
        >
          {(kid.display_name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{kid.display_name}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {isTrial && <StatusPill label="Trial" color={C.warn} />}
            {frozen && <StatusPill label="Frozen" color={C.danger} />}
            {paused && <StatusPill label="Paused" color="#6b7280" />}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <MiniStat value={kid.articles_read_count || 0} label="Articles" />
        <MiniStat value={kid.quizzes_completed_count || 0} label="Quizzes" />
        <MiniStat value={kid.streak_current || 0} label="Streak" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={onDashboard}
          style={{
            flex: '1 1 auto',
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: C.accent,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Dashboard
        </button>
        <button
          onClick={onPauseToggle}
          disabled={pauseBusy}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.text,
            fontSize: 12,
            fontWeight: 700,
            cursor: pauseBusy ? 'default' : 'pointer',
            opacity: pauseBusy ? 0.5 : 1,
          }}
        >
          {pauseBusy ? '\u2026' : paused ? 'Resume' : 'Pause'}
        </button>
        {canRemove && (
          <button
            onClick={onDelete}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: C.danger,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        padding: '2px 8px',
        borderRadius: 999,
        background: `${color}1a`,
        color,
      }}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Birthday-prompt banner — surfaces when the daily cron has stamped
// `birthday_prompt_at` on a kid whose age has crossed a band boundary the
// parent hasn't acted on. CTA links into the per-kid dashboard, where the
// existing BandPanel handles the actual advance/graduate flow. Banner is
// silently hidden when:
//   - prompt is unset (no pending crossing)
//   - kid is not active (frozen / deleted)
//   - kid already on `graduated` band (nothing more to do)
// `birthday_prompt_at` is cleared server-side by the advance-band RPC
// (Phase 6 migration), so refreshing the page after acting will dismiss.
// ---------------------------------------------------------------------------
function BirthdayPromptBanner({ kid }: { kid: KidRow }) {
  if (!kid.birthday_prompt_at) return null;
  if (!kid.is_active) return null;

  const band = kid.reading_band || 'kids';
  let message: string;
  let cta: string;
  if (band === 'kids') {
    message = `${kid.display_name} is ready for the Tweens content track. Promote them to keep their reading age-appropriate.`;
    cta = 'Move to Tweens';
  } else if (band === 'tweens') {
    message = `${kid.display_name} is approaching adulthood. Graduate them when they're ready.`;
    cta = 'Start graduation';
  } else {
    // Already graduated — nothing for the parent to do here.
    return null;
  }

  return (
    <div
      style={{
        background: '#fffbeb',
        border: `1px solid ${C.warn}`,
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
      role="status"
    >
      {/* Typographic indicator (no emoji per design system default). The
          dot doubles as a status accent and matches the warn-tier color
          family used elsewhere on this page (TrialHero, KidCard pills). */}
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: C.warn,
          flex: '0 0 auto',
        }}
      />
      <span style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: '#78350f', lineHeight: 1.45 }}>
        <strong style={{ fontWeight: 700 }}>Birthday milestone.</strong> {message}
      </span>
      <a
        href={`/profile/kids/${kid.id}`}
        style={{
          padding: '6px 12px',
          borderRadius: 7,
          background: C.warn,
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
          flex: '0 0 auto',
        }}
      >
        {cta}
      </a>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>{value}</div>
      <div
        style={{
          fontSize: 10,
          color: C.dim,
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: 0.4,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function CreateKidForm({
  form,
  setForm,
  saving,
  mode,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  saving: boolean;
  mode: Exclude<FormMode, false>;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const valid =
    isDobValid(form.date_of_birth) &&
    isUnder13(form.date_of_birth) &&
    form.display_name.trim() &&
    form.consent_ack &&
    form.parent_name.trim().length >= 2;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
        {mode === 'trial' ? 'Start 7-day trial' : 'New kid profile'}
      </div>
      <Field label="Display name">
        <input
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          style={inputStyle}
        />
      </Field>
      <Field label="Date of birth">
        <input
          type="date"
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
          style={inputStyle}
        />
      </Field>
      <Field label="Avatar colour">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COLOR_OPTIONS.map((col) => (
            <button
              key={col}
              onClick={() => setForm({ ...form, avatar_color: col })}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: col,
                border: form.avatar_color === col ? `3px solid ${C.text}` : 'none',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </Field>
      <Field label="Kid PIN (4 digits, optional) — your child types this to open the app">
        <input
          value={form.pin}
          onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          placeholder={'\u2022\u2022\u2022\u2022'}
          style={inputStyle}
        />
        <input
          value={form.pinConfirm}
          onChange={(e) =>
            setForm({ ...form, pinConfirm: e.target.value.replace(/\D/g, '').slice(0, 4) })
          }
          placeholder="Confirm"
          style={{ ...inputStyle, marginTop: 6 }}
        />
      </Field>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: '#fff',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#666',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Parental consent (COPPA)
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: C.text,
            marginBottom: 10,
            whiteSpace: 'pre-wrap',
          }}
        >
          {COPPA_CONSENT_TEXT}
        </div>
        <Field label="Parent or guardian full name">
          <input
            value={form.parent_name}
            onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
            style={inputStyle}
            placeholder="Full legal name"
          />
        </Field>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            fontSize: 12,
            lineHeight: 1.5,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={form.consent_ack}
            onChange={(e) => setForm({ ...form, consent_ack: e.target.checked })}
            style={{ marginTop: 2 }}
          />
          <span>
            I am the parent or legal guardian of this child and consent to the data collection
            described above.
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          onClick={onSubmit}
          disabled={saving || !valid}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: C.accent,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            opacity: saving || !valid ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving\u2026' : mode === 'trial' ? 'Start trial' : 'Create profile'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: 'transparent',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          color: '#666',
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};
