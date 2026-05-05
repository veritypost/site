// Expert profile — credentials, areas, status + Wave 4a settings:
// Pause my queue / Quiet hours / Mention caps / Push (read-only-or-hidden).
//
// Reads expert_applications + expert_application_categories + the caller's
// users.timezone. Writes through:
//   POST /api/expert/availability  — Pause + Quiet hours
//   POST /api/expert/quotas        — Mention caps
//   POST /api/expert/timezone      — Quiet-hours TZ auto-populate / confirm
//   GET  /api/expert/quota-status  — "Today: X of Y" counter
//   GET  /api/expert/threads-config — kill-switch banner copy
//   PATCH/POST /api/expert/apply + /api/expert/vacation are no longer used by
//   this section (vacation toggle replaced by Pause radio; credentials still
//   PATCH apply).
//
// Spec: EXPERT_THREADS.md §2 (section order, mentionability vs push,
// adversary mitigation #2 timezone auto-populate + confirm banner) +
// §10 Wave 4a + §8 web table row.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { Card } from '../_components/Card';
import { buttonPrimaryStyle, buttonSecondaryStyle, inputStyle, textareaStyle } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { SkeletonBlock } from '../_components/Skeleton';
import { C, F, FONT, R, S } from '../_lib/palette';
import { ExpertApplyForm } from './ExpertApplyForm';

interface Application {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | string;
  application_type: string | null;
  credentials: string | null;
  rejection_reason: string | null;
  vacation_until: string | null;
  pause_until_indefinite: boolean;
  mention_quiet_hours_start: string | null;
  mention_quiet_hours_end: string | null;
  mention_quiet_hours_days: number[] | null;
  mention_quota_per_post: number;
  mention_quota_per_day: number;
  notify_push_on_mention: boolean;
  notify_push_on_category_arrival: boolean;
}

interface CategoryRef {
  id: string;
  name: string;
}

interface QuotaStatus {
  today_mentions: number;
  per_day_quota: number;
  today_per_post_max: number;
}

interface Props {
  preview: boolean;
}

// Day labels in spec order — Sun..Sat (matches DB int 0..6 used by
// `_is_in_quiet_hours_v2`).
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DAY_NAMES_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DEFAULT_QH_START = '21:00';
const DEFAULT_QH_END = '07:00';
const DEFAULT_QH_DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];

type PauseMode = 'off' | 'indefinite' | 'date';

export function ExpertProfileSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [app, setApp] = useState<Application | null>(null);
  const [areas, setAreas] = useState<CategoryRef[]>([]);
  const [credentialsDraft, setCredentialsDraft] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  // Pause my queue
  const [savingPause, setSavingPause] = useState(false);

  // Quiet hours
  const [qhEnabled, setQhEnabled] = useState(false);
  const [qhStart, setQhStart] = useState(DEFAULT_QH_START);
  const [qhEnd, setQhEnd] = useState(DEFAULT_QH_END);
  const [qhDays, setQhDays] = useState<number[]>([...DEFAULT_QH_DAYS]);
  const [savingQh, setSavingQh] = useState(false);

  // Mention caps
  const [perPost, setPerPost] = useState(3);
  const [perDay, setPerDay] = useState(25);
  const [savingQuotas, setSavingQuotas] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);

  // Timezone state — drives the auto-populate-on-first-render + confirm banner.
  const [storedTz, setStoredTz] = useState<string | null>(null);
  const [browserTz, setBrowserTz] = useState<string | null>(null);
  const [tzBannerDismissed, setTzBannerDismissed] = useState(false);
  // Guard against double-firing the auto-populate POST under React 18 strict-
  // mode (effects run twice in dev). The ref tracks "have we already kicked
  // off the populate for this mount" — without it, two parallel POSTs race
  // and the second sees a non-NULL row + no-ops (harmless, but noisy in logs).
  const tzPopulateAttempted = useRef(false);

  // Kill-switch banner copy
  const [killSwitchOff, setKillSwitchOff] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: appRow } = await supabase
        .from('expert_applications')
        .select(
          [
            'id',
            'status',
            'application_type',
            'credentials',
            'rejection_reason',
            'vacation_until',
            'pause_until_indefinite',
            'mention_quiet_hours_start',
            'mention_quiet_hours_end',
            'mention_quiet_hours_days',
            'mention_quota_per_post',
            'mention_quota_per_day',
            'notify_push_on_mention',
            'notify_push_on_category_arrival',
          ].join(', ')
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const a = (appRow ?? null) as Application | null;
      setApp(a);
      setCredentialsDraft(a?.credentials ?? '');

      if (a) {
        // Hydrate quiet-hours editor from the row. If any field is null, the
        // master toggle stays OFF and the editor pre-fills with defaults so
        // the very first click on "On" presents a usable state.
        const qhAllSet =
          !!a.mention_quiet_hours_start &&
          !!a.mention_quiet_hours_end &&
          Array.isArray(a.mention_quiet_hours_days) &&
          a.mention_quiet_hours_days.length > 0;
        setQhEnabled(qhAllSet);
        setQhStart(toHHMM(a.mention_quiet_hours_start) ?? DEFAULT_QH_START);
        setQhEnd(toHHMM(a.mention_quiet_hours_end) ?? DEFAULT_QH_END);
        setQhDays(
          Array.isArray(a.mention_quiet_hours_days) && a.mention_quiet_hours_days.length > 0
            ? [...a.mention_quiet_hours_days]
            : [...DEFAULT_QH_DAYS]
        );
        setPerPost(a.mention_quota_per_post ?? 3);
        setPerDay(a.mention_quota_per_day ?? 25);
      }

      if (a?.id) {
        const { data: catRows } = await supabase
          .from('expert_application_categories')
          .select('categories(id, name)')
          .eq('application_id', a.id);
        if (cancelled) return;
        const list = ((catRows ?? []) as Array<{ categories: CategoryRef | null }>)
          .map((r) => r.categories)
          .filter((c): c is CategoryRef => !!c);
        setAreas(list);
      }

      // Stored timezone — the column is nullable; a successful read with a
      // non-null value short-circuits the auto-populate path.
      const { data: userRow } = await supabase
        .from('users')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setStoredTz((userRow as { timezone: string | null } | null)?.timezone ?? null);

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  // Detect browser TZ once on mount — `Intl.DateTimeFormat` is sync and
  // stable for a given browser/profile.
  useEffect(() => {
    try {
      setBrowserTz(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setBrowserTz(null);
    }
  }, []);

  // Auto-populate users.timezone on first render of the Quiet hours editor.
  // RPC ensure_user_timezone is a no-op when the column is non-null, so this
  // is safe to call even when storedTz is set (we still skip the POST in
  // that case to avoid burning a request).
  useEffect(() => {
    if (preview) return;
    if (!app) return;
    if (!browserTz) return;
    if (storedTz) return;
    if (tzPopulateAttempted.current) return;
    tzPopulateAttempted.current = true;
    (async () => {
      try {
        const res = await fetch('/api/expert/timezone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tz: browserTz }),
        });
        if (res.ok) {
          // Reflect the just-written value in local state so the confirm
          // banner doesn't fire on the same browser TZ in this session.
          setStoredTz(browserTz);
        }
      } catch {
        // Silent — banner path will surface a manual confirm next render.
      }
    })();
  }, [preview, app, browserTz, storedTz]);

  // Kill-switch banner — fetch once per mount.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/expert/threads-config', { cache: 'no-store' });
        if (!res.ok) return;
        const j = (await res.json()) as { expert_threads_enabled?: boolean };
        if (cancelled) return;
        setKillSwitchOff(j.expert_threads_enabled === false);
      } catch {
        // Silent — no banner is the conservative default if the fetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  // Quota status — refresh on mount + after any quota save so the line
  // under Mention caps stays accurate.
  const refreshQuotaStatus = useMemo(
    () => async () => {
      if (preview) return;
      try {
        const res = await fetch('/api/expert/quota-status', { cache: 'no-store' });
        if (!res.ok) return;
        const j = (await res.json()) as QuotaStatus;
        setQuotaStatus(j);
      } catch {
        // Silent — display gracefully degrades to "—" via render below.
      }
    },
    [preview]
  );
  useEffect(() => {
    if (app) void refreshQuotaStatus();
  }, [app, refreshQuotaStatus]);

  const saveCreds = async () => {
    if (preview) {
      toast.info('Sign in to update your credentials.');
      return;
    }
    setSavingCreds(true);
    try {
      const res = await fetch('/api/expert/apply', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: credentialsDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Save failed.');
      }
      toast.success('Credentials updated.');
      setApp((a) => (a ? { ...a, credentials: credentialsDraft } : a));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingCreds(false);
    }
  };

  // Pause my queue — three radio states map to (pause_until_indefinite,
  // vacation_until):
  //   off        → (false, null)
  //   indefinite → (true,  null)
  //   date       → (false, ISO timestamp)
  const pauseMode: PauseMode = !app
    ? 'off'
    : app.pause_until_indefinite
      ? 'indefinite'
      : app.vacation_until && Date.parse(app.vacation_until) > Date.now()
        ? 'date'
        : 'off';
  const [datePicker, setDatePicker] = useState<string>(() =>
    app?.vacation_until && Date.parse(app.vacation_until) > Date.now()
      ? new Date(app.vacation_until).toISOString().slice(0, 10)
      : ''
  );
  // When app loads after the initial render, sync the date picker once so
  // editing reflects the persisted date (no re-sync on every render — the
  // user might be mid-edit).
  useEffect(() => {
    if (app?.vacation_until && !datePicker) {
      const d = new Date(app.vacation_until);
      if (!isNaN(d.getTime())) setDatePicker(d.toISOString().slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id]);

  const savePause = async (next: {
    pause_until_indefinite: boolean;
    vacation_until: string | null;
  }) => {
    if (preview) {
      toast.info('Sign in to change your pause setting.');
      return;
    }
    setSavingPause(true);
    try {
      const body = {
        pause_until_indefinite: next.pause_until_indefinite,
        vacation_until: next.vacation_until,
        // Quiet hours are persisted by their own block — re-send the
        // current values here so the RPC's single UPDATE doesn't clobber
        // them with NULL. The RPC takes all 6 fields together.
        quiet_hours_start: qhEnabled ? toHHMM(qhStart) : null,
        quiet_hours_end: qhEnabled ? toHHMM(qhEnd) : null,
        quiet_hours_days: qhEnabled ? qhDays : null,
      };
      const res = await fetch('/api/expert/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Could not save.');
      }
      setApp((a) =>
        a ? { ...a, pause_until_indefinite: next.pause_until_indefinite, vacation_until: next.vacation_until } : a
      );
      toast.success('Pause setting updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSavingPause(false);
    }
  };

  const saveQuietHours = async (
    nextEnabled: boolean,
    nextStart: string,
    nextEnd: string,
    nextDays: number[]
  ) => {
    if (preview) {
      toast.info('Sign in to change quiet hours.');
      return;
    }
    setSavingQh(true);
    try {
      const body = {
        // Echo current pause state — same single-UPDATE concern as above.
        pause_until_indefinite: app?.pause_until_indefinite ?? false,
        vacation_until: app?.vacation_until ?? null,
        quiet_hours_start: nextEnabled ? toHHMM(nextStart) : null,
        quiet_hours_end: nextEnabled ? toHHMM(nextEnd) : null,
        quiet_hours_days: nextEnabled ? nextDays : null,
      };
      const res = await fetch('/api/expert/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Could not save.');
      }
      setApp((a) =>
        a
          ? {
              ...a,
              mention_quiet_hours_start: nextEnabled ? toHHMM(nextStart) : null,
              mention_quiet_hours_end: nextEnabled ? toHHMM(nextEnd) : null,
              mention_quiet_hours_days: nextEnabled ? nextDays : null,
            }
          : a
      );
      toast.success('Quiet hours updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSavingQh(false);
    }
  };

  const saveQuotas = async (nextPerPost: number, nextPerDay: number) => {
    if (preview) {
      toast.info('Sign in to change mention caps.');
      return;
    }
    if (!Number.isInteger(nextPerPost) || nextPerPost < 1 || nextPerPost > 10) {
      toast.error('Per article must be 1–10.');
      return;
    }
    if (!Number.isInteger(nextPerDay) || nextPerDay < 1 || nextPerDay > 200) {
      toast.error('Per day must be 1–200.');
      return;
    }
    setSavingQuotas(true);
    try {
      const res = await fetch('/api/expert/quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ per_post: nextPerPost, per_day: nextPerDay }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Could not save.');
      }
      setApp((a) =>
        a ? { ...a, mention_quota_per_post: nextPerPost, mention_quota_per_day: nextPerDay } : a
      );
      toast.success('Mention caps updated.');
      void refreshQuotaStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSavingQuotas(false);
    }
  };

  const confirmTimezone = async () => {
    if (!browserTz) return;
    try {
      // The auto-populate endpoint (ensure_user_timezone) is a no-op when
      // users.timezone is non-null, so the manual "Yes, update my saved tz"
      // path bypasses it and writes directly via the user's authed Supabase
      // client. RLS policy `users_update` permits self-update where
      // `id = auth.uid()`, so this is safe and avoids a round-trip.
      const { data: authUser } = await supabase.auth.getUser();
      const uid = authUser.user?.id;
      if (!uid) throw new Error('Not signed in.');
      const { error } = await supabase
        .from('users')
        .update({ timezone: browserTz })
        .eq('id', uid);
      if (error) throw new Error(error.message);
      setStoredTz(browserTz);
      setTzBannerDismissed(true);
      toast.success(`Timezone updated to ${browserTz}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update timezone.');
    }
  };

  if (loading) return <SkeletonBlock height={140} />;

  if (!app) {
    return (
      <ExpertApplyForm
        preview={preview}
        onSubmitted={() => {
          // Refresh the section so the freshly-created application
          // shows in its under-review state without leaving the panel.
          setLoading(true);
          setApp({
            id: 'pending-local',
            status: 'pending',
            application_type: null,
            credentials: null,
            rejection_reason: null,
            vacation_until: null,
            pause_until_indefinite: false,
            mention_quiet_hours_start: null,
            mention_quiet_hours_end: null,
            mention_quiet_hours_days: null,
            mention_quota_per_post: 3,
            mention_quota_per_day: 25,
            notify_push_on_mention: false,
            notify_push_on_category_arrival: false,
          });
          setLoading(false);
        }}
      />
    );
  }

  const showPushBlock =
    app.notify_push_on_mention === true || app.notify_push_on_category_arrival === true;

  const tzMismatch =
    !tzBannerDismissed && !!browserTz && !!storedTz && browserTz !== storedTz;

  // Quick-pick chips for "Until a date".
  const quickPicks: Array<{ label: string; days: number }> = [
    { label: 'Tomorrow', days: 1 },
    { label: 'End of week', days: daysUntilEndOfWeek() },
    { label: '2 weeks', days: 14 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      {killSwitchOff ? (
        <div
          role="status"
          style={{
            background: C.infoSoft,
            color: C.info,
            border: `1px solid ${C.info}`,
            borderRadius: R.md,
            padding: `${S[3]}px ${S[4]}px`,
            fontSize: F.sm,
            lineHeight: 1.5,
            fontFamily: FONT.sans,
          }}
        >
          Mention threads are not yet active for users — these settings will take effect when launched.
        </div>
      ) : null}

      {/* 1. Pause my queue */}
      <Card
        title="Pause my queue"
        description="Stop receiving new mentions. Existing questions in the shared queue still appear."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], fontFamily: FONT.sans }}>
          <PauseRadio
            checked={pauseMode === 'off'}
            label="Off"
            disabled={savingPause}
            onChange={() => savePause({ pause_until_indefinite: false, vacation_until: null })}
          />
          <PauseRadio
            checked={pauseMode === 'indefinite'}
            label="Until I turn it back on"
            disabled={savingPause}
            onChange={() => savePause({ pause_until_indefinite: true, vacation_until: null })}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            <PauseRadio
              checked={pauseMode === 'date'}
              label="Until a date"
              disabled={savingPause}
              onChange={() => {
                // If user hasn't picked a date, default to "Tomorrow" so
                // the radio always commits a sensible value.
                const iso =
                  datePicker && !isNaN(Date.parse(datePicker))
                    ? endOfDayIso(datePicker)
                    : endOfDayIso(addDaysIso(new Date(), 1));
                savePause({ pause_until_indefinite: false, vacation_until: iso });
              }}
            />
            {pauseMode === 'date' || datePicker ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], paddingLeft: S[6] }}>
                <input
                  type="date"
                  value={datePicker}
                  min={new Date(Date.now() + 86400_000).toISOString().slice(0, 10)}
                  onChange={(e) => {
                    setDatePicker(e.target.value);
                    if (e.target.value && !isNaN(Date.parse(e.target.value))) {
                      savePause({
                        pause_until_indefinite: false,
                        vacation_until: endOfDayIso(e.target.value),
                      });
                    }
                  }}
                  disabled={savingPause}
                  style={{
                    ...inputStyle,
                    width: 'auto',
                    padding: `${S[2]}px ${S[3]}px`,
                    fontSize: F.sm,
                  }}
                />
                {quickPicks.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    disabled={savingPause}
                    onClick={() => {
                      const iso = endOfDayIso(addDaysIso(new Date(), qp.days));
                      setDatePicker(iso.slice(0, 10));
                      savePause({ pause_until_indefinite: false, vacation_until: iso });
                    }}
                    style={{
                      ...buttonSecondaryStyle,
                      padding: `${S[1]}px ${S[3]}px`,
                      fontSize: F.xs,
                    }}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {pauseMode === 'date' && app.vacation_until ? (
            <div style={{ fontSize: F.xs, color: C.inkMuted }}>
              Returns {new Date(app.vacation_until).toLocaleDateString()}.
            </div>
          ) : null}
        </div>
      </Card>

      {/* 2. Quiet hours */}
      <Card
        title="Quiet hours"
        description="Hide your name from the @-picker during a recurring window. Mentions you receive in this window are bundled into one summary push when it ends."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], fontFamily: FONT.sans }}>
          {tzMismatch ? (
            <div
              role="status"
              style={{
                background: C.warnSoft,
                color: C.warn,
                border: `1px solid ${C.warn}`,
                borderRadius: R.md,
                padding: `${S[3]}px ${S[4]}px`,
                display: 'flex',
                gap: S[3],
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                fontSize: F.sm,
                lineHeight: 1.5,
              }}
            >
              <span>
                We detected {browserTz}. Update your timezone?
                <span style={{ display: 'block', fontSize: F.xs, opacity: 0.85, marginTop: 2 }}>
                  Currently saved: {storedTz}
                </span>
              </span>
              <span style={{ display: 'flex', gap: S[2] }}>
                <button
                  type="button"
                  onClick={confirmTimezone}
                  style={{ ...buttonPrimaryStyle, padding: `${S[1]}px ${S[3]}px`, fontSize: F.sm }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setTzBannerDismissed(true)}
                  style={{ ...buttonSecondaryStyle, padding: `${S[1]}px ${S[3]}px`, fontSize: F.sm }}
                >
                  Dismiss
                </button>
              </span>
            </div>
          ) : null}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S[2],
              fontSize: F.sm,
              fontWeight: 600,
              color: C.ink,
              cursor: savingQh ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={qhEnabled}
              disabled={savingQh}
              onChange={(e) => {
                const next = e.target.checked;
                setQhEnabled(next);
                saveQuietHours(next, qhStart, qhEnd, qhDays);
              }}
              style={{ width: 18, height: 18, accentColor: C.accent }}
            />
            Quiet hours on
          </label>
          {qhEnabled ? (
            <>
              <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  <span style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>Start</span>
                  <input
                    type="time"
                    value={qhStart}
                    disabled={savingQh}
                    onChange={(e) => setQhStart(e.target.value)}
                    onBlur={() => saveQuietHours(true, qhStart, qhEnd, qhDays)}
                    style={{ ...inputStyle, width: 'auto', padding: `${S[2]}px ${S[3]}px`, fontSize: F.sm }}
                  />
                </label>
                <span style={{ color: C.inkMuted, fontSize: F.sm, paddingTop: S[4] }}>→</span>
                <label style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  <span style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>End</span>
                  <input
                    type="time"
                    value={qhEnd}
                    disabled={savingQh}
                    onChange={(e) => setQhEnd(e.target.value)}
                    onBlur={() => saveQuietHours(true, qhStart, qhEnd, qhDays)}
                    style={{ ...inputStyle, width: 'auto', padding: `${S[2]}px ${S[3]}px`, fontSize: F.sm }}
                  />
                </label>
              </div>
              <div>
                <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600, marginBottom: S[2] }}>
                  Days
                </div>
                <div style={{ display: 'flex', gap: S[2] }}>
                  {DAY_LABELS.map((lbl, i) => {
                    const active = qhDays.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Toggle ${DAY_NAMES_LONG[i]}`}
                        aria-pressed={active}
                        disabled={savingQh}
                        onClick={() => {
                          const next = active
                            ? qhDays.filter((d) => d !== i)
                            : [...qhDays, i].sort((a, b) => a - b);
                          setQhDays(next);
                          saveQuietHours(true, qhStart, qhEnd, next);
                        }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: R.pill,
                          border: `1px solid ${active ? C.ink : C.border}`,
                          background: active ? C.ink : C.bg,
                          color: active ? C.bg : C.inkSoft,
                          fontSize: F.sm,
                          fontWeight: 600,
                          cursor: savingQh ? 'not-allowed' : 'pointer',
                          fontFamily: FONT.sans,
                        }}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
              {storedTz ? (
                <div style={{ fontSize: F.xs, color: C.inkMuted }}>
                  Times interpreted in {storedTz}.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>

      {/* 3. Mention caps */}
      <Card
        title="Mention caps"
        description="Limit how many times anyone can @-mention you."
        footer={
          <button
            type="button"
            onClick={() => saveQuotas(perPost, perDay)}
            disabled={
              savingQuotas ||
              (perPost === app.mention_quota_per_post && perDay === app.mention_quota_per_day)
            }
            style={{
              ...buttonPrimaryStyle,
              opacity:
                savingQuotas ||
                (perPost === app.mention_quota_per_post && perDay === app.mention_quota_per_day)
                  ? 0.55
                  : 1,
              cursor:
                savingQuotas ||
                (perPost === app.mention_quota_per_post && perDay === app.mention_quota_per_day)
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {savingQuotas ? 'Saving…' : 'Save caps'}
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], fontFamily: FONT.sans }}>
          <div style={{ display: 'flex', gap: S[4], flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
              <span style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>
                Max mentions per article
              </span>
              <input
                type="number"
                min={1}
                max={10}
                value={perPost}
                disabled={savingQuotas}
                onChange={(e) => setPerPost(Number(e.target.value))}
                style={{ ...inputStyle, width: 96, padding: `${S[2]}px ${S[3]}px`, fontSize: F.sm }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
              <span style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>
                Max mentions per day
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={perDay}
                disabled={savingQuotas}
                onChange={(e) => setPerDay(Number(e.target.value))}
                style={{ ...inputStyle, width: 96, padding: `${S[2]}px ${S[3]}px`, fontSize: F.sm }}
              />
            </label>
          </div>
          <div style={{ fontSize: F.sm, color: C.inkMuted }}>
            Today:{' '}
            <strong style={{ color: C.ink }}>
              {quotaStatus ? quotaStatus.today_mentions : '—'}
            </strong>{' '}
            of{' '}
            <strong style={{ color: C.ink }}>
              {quotaStatus ? quotaStatus.per_day_quota : app.mention_quota_per_day}
            </strong>
            .
          </div>
        </div>
      </Card>

      {/* 4. Push alerts (iOS only) — only render when iOS has set at least one */}
      {showPushBlock ? (
        <Card
          title="Push alerts"
          description="Manage push opt-ins on the iOS app — these are not editable on the web."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], fontFamily: FONT.sans }}>
            <ReadonlyToggle
              label="Push when I'm @-mentioned"
              checked={app.notify_push_on_mention}
            />
            <ReadonlyToggle
              label="Push when a question lands in my category"
              checked={app.notify_push_on_category_arrival}
            />
            <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: S[1] }}>
              Push managed in iOS app.
            </div>
          </div>
        </Card>
      ) : null}

      {/* 5-7. Existing — Application status / Verified areas / Credentials */}
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S[3],
            fontFamily: FONT.sans,
          }}
        >
          <div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>
              APPLICATION STATUS
            </div>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: F.xl,
                fontWeight: 600,
                color: C.ink,
                marginTop: 2,
              }}
            >
              {statusLabel(app.status)}
            </div>
            {app.status === 'rejected' && app.rejection_reason ? (
              <div style={{ fontSize: F.sm, color: C.danger, marginTop: S[1] }}>
                {app.rejection_reason}
              </div>
            ) : null}
          </div>
          <span
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              borderRadius: 999,
              fontSize: F.xs,
              fontWeight: 600,
              background: statusBg(app.status),
              color: statusInk(app.status),
              border: `1px solid ${statusInk(app.status)}`,
            }}
          >
            {statusLabel(app.status)}
          </span>
        </div>
      </Card>

      <Card
        title="Verified areas"
        description="The categories your badge applies to. Add or remove via re-application."
      >
        {areas.length === 0 ? (
          <p style={{ margin: 0, fontSize: F.sm, color: C.inkMuted }}>
            No categories assigned yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2] }}>
            {areas.map((a) => (
              <span
                key={a.id}
                style={{
                  padding: `${S[1]}px ${S[3]}px`,
                  background: C.expertSoft,
                  color: C.expert,
                  border: `1px solid ${C.expert}`,
                  borderRadius: 999,
                  fontSize: F.sm,
                  fontWeight: 600,
                }}
              >
                {a.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Credentials"
        description="Public bio shown next to your expert badge. Editable any time."
        footer={
          <button
            type="button"
            onClick={saveCreds}
            disabled={savingCreds || credentialsDraft === (app.credentials ?? '')}
            style={{
              ...buttonPrimaryStyle,
              opacity: savingCreds || credentialsDraft === (app.credentials ?? '') ? 0.55 : 1,
              cursor:
                savingCreds || credentialsDraft === (app.credentials ?? '')
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {savingCreds ? 'Saving…' : 'Save credentials'}
          </button>
        }
      >
        <textarea
          value={credentialsDraft}
          onChange={(e) => setCredentialsDraft(e.target.value)}
          maxLength={600}
          style={{ ...textareaStyle, minHeight: 100 }}
        />
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Subcomponents + helpers
// ──────────────────────────────────────────────────────────────────────────

function PauseRadio(props: {
  checked: boolean;
  label: string;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S[2],
        fontSize: F.sm,
        color: C.ink,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        fontFamily: FONT.sans,
      }}
    >
      <input
        type="radio"
        name="expert-pause-mode"
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
        style={{ width: 18, height: 18, accentColor: C.accent }}
      />
      {props.label}
    </label>
  );
}

function ReadonlyToggle(props: { label: string; checked: boolean }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S[2],
        fontSize: F.sm,
        color: C.ink,
        cursor: 'not-allowed',
        opacity: 0.7,
        fontFamily: FONT.sans,
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        disabled
        readOnly
        style={{ width: 18, height: 18, accentColor: C.accent }}
      />
      {props.label}
    </label>
  );
}

// "HH:MM:SS" or "HH:MM" → "HH:MM" (the only shape <input type="time"> accepts).
function toHHMM(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = String(Number(m[1])).padStart(2, '0');
  return `${h}:${m[2]}`;
}

// Compute days until end of week (Sunday). Avoids 0 (which would map to "today").
function daysUntilEndOfWeek(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const remaining = (7 - day) % 7;
  return remaining === 0 ? 7 : remaining;
}

// Date math — avoids timezone surprises by clamping to midnight UTC of the
// returned ISO. The pause-until column is `timestamptz`; an end-of-day local
// timestamp would be more user-intuitive but we keep it simple and use the
// end of the chosen UTC day so quick-pick chips and the date input agree.
function addDaysIso(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86400_000);
  return d.toISOString().slice(0, 10);
}
function endOfDayIso(yyyyMmDd: string): string {
  // Set to 23:59:59 UTC on the picked date — paused through end of that day.
  return new Date(`${yyyyMmDd}T23:59:59Z`).toISOString();
}

function statusLabel(s: string) {
  if (s === 'approved') return 'Verified expert';
  if (s === 'pending') return 'Under review';
  if (s === 'rejected') return 'Application not approved';
  if (s === 'revoked') return 'Verification revoked';
  return s;
}
function statusBg(s: string) {
  if (s === 'approved') return C.successSoft;
  if (s === 'pending') return C.expertSoft;
  if (s === 'rejected' || s === 'revoked') return C.dangerSoft;
  return C.surfaceSunken;
}
function statusInk(s: string) {
  if (s === 'approved') return C.success;
  if (s === 'pending') return C.expert;
  if (s === 'rejected' || s === 'revoked') return C.danger;
  return C.inkMuted;
}
